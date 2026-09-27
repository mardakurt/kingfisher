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

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { useTrainingItems, useProfile } from '@/features/persistence/queries';
import { useReviewItems } from '@/features/review/queries';
import { useEndgamePositions, usePreparationSessions } from '@/features/preparation/queries';
import {
  buildDailySession,
  type DailySession,
  type SessionCard,
  type SliceId,
} from '@/daily/session';
import { localDay, readRehearsed, writeRehearsed } from '@/daily/rehearsed';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui/Panel';
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
  const day = localDay(now);
  /*
    Today's rehearsals (see \`src/daily/rehearsed.ts\`). Read in the
    initializer: the server has no storage and renders the loading state,
    which does not depend on them, so the first client render agrees.
  */
  const [graded, setGraded] = useState<ReadonlySet<string>>(() => new Set(readRehearsed(day)));
  const [currentId, setCurrentId] = useState<string | null>(null);

  const markRehearsed = useCallback(
    (id: string) =>
      setGraded((current) => {
        const next = new Set(current);
        next.add(id);
        writeRehearsed(day, next);
        return next;
      }),
    [day],
  );

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

  const grade = useCallback(
    async (card: SessionCard, choice: ReviewGrade) => {
      if (card.kind !== 'repertoire' && card.kind !== 'critical') {
        // Endgame and brief cards have no schedule to update; the rehearsal
        // is logged in the player's own attempt, never against the source.
        markRehearsed(card.id);
        notify({
          tone: 'info',
          message: 'Rehearsed. Endgame and brief cards do not reschedule themselves.',
        });
        return;
      }
      try {
        const repositories = await getRepositories();
        /*
          Written through the calls the Training and Review pages use. The
          page used to write the repertoire card with `training.update`,
          which deliberately keeps the stored schedule — so a graded card was
          never rescheduled and came back due for ever, under a button that
          had promised an interval. And it passed the critical card's review
          count where the record's revision belongs, which only worked while
          the two happened to be equal.
        */
        if (card.kind === 'repertoire') {
          await repositories.training.review(card.id, choice, choice !== 'again', Date.now());
        } else {
          const current = await repositories.review.getReviewItem(card.id);
          if (!current) throw new Error('That position is no longer in the queue.');
          const next = scheduleGrade(current.schedule ?? card.schedule, choice, Date.now());
          await repositories.review.scheduleReviewItem(current.id, current.revision, next);
        }
        markRehearsed(card.id);
        void client.invalidateQueries({ queryKey: ['persistence', 'training'] });
        void client.invalidateQueries({ queryKey: ['persistence', 'review'] });
        void client.invalidateQueries({ queryKey: ['review'] });
      } catch (error) {
        notify({
          tone: 'error',
          message: 'The schedule did not update.',
          detail: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [client, markRehearsed, notify],
  );

  /*
    Any of the four reads can fail — a blocked store, a record that no longer
    validates. Without this the session stayed null and the page said
    "Loading your work…" for ever, which is the one answer that gives a person
    nothing to do. Name the read that failed and offer another attempt.
  */
  const failed = [
    ['repertoire cards', training],
    ['review queue', review],
    ['saved endgames', endgames],
    ['preparation sessions', sessions],
  ].find(([, query]) => (query as { isError: boolean }).isError) as
    [string, { error: unknown; refetch: () => unknown }] | undefined;
  if (!session && failed) {
    const [what, query] = failed;
    return (
      <WorkspaceFrame
        workspace="daily"
        title="Daily session"
        subtitle="Could not read your work"
        empty={
          <div data-daily="true" data-daily-count="0" data-daily-rehearsed="0" data-daily-error>
            <EmptyState
              title={`Your ${what} could not be read.`}
              description={
                query.error instanceof Error
                  ? query.error.message
                  : 'The browser refused access to its database.'
              }
              action={
                <Button variant="subtle" onClick={() => void query.refetch()}>
                  Try again
                </Button>
              }
            />
          </div>
        }
      />
    );
  }

  if (!session) {
    return (
      <WorkspaceFrame
        workspace="daily"
        title="Daily session"
        subtitle="Loading your work…"
        empty={
          <div data-daily="true" data-daily-count="0" data-daily-rehearsed="0">
            <EmptyState
              title="Reading your work…"
              description="Your repertoire cards, review queue, saved endgames and round briefs."
            />
          </div>
        }
      />
    );
  }

  const cards = session.slices.flatMap((slice) => slice.cards);
  /*
    Counted from the day, not from the queue: a graded repertoire or critical
    card is rescheduled and leaves the queue, and is still rehearsed.
  */
  const rehearsed = graded.size;
  const remaining = cards.filter((card) => !graded.has(card.id));
  const header =
    session.totalCount === 0 && rehearsed === 0
      ? 'Nothing is due today'
      : `${remaining.length} to go · ${rehearsed} rehearsed today`;
  const current = cards.find((card) => card.id === currentId) ?? null;
  const nextCard = cards.find((card) => !graded.has(card.id) && card.id !== currentId) ?? null;

  const openOnBoard = (card: SessionCard) => {
    setCurrentId(card.id);
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

  /*
    Grade, then carry on: the next card not yet rehearsed goes on the board.
    The person is in the session by then — they began it — so moving the
    board is what they asked for; before they begin, nothing replaces what
    Analysis had open.
  */
  const gradeAndAdvance = async (card: SessionCard, choice: ReviewGrade) => {
    await grade(card, choice);
    const after = cards.find((candidate) => !graded.has(candidate.id) && candidate.id !== card.id);
    if (after) openOnBoard(after);
    else setCurrentId(null);
  };

  const railContent = (
    <div
      className="flex flex-col gap-3 px-3 py-3"
      data-daily="true"
      data-daily-count={session.totalCount}
      data-daily-rehearsed={rehearsed}
    >
      <p className="text-[11px] leading-relaxed text-secondary">
        {session.totalCount === 0
          ? 'Only your own material is rehearsed here, and none is due. Each kind below says what puts a position in it.'
          : `${rehearsed} rehearsed today, ${remaining.length} to go — about ${session.minutes} min for today's queue. Only your own material; nothing is scored beyond the schedule.`}
      </p>
      {session.slices.map((slice) => (
        <section key={slice.id} aria-labelledby={`daily-${slice.id}`}>
          <h2
            id={`daily-${slice.id}`}
            className="flex items-baseline gap-2 text-xs font-semibold text-primary"
          >
            {SLICE_LABEL[slice.id]}
            <span className="text-[11px] font-normal text-tertiary">
              {slice.cards.length} {slice.cards.length === 1 ? 'card' : 'cards'}
            </span>
          </h2>
          {slice.cards.length === 0 ? (
            <p className="mt-1 text-[11px] leading-relaxed text-tertiary">
              {slice.emptyReason}{' '}
              <Link className="text-secondary underline" href={SLICE_SOURCE[slice.id].href}>
                {SLICE_SOURCE[slice.id].label}
              </Link>
            </p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
              {slice.cards.map((card) => (
                <li key={card.id} data-daily-card={card.kind} data-daily-card-id={card.id}>
                  <button
                    type="button"
                    onClick={() => openOnBoard(card)}
                    aria-current={card.id === currentId ? 'true' : undefined}
                    className={cn(
                      'w-full rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-surface-2',
                      card.id === currentId && 'bg-accent/10 ring-1 ring-accent/40',
                      graded.has(card.id) && 'opacity-60',
                    )}
                  >
                    <span className="block text-xs text-primary">{cardTitle(card)}</span>
                    <span className="block text-[11px] text-tertiary">
                      {graded.has(card.id) ? 'Rehearsed · ' : ''}
                      {cardReason(card)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );

  const strip =
    session.totalCount === 0 && rehearsed === 0 ? undefined : (
      <div className="shrink-0 border-t border-line-subtle px-3 py-2" data-daily-current>
        {current ? (
          <>
            <p className="text-xs text-primary">{cardTitle(current)}</p>
            <p className="mt-0.5 text-[11px] text-tertiary">{cardTask(current)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {GRADES.map(({ id, label }) => (
                <Button
                  key={id}
                  size="sm"
                  variant={id === 'good' ? 'accent' : 'subtle'}
                  onClick={() => void gradeAndAdvance(current, id)}
                  disabled={graded.has(current.id)}
                  data-daily-grade={id}
                  data-daily-grade-card={current.id}
                >
                  {current.kind === 'repertoire' || current.kind === 'critical'
                    ? `${label} · ${describeInterval(scheduleGrade(current.schedule, id, now).intervalDays)}`
                    : label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openPositionPage(current.fen as Fen, router.push)}
                data-daily-position-page
              >
                Open position page
              </Button>
            </div>
          </>
        ) : remaining.length === 0 ? (
          <p className="text-xs text-primary" data-daily-complete>
            Session complete — {rehearsed} rehearsed. What you graded is rescheduled; come back
            tomorrow for what falls due.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-secondary">
              {nextCard ? `Start with ${cardTitle(nextCard)}.` : 'Choose a card on the left.'}
            </p>
            {nextCard ? (
              <Button
                size="sm"
                variant="accent"
                onClick={() => openOnBoard(nextCard)}
                data-daily-begin
              >
                {rehearsed === 0 ? 'Begin' : 'Continue'}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    );

  return (
    <WorkspaceFrame
      workspace="daily"
      title="Daily session"
      subtitle={header}
      rail={{ label: 'Today', width: 280, content: railContent }}
      board={{ mode: 'interactive' }}
      belowBoard={strip}
      {...(session.totalCount === 0
        ? {
            empty:
              rehearsed > 0 ? (
                <EmptyState
                  title="Today's session is done."
                  description={`${rehearsed} rehearsed. What you graded is rescheduled; come back tomorrow for what falls due.`}
                />
              ) : (
                <EmptyState
                  title="Nothing is due today."
                  description="The session is built from your own repertoire, the critical positions from your reviews, your saved endgames and your round briefs. Add to any of them and it appears here."
                />
              ),
          }
        : {})}
    />
  );
}

const SLICE_SOURCE: Record<SliceId, { readonly href: string; readonly label: string }> = {
  repertoire: { href: '/repertoire', label: 'Open Repertoire' },
  critical: { href: '/review', label: 'Open Review' },
  endgame: { href: '/endgame', label: 'Open Endgame' },
  brief: { href: '/preparation', label: 'Open Preparation' },
};

const cardTitle = (card: SessionCard): string =>
  card.kind === 'repertoire'
    ? card.prompt
    : card.kind === 'critical'
      ? card.gameLabel
      : card.kind === 'endgame'
        ? card.title
        : card.why;

const cardReason = (card: SessionCard): string =>
  card.kind === 'repertoire'
    ? `Your repertoire · ${card.dueInDays === 0 ? 'due now' : `${card.dueInDays}d overdue`}`
    : card.kind === 'critical'
      ? `From a review · ${card.reason}`
      : card.kind === 'endgame'
        ? `${card.category} · goal: ${card.goal}`
        : 'Game-day sheet';

/** What to do with the card on the board, before grading it. */
const cardTask = (card: SessionCard): string =>
  card.kind === 'repertoire'
    ? 'Recall your move and play it on the board, then say how well you knew it.'
    : card.kind === 'critical'
      ? `Calculate before you look: ${card.reason}. Then grade it.`
      : card.kind === 'endgame'
        ? `Goal: ${card.goal}. Play it out from the tools on the right; the tablebase referees where it can.`
        : 'Read the card and recall the plan; mark it when done.';
