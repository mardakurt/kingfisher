'use client';

/**
 * Solve a chapter's questions (Phase 84).
 *
 * The chapter's marked moves (`src/chess/tree/questions.ts`), asked one at a
 * time at the position before each, in reading order. The answering control
 * and the check are Training's own (`TrainingAnswer`, `checkAnswer`): a
 * chapter question is a best-move item that has not been stored, so there is
 * one way to answer a move question in Kingfisher, not two.
 *
 * At the end the page says which were found and which were missed — the
 * coach's question, "which ones did the student miss?" — and offers to put
 * the missed ones in Training, linked to the chapter, where spaced repetition
 * brings them back.
 *
 * Phase 85: a question may carry points and a time limit (ChessBase's
 * training annotation). The clock runs only where the author set one, and an
 * answer after it has run out is not counted. Points are all or nothing: the
 * author's number for a question found in time, none otherwise. Each finished
 * sitting is recorded (`questionSessions`) with what happened to every
 * question — outcome, seconds taken, points — and the chapter's earlier
 * sittings are listed under the summary. A sitting abandoned half way is not
 * recorded.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import type { ChapterQuestion } from '@/chess/tree/questions';
import { moveNumberOfPly } from '@/chess/tree/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { invalidateReferences, invalidateTraining } from '@/features/persistence/queries';
import { TrainingAnswer, type AttemptState } from '@/features/training/TrainingAnswer';
import type {
  QuestionAnswerRecord,
  QuestionOutcome,
  QuestionSessionRecord,
  TrainingItemRecord,
} from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { newSchedule } from '@/training/schedule';
import { useUi } from '@/stores/ui-store';

type Outcome = QuestionOutcome;

const OUTCOME_LABEL: Readonly<Record<Outcome, string>> = {
  found: 'found',
  missed: 'missed',
  revealed: 'shown',
  'timed-out': 'out of time',
};

const OUTCOME_CLASS: Readonly<Record<Outcome, string>> = {
  found: 'text-xs text-positive',
  missed: 'text-xs text-negative',
  revealed: 'text-xs text-caution',
  'timed-out': 'text-xs text-negative',
};

const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, '0')}`;

const label = (question: ChapterQuestion) =>
  `${moveNumberOfPly(question.ply)}${question.ply % 2 === 1 ? '.' : '...'} ${question.solutionSan[0]}`;

/** The question as the unstored best-move item Training's controls answer. */
function itemFor(question: ChapterQuestion, now: number): TrainingItemRecord {
  return {
    id: `chapter-question:${question.nodeId}` as TrainingItemRecord['id'],
    mode: 'best-move',
    positionKey: positionKey(question.fen) as TrainingItemRecord['positionKey'],
    fen: question.fen,
    sideToMove: question.ply % 2 === 1 ? 'w' : 'b',
    prompt: question.prompt,
    solutionUci: question.solutionUci,
    solutionSan: question.solutionSan,
    candidatesUci: [],
    plans: [],
    ...(question.explanation ? { explanation: question.explanation } : {}),
    tags: [],
    answerSource: 'user',
    schedule: newSchedule(now),
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
}

export function SolveQuestionsDialog({
  questions,
  chapterId,
  chapterTitle,
  onClose,
}: {
  readonly questions: readonly ChapterQuestion[];
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<readonly QuestionAnswerRecord[]>([]);
  const [result, setResult] = useState<AttemptState | null>(null);
  const [revealed, setRevealed] = useState(false);
  /** Set when an answer came in after the limit, before the clock's next tick noticed. */
  const [late, setLate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now] = useState(() => Date.now());
  /** When the question on screen was first shown, and when it was answered. */
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [answeredAt, setAnsweredAt] = useState<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const done = index >= questions.length;
  const question = questions[index];
  const item = useMemo(() => (question ? itemFor(question, now) : null), [question, now]);
  const outcomes = answers.map((answer) => answer.outcome);

  const limit = question?.timeLimitSeconds;
  /* Out of time is read off the clock, not stored: the limit passed with no answer. */
  const timedOut =
    late ||
    (limit !== undefined &&
      result === null &&
      !revealed &&
      (answeredAt ?? tick) - shownAt >= limit * 1000);
  const answered = result !== null || revealed || timedOut;
  const elapsed = Math.floor(((answeredAt ?? tick) - shownAt) / 1000);
  const remaining = limit !== undefined ? Math.max(0, limit - elapsed) : null;

  /* The clock: ticking only while a timed question waits for its answer. */
  useEffect(() => {
    if (done || limit === undefined || answered) return;
    const timer = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [answered, done, limit]);

  const submit = (attempt: AttemptState) => {
    if (timedOut) return;
    const at = Date.now();
    // An answer after the limit, inside the clock's quarter-second tick, is still late.
    if (limit !== undefined && at - shownAt >= limit * 1000) {
      setLate(true);
      return;
    }
    setResult(attempt);
    setAnsweredAt(at);
  };

  const next = () => {
    if (!question) return;
    const outcome: Outcome = timedOut
      ? 'timed-out'
      : revealed
        ? 'revealed'
        : result && result.check.verdict === 'correct'
          ? 'found'
          : 'missed';
    const seconds =
      timedOut && limit !== undefined
        ? limit
        : Math.max(0, Math.round(((answeredAt ?? Date.now()) - shownAt) / 1000));
    const answer: QuestionAnswerRecord = {
      nodeId: question.nodeId,
      prompt: question.prompt,
      solutionSan: question.solutionSan[0] ?? '',
      outcome,
      seconds,
      ...(question.timeLimitSeconds !== undefined
        ? { timeLimitSeconds: question.timeLimitSeconds }
        : {}),
      ...(question.points !== undefined
        ? { points: question.points, earned: outcome === 'found' ? question.points : 0 }
        : {}),
    };
    setAnswers((current) => [...current, answer]);
    setResult(null);
    setRevealed(false);
    setLate(false);
    setAnsweredAt(null);
    setShownAt(Date.now());
    setTick(Date.now());
    setIndex((current) => current + 1);
  };

  /* A finished sitting is recorded once, then the chapter's sittings are read back. */
  const recorded = useRef(false);
  const [sittingSaved, setSittingSaved] = useState(false);
  useEffect(() => {
    if (!done || recorded.current || answers.length !== questions.length) return;
    recorded.current = true;
    void (async () => {
      try {
        const repositories = await getRepositories();
        await repositories.questionSessions.record({
          chapterId,
          chapterTitle,
          startedAt: now,
          answers,
        });
        setSittingSaved(true);
        void queryClient.invalidateQueries({ queryKey: ['question-sessions', chapterId] });
      } catch (error) {
        notify({
          tone: 'error',
          message: 'This sitting could not be recorded.',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, [answers, chapterId, chapterTitle, done, notify, now, queryClient, questions.length]);
  const sittings = useQuery({
    queryKey: ['question-sessions', chapterId],
    enabled: done && sittingSaved,
    queryFn: async () => (await getRepositories()).questionSessions.forChapter(chapterId),
  });

  const possible = answers.reduce((sum, answer) => sum + (answer.points ?? 0), 0);
  const earned = answers.reduce((sum, answer) => sum + (answer.earned ?? 0), 0);

  const missed = questions.filter((_, at) => outcomes[at] !== 'found');

  const train = async () => {
    setSaving(true);
    try {
      const repositories = await getRepositories();
      for (const question of missed) {
        const {
          id: _id,
          schedule: _schedule,
          createdAt: _c,
          updatedAt: _u,
          revision: _r,
          ...input
        } = itemFor(question, Date.now());
        const created = await repositories.training.create({
          ...input,
          source: { kind: 'study', id: chapterId, label: chapterTitle, nodeId: question.nodeId },
        });
        await repositories.references.create({
          chapterId,
          kind: 'training-item',
          targetId: created.id,
          label: created.prompt,
        });
      }
      invalidateTraining(queryClient);
      invalidateReferences(queryClient, chapterId);
      notify({
        tone: 'success',
        message: `${missed.length} ${missed.length === 1 ? 'question is' : 'questions are'} in Training now.`,
      });
      onClose();
    } catch (error) {
      notify({
        tone: 'error',
        message: 'The questions could not be added to Training.',
        detail: error instanceof Error ? error.message : String(error),
      });
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Questions in ${chapterTitle}`}
      description={
        done
          ? 'Your answers, question by question.'
          : `Question ${index + 1} of ${questions.length} · asked before ${moveNumberOfPly(question!.ply)}${question!.ply % 2 === 1 ? '.' : '...'}`
      }
      width="w-[560px]"
      footer={
        done ? (
          <>
            <Button onClick={onClose}>Close</Button>
            {missed.length ? (
              <Button variant="accent" disabled={saving} onClick={() => void train()}>
                Add {missed.length} to Training
              </Button>
            ) : null}
          </>
        ) : (
          <Button variant="accent" disabled={!answered} onClick={next} data-question-next>
            {index + 1 === questions.length ? 'See how it went' : 'Next question'}
          </Button>
        )
      }
    >
      <div data-solve-questions>
        {!done && item ? (
          <>
            <p className="mb-2 text-sm font-medium text-primary" data-question-prompt>
              {item.prompt}
            </p>
            {question?.points !== undefined || remaining !== null ? (
              <p className="mb-2 flex gap-3 text-xs text-secondary tabular">
                {question?.points !== undefined ? (
                  <span data-question-points>
                    {question.points} {question.points === 1 ? 'point' : 'points'}
                  </span>
                ) : null}
                {remaining !== null ? (
                  <span
                    data-question-clock
                    className={remaining <= 10 && !answered ? 'text-negative' : undefined}
                    aria-live="off"
                  >
                    {timedOut ? 'Out of time' : `${clock(remaining)} left`}
                  </span>
                ) : null}
              </p>
            ) : null}
            <TrainingAnswer
              key={item.id}
              item={item}
              result={result}
              revealed={revealed || timedOut}
              onSubmit={submit}
              onReveal={() => {
                setRevealed(true);
                setAnsweredAt(Date.now());
              }}
            />
          </>
        ) : (
          <div data-question-summary>
            <p className="mb-2 text-sm text-primary tabular">
              You found {outcomes.filter((outcome) => outcome === 'found').length} of{' '}
              {questions.length}.
              {possible > 0 ? (
                <span data-question-score>
                  {' '}
                  {earned} of {possible} points.
                </span>
              ) : null}
            </p>
            <ol className="divide-y divide-line-subtle text-sm">
              {questions.map((entry, at) => {
                const answer = answers[at];
                return (
                  <li key={entry.nodeId} className="flex items-baseline gap-2 py-1.5">
                    <span className="font-medium tabular">{label(entry)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-tertiary">
                      {entry.prompt}
                    </span>
                    {answer ? (
                      <span className="text-xs text-tertiary tabular">{clock(answer.seconds)}</span>
                    ) : null}
                    {answer?.points !== undefined ? (
                      <span className="text-xs text-tertiary tabular">
                        {answer.earned}/{answer.points}
                      </span>
                    ) : null}
                    {answer ? (
                      <span className={OUTCOME_CLASS[answer.outcome]}>
                        {OUTCOME_LABEL[answer.outcome]}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <Sittings sittings={sittings.data ?? []} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** The chapter's recorded sittings, newest first: when, how many found, and the points. */
function Sittings({ sittings }: { readonly sittings: readonly QuestionSessionRecord[] }) {
  if (sittings.length === 0) return null;
  return (
    <div className="mt-3 border-t border-line-subtle pt-2" data-question-sittings>
      <p className="mb-1 text-xs font-medium text-secondary">
        {sittings.length === 1
          ? 'This sitting is recorded.'
          : `${sittings.length} sittings recorded`}
      </p>
      <ol className="space-y-0.5 text-xs text-tertiary tabular">
        {sittings.slice(0, 5).map((sitting) => {
          const found = sitting.answers.filter((answer) => answer.outcome === 'found').length;
          const possible = sitting.answers.reduce((sum, answer) => sum + (answer.points ?? 0), 0);
          const earned = sitting.answers.reduce((sum, answer) => sum + (answer.earned ?? 0), 0);
          return (
            <li key={sitting.id}>
              {new Date(sitting.finishedAt).toLocaleString()} · found {found} of{' '}
              {sitting.answers.length}
              {possible > 0 ? ` · ${earned} of ${possible} points` : ''}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
