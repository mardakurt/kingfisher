'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Segmented } from '@/components/ui/Tabs';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { AnswerBoard, type AcceptedMove } from './AnswerBoard';
import {
  invalidateReferences,
  invalidateReview,
  invalidateTraining,
  useRepertoiresAtPosition,
} from '@/features/persistence/queries';
import {
  ANSWER_SOURCE_LABEL,
  EVALUATION_BANDS,
  type AnswerSource,
  type EvaluationBand,
  type TrainingMode,
} from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { useUi } from '@/stores/ui-store';

const MODES: readonly { id: TrainingMode; label: string }[] = [
  { id: 'repertoire-recall', label: 'Repertoire recall' },
  { id: 'best-move', label: 'Find the best move' },
  { id: 'candidates', label: 'Candidate moves' },
  { id: 'evaluate', label: 'Evaluate' },
  { id: 'plan', label: 'Choose the plan' },
];

export function CreateTrainingDialog() {
  const open = useUi((state) => state.trainingCaptureOpen);
  return open ? <CreateTrainingForm /> : null;
}

function CreateTrainingForm() {
  const queryClient = useQueryClient();
  const setOpen = useUi((state) => state.setTrainingCaptureOpen);
  const referenceChapterId = useUi((state) => state.trainingReferenceChapterId);
  const setReferenceChapterId = useUi((state) => state.setTrainingReferenceChapterId);
  const setTargetId = useUi((state) => state.trainingSetTargetId);
  const reviewItemId = useUi((state) => state.trainingReviewItemId);
  const setCaptureTarget = useUi((state) => state.setTrainingCaptureTarget);
  const notify = useUi((state) => state.notify);
  const document = useAnalysis((state) => state.document);
  const { node, position, currentId } = useAnalysisPosition();
  const engineLines = useEngine((state) => state.primary.analysis?.lines);
  const engineFen = useEngine((state) => state.primary.analysedFen);
  const repertoireHere = useRepertoiresAtPosition(positionKey(node.fen));

  const [mode, setMode] = useState<TrainingMode>('repertoire-recall');
  const [prompt, setPrompt] = useState('Play the prepared move.');
  const [accepted, setAccepted] = useState<readonly AcceptedMove[]>([]);
  const [candidates, setCandidates] = useState<readonly AcceptedMove[]>([]);
  const [band, setBand] = useState<EvaluationBand>('equal');
  const [whitePlan, setWhitePlan] = useState('');
  const [blackPlan, setBlackPlan] = useState('');
  const [explanation, setExplanation] = useState('');
  const [tags, setTags] = useState('');
  const [answerSource, setAnswerSource] = useState<AnswerSource>('user');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    Both shortcuts copy evidence that already exists into the item's own
    answer, and record where it came from. Nothing is consulted at review time:
    an item is a decision written down, not a live query against an engine.
  */
  const engineMove = engineFen === node.fen ? engineLines?.[0]?.moves[0] : undefined;
  const repertoireMoves = (repertoireHere.data ?? [])
    .flatMap((entry) => entry.moves)
    .filter((move) => !move.expected && move.role !== 'avoid');

  const moveMode = mode === 'repertoire-recall' || mode === 'best-move' || mode === 'candidates';

  const submit = async () => {
    setError(null);
    const solutionMoves = moveMode ? accepted : [];
    if (moveMode && solutionMoves.length === 0) {
      setError('Play the answer on the board first.');
      return;
    }
    const candidateMoves = mode === 'candidates' ? candidates : [];
    if (mode === 'plan' && !whitePlan.trim() && !blackPlan.trim()) {
      setError('Write at least one structured plan.');
      return;
    }

    setBusy(true);
    try {
      const item = await (
        await getRepositories()
      ).training.create({
        mode,
        positionKey: positionKey(node.fen),
        fen: node.fen,
        sideToMove: position.turn,
        prompt: prompt.trim() || defaultPrompt(mode),
        solutionUci: solutionMoves.map((move) => move.uci),
        solutionSan: solutionMoves.map((move) => move.san),
        candidatesUci: candidateMoves.map((move) => move.uci),
        ...(mode === 'evaluate' ? { expectedBand: band } : {}),
        plans: [
          ...(whitePlan.trim() ? [{ color: 'w' as const, text: whitePlan.trim() }] : []),
          ...(blackPlan.trim() ? [{ color: 'b' as const, text: blackPlan.trim() }] : []),
        ],
        ...(explanation.trim() ? { explanation: explanation.trim() } : {}),
        ...(moveMode ? { answerSource } : {}),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        source: {
          kind:
            document.kind === 'study-chapter'
              ? 'study'
              : document.kind === 'database-game'
                ? 'game'
                : 'analysis',
          ...(document.kind === 'study-chapter'
            ? { id: document.chapterId }
            : document.kind === 'database-game'
              ? { id: document.gameId }
              : {}),
          label: document.title,
          nodeId: currentId,
        },
      });
      if (referenceChapterId) {
        const repositories = await getRepositories();
        await repositories.references.create({
          chapterId: referenceChapterId,
          kind: 'training-item',
          targetId: item.id,
          label: item.prompt,
        });
        invalidateReferences(queryClient, referenceChapterId);
      }
      /*
        Two follow-ups Review asks for so the player gets one action instead of
        three. Both are best-effort on purpose: the training item is the thing
        that had to be created, and losing its set membership is a smaller
        failure than losing the item.
      */
      if (setTargetId) {
        const repositories = await getRepositories();
        const set = await repositories.trainingSets.get(setTargetId);
        // Dynamic sets are queries, not mutable membership lists. The item is
        // allowed to join them only by matching their saved criteria.
        if (set?.kind === 'static') {
          await repositories.trainingSets.addItems(set.id, set.revision, [item.id]);
        }
      }
      if (reviewItemId) {
        const repositories = await getRepositories();
        const reviewItem = await repositories.review.getReviewItem(reviewItemId);
        if (reviewItem) {
          await repositories.review.updateReviewItem(reviewItem.id, reviewItem.revision, {
            status: 'converted',
            trainingItemId: item.id,
          });
        }
      }
      if (setTargetId || reviewItemId) invalidateReview(queryClient);
      setCaptureTarget({ setId: null, reviewItemId: null });
      invalidateTraining(queryClient);
      notify({ tone: 'success', message: `Training position created: ${item.prompt}` });
      setOpen(false);
      setReferenceChapterId(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'The training item could not be saved.',
      );
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => {
        if (busy) return;
        setReferenceChapterId(null);
        setOpen(false);
      }}
      title="Create training position"
      description="The position and source link are stored exactly as they are now. Answers remain user-authored evidence."
      width="w-[620px]"
      footer={
        <>
          <Button
            onClick={() => {
              setReferenceChapterId(null);
              setOpen(false);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button variant="accent" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : 'Create item'}
          </Button>
        </>
      }
    >
      <div className="text-2xs text-tertiary">
        Mode
        <Segmented className="mt-1 max-w-full" items={MODES} value={mode} onChange={setMode} />
      </div>

      <label className="mt-3 block text-2xs text-tertiary">
        Prompt
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className={FIELD}
        />
      </label>

      {moveMode ? (
        <>
          <div className="mt-3">
            <p className="mb-1.5 text-2xs text-tertiary">
              Accepted move{mode === 'repertoire-recall' || mode === 'candidates' ? 's' : ''}
            </p>
            <AnswerBoard
              fen={node.fen}
              moves={accepted}
              onChange={(next) => {
                setAccepted(next);
                setAnswerSource('user');
              }}
              multiple={mode !== 'best-move'}
              orientation={position.turn}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-tertiary">
              Answer source: {ANSWER_SOURCE_LABEL[answerSource]}
            </span>
            {engineMove ? (
              <Button
                onClick={() => {
                  const played = position.playUci(engineMove);
                  if (!played.ok) return;
                  setAccepted([{ uci: played.value.uci, san: played.value.san }]);
                  setAnswerSource('engine');
                }}
              >
                Use the engine’s current top move
              </Button>
            ) : null}
            {repertoireMoves.length ? (
              <Button
                onClick={() => {
                  setAccepted(repertoireMoves.map((move) => ({ uci: move.uci, san: move.san })));
                  setAnswerSource('repertoire');
                }}
              >
                Use my repertoire ({repertoireMoves.map((move) => move.san).join(', ')})
              </Button>
            ) : null}
          </div>

          {mode === 'candidates' ? (
            <div className="mt-3">
              <p className="mb-1.5 text-2xs text-tertiary">Additional candidates</p>
              <AnswerBoard
                fen={node.fen}
                moves={candidates}
                onChange={setCandidates}
                multiple
                orientation={position.turn}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {mode === 'evaluate' ? (
        <label className="mt-3 block text-2xs text-tertiary">
          Expected evaluation
          <select
            value={band}
            onChange={(event) => setBand(event.target.value as EvaluationBand)}
            className={FIELD}
          >
            {EVALUATION_BANDS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {mode === 'plan' ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-2xs text-tertiary">
            White plan
            <textarea
              value={whitePlan}
              onChange={(event) => setWhitePlan(event.target.value)}
              className={AREA}
            />
          </label>
          <label className="text-2xs text-tertiary">
            Black plan
            <textarea
              value={blackPlan}
              onChange={(event) => setBlackPlan(event.target.value)}
              className={AREA}
            />
          </label>
        </div>
      ) : null}

      <label className="mt-3 block text-2xs text-tertiary">
        Explanation or note (optional)
        <textarea
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
          className={AREA}
        />
      </label>
      <label className="mt-3 block text-2xs text-tertiary">
        Tags (comma separated)
        <input value={tags} onChange={(event) => setTags(event.target.value)} className={FIELD} />
      </label>

      {error ? <p className="mt-2 text-2xs text-negative">{error}</p> : null}
    </Dialog>
  );
}

function defaultPrompt(mode: TrainingMode): string {
  if (mode === 'repertoire-recall') return 'Play the prepared move.';
  if (mode === 'best-move') return 'Find the best move.';
  if (mode === 'candidates') return 'List the candidate moves.';
  if (mode === 'evaluate') return 'Evaluate the position.';
  return 'Choose the plan.';
}

const FIELD =
  'mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 text-xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60';
const AREA =
  'mt-1 min-h-20 w-full resize-y rounded-[4px] border border-line bg-surface-inset px-2.5 py-2 text-xs leading-relaxed text-primary outline-none focus:border-accent/60';
