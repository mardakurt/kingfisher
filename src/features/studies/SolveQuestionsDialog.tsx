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
 * brings them back. Nothing is stored unless that is chosen.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import type { ChapterQuestion } from '@/chess/tree/questions';
import { moveNumberOfPly } from '@/chess/tree/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { invalidateReferences, invalidateTraining } from '@/features/persistence/queries';
import { TrainingAnswer, type AttemptState } from '@/features/training/TrainingAnswer';
import type { TrainingItemRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { newSchedule } from '@/training/schedule';
import { useUi } from '@/stores/ui-store';

type Outcome = 'found' | 'missed' | 'revealed';

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
  const [outcomes, setOutcomes] = useState<readonly Outcome[]>([]);
  const [result, setResult] = useState<AttemptState | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now] = useState(() => Date.now());
  const done = index >= questions.length;
  const question = questions[index];
  const item = useMemo(() => (question ? itemFor(question, now) : null), [question, now]);
  const answered = result !== null || revealed;

  const next = () => {
    const outcome: Outcome = revealed
      ? 'revealed'
      : result && result.check.verdict === 'correct'
        ? 'found'
        : 'missed';
    setOutcomes((current) => [...current, outcome]);
    setResult(null);
    setRevealed(false);
    setIndex((current) => current + 1);
  };

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
            <TrainingAnswer
              key={item.id}
              item={item}
              result={result}
              revealed={revealed}
              onSubmit={setResult}
              onReveal={() => setRevealed(true)}
            />
          </>
        ) : (
          <div data-question-summary>
            <p className="mb-2 text-sm text-primary tabular">
              You found {outcomes.filter((outcome) => outcome === 'found').length} of{' '}
              {questions.length}.
            </p>
            <ol className="divide-y divide-line-subtle text-sm">
              {questions.map((entry, at) => (
                <li key={entry.nodeId} className="flex items-baseline gap-2 py-1.5">
                  <span className="font-medium tabular">{label(entry)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-tertiary">
                    {entry.prompt}
                  </span>
                  <span
                    className={
                      outcomes[at] === 'found'
                        ? 'text-xs text-positive'
                        : outcomes[at] === 'missed'
                          ? 'text-xs text-negative'
                          : 'text-xs text-caution'
                    }
                  >
                    {outcomes[at] === 'found'
                      ? 'found'
                      : outcomes[at] === 'missed'
                        ? 'missed'
                        : 'shown'}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Dialog>
  );
}
