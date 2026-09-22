'use client';

/**
 * The daily session — fifteen minutes, only your own material.
 *
 * Reads the four slices built by `src/daily/session.ts` and renders them in
 * the same order: repertoire (own-move training items due now), critical
 * positions (review items due now), one seeded endgame (tablebase-eligible
 * only), and the most recent brief's first three sheet cards.
 *
 * Grading reuses the existing SM-2 scheduler: a click writes a new
 * `ScheduleState` to the same record via the same repository the player
 * already trusts in `/review`. The audit trail is the schedule; there is no
 * separate "daily session" store.
 *
 * No invented score, no streak, no rating-gain claim — the headline says
 * "X rehearsed of Y" because that is the only honest count. The slice
 * heading tells the player which slice they are in and which input would
 * make an empty slice non-empty.
 *
 * See `docs/design/daily-session.md` for the design.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { useTrainingItems, useProfile } from '@/features/persistence/queries';
import { useReviewItems } from '@/features/review/queries';
import {
  useEndgamePositions,
  usePreparationSessions,
} from '@/features/preparation/queries';
import { buildDailySession, type DailySession, type SessionCard, type SliceId } from '@/daily/session';
import { Button } from '@/components/ui/Button';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { getRepositories } from '@/persistence/repositories';
import type { ReviewGrade } from '@/persistence/domain';
import type { Fen } from '@/chess/types';
import { grade as scheduleGrade, describeInterval } from '@/training/schedule';
import { createTree } from '@/chess/tree/tree';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { openPositionPage } from '@/features/position/open-position-page';

const SLICE_LABEL: Record<SliceId, string> = {
  repertoire: 'Repertoire',
  critical: 'Critical positions',
  endgame: 'Endgame',
  brief: 'Brief rehearsal',
};

const GRADES: readonly { id: ReviewGrade; label: string }[] = [
  { id: 'again', label: 'Again' },
  { id: 'hard', label: 'Hard' },
  { id: 'good', label: 'Good' },
  { id: 'easy', label: 'Easy' },
];

export function DailyWorkspace() {
  const training = useTrainingItems();
  const review = useReviewItems();
  const endgames = useEndgamePositions();
  const sessions = usePreparationSessions();
  const profile = useProfile();
  const openDocument = useAnalysis((state) => state.openDocument);
  const notify = useUi((state) => state.notify);
  const client = useQueryClient();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [graded, setGraded] = useState<ReadonlySet<string>>(() => new Set());
  const appliedHash = useRef<string | null>(null);

  const salt = profile.data?.id ?? 'anonymous';
  const session: DailySession | null = useMemo(() => {
    if (!training.data || !review.data || !endgames.data || !sessions.data) return null;
    return buildDailySession({
      training: training.data,
      review: review.data,
      endgame: endgames.data,
      sessions: sessions.data,
      now,
      endgameSalt: salt,
    });
  }, [training.data, review.data, endgames.data, sessions.data, now, salt]);

  /*
   * Reset the graded set when the underlying content hash changes —
   * e.g. a card was graded and removed from the queue by re-querying.
   * The schedule itself records what was attempted; this transient
   * state is only for the in-flight session, and a refresh is fine.
   */
  useEffect(() => {
    if (!session) return;
    if (appliedHash.current !== session.contentHash) {
      appliedHash.current = session.contentHash;
      setGraded(new Set());
    }
  }, [session]);

  const grade = useCallback(async (card: SessionCard, choice: ReviewGrade) => {
    if (card.kind !== 'repertoire' && card.kind !== 'critical') {
      // Endgame and brief cards have no schedule to update; the rehearsal
      // is logged in the player's own attempt, never against the source.
      setGraded((current) => {
        const next2 = new Set(current);
        next2.add(card.id);
        return next2;
      });
      notify({
        tone: 'info',
        message: 'Rehearsed. Endgame and brief cards do not reschedule themselves.',
      });
      return;
    }
    try {
      const repositories = await getRepositories();
      const next = scheduleGrade(card.schedule, choice, Date.now());
      if (card.kind === 'repertoire') {
        const current = training.data?.find((item) => item.id === card.id);
        if (!current) throw new Error('That card no longer exists.');
        await repositories.training.update({ ...current, schedule: next });
      } else {
        await repositories.review.scheduleReviewItem(
          card.id,
          card.schedule.reviewCount,
          next,
        );
      }
      setGraded((current) => {
        const next2 = new Set(current);
        next2.add(card.id);
        return next2;
      });
      void client.invalidateQueries({ queryKey: ['persistence', 'training'] });
      void client.invalidateQueries({ queryKey: ['persistence', 'review'] });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'The schedule did not update.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  }, [client, notify, training.data]);

  if (!session) {
    return (
      <WorkspaceFrame
        workspace="daily"
        title="Daily session"
        subtitle="Loading your work…"
      >
        <div data-daily="true" data-daily-count="0" data-daily-rehearsed="0">
          <Panel>
            <PanelHeader>
              <h2 className="text-sm font-semibold text-primary">Daily session</h2>
            </PanelHeader>
            <PanelBody>Reading your repertoire, review queue and saved endgame positions…</PanelBody>
          </Panel>
        </div>
      </WorkspaceFrame>
    );
  }

  const rehearsed = session.slices.reduce(
    (count, slice) => count + slice.cards.filter((card) => graded.has(card.id)).length,
    0,
  );
  const header =
    session.totalCount === 0
      ? `${session.minutes || 0} minutes · 0 rehearsed`
      : `${session.minutes} minutes · ${session.totalCount} positions · ${rehearsed} rehearsed`;

  const openOnBoard = (card: SessionCard) => {
    const orientation = card.kind === 'brief' ? 'w' : card.sideToMove;
    openDocument({
      tree: createTree(card.fen as Fen, {
        Event: `Daily · ${SLICE_LABEL[card.kind]}`,
        Result: '*',
      }),
      document: { kind: 'untitled', title: `Daily · ${SLICE_LABEL[card.kind]}` },
      orientation,
    });
  };

  return (
    <WorkspaceFrame
      workspace="daily"
      title="Daily session"
      subtitle={header}
    >
      <div
        className="flex flex-col gap-4"
        data-daily="true"
        data-daily-count={session.totalCount}
        data-daily-rehearsed={rehearsed}
      >
        {session.slices.map((slice) => (
          <Panel key={slice.id}>
            <PanelHeader>
              <h2 className="text-sm font-semibold text-primary">
                {SLICE_LABEL[slice.id]}{' '}
                <span className="ml-2 text-xs font-normal text-tertiary">
                  {slice.cards.length} {slice.cards.length === 1 ? 'card' : 'cards'}
                </span>
              </h2>
            </PanelHeader>
            <PanelBody>
              {slice.cards.length === 0 ? (
                <p className="text-sm text-secondary">{slice.emptyReason}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {slice.cards.map((card) => (
                    <li
                      key={card.id}
                      data-daily-card={card.kind}
                      data-daily-card-id={card.id}
                      className="rounded border border-line-subtle bg-surface-1 p-3"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-primary">
                            {card.kind === 'repertoire'
                              ? card.prompt
                              : card.kind === 'critical'
                                ? card.gameLabel
                                : card.kind === 'endgame'
                                  ? card.title
                                  : card.why}
                          </p>
                          <p className="text-xs text-secondary">
                            {card.kind === 'repertoire'
                              ? `Recall your move · ${card.dueInDays === 0 ? 'due now' : `${card.dueInDays}d overdue`}`
                              : card.kind === 'critical'
                                ? `Calculation prompt · ${card.reason}`
                                : card.kind === 'endgame'
                                  ? `${card.category} · goal: ${card.goal}`
                                  : 'Game-day sheet'}
                          </p>
                        </div>
                        <Button onClick={() => openOnBoard(card)} variant="ghost">
                          Open on board
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {GRADES.map(({ id, label }) => (
                          <Button
                            key={id}
                            variant="ghost"
                            onClick={() => void grade(card, id)}
                            disabled={graded.has(card.id)}
                            data-daily-grade={id}
                            data-daily-grade-card={card.id}
                          >
                            {card.kind === 'repertoire' || card.kind === 'critical'
                              ? `${label} · ${describeInterval(scheduleGrade(card.schedule, id, now).intervalDays)}`
                              : label}
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          onClick={() => openPositionPage(card.fen as Fen, router.push)}
                          data-daily-position-page
                        >
                          Open position page
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        ))}
      </div>
    </WorkspaceFrame>
  );
}