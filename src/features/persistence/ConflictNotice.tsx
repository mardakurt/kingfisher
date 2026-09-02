'use client';

/**
 * What the user sees when two tabs disagree about a chapter.
 *
 * Rendered as a bar across the workspace rather than a modal: the analysis
 * underneath is still valid, still theirs, and still editable, and trapping
 * them in a dialog would imply otherwise. Autosave is paused while this is up
 * — every write would be refused anyway — so the bar states that plainly
 * rather than letting a "Saved" indicator quietly lie.
 *
 * There is no merge button. Merging two game trees means choosing which
 * variation wins at every divergence, and a wrong guess invents analysis the
 * user never played. Reload theirs, or fork mine: both are honest.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Warning } from '@/components/icons';
import { invalidateStudies } from '@/features/persistence/queries';
import { getRepositories } from '@/persistence/repositories';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

export function ConflictNotice() {
  const conflict = useAnalysis((state) => state.conflict);
  const document = useAnalysis((state) => state.document);
  const [busy, setBusy] = useState<'reload' | 'copy' | null>(null);
  const notify = useUi((state) => state.notify);
  const client = useQueryClient();

  if (!conflict || document.kind !== 'study-chapter') return null;
  if (document.chapterId !== conflict.chapterId) return null;

  const reload = async () => {
    setBusy('reload');
    try {
      const repositories = await getRepositories();
      const chapter = await repositories.studies.getChapter(conflict.chapterId);
      if (!chapter) throw new Error('That chapter no longer exists.');
      const state = useAnalysis.getState();
      state.openDocument({
        tree: chapter.tree,
        document: { ...document, title: chapter.title, revision: chapter.revision },
        orientation: state.orientation,
      });
      state.clearConflict();
      notify({ tone: 'info', message: 'Reloaded the version saved by the other tab.' });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'That version could not be read.',
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const saveCopy = async () => {
    setBusy('copy');
    try {
      const state = useAnalysis.getState();
      const repositories = await getRepositories();
      // A new chapter, so neither version is overwritten and the user can
      // compare them side by side before deciding what to keep.
      const copy = await repositories.studies.createChapter({
        studyId: document.studyId,
        title: `${document.title} (this tab)`,
        tree: state.tree,
      });
      state.openDocument({
        tree: copy.tree,
        document: { ...document, title: copy.title, chapterId: copy.id, revision: copy.revision },
        orientation: state.orientation,
      });
      state.clearConflict();
      invalidateStudies(client, document.studyId);
      notify({ tone: 'success', message: `Saved this tab's work as "${copy.title}".` });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'This version could not be saved as a copy.',
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="alert"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-caution/40 bg-caution/10 px-4 py-2.5"
    >
      <Warning className="h-4 w-4 shrink-0 text-caution" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary">
          This chapter changed in another Kingfisher tab.
        </p>
        <p className="text-xs text-secondary">
          Autosave is paused so neither version is overwritten. Your work here is still open and
          unsaved.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button onClick={() => void saveCopy()} disabled={busy !== null} variant="accent">
          {busy === 'copy' ? 'Saving…' : 'Save my version as a copy'}
        </Button>
        <Button onClick={() => void reload()} disabled={busy !== null}>
          {busy === 'reload' ? 'Reloading…' : 'Discard mine, reload latest'}
        </Button>
      </div>
    </div>
  );
}
