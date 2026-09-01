'use client';

/**
 * Answering a training item.
 *
 * The five modes are genuinely different questions, so they get genuinely
 * different controls: three of them take moves played on the board, one takes
 * an evaluation band, and one takes prose. What they share is that the item's
 * own recorded answer is the only thing an attempt is compared with — there is
 * no engine here, and nothing is marked right because a search agreed with it.
 */

import { useMemo, useState } from 'react';

import type { Shape } from '@/chess/annotations';
import { Position } from '@/chess/position';
import type { MoveIntent, Square, Uci } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { Chessboard } from '@/features/board/Chessboard';
import { cn } from '@/lib/cn';
import {
  EVALUATION_BANDS,
  type EvaluationBand,
  type TrainingItemRecord,
} from '@/persistence/domain';
import { resolveAnimationMs, usePreferences } from '@/stores/preferences-store';
import { checkAnswer, isMoveMode, type AnswerCheck, type Attempt } from '@/training/answer';

export interface AttemptState {
  readonly attempt: Attempt;
  readonly check: AnswerCheck;
}

interface TrainingAnswerProps {
  readonly item: TrainingItemRecord;
  readonly result: AttemptState | null;
  readonly onSubmit: (state: AttemptState) => void;
  /** Give up and see the answer; nothing is marked right or wrong. */
  readonly onReveal: () => void;
  readonly revealed: boolean;
}

export function TrainingAnswer({
  item,
  result,
  onSubmit,
  onReveal,
  revealed,
}: TrainingAnswerProps) {
  const preferences = usePreferences();
  const [played, setPlayed] = useState<readonly PlayedMove[]>([]);
  const [plan, setPlan] = useState('');

  const position = useMemo(() => Position.fromTrustedFen(item.fen), [item.fen]);
  const destinations = useMemo(() => legalDestinations(position), [position]);

  const shapes = useMemo<Shape[]>(
    () =>
      played.map((move) => ({
        kind: 'arrow' as const,
        from: move.from,
        to: move.to,
        brush: arrowBrush(move.uci, result),
      })),
    [played, result],
  );

  const submitMoves = (moves: readonly PlayedMove[]) => {
    const attempt: Attempt = { kind: 'moves', uci: moves.map((move) => move.uci) };
    onSubmit({ attempt, check: checkAnswer(item, attempt) });
  };

  const onMove = (intent: MoveIntent) => {
    if (result || revealed) return;
    const move = position.play(intent);
    if (!move.ok) return;
    const entry: PlayedMove = {
      uci: move.value.uci,
      san: move.value.san,
      from: move.value.from,
      to: move.value.to,
    };
    if (played.some((candidate) => candidate.uci === entry.uci)) return;

    // A single-answer item is decided by the move; a candidate list is not
    // finished until the user says it is.
    if (item.mode === 'candidates') {
      setPlayed((current) => [...current, entry]);
      return;
    }
    setPlayed([entry]);
    submitMoves([entry]);
  };

  const answered = result !== null;
  const locked = answered || revealed;

  return (
    <>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="aspect-square w-full max-w-[min(620px,calc(100dvh-260px))]">
          <Chessboard
            fen={item.fen}
            orientation={item.sideToMove}
            theme={preferences.boardTheme}
            pieceSet={preferences.pieceSet}
            coordinates={preferences.coordinateStyle}
            animationMs={resolveAnimationMs(preferences.animationSpeed)}
            {...(isMoveMode(item.mode) && !locked ? { destinations, onMove } : {})}
            isPromotion={(from, to) => position.requiresPromotion(from, to)}
            promotionColor={position.turn}
            shapes={shapes}
          />
        </div>
      </div>

      <div className="mx-auto mt-3 w-full max-w-[620px] border-t border-line-subtle pt-2">
        {isMoveMode(item.mode) ? (
          <MoveAnswer
            item={item}
            played={played}
            locked={locked}
            onRemove={(uci) => setPlayed((current) => current.filter((move) => move.uci !== uci))}
            onCheck={() => submitMoves(played)}
            onReveal={onReveal}
          />
        ) : item.mode === 'evaluate' ? (
          <BandAnswer
            locked={locked}
            chosen={result?.attempt.kind === 'band' ? result.attempt.band : null}
            expected={answered || revealed ? item.expectedBand : undefined}
            onChoose={(band) => {
              const attempt: Attempt = { kind: 'band', band };
              onSubmit({ attempt, check: checkAnswer(item, attempt) });
            }}
            onReveal={onReveal}
          />
        ) : (
          <PlanAnswer
            value={plan}
            locked={locked}
            onChange={setPlan}
            onSubmit={() => {
              const attempt: Attempt = { kind: 'plan', text: plan };
              onSubmit({ attempt, check: checkAnswer(item, attempt) });
            }}
            onReveal={onReveal}
          />
        )}

        {result ? <Verdict check={result.check} item={item} /> : null}
      </div>
    </>
  );
}

interface PlayedMove {
  readonly uci: Uci;
  readonly san: string;
  readonly from: Square;
  readonly to: Square;
}

function MoveAnswer({
  item,
  played,
  locked,
  onRemove,
  onCheck,
  onReveal,
}: {
  readonly item: TrainingItemRecord;
  readonly played: readonly PlayedMove[];
  readonly locked: boolean;
  readonly onRemove: (uci: Uci) => void;
  readonly onCheck: () => void;
  readonly onReveal: () => void;
}) {
  const collecting = item.mode === 'candidates';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-2xs text-tertiary">
        {locked
          ? 'Answer recorded.'
          : collecting
            ? 'Play every candidate you would consider, then check.'
            : 'Play your answer on the board.'}
      </span>
      {played.map((move) => (
        <span
          key={move.uci}
          className="flex items-center gap-1 rounded-[3px] border border-line bg-surface-2 px-1.5 py-0.5 text-2xs text-primary"
        >
          {move.san}
          {!locked && collecting ? (
            <button
              type="button"
              aria-label={`Remove ${move.san}`}
              className="text-tertiary hover:text-negative"
              onClick={() => onRemove(move.uci)}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      <div className="ml-auto flex gap-1.5">
        {collecting && !locked ? (
          <Button variant="accent" disabled={played.length === 0} onClick={onCheck}>
            Check {played.length} candidate{played.length === 1 ? '' : 's'}
          </Button>
        ) : null}
        {!locked ? (
          <Button variant="subtle" onClick={onReveal}>
            Show answer
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function BandAnswer({
  locked,
  chosen,
  expected,
  onChoose,
  onReveal,
}: {
  readonly locked: boolean;
  readonly chosen: EvaluationBand | null;
  readonly expected: EvaluationBand | undefined;
  readonly onChoose: (band: EvaluationBand) => void;
  readonly onReveal: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-2xs text-tertiary">
          {locked ? 'Answer recorded.' : 'Choose the band you would give this position.'}
        </span>
        {!locked ? (
          <Button className="ml-auto" variant="subtle" onClick={onReveal}>
            Show answer
          </Button>
        ) : null}
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-5">
        {EVALUATION_BANDS.map((band) => (
          <Button
            key={band.id}
            disabled={locked}
            variant={band.id === chosen ? 'accent' : 'subtle'}
            className={cn(
              'h-auto justify-center py-1.5 text-center text-[10.5px] leading-tight',
              locked && band.id === expected && band.id !== chosen && 'border-positive',
            )}
            onClick={() => onChoose(band.id)}
          >
            {band.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PlanAnswer({
  value,
  locked,
  onChange,
  onSubmit,
  onReveal,
}: {
  readonly value: string;
  readonly locked: boolean;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onReveal: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-2xs text-tertiary">
          Write the plan you would follow, then compare it with the one you recorded.
        </span>
        {!locked ? (
          <Button className="ml-auto shrink-0" variant="subtle" onClick={onReveal}>
            Show answer
          </Button>
        ) : null}
      </div>
      <textarea
        value={value}
        disabled={locked}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Trade the light-squared bishops, then push c5."
        className="mt-2 min-h-16 w-full resize-y rounded-[4px] border border-line bg-surface-inset px-2.5 py-2 text-xs leading-relaxed text-primary outline-none focus:border-accent/60 disabled:opacity-70"
      />
      {!locked ? (
        <div className="mt-1.5 flex justify-end">
          <Button variant="accent" disabled={!value.trim()} onClick={onSubmit}>
            Compare with the recorded plan
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Verdict({
  check,
  item,
}: {
  readonly check: AnswerCheck;
  readonly item: TrainingItemRecord;
}) {
  const tone =
    check.verdict === 'correct'
      ? 'text-positive'
      : check.verdict === 'incorrect'
        ? 'text-negative'
        : 'text-secondary';
  return (
    <p className="mt-2 text-2xs leading-relaxed">
      <span className={cn('font-medium capitalize', tone)}>{check.verdict}</span>
      <span className="text-tertiary"> · {check.summary}</span>
      {check.missed.length ? (
        <span className="text-tertiary">
          {' '}
          Recorded: {check.missed.map((uci) => sanFor(item, uci)).join(', ')}.
        </span>
      ) : null}
    </p>
  );
}

/** The SAN the item stored for a move, falling back to its UCI. */
function sanFor(item: TrainingItemRecord, uci: Uci): string {
  const at = item.solutionUci.indexOf(uci);
  return at >= 0 ? (item.solutionSan[at] ?? uci) : uci;
}

function arrowBrush(uci: Uci, result: AttemptState | null): 'blue' | 'green' | 'red' {
  if (!result || result.check.verdict === 'unchecked') return 'blue';
  return result.check.matched.includes(uci) ? 'green' : 'red';
}

function legalDestinations(position: Position): ReadonlyMap<Square, readonly Square[]> {
  const destinations = new Map<Square, Square[]>();
  for (const move of position.legalMoves()) {
    const existing = destinations.get(move.from);
    if (existing) {
      if (!existing.includes(move.to)) existing.push(move.to);
    } else {
      destinations.set(move.from, [move.to]);
    }
  }
  return destinations;
}
