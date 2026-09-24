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
import { useQueryClient } from '@tanstack/react-query';

import { autosaveDelay } from '@/persistence/autosave';
import { newerDraft, takeUnloadDraft, writeUnloadDraft } from '@/persistence/unload-draft';
import { beginSession, releaseHeldDraft, shouldHoldDraft } from '@/persistence/session-launch';
import { ensurePersistenceForAuthoredWork } from '@/persistence/storage-persistence';
import { getRepositories } from '@/persistence/repositories';
import { announceChapterSaved, subscribeCrossTab } from '@/persistence/cross-tab';
import type { AppRepositories, ChapterRecord, DraftRecord } from '@/persistence/types';
import { StaleChapterWriteError } from '@/persistence/types';
import { useAnalysis, selectDirty, UNTITLED_DOCUMENT } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

import { invalidateStudies } from './queries';

/**
 * One answer per page load. The effect that asks is mounted twice under
 * StrictMode and again on every route change, and the second asking must not
 * read the marker the first one wrote — the question is about the page load,
 * not the mount.
 */
let launch: boolean | null = null;

/**
 * Settles once this page load's draft restore has finished — restored, held,
 * or found nothing. Workspace tabs wait on it before capturing the board: a
 * switch made in the moment between a reload and the restore landing would
 * otherwise file an empty board as the tab's work, and the restore would then
 * put that tab's moves on another tab's board.
 */
let settleRestore: () => void = () => undefined;
const restoreSettled = new Promise<void>((resolve) => {
  settleRestore = resolve;
});
export const workspaceRestored = (): Promise<void> => restoreSettled;
const sessionStore = () => (typeof window === 'undefined' ? null : window.sessionStorage);
/**
 * The unload draft, taken once per page load. The restore effect runs twice
 * under StrictMode; the first pass is abandoned mid-flight, and a draft it
 * had taken (and removed from storage) was then missing for the second.
 */
let unloadTaken: { readonly draft: DraftRecord | null } | null = null;
const takeUnloadOnce = (): DraftRecord | null =>
  (unloadTaken ??= { draft: takeUnloadDraft(localStore()) }).draft;
const localStore = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};
const freshLaunch = (): boolean => {
  launch ??= beginSession(sessionStore());
  return launch;
};

/**
 * Put the stored draft back on the board, on request. Recent's "Continue"
 * calls this when the workspace is still the untouched initial position of a
 * fresh launch; a session that already has work on the board is left alone.
 * Returns whether a draft was restored.
 */
export async function continueStoredDraft(): Promise<boolean> {
  const repositories = await getRepositories();
  const draft = await repositories.drafts.get();
  if (!draft) return false;
  if (useAnalysis.getState().revision !== 0) return false;
  await restoreDraft(repositories, draft);
  // From here this session is working on it again, so a reload restores it.
  releaseHeldDraft(sessionStore());
  return true;
}

/** Wired once, in the shell, so every route keeps the same session alive. */
export function useWorkspacePersistence(): void {
  const client = useQueryClient();
  /** Set on mount rather than at render time, so the hook stays pure. */
  const lastChangeAt = useRef(0);
  const firstUnsavedAt = useRef<number | null>(null);
  const lastRevision = useRef(-1);
  /*
    Whether the stored draft still describes what is on screen.
    True at the start of a session, and again whenever the open document
    changes: opening an imported game left nothing dirty, so autosave never
    ran, so nothing was written — and the indicator said "Draft saved" about a
    board that a reload emptied. A draft is cheap; claiming one that does not
    exist is not.
  */
  const draftStale = useRef(true);
  const lastDocument = useRef('');
  /**
   * A stored draft this launch chose not to put on the board. While it is
   * held and nothing has happened here (`revision === 0`), the autosave must
   * not write the empty board over it: that would turn "not shown" into
   * "gone". The first move, import or open here releases it — the draft is
   * one slot, "what is on screen", and from then on this is what is.
   */
  const heldDraft = useRef(false);

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

    /*
      Phase 72: a fresh launch opens on the initial position. The draft is
      restored to the board only for a reload of the session it was written
      in; on a new launch it is *held* — kept in storage, offered by Recent as
      "Continue …", and not overwritten by the empty board until the person
      does something here (see `save`). See `persistence/session-launch.ts`.
    */
    const hold = shouldHoldDraft(sessionStore(), freshLaunch());

    void (async () => {
      try {
        const repositories = await getRepositories();
        /*
          The draft a page wrote as it went away (unload-draft.ts), when it is
          newer than the stored one: the work of the last moments before a
          reload, which the IndexedDB write did not live to store. Stored
          straight away, so the one slot holds it however this load goes on.
        */
        const unload = takeUnloadOnce();
        const stored = await repositories.drafts.get();
        const draft = newerDraft(unload, stored);
        const continuation = Boolean(unload) && draft === unload;
        if (continuation && draft) await repositories.drafts.save(draft);
        if (!active || !draft) return;

        // Checked here rather than on mount: storage takes a moment to open,
        // and anything the user played in the meantime outranks the draft.
        if (useAnalysis.getState().revision !== 0) return;

        if (hold) {
          heldDraft.current = true;
          return;
        }
        await restoreDraft(repositories, draft, { continuation });
      } catch (error) {
        if (!active) return;
        useUi.getState().notify({
          tone: 'error',
          message: 'Saved work could not be read from this browser.',
          detail: describe(error),
        });
      }
    })().finally(() => {
      if (active) settleRestore();
    });

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
      const dirty = selectDirty(state);
      // A refused write would only be refused again; the user has to choose.
      if ((!dirty && !draftStale.current) || state.saving || state.conflict) return;
      // The held draft outranks an untouched board (see `heldDraft`).
      if (heldDraft.current && state.revision === 0) return;
      /*
        Past that guard this session has work of its own, so it is no longer
        holding anything: the draft about to be written is this session's and
        a reload must bring it back. That is the crash-safety the draft
        exists for; all Phase 72 changed is which session gets it back
        without asking. Released on every save rather than only when a draft
        was held, because a session that started with an empty store never
        held one and still owns what it writes.
      */
      heldDraft.current = false;
      releaseHeldDraft(sessionStore());

      const revision = state.revision;
      state.markSaving();
      try {
        const repositories = await getRepositories();
        // Nothing has changed, so a chapter write would only inflate its
        // revision and wake other tabs; the draft is the whole point here.
        const written = await writeWorkspace(repositories, state, { draftOnly: !dirty });
        draftStale.current = false;
        if (disposed) return;
        if (written) {
          useAnalysis.getState().setDocumentRevision(written.revision);
          announceChapterSaved(written.id, written.revision);
          /*
            Autosave is the only writer that used to change chapters without
            telling the cache. Anything derived from a chapter's moves — the
            stored move orders in particular, which are cached for a minute —
            was therefore answering from before this edit.
          */
          invalidateStudies(client, written.studyId);
        }
        useAnalysis.getState().markSaved(revision);
        // The person has now authored something worth keeping — a draft
        // counts, an untitled analysis is work — so ask the browser, once,
        // to keep this origin's storage out of eviction.
        void ensurePersistenceForAuthoredWork();
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
        dirty: selectDirty(state) || draftStale.current,
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

      /*
        Every open is a new document, even one with the same title: two
        untitled analyses serialise identically, and a workspace tab switch
        (or New tab) that swapped one for the other left the stored draft
        describing the board before it — which a reload then put back. The
        generation is bumped by every open and by nothing else.
      */
      const openDocument = `${documentKey(state)}#${state.generation}`;
      if (openDocument !== lastDocument.current) {
        lastDocument.current = openDocument;
        draftStale.current = true;
      }
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
    /*
      `pagehide` saves whatever the visibility says. A reload or a navigation
      away fires it while the page is still "visible", and the check above
      made this handler a no-op exactly then: a move played in a study chapter
      and followed by a reload inside the 900 ms debounce was lost, while the
      header said "Saved" (found in Phase 84 by e2e/chapter-questions.spec.ts;
      pinned by e2e/study-reload.spec.ts). An IndexedDB write started here is
      not guaranteed to finish before the page goes — it is started as early
      as anything can start it, and the draft written with it is what the
      reload restores.
    */
    const flushOnHide = () => {
      const state = useAnalysis.getState();
      /*
        Only work that is really unsaved, and never from a session holding a
        draft it has not touched: a fresh launch keeps the last session's draft
        without showing it, and an unload draft of its empty board, taken on
        the next load as "newer", replaced the held work. `e2e/launch-board`
        caught it.
      */
      const holding = heldDraft.current && state.revision === 0;
      if (selectDirty(state) && !holding) {
        writeUnloadDraft(localStore(), {
          id: 'active',
          document: state.document,
          tree: state.tree,
          currentId: state.currentId,
          orientation: state.orientation,
          updatedAt: Date.now(),
          unsaved: state.document.kind === 'study-chapter' && selectDirty(state),
        });
      }
      void save();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flushOnHide);

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
      window.removeEventListener('pagehide', flushOnHide);
    };
    // The query client is a stable per-application instance; listing it would
    // suggest this autosave session can be torn down and rebuilt, which is the
    // one thing it must not do while an edit is in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  options: { readonly draftOnly?: boolean } = {},
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

  if (options.draftOnly) return null;
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
async function restoreDraft(
  repositories: AppRepositories,
  draft: DraftRecord,
  options: { readonly continuation?: boolean } = {},
): Promise<void> {
  const analysis = useAnalysis.getState();

  if (draft.document.kind === 'study-chapter') {
    const chapter = await repositories.studies.getChapter(draft.document.chapterId);
    if (chapter) {
      /*
        A draft this session wrote as the page went away, on a chapter nobody
        has written since (the revision it was edited from is still the
        chapter's): it is the same document a moment later, not a rival
        version, so it is put back as the work in progress — dirty, so
        autosave writes it to the chapter — rather than offered as a recovery.
      */
      if (
        options.continuation &&
        draft.unsaved &&
        draft.document.revision === chapter.revision &&
        !sameTree(draft.tree, chapter.tree)
      ) {
        analysis.openDocument({
          tree: draft.tree,
          document: { ...draft.document, title: chapter.title, revision: chapter.revision },
          currentId: draft.tree.nodes[draft.currentId] ? draft.currentId : draft.tree.rootId,
          orientation: draft.orientation,
          clean: false,
        });
        return;
      }
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

/*
  The identity of the open document, so switching to another one is treated as
  something the draft has to catch up with even when no move was played.
*/
const documentKey = (state: ReturnType<typeof useAnalysis.getState>): string =>
  JSON.stringify(state.document);

const signature = (state: ReturnType<typeof useAnalysis.getState>): string =>
  `${state.revision}|${state.savedRevision}|${state.saving ? 1 : 0}|${state.generation}|${documentKey(state)}`;

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : 'The browser rejected the write.';
