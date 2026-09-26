'use client';

/**
 * "Add stored evaluations" on a study chapter, and its undo (Phase 86).
 *
 * The evaluations come from what the analysis queue and deep analysis have
 * stored, by canonical position (`src/evidence/write-back.ts`); the write is
 * one transaction against the revision this tab holds
 * (`analysis-write-back-repository.ts`). The tab must have nothing unsaved:
 * the write goes to the stored chapter and the tab then reloads it, which
 * would otherwise discard the edits autosave had not yet written.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { positionKey } from '@/chess/fen';
import { mainlinePath } from '@/chess/tree/tree';
import { planWriteBack } from '@/evidence/write-back';
import type { StoredEngineEvidenceRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import type { ChapterRecord } from '@/persistence/types';
import { selectDirty, useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function useEvaluationWriteBack() {
  const document = useAnalysis((state) => state.document);
  const dirty = useAnalysis(selectDirty);
  const notify = useUi((state) => state.notify);
  const client = useQueryClient();
  const chapterId = document.kind === 'study-chapter' ? document.chapterId : null;
  const revision = document.kind === 'study-chapter' ? document.revision : null;

  const latest = useQuery({
    queryKey: ['analysis-write-back', chapterId, revision],
    enabled: chapterId !== null,
    queryFn: async () =>
      chapterId ? (await getRepositories()).analysisWriteBacks.latestApplied(chapterId) : null,
  });

  const reload = useCallback((chapter: ChapterRecord) => {
    const state = useAnalysis.getState();
    if (state.document.kind !== 'study-chapter') return;
    state.openDocument({
      tree: chapter.tree,
      document: { ...state.document, revision: chapter.revision },
      currentId: chapter.tree.nodes[state.currentId] ? state.currentId : chapter.tree.rootId,
      orientation: state.orientation,
      clean: true,
    });
  }, []);

  const refused = useCallback(() => {
    notify({
      tone: 'error',
      message:
        'This chapter changed in another tab, so nothing was written. Reload it, then try again on that version.',
    });
  }, [notify]);

  const add = useCallback(async () => {
    if (chapterId === null || revision === null) return;
    if (dirty) {
      notify({ tone: 'info', message: 'Wait for the chapter to save, then add the evaluations.' });
      return;
    }
    const repositories = await getRepositories();
    const stored = await repositories.studies.getChapter(chapterId);
    if (!stored) return;
    const keys = [
      ...new Set(mainlinePath(stored.tree).map((id) => positionKey(stored.tree.nodes[id]!.fen))),
    ];
    const held = new Map<string, readonly StoredEngineEvidenceRecord[]>(
      await Promise.all(
        keys.map(
          async (key) => [key, await repositories.analysisQueue.evidenceForPosition(key)] as const,
        ),
      ),
    );
    const outcome = await repositories.analysisWriteBacks.apply({
      chapterId,
      expectedRevision: revision,
      plan: (chapter) => planWriteBack(chapter.tree, (key) => held.get(key) ?? []),
    });
    if (outcome.status === 'blocked-on-merge') return refused();
    if (outcome.status === 'nothing') {
      notify({
        tone: 'info',
        message:
          outcome.plan.keptExisting > 0
            ? `Every analysed position here already has an evaluation (${plural(outcome.plan.keptExisting, 'position')}); none was replaced.`
            : 'No stored analysis covers this chapter’s main line yet. Queue the game for analysis first.',
      });
      return;
    }
    reload(outcome.chapter);
    await client.invalidateQueries({ queryKey: ['analysis-write-back', chapterId] });
    notify({
      tone: 'success',
      message:
        `Added ${plural(outcome.batch.entries.length, 'stored evaluation')}` +
        (outcome.batch.keptExisting
          ? `; ${plural(outcome.batch.keptExisting, 'existing evaluation')} kept as they were`
          : '') +
        '. Document actions → Undo added evaluations takes them out again.',
    });
  }, [chapterId, revision, dirty, notify, refused, reload, client]);

  const undo = useCallback(async () => {
    const batch = latest.data;
    if (!batch || revision === null) return;
    if (dirty) {
      notify({ tone: 'info', message: 'Wait for the chapter to save, then undo.' });
      return;
    }
    const outcome = await (await getRepositories()).analysisWriteBacks.undo(batch.id, revision);
    if (outcome.status === 'blocked-on-merge') return refused();
    if (outcome.status === 'already-undone') return;
    reload(outcome.chapter);
    await client.invalidateQueries({ queryKey: ['analysis-write-back', chapterId] });
    const kept = outcome.batch.undo?.keptChanged ?? 0;
    notify({
      tone: 'success',
      message:
        `Removed ${plural(outcome.batch.undo?.removed ?? 0, 'added evaluation')}` +
        (kept ? `; ${plural(kept, 'evaluation')} changed since were kept` : '') +
        '.',
    });
  }, [latest.data, revision, dirty, notify, refused, reload, client, chapterId]);

  return { available: chapterId !== null, canUndo: Boolean(latest.data), add, undo };
}
