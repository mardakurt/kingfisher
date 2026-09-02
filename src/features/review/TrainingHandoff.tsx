'use client';

/**
 * The last step of a review: turn what you just learned into practice.
 *
 * This is the join that makes the whole workflow worth doing —
 * game → review → theme → training → re-review — and it is one action rather
 * than three, because a player who has to create an item, find a set and mark
 * the queue entry will do the first and forget the other two.
 *
 * The set is chosen here and applied by the capture dialog, which already owns
 * authoring an answer. Nothing about the training item is invented on the
 * player's behalf: the dialog still asks what the position is asking.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { invalidateReview } from '@/features/persistence/queries';
import { getRepositories } from '@/persistence/repositories';
import type { ReviewItemRecord } from '@/persistence/domain';
import { useUi } from '@/stores/ui-store';

import { useTrainingSets } from './queries';

const NEW_SET = '__new__';

export function TrainingHandoff({
  reviewItem,
}: {
  /** The queue entry this position came from, when it came from one. */
  readonly reviewItem?: ReviewItemRecord | null;
}) {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const setCaptureOpen = useUi((state) => state.setTrainingCaptureOpen);
  const setCaptureTarget = useUi((state) => state.setTrainingCaptureTarget);
  const sets = useTrainingSets();
  const [choice, setChoice] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      let setId: string | null = null;
      if (choice === NEW_SET) {
        const name = newName.trim();
        if (!name) {
          notify({ tone: 'error', message: 'Give the new training set a name.' });
          return;
        }
        const repositories = await getRepositories();
        const created = await repositories.trainingSets.create({ name, kind: 'static' });
        setId = created.id;
        setNewName('');
        setChoice(created.id);
        invalidateReview(client);
      } else if (choice) {
        setId = choice;
      }
      setCaptureTarget({ setId, reviewItemId: reviewItem?.id ?? null });
      setCaptureOpen(true);
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That could not be started.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
        Turn this into practice
      </h3>
      <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">
        Creates a training position from this exact position. Choose a set to put it in, or leave it
        loose.
      </p>
      <label className="mt-2 block text-[10px] text-tertiary">
        Training set
        <select
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          aria-label="Training set"
          className="mt-1 h-7 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-[11px] text-primary outline-none focus:border-accent/60"
        >
          <option value="">No set</option>
          {(sets.data ?? []).map((set) => (
            <option key={set.id} value={set.id}>
              {set.name}
              {set.kind === 'dynamic' ? ' (filters)' : ''}
            </option>
          ))}
          <option value={NEW_SET}>New set…</option>
        </select>
      </label>
      {choice === NEW_SET ? (
        <label className="mt-1.5 block text-[10px] text-tertiary">
          New set name
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Trade decisions"
            aria-label="New set name"
            className="mt-1 h-7 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-[11px] text-primary outline-none focus:border-accent/60"
          />
        </label>
      ) : null}
      {(sets.data ?? []).find((set) => set.id === choice)?.kind === 'dynamic' ? (
        <p className="mt-1.5 text-[10px] leading-relaxed text-caution">
          That set decides its own membership from its filters, so the new item joins only if it
          matches them. Tag the item to match, or choose a static set.
        </p>
      ) : null}
      <Button variant="accent" className="mt-2" disabled={busy} onClick={() => void start()}>
        Create training position
      </Button>
    </div>
  );
}
