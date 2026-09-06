'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { positionKey } from '@/chess/fen';
import { asFen, asSan, asUci } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { invalidateTraining, useTrainingItems } from '@/features/persistence/queries';
import { reviewKeys } from '@/features/review/queries';
import type { RepertoireWithPositions } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { cardFor, planEnrolment } from '@/repertoire/enrol';
import { buildReviewSession, describePromptReason, type DrillMode } from '@/repertoire/review';

const MODES: readonly { id: DrillMode; label: string }[] = [
  { id: 'my-move', label: 'My move' },
  { id: 'opponent-reply', label: 'Opponent response' },
  { id: 'full-branch', label: 'Full branch positions' },
  { id: 'critical', label: 'Critical only · multiple prepared answers' },
];

export function RepertoireReviewDialog({
  repertoire,
  onClose,
}: {
  readonly repertoire: RepertoireWithPositions;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const training = useTrainingItems();
  const [mode, setMode] = useState<DrillMode>('my-move');
  const [dueOnly, setDueOnly] = useState(true);
  const [limit, setLimit] = useState(40);
  const [now] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prompts = useMemo(
    () =>
      buildReviewSession(
        {
          positions: repertoire.positions,
          colour: repertoire.repertoire.color,
          existingItems: training.data ?? [],
        },
        { mode, dueOnly, limit, now },
      ),
    [repertoire, training.data, mode, dueOnly, limit, now],
  );
  const plan = planEnrolment(prompts, training.data ?? []);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const repositories = await getRepositories();
      const items = await repositories.training.enrolRepertoire(
        prompts.map((prompt) => {
          const card = cardFor(prompt, {
            id: repertoire.repertoire.id,
            name: repertoire.repertoire.title,
          });
          return {
            ...card,
            positionKey: positionKey(card.fen),
            fen: asFen(card.fen),
            solutionUci: card.solutionUci.map(asUci),
            solutionSan: card.solutionSan.map(asSan),
            candidatesUci: [],
            answerSource: 'repertoire' as const,
          };
        }),
      );
      const name = `Review ${repertoire.repertoire.title} · ${MODES.find((value) => value.id === mode)?.label}`;
      const existing = (await repositories.trainingSets.list()).find(
        (set) => set.name === name && set.kind === 'static',
      );
      const set = existing
        ? await repositories.trainingSets.addItems(
            existing.id,
            existing.revision,
            items.map((item) => item.id),
          )
        : await repositories.trainingSets.create({
            name,
            kind: 'static',
            itemIds: items.map((item) => item.id),
          });
      invalidateTraining(client);
      await client.invalidateQueries({ queryKey: reviewKeys.sets });
      onClose();
      router.push(`/training?set=${encodeURIComponent(set.id)}${dueOnly ? '' : '&scope=all'}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Review could not start.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Review repertoire"
      description={`${repertoire.repertoire.title} · one prompt per canonical position and prepared answer set. Uses your existing training schedule.`}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="accent"
            disabled={busy || training.isPending || prompts.length === 0}
            onClick={() => void start()}
          >
            {busy ? 'Preparing…' : 'Start repertoire review'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <label className="block">
          Drill mode
          <select
            aria-label="Drill mode"
            className="mt-1 block w-full rounded border border-line bg-surface-inset p-2"
            value={mode}
            onChange={(event) => setMode(event.target.value as DrillMode)}
          >
            {MODES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={dueOnly}
            onChange={(event) => setDueOnly(event.target.checked)}
          />
          Due only, including new positions
        </label>
        <label className="block">
          Session limit
          <input
            aria-label="Session limit"
            className="ml-2 w-20 rounded border border-line bg-surface-inset p-1"
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={(event) =>
              setLimit(Math.max(1, Math.min(200, Number(event.target.value) || 1)))
            }
          />
        </label>
        <p role="status">
          {prompts.length} prompts · {plan.toCreate.length} new · {plan.alreadyCovered.length}{' '}
          already scheduled
        </p>
        {prompts.length === 0 && (
          <p>
            No prepared positions match this selection. Candidate and Avoid moves are not accepted
            recall answers.
          </p>
        )}
        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {prompts.map((prompt) => (
            <li key={prompt.positionKey} className="border-t border-line-subtle pt-2">
              <span>
                {prompt.sideToMove === 'w' ? 'White' : 'Black'} to move · {prompt.depth} plies from
                start · {prompt.reasons.map(describePromptReason).join(' · ')}
              </span>
              <p className="text-tertiary">
                Last reviewed:{' '}
                {prompt.schedule.lastReviewedAt
                  ? new Date(prompt.schedule.lastReviewedAt).toLocaleDateString()
                  : 'never'}{' '}
                · Next due: {new Date(prompt.schedule.dueAt).toLocaleDateString()} · Interval:{' '}
                {prompt.schedule.intervalDays} days
              </p>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-negative">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
