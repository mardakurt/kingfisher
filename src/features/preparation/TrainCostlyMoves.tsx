'use client';

/**
 * "Train these positions": the costly moves of a report, as drills.
 *
 * The bridge between the report and the Training scheduler the costly-moves
 * panel lacked: each position before a costly move becomes a best-move card
 * whose answer is the engine's preferred move, labelled as engine-derived.
 * A position already drilled with the same answer is reused rather than
 * duplicated, and the cards are gathered into one named set — "<player> —
 * costly moves" — so a second run of the report refreshes the set instead
 * of adding another.
 */

import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { Button } from '@/components/ui/Button';
import { invalidateTraining } from '@/features/persistence/queries';
import { reviewKeys } from '@/features/review/queries';
import { plural } from '@/lib/plural';
import { getRepositories } from '@/persistence/repositories';
import type { CostlyMove } from '@/preparation/costly-moves';
import { drillsFromCostlyMoves } from '@/preparation/costly-training';
import { useUi } from '@/stores/ui-store';

export function TrainCostlyMoves({
  name,
  moves,
}: {
  readonly name: string;
  readonly moves: readonly CostlyMove[];
}) {
  const drills = useMemo(() => drillsFromCostlyMoves(moves), [moves]);
  const notify = useUi((state) => state.notify);
  const client = useQueryClient();
  const router = useRouter();

  const train = useMutation({
    mutationFn: async () => {
      const repositories = await getRepositories();
      const existing = (await repositories.training.list()).filter(
        (item) => item.mode === 'best-move',
      );
      const ids: string[] = [];
      let created = 0;
      for (const drill of drills) {
        const known = existing.find(
          (item) =>
            item.positionKey === drill.positionKey &&
            item.solutionUci.join(' ') === drill.solutionUci.join(' '),
        );
        if (known) {
          ids.push(known.id);
          continue;
        }
        const item = await repositories.training.create({
          mode: 'best-move',
          positionKey: drill.positionKey,
          fen: drill.fen,
          sideToMove: drill.sideToMove,
          prompt: drill.prompt,
          solutionUci: drill.solutionUci,
          solutionSan: drill.solutionSan,
          candidatesUci: [],
          plans: [],
          tags: drill.tags,
          explanation: drill.explanation,
          source: drill.source,
          answerSource: 'engine',
        });
        ids.push(item.id);
        created += 1;
      }
      const setName = `${name} — costly moves`;
      const set = (await repositories.trainingSets.list()).find(
        (entry) => entry.name === setName && entry.kind === 'static',
      );
      const saved = set
        ? await repositories.trainingSets.replaceItems(set.id, set.revision, ids)
        : await repositories.trainingSets.create({ name: setName, kind: 'static', itemIds: ids });
      invalidateTraining(client);
      await client.invalidateQueries({ queryKey: reviewKeys.sets });
      return { set: saved, created, total: ids.length };
    },
    onSuccess: ({ set, created, total }) => {
      const reused = total - created;
      notify({
        tone: 'success',
        message: `${plural(total, 'position')} in "${set.name}"${reused ? ` (${reused} already being trained)` : ''}. Find the engine’s move in each.`,
      });
      router.push(`/training?set=${encodeURIComponent(set.id)}&scope=all`);
    },
    onError: (error) => {
      notify({
        tone: 'error',
        message: 'The training set could not be created.',
        detail: error instanceof Error ? error.message : undefined,
      });
    },
  });

  if (drills.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3" data-costly-train>
      <Button variant="subtle" size="sm" disabled={train.isPending} onClick={() => train.mutate()}>
        {train.isPending ? 'Preparing…' : `Train these ${plural(drills.length, 'position')}`}
      </Button>
      <p className="text-[11px] text-tertiary">
        Each becomes a card: the position before the costly move, answered with the move the engine
        preferred.
      </p>
    </div>
  );
}
