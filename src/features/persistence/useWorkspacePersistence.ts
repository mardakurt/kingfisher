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
import type { AppRepositories, DraftRecord } from '@/persistence/types';
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
      if (!selectDirty(state) || state.saving) return;

      const revision = state.revision;
      state.markSaving();
      try {
        const repositories = await getRepositories();
        await writeWorkspace(repositories, state);
        if (disposed) return;
        useAnalysis.getState().markSaved(revision);
        firstUnsavedAt.current = null;
      } catch (error) {
        if (disposed) return;
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

    // A hidden tab may never come back. This is best effort: IndexedDB gives no
    // guarantee that a write started here completes, which is exactly why the
    // debounce above is short enough that little is ever at risk.
    const flush = () => {
      if (document.visibilityState === 'hidden') void save();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);

    schedule();

    return () => {
      disposed = true;
      clear();
      unsubscribe();
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
}

async function writeWorkspace(
  repositories: AppRepositories,
  state: ReturnType<typeof useAnalysis.getState>,
): Promise<void> {
  const draft: DraftRecord = {
    id: 'active',
    document: state.document,
    tree: state.tree,
    currentId: state.currentId,
    orientation: state.orientation,
    updatedAt: Date.now(),
  };

  if (state.document.kind === 'study-chapter') {
    const chapter = await repositories.studies.getChapter(state.document.chapterId);
    if (!chapter) {
      throw new Error('That chapter no longer exists. Save this analysis to a new chapter.');
    }
    await repositories.studies.saveChapter({ ...chapter, tree: state.tree });
  }

  await repositories.drafts.save(draft);
}

/**
 * Reopen what was on screen.
 *
 * For a chapter the stored chapter wins over the draft copy of its tree: the
 * chapter is the record the user believes in, and a draft written moments
 * earlier by the same pass can only be equal or older.
 */
async function restoreDraft(repositories: AppRepositories, draft: DraftRecord): Promise<void> {
  const analysis = useAnalysis.getState();

  if (draft.document.kind === 'study-chapter') {
    const chapter = await repositories.studies.getChapter(draft.document.chapterId);
    if (chapter) {
      analysis.openDocument({
        tree: chapter.tree,
        document: { ...draft.document, title: chapter.title },
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

const signature = (state: ReturnType<typeof useAnalysis.getState>): string =>
  `${state.revision}|${state.savedRevision}|${state.saving ? 1 : 0}`;

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : 'The browser rejected the write.';
