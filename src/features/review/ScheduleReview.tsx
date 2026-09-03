'use client';

/**
 * "When should I think about this again?"
 *
 * Asked once, after the reveal, in the terms a player thinks in. They know
 * "soon" or "this is solid now"; they do not know an ease factor, and a form
 * that asked for one would be asking the wrong person.
 *
 * The distinction from training is the whole reason this exists separately.
 * Training asks *what is the move here* and checks an answer. Review asks *how
 * did I think here* and has nothing to check — the player rebuilds their
 * reasoning and compares it to what they wrote. Being able to recall a move
 * says nothing about being able to rebuild the plan, so the two schedules are
 * kept apart even though one implementation drives both.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { invalidateReview } from '@/features/persistence/queries';
import { getRepositories } from '@/persistence/repositories';
import type { ReviewItemRecord } from '@/persistence/domain';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

import {
  describeNextReview,
  scheduleAfterReview,
  SCHEDULING_CHOICES,
  type ReviewSchedulingChoice,
} from './scheduling';

export function ScheduleReview({ item }: { readonly item: ReviewItemRecord }) {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const [saving, setSaving] = useState<ReviewSchedulingChoice | null>(null);
  const [now] = useState(() => Date.now());

  const choose = async (choice: ReviewSchedulingChoice) => {
    setSaving(choice);
    try {
      const { schedule } = await applyChoice(item.id, choice);
      invalidateReview(client);
      notify({
        tone: 'success',
        message:
          choice === 'never'
            ? 'This position will not come back.'
            : `Scheduled: ${describeSchedule(schedule).toLowerCase()}.`,
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not schedule this review.',
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="border-t border-line-subtle px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <h4 className="text-[9.5px] uppercase tracking-wide text-tertiary">Review again</h4>
        <span className="text-[10px] text-secondary">{describeNextReview(item.schedule, now)}</span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-tertiary">
        Separate from training. Training asks for the move; this asks you to rebuild the thinking
        and compare it with what you wrote.
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {SCHEDULING_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            title={choice.detail}
            disabled={saving !== null}
            onClick={() => void choose(choice.id)}
            className={cn(
              'rounded-[4px] border px-1.5 py-0.5 text-[10.5px] transition-colors',
              'border-line text-secondary hover:border-accent/50 hover:text-primary',
              'disabled:opacity-50',
            )}
          >
            {saving === choice.id ? '…' : choice.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** The due list, for the queue header. */
export function DueReviewsNotice({
  due,
  onOpen,
}: {
  readonly due: readonly ReviewItemRecord[];
  readonly onOpen: (item: ReviewItemRecord) => void;
}) {
  if (due.length === 0) return null;
  return (
    <div className="flex items-center gap-2 border-b border-line-subtle bg-surface-2 px-3 py-1.5">
      <span className="text-[10.5px] text-secondary">
        {due.length} position{due.length === 1 ? '' : 's'} due for review
      </span>
      <Button className="ml-auto" onClick={() => onOpen(due[0]!)}>
        Start
      </Button>
    </div>
  );
}

/**
 * Apply a scheduling choice, reading the clock outside render.
 *
 * At module scope on purpose: this is where the clock is read, and React's
 * purity rule is correct that a component body is not the place for it. It
 * also re-reads the item, so the revision it writes against is the current
 * one rather than whatever was rendered a moment ago.
 */
async function applyChoice(itemId: string, choice: ReviewSchedulingChoice) {
  const now = Date.now();
  const repositories = await getRepositories();
  const current = await repositories.review.getReviewItem(itemId);
  if (!current) throw new Error('That position is no longer in the queue.');
  const schedule = scheduleAfterReview(current.schedule, choice, now);
  await repositories.review.scheduleReviewItem(current.id, current.revision, schedule);
  return { schedule, now };
}

const describeSchedule = (schedule: ReturnType<typeof scheduleAfterReview>): string =>
  describeNextReview(schedule, Date.now());
