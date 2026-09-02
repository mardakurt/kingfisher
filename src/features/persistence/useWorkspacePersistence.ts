'use client';

/**
 * Keeping the workspace alive across reloads.
 *
 * Two things are persisted, and they answer different questions. The *draft*
 * answers "what was on screen?" — document, tree, cursor, orientation — so an
 * accidental refresh does not destroy work that was never filed anywhere. The
 * *chapter* answers "what is in my study?" and is the authoritative copy of
 * anything the user has actually saved.
 *
 * Both are written from one debounced pass over the same store snapshot, so
 * they can never disagree about what the analysis contained.
 */

import { useEffect, useRef } from 'react';

import { autosaveDelay } from '@/persistence/autosave';
import { getRepositories } from '@/persistence/repositories';
import { announceChapterSaved, subscribeCrossTab } from '@/persistence/cross-tab';
import type { AppRepositories, ChapterRecord, DraftRecord } from '@/persistence/types';
import { StaleChapterWriteError } from '@/persistence/types';
import { useAnalysis, selectDirty, UNTITLED_DOCUMENT } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

/** Wired once, in the shell, so every route keeps the same session alive. */
export function useWorkspacePersistence(): void {
  /** Set on mount rather than at render time, so the hook stays pure. */
  const lastChangeAt = useRef(0);
  const firstUnsavedAt = useRef<number | null>(null);
  const lastRevision = useRef(-1);

  useEffect(() => {
    /*
      Deliberately no "have I already run?" ref. Under StrictMode the effect is
      mounted, torn down and mounted again; a ref set on the first pass would
      make the second pass skip the restore that the first pass had just
      abandoned, and the workspace would come back empty after every reload.
      Re-running is safe instead, because the only thing that must not be
      overwritten is work the user has already started — which is what the
      revision check below actually tests, at the moment it matters.
    */
    let active = true;

    void (async () => {
      try {
        const repositories = await getRepositories();
        const draft = await repositories.drafts.get();
        if (!active || !draft) return;

        // Checked here rather than on mount: storage takes a moment to open,
        // and anything the user played in the meantime outranks the draft.
        if (useAnalysis.getState().revision !== 0) return;

        await restoreDraft(repositories, draft);
      } catch (error) {
        if (!active) return;
        useUi.getState().notify({
          tone: 'error',
          message: 'Saved work could not be read from this browser.',
          detail: describe(error),
        });
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    lastChangeAt.current = Date.now();
    lastRevision.current = useAnalysis.getState().revision;

    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    const save = async () => {
      const state = useAnalysis.getState();
      // A refused write would only be refused again; the user has to choose.
      if (!selectDirty(state) || state.saving || state.conflict) return;

      const revision = state.revision;
      state.markSaving();
      try {
        const repositories = await getRepositories();
        const written = await writeWorkspace(repositories, state);
        if (disposed) return;
        if (written) {
          useAnalysis.getState().setDocumentRevision(written.revision);
          announceChapterSaved(written.id, written.revision);
        }
        useAnalysis.getState().markSaved(revision);
        firstUnsavedAt.current = null;
      } catch (error) {
        if (disposed) return;
        if (error instanceof StaleChapterWriteError) {
          useAnalysis.getState().reportConflict({
            chapterId: error.current.id,
            storedRevision: error.current.revision,
            losingWork: true,
            detectedAt: Date.now(),
          });
          return;
        }
        useAnalysis.getState().markSaveFailed(describe(error));
      }
    };

    const schedule = () => {
      clear();
      const state = useAnalysis.getState();
      const delay = autosaveDelay({
        dirty: selectDirty(state),
        saving: state.saving,
        now: Date.now(),
        lastChangeAt: lastChangeAt.current,
        firstUnsavedAt: firstUnsavedAt.current,
      });
      if (delay === null) return;
      timer = setTimeout(() => void save(), delay);
    };

    // Navigating the tree changes the store constantly and saves nothing, so
    // only a change to the save-relevant triple may disturb a pending write.
    let watched = signature(useAnalysis.getState());

    const unsubscribe = useAnalysis.subscribe((state) => {
      const next = signature(state);
      if (next === watched) return;
      watched = next;

      if (state.revision !== lastRevision.current) {
        lastRevision.current = state.revision;
        lastChangeAt.current = Date.now();
      }
      if (selectDirty(state)) firstUnsavedAt.current ??= lastChangeAt.current;
      else firstUnsavedAt.current = null;

      schedule();
    });

    /*
      Flush points, in order of how much they can be trusted.

      `visibilitychange` to hidden is the reliable one and fires on tab
      switching, minimising and mobile backgrounding. `pagehide` fires on
      navigation away and on bfcache eviction. `beforeunload` is deliberately
      *not* used as the mechanism: it is unreliable on mobile and cannot await
      an IndexedDB write anyway. The real guarantee is that the debounce is
      short enough that little is ever unsaved, and that ordinary transitions —
      opening another chapter, switching document — save before they switch.
    */
    const flush = () => {
      if (document.visibilityState === 'hidden') void save();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);

    /*
      Another tab wrote the chapter this one is showing.

      Clean means nothing of ours is at risk, so take theirs: that is what the
      user would pick every time, and asking would be noise. Dirty means a
      choice has to be made, and only the user can make it.
    */
    const unsubscribeTabs = subscribeCrossTab((message) => {
      const state = useAnalysis.getState();
      if (state.document.kind !== 'study-chapter') return;
      if (state.document.chapterId !== message.chapterId) return;
      if (message.revision <= state.document.revision) return;

      if (selectDirty(state) || state.saving) {
        useAnalysis.getState().reportConflict({
          chapterId: message.chapterId,
          storedRevision: message.revision,
          losingWork: true,
          detectedAt: Date.now(),
        });
        return;
      }
      void adoptStoredChapter(message.chapterId);
    });

    schedule();

    return () => {
      disposed = true;
      clear();
      unsubscribe();
      unsubscribeTabs();
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
}

/** Reload a chapter another tab has advanced, when nothing local is at risk. */
async function adoptStoredChapter(chapterId: string): Promise<void> {
  try {
    const repositories = await getRepositories();
    const chapter = await repositories.studies.getChapter(chapterId);
    const state = useAnalysis.getState();
    if (!chapter) return;
    // Re-checked after the await: the user may have started editing meanwhile,
    // and silently replacing their tree would be the exact loss this prevents.
    if (state.document.kind !== 'study-chapter') return;
    if (state.document.chapterId !== chapterId) return;
    if (selectDirty(state)) {
      state.reportConflict({
        chapterId,
        storedRevision: chapter.revision,
        losingWork: true,
        detectedAt: Date.now(),
      });
      return;
    }
    state.openDocument({
      tree: chapter.tree,
      document: { ...state.document, title: chapter.title, revision: chapter.revision },
      orientation: state.orientation,
    });
  } catch {
    // Best effort. The revision check still refuses any stale write.
  }
}

/**
 * Returns the chapter that was written, or null for a document with no chapter.
 *
 * Order matters. The draft is written first and marked unsaved, so the work
 * exists somewhere durable before the chapter write — which is the write that
 * can be refused for a stale revision, rejected for quota, or interrupted by
 * the tab going away. Previously the draft went last, so a chapter write that
 * threw took the session's work with it.
 */
async function writeWorkspace(
  repositories: AppRepositories,
  state: ReturnType<typeof useAnalysis.getState>,
): Promise<ChapterRecord | null> {
  const draft: DraftRecord = {
    id: 'active',
    document: state.document,
    tree: state.tree,
    currentId: state.currentId,
    orientation: state.orientation,
    updatedAt: Date.now(),
    unsaved: state.document.kind === 'study-chapter',
  };
  await repositories.drafts.save(draft);

  if (state.document.kind !== 'study-chapter') return null;

  const chapter = await repositories.studies.getChapter(state.document.chapterId);
  if (!chapter) {
    throw new Error('That chapter no longer exists. Save this analysis to a new chapter.');
  }
  /*
    The revision offered is the one this *workspace* loaded, not the one just
    read back. Using the fresh read would make every write trivially valid and
    the conflict check decorative.
  */
  const written = await repositories.studies.saveChapter({
    ...chapter,
    tree: state.tree,
    revision: state.document.revision,
  });

  // The chapter now holds this work, so the draft is no longer a recovery.
  await repositories.drafts.save({
    ...draft,
    document: { ...state.document, revision: written.revision },
    unsaved: false,
  });
  return written;
}

/**
 * Reopen what was on screen.
 *
 * For a chapter the stored chapter normally wins over the draft copy of its
 * tree: the chapter is the record the user believes in. The exception is a
 * draft still marked `unsaved`, which means the last chapter write never
 * landed — a crash, a refused revision, a full disk. That draft holds work the
 * chapter does not, so it is offered rather than silently discarded, and
 * silently *applied* would be just as wrong: the user has to be told which
 * version they are looking at.
 */
async function restoreDraft(repositories: AppRepositories, draft: DraftRecord): Promise<void> {
  const analysis = useAnalysis.getState();

  if (draft.document.kind === 'study-chapter') {
    const chapter = await repositories.studies.getChapter(draft.document.chapterId);
    if (chapter) {
      if (draft.unsaved && !sameTree(draft.tree, chapter.tree)) {
        analysis.openDocument({
          tree: chapter.tree,
          document: { ...draft.document, title: chapter.title, revision: chapter.revision },
          currentId: chapter.tree.nodes[draft.currentId] ? draft.currentId : chapter.tree.rootId,
          orientation: draft.orientation,
        });
        analysis.offerRecovery({
          draft,
          chapterTitle: chapter.title,
          savedAt: chapter.updatedAt,
        });
        return;
      }
      analysis.openDocument({
        tree: chapter.tree,
        document: { ...draft.document, title: chapter.title, revision: chapter.revision },
        currentId: draft.currentId,
        orientation: draft.orientation,
      });
      return;
    }
    // The chapter was deleted elsewhere; keep the work rather than lose it.
    analysis.openDocument({
      tree: draft.tree,
      document: UNTITLED_DOCUMENT,
      currentId: draft.currentId,
      orientation: draft.orientation,
      clean: false,
    });
    useUi.getState().notify({
      tone: 'info',
      message: 'The chapter you were editing no longer exists.',
      detail: 'Your analysis was reopened as an untitled analysis.',
    });
    return;
  }

  analysis.openDocument({
    tree: draft.tree,
    document: draft.document,
    currentId: draft.currentId,
    orientation: draft.orientation,
  });
}

/**
 * Cheap enough to run on every start, exact enough to avoid a false offer.
 *
 * Node count first because it settles almost every case without walking
 * anything; the id comparison then catches an edit that replaced a move
 * without changing the size of the tree.
 */
function sameTree(a: DraftRecord['tree'], b: DraftRecord['tree']): boolean {
  const left = Object.keys(a.nodes);
  const right = Object.keys(b.nodes);
  if (left.length !== right.length) return false;
  for (const id of left) {
    const one = a.nodes[id];
    const other = b.nodes[id];
    if (!other || one?.move?.san !== other.move?.san) return false;
    if (one?.comment !== other.comment) return false;
  }
  return true;
}

const signature = (state: ReturnType<typeof useAnalysis.getState>): string =>
  `${state.revision}|${state.savedRevision}|${state.saving ? 1 : 0}`;

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : 'The browser rejected the write.';
