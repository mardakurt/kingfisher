'use client';

/**
 * The self-analysis form, and afterwards the comparison.
 *
 * One panel with two faces, because they are one thought: what you decided,
 * and then what the evidence says about it. Keeping them in the same place is
 * what makes the second half readable — a comparison shown somewhere else
 * would let the player forget what they had actually claimed.
 *
 * Keyboard first throughout. Candidates go in by playing them on a board (or
 * by typing a line, for a move pasted from elsewhere); the estimate is a
 * five-way radio group; plan and notes are plain fields; and the primary
 * action is always reachable with Tab from wherever you are.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';
import { isOk } from '@/chess/result';
import type { San, Uci } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { AnswerBoard, type AcceptedMove } from '@/features/training/AnswerBoard';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { invalidateReview, invalidateTraining } from '@/features/persistence/queries';
import { getRepositories } from '@/persistence/repositories';
import type { DecisionRecord, ReviewItemRecord } from '@/persistence/domain';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { cn } from '@/lib/cn';

import {
  BANDS,
  compareCandidates,
  compareEstimate,
  describeEstimateComparison,
} from './comparison';
import { ThemePicker } from './ThemePicker';
import { TrainingHandoff } from './TrainingHandoff';
import {
  draftEstimate,
  hasAnswers,
  useReviewSession,
  type DraftAnswers,
} from './review-session-store';

const FIELD =
  'mt-1 w-full rounded-[4px] border border-line bg-surface-inset px-2.5 py-1.5 text-xs text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60';

export function DecisionJournal({
  decision,
  reviewItem,
  onSaved,
}: {
  /** The stored record for this position, when one exists. */
  readonly decision: DecisionRecord | null;
  /** The queue entry the player opened, when they arrived from the queue. */
  readonly reviewItem?: ReviewItemRecord | null;
  readonly onSaved: () => void;
}) {
  const client = useQueryClient();
  const { node, position } = useAnalysisPosition();
  const document = useAnalysis((state) => state.document);
  const currentId = useAnalysis((state) => state.currentId);
  const orientation = useAnalysis((state) => state.orientation);

  const selfAnalysis = useReviewSession((state) => state.selfAnalysis);
  const revealedKeys = useReviewSession((state) => state.revealed);
  const answers = useReviewSession((state) => state.answers);
  const setAnswers = useReviewSession((state) => state.setAnswers);
  const addCandidate = useReviewSession((state) => state.addCandidate);
  const updateCandidate = useReviewSession((state) => state.updateCandidate);
  const removeCandidate = useReviewSession((state) => state.removeCandidate);
  const setChosen = useReviewSession((state) => state.setChosen);
  const reveal = useReviewSession((state) => state.reveal);
  const resetAnswers = useReviewSession((state) => state.resetAnswers);
  const markSubmitted = useReviewSession((state) => state.markSubmitted);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = positionKey(node.fen);
  const revealed = !selfAnalysis || revealedKeys.includes(key);
  const stored = decision;

  const submit = async (thenReveal: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const repositories = await getRepositories();
      const input = {
        positionKey: key,
        fen: node.fen,
        sideToMove: position.turn,
        ...(document.kind === 'database-game' ? { gameId: document.gameId } : {}),
        ...(document.kind === 'study-chapter' ? { chapterId: document.chapterId } : {}),
        nodeId: currentId,
        ply: node.ply,
        ...(answers.chosenUci ? { chosenUci: answers.chosenUci } : {}),
        ...(answers.chosenSan ? { chosenSan: answers.chosenSan } : {}),
        candidates: answers.candidates,
        ...(draftEstimate(answers) ? { estimate: draftEstimate(answers) } : {}),
        plan: answers.plan,
        calculationNotes: answers.calculationNotes,
        ...(answers.confidence ? { confidence: answers.confidence } : {}),
      };

      const record = stored
        ? await repositories.review.updateDecision(stored.id, stored.revision, input)
        : await repositories.review.createDecision(input);
      markSubmitted(key, record.id);

      if (thenReveal) {
        await repositories.review.revealDecision(record.id, record.revision);
        reveal(key);
      }
      invalidateReview(client);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (revealed) {
    return (
      <RevealedJournal
        decision={stored}
        reviewItem={reviewItem ?? null}
        onThemesChanged={() => {
          invalidateReview(client);
          invalidateTraining(client);
          onSaved();
        }}
      />
    );
  }

  return (
    <Panel className="h-full border-0">
      <PanelHeader
        actions={
          <span className="text-[10px] text-tertiary">
            {answers.candidates.length} candidate{answers.candidates.length === 1 ? '' : 's'}
          </span>
        }
      >
        Your decision
      </PanelHeader>
      <PanelBody className="space-y-4 overflow-y-auto">
        <p className="text-[11px] leading-relaxed text-tertiary">
          Computer evidence is hidden. Record what you are actually thinking, then reveal — what you
          write now is kept exactly as it is.
        </p>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            Candidate moves
          </h3>
          <p className="mt-1 text-[10.5px] text-tertiary">
            Play each move you considered. The first one you mark is your choice.
          </p>
          <div className="mt-2">
            <AnswerBoard
              fen={node.fen}
              moves={answers.candidates.map(({ uci, san }) => ({ uci, san }))}
              multiple
              orientation={orientation}
              onChange={(moves) => syncCandidates(moves, answers, addCandidate, removeCandidate)}
            />
          </div>
          {answers.candidates.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {answers.candidates.map((candidate) => (
                <li
                  key={candidate.uci}
                  className="rounded-[4px] border border-line-subtle bg-surface-inset p-2"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setChosen(
                          answers.chosenUci === candidate.uci ? undefined : candidate.uci,
                          candidate.san,
                        )
                      }
                      aria-pressed={answers.chosenUci === candidate.uci}
                      className={cn(
                        'rounded-[3px] border px-1.5 py-0.5 text-[11px] tabular',
                        answers.chosenUci === candidate.uci
                          ? 'border-accent bg-accent-muted text-primary'
                          : 'border-line text-secondary hover:text-primary',
                      )}
                    >
                      {candidate.san}
                      {answers.chosenUci === candidate.uci ? ' · my move' : ''}
                    </button>
                    <Button
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => removeCandidate(candidate.uci)}
                      aria-label={`Remove candidate ${candidate.san}`}
                    >
                      Remove
                    </Button>
                  </div>
                  <label className="mt-1.5 block text-[10px] text-tertiary">
                    Why this move
                    <input
                      value={candidate.note ?? ''}
                      onChange={(event) =>
                        updateCandidate(candidate.uci, { note: event.target.value })
                      }
                      placeholder="Keeps the knight, avoids the trade"
                      className={FIELD}
                    />
                  </label>
                  <label className="mt-1.5 block text-[10px] text-tertiary">
                    Line you calculated
                    <input
                      value={(candidate.line ?? []).join(' ')}
                      onChange={(event) =>
                        updateCandidate(candidate.uci, {
                          line: parseLine(node.fen, candidate.uci, event.target.value),
                        })
                      }
                      placeholder="Rc8 Qd2 Bf8"
                      className={FIELD}
                    />
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            Your assessment
          </h3>
          <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="Evaluation estimate">
            {BANDS.map((band) => (
              <button
                key={band.id}
                type="button"
                role="radio"
                aria-checked={answers.band === band.id}
                onClick={() => setAnswers({ band: answers.band === band.id ? undefined : band.id })}
                className={cn(
                  'w-full rounded-[4px] border px-2.5 py-1.5 text-left text-xs transition-colors',
                  answers.band === band.id
                    ? 'border-accent bg-accent-muted text-primary'
                    : 'border-line-subtle text-secondary hover:border-line hover:text-primary',
                )}
              >
                {band.label}
              </button>
            ))}
          </div>
          <label className="mt-2 block text-[10px] text-tertiary">
            In pawns, if you want to commit to a number (optional)
            <input
              value={answers.pawns}
              onChange={(event) => setAnswers({ pawns: event.target.value })}
              inputMode="decimal"
              placeholder="+0.4"
              aria-label="Evaluation estimate in pawns"
              className={FIELD}
            />
          </label>
        </section>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            Your plan
          </h3>
          <textarea
            value={answers.plan}
            onChange={(event) => setAnswers({ plan: event.target.value })}
            aria-label="Your plan"
            placeholder={'Improve the knight on d2\nPrepare c4\nAvoid the queen trade'}
            className={cn(FIELD, 'h-20 resize-y font-normal')}
          />
        </section>

        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            What you calculated
          </h3>
          <textarea
            value={answers.calculationNotes}
            onChange={(event) => setAnswers({ calculationNotes: event.target.value })}
            aria-label="What you calculated"
            placeholder="Looked at Rc8 first; stopped when Qd2 held everything."
            className={cn(FIELD, 'h-16 resize-y')}
          />
          <div className="mt-2">
            <span className="text-[10px] text-tertiary">Confidence</span>
            <div className="mt-1">
              <Segmented
                items={[
                  { id: 'low' as const, label: 'Low' },
                  { id: 'medium' as const, label: 'Medium' },
                  { id: 'high' as const, label: 'High' },
                ]}
                value={answers.confidence ?? 'medium'}
                onChange={(confidence) => setAnswers({ confidence })}
              />
            </div>
          </div>
        </section>

        {error ? <p className="text-2xs text-negative">{error}</p> : null}

        <div className="flex flex-wrap gap-2 border-t border-line-subtle pt-3">
          <Button
            variant="accent"
            disabled={busy || !hasAnswers(answers)}
            onClick={() => void submit(true)}
          >
            {busy ? 'Saving…' : 'Submit and reveal'}
          </Button>
          <Button disabled={busy || !hasAnswers(answers)} onClick={() => void submit(false)}>
            Save without revealing
          </Button>
          <Button variant="ghost" onClick={resetAnswers} disabled={busy}>
            Clear
          </Button>
        </div>
        <p className="text-[10px] leading-relaxed text-tertiary">
          Revealing is one-way for this position. Your answers stay as written; only themes and
          notes can be added afterwards.
        </p>
      </PanelBody>
    </Panel>
  );
}

/** After reveal: the player's answers, then the evidence beside them. */
function RevealedJournal({
  decision,
  reviewItem,
  onThemesChanged,
}: {
  readonly decision: DecisionRecord | null;
  readonly reviewItem: ReviewItemRecord | null;
  readonly onThemesChanged: () => void;
}) {
  const { node } = useAnalysisPosition();
  const analysis = useEngine((state) => state.primary.analysis);
  const analysedFen = useEngine((state) => state.primary.analysedFen);
  /*
    Only lines that belong to *this* position. An engine snapshot from the move
    before is the classic stale-evaluation bug, and in a comparison it would be
    worse than stale: it would put the player's reading beside a number about a
    different position and call the gap theirs.
  */
  const lines = useMemo(
    () => (analysedFen === node.fen ? (analysis?.lines ?? []) : []),
    [analysedFen, analysis?.lines, node.fen],
  );

  const estimateComparison = useMemo(
    () => compareEstimate(decision?.estimate, lines[0]?.score),
    [decision?.estimate, lines],
  );
  const candidateReport = useMemo(
    () =>
      compareCandidates(
        decision?.candidates ?? [],
        lines.map((line) => ({ rank: line.rank, moves: line.moves, score: line.score })),
        decision?.chosenUci,
      ),
    [decision?.candidates, decision?.chosenUci, lines],
  );

  if (!decision) {
    return (
      <Panel className="h-full border-0">
        <PanelHeader>Your decision</PanelHeader>
        <PanelBody className="space-y-4 overflow-y-auto">
          <EmptyState
            title="Nothing recorded here."
            description="Evidence is visible for this position. Turn self-analysis on to record a decision before revealing it."
          />
          {reviewItem ? (
            <>
              <section className="border-t border-line-subtle pt-3">
                <ThemePicker reviewItem={reviewItem} onChanged={onThemesChanged} />
              </section>
              <section className="border-t border-line-subtle pt-3">
                <TrainingHandoff reviewItem={reviewItem} />
              </section>
            </>
          ) : null}
        </PanelBody>
      </Panel>
    );
  }

  return (
    <Panel className="h-full border-0">
      <PanelHeader
        actions={
          decision.revealedAt ? (
            <span className="text-[10px] text-tertiary">Revealed</span>
          ) : (
            <span className="text-[10px] text-tertiary">Recorded</span>
          )
        }
      >
        Your decision
      </PanelHeader>
      <PanelBody className="space-y-4 overflow-y-auto">
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            What you wrote
          </h3>
          <dl className="mt-1.5 space-y-1 text-xs">
            {decision.chosenSan ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-tertiary">Your move</dt>
                <dd className="text-primary tabular">{decision.chosenSan}</dd>
              </div>
            ) : null}
            {decision.estimate ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-tertiary">Your reading</dt>
                <dd className="text-primary">
                  {BANDS.find((band) => band.id === decision.estimate?.band)?.label}
                  {decision.estimate.pawns !== undefined
                    ? ` (${decision.estimate.pawns > 0 ? '+' : ''}${decision.estimate.pawns})`
                    : ''}
                </dd>
              </div>
            ) : null}
            {decision.plan ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-tertiary">Your plan</dt>
                <dd className="whitespace-pre-line text-primary">{decision.plan}</dd>
              </div>
            ) : null}
            {decision.calculationNotes ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-tertiary">Calculation</dt>
                <dd className="whitespace-pre-line text-secondary">{decision.calculationNotes}</dd>
              </div>
            ) : null}
            {decision.confidence ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-tertiary">Confidence</dt>
                <dd className="text-secondary capitalize">{decision.confidence}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="border-t border-line-subtle pt-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            Compared with the engine
          </h3>
          {lines.length === 0 ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-tertiary">
              No engine evidence for this position yet. Start the engine in the dock, or queue the
              game for background analysis, and this comparison fills in.
            </p>
          ) : (
            <>
              {estimateComparison ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-secondary">
                  {describeEstimateComparison(estimateComparison)}
                  {estimateComparison.chanceDifference !== undefined
                    ? ` That is ${Math.round(estimateComparison.chanceDifference * 100)} percentage points of expected result.`
                    : ''}
                </p>
              ) : null}
              <table className="mt-2 w-full text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-tertiary">
                    <th className="py-1 text-left font-medium">You considered</th>
                    <th className="py-1 text-right font-medium">Engine rank</th>
                    <th className="py-1 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateReport.rows.map((row) => (
                    <tr key={row.uci} className="border-t border-line-subtle">
                      <td className="py-1 text-primary tabular">
                        {row.san}
                        {row.chosen ? ' · played' : ''}
                        {row.note ? (
                          <span className="block text-[10px] text-tertiary">{row.note}</span>
                        ) : null}
                      </td>
                      <td className="py-1 text-right text-secondary tabular">
                        {row.engineRank ?? 'not in its lines'}
                      </td>
                      <td className="py-1 text-right text-secondary tabular">
                        {row.engineScore ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {candidateReport.unconsidered.length > 0 ? (
                <p className="mt-2 text-[10.5px] leading-relaxed text-tertiary">
                  The engine also offered{' '}
                  {candidateReport.unconsidered
                    .slice(0, 3)
                    .map((line) => line.moves[0])
                    .join(', ')}
                  , which you did not list.
                </p>
              ) : null}
              <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
                A comparison, not a mark. The engine is evidence at the depth it reached, and only a
                tablebase result is a fact.
              </p>
            </>
          )}
        </section>

        <section className="border-t border-line-subtle pt-3">
          <ThemePicker decision={decision} onChanged={onThemesChanged} />
        </section>

        <section className="border-t border-line-subtle pt-3">
          <TrainingHandoff reviewItem={reviewItem} />
        </section>
      </PanelBody>
    </Panel>
  );
}

/**
 * Reconcile the board's accepted-move list with the store's richer candidates.
 *
 * The board knows moves; the store knows moves plus notes and lines. Diffing
 * rather than replacing is what keeps a note attached to its move when another
 * candidate is added beside it.
 */
function syncCandidates(
  moves: readonly AcceptedMove[],
  answers: DraftAnswers,
  add: (candidate: { uci: Uci; san: San }) => void,
  remove: (uci: Uci) => void,
): void {
  const incoming = new Set(moves.map((move) => move.uci));
  for (const move of moves) {
    if (!answers.candidates.some((candidate) => candidate.uci === move.uci)) add(move);
  }
  for (const candidate of answers.candidates) {
    if (!incoming.has(candidate.uci)) remove(candidate.uci);
  }
}

/**
 * Read a typed continuation as SAN, keeping only the moves that are legal.
 *
 * Legality is checked against the position the candidate move reaches, so a
 * typo is dropped rather than stored as a chess claim that is not true.
 */
function parseLine(fen: string, uci: Uci, text: string): readonly San[] {
  const start = Position.fromTrustedFen(fen as never);
  const first = start.playUci(uci);
  if (!isOk(first)) return [];
  let cursor = Position.fromTrustedFen(first.value.after);
  const out: San[] = [];
  for (const token of text.trim().split(/\s+/)) {
    if (!token) continue;
    const played = cursor.playSan(token);
    if (!isOk(played)) break;
    out.push(played.value.san);
    cursor = Position.fromTrustedFen(played.value.after);
  }
  return out;
}
