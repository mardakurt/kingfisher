'use client';

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import {
  invalidateReferences,
  useGameSummaries,
  useModelGamesForPosition,
  useRepertoires,
  useRepertoiresAtPosition,
  useStudyReferences,
  useTrainingItems,
} from '@/features/persistence/queries';
import { positionKey } from '@/chess/fen';
import { getRepositories } from '@/persistence/repositories';
import type { ChapterRecord } from '@/persistence/types';
import type { ResolvedStudyReference, StudyReferenceKind } from '@/persistence/domain';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

const GROUP: Record<StudyReferenceKind, string> = {
  'model-game': 'Model games',
  'repertoire-position': 'Repertoire',
  'training-item': 'Training',
};

export function ChapterReferences({ chapter }: { readonly chapter: ChapterRecord }) {
  const router = useRouter();
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const openDocument = useAnalysis((state) => state.openDocument);
  const fen = useAnalysis((state) => state.tree.nodes[state.currentId]?.fen ?? state.tree.startFen);
  const key = positionKey(fen);
  const references = useStudyReferences(chapter.id);
  const repertoires = useRepertoires();
  const repertoireHere = useRepertoiresAtPosition(key);
  const training = useTrainingItems();
  const modelLinks = useModelGamesForPosition(key);
  const summaries = useGameSummaries((modelLinks.data ?? []).map((link) => link.gameId));
  const setTrainingReferenceChapterId = useUi((state) => state.setTrainingReferenceChapterId);
  const setTrainingCaptureOpen = useUi((state) => state.setTrainingCaptureOpen);

  const existing = useMemo(
    () =>
      new Set(
        (references.data ?? []).map(
          (entry) => `${entry.reference.kind}:${entry.reference.targetId}`,
        ),
      ),
    [references.data],
  );
  const repertoireNames = new Map((repertoires.data ?? []).map((entry) => [entry.id, entry.title]));
  const summariesById = new Map((summaries.data ?? []).map((game) => [game.id, game]));
  const trainingHere = (training.data ?? []).filter((item) => item.positionKey === key);

  const link = async (kind: StudyReferenceKind, targetId: string, label: string) => {
    try {
      await (
        await getRepositories()
      ).references.create({ chapterId: chapter.id, kind, targetId, label });
      invalidateReferences(client, chapter.id);
    } catch (error) {
      notify({
        tone: 'error',
        message: 'The reference could not be linked.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const remove = async (id: string) => {
    await (await getRepositories()).references.delete(id);
    invalidateReferences(client, chapter.id);
  };

  const open = async (entry: ResolvedStudyReference) => {
    if (entry.missing) return;
    if (entry.gameId) {
      const game = await (await getRepositories()).games.get(entry.gameId);
      if (!game) return;
      openDocument({
        tree: game.tree,
        document: { kind: 'database-game', title: entry.label, gameId: game.id },
      });
      router.push('/analysis');
      return;
    }
    if (entry.repertoireId) {
      router.push(
        `/repertoire?repertoire=${encodeURIComponent(entry.repertoireId)}&position=${encodeURIComponent(entry.reference.targetId)}`,
      );
      return;
    }
    if (entry.trainingItemId) {
      router.push(`/training?item=${encodeURIComponent(entry.trainingItemId)}`);
    }
  };

  return (
    <Panel className="h-full border-0">
      <PanelHeader actions={<span>{references.data?.length ?? 0} linked</span>}>
        References
      </PanelHeader>
      <PanelBody className="space-y-4 overflow-y-auto">
        {references.isPending ? (
          <p className="text-xs text-tertiary">Reading chapter references…</p>
        ) : references.data?.length ? (
          (Object.keys(GROUP) as StudyReferenceKind[]).map((kind) => {
            const rows = references.data.filter((entry) => entry.reference.kind === kind);
            if (!rows.length) return null;
            return (
              <section key={kind}>
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  {GROUP[kind]}
                </h3>
                <ul className="space-y-1">
                  {rows.map((entry) => (
                    <li
                      key={entry.reference.id}
                      className="flex items-center gap-2 rounded-[4px] border border-line-subtle bg-surface-inset p-2"
                    >
                      <button
                        type="button"
                        disabled={entry.missing}
                        onClick={() => void open(entry)}
                        className="min-w-0 flex-1 truncate text-left text-xs text-primary disabled:text-tertiary"
                      >
                        {entry.missing
                          ? `Missing reference · ${entry.reference.label}`
                          : entry.label}
                      </button>
                      <Button variant="ghost" onClick={() => void remove(entry.reference.id)}>
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        ) : (
          /*
            Deliberately a short paragraph rather than the centred EmptyState
            component: this panel's actions live below it, and an empty state
            that grows to fill the panel pushed them off screen.
          */
          <p className="text-xs leading-relaxed text-tertiary">
            No references yet. Link the model games, repertoire positions and training items this
            chapter is about — the originals stay where they are.
          </p>
        )}

        <section className="border-t border-line-subtle pt-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            Link current position
          </h3>
          <div className="mt-2 space-y-1.5">
            {(repertoireHere.data ?? []).map((position) => (
              <Button
                key={position.id}
                className="w-full justify-start"
                disabled={existing.has(`repertoire-position:${position.id}`)}
                onClick={() =>
                  void link(
                    'repertoire-position',
                    position.id,
                    `${repertoireNames.get(position.repertoireId) ?? 'Repertoire'} → ${position.moves.map((move) => move.san).join(' / ')}`,
                  )
                }
              >
                Link {repertoireNames.get(position.repertoireId) ?? 'repertoire'}
              </Button>
            ))}
            {(modelLinks.data ?? []).map((model) => {
              const game = summariesById.get(model.gameId);
              const label = game
                ? `${game.white} – ${game.black}${game.year ? `, ${game.year}` : ''}`
                : 'Model game';
              return (
                <Button
                  key={model.id}
                  className="w-full justify-start"
                  disabled={existing.has(`model-game:${model.gameId}`)}
                  onClick={() => void link('model-game', model.gameId, label)}
                >
                  Link {label}
                </Button>
              );
            })}
            {trainingHere.map((item) => (
              <Button
                key={item.id}
                className="w-full justify-start"
                disabled={existing.has(`training-item:${item.id}`)}
                onClick={() => void link('training-item', item.id, item.prompt)}
              >
                Link training · {item.prompt}
              </Button>
            ))}
            <Button
              variant="accent"
              className="w-full justify-start"
              onClick={() => {
                setTrainingReferenceChapterId(chapter.id);
                setTrainingCaptureOpen(true);
              }}
            >
              Create training item and link
            </Button>
          </div>
        </section>
      </PanelBody>
    </Panel>
  );
}
