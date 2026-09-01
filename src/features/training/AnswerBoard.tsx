'use client';

/**
 * Authoring a move answer by playing it.
 *
 * Phase 3 shipped this as a text field that wanted `e2e4`. That is a notation
 * exam, not an authoring tool: it is slow, it is easy to get wrong, and it is
 * the one part of the product that asked the user to think in UCI. The board
 * is the input now, and the notation is derived.
 *
 * The text field survives as a disclosure, because there is one case it is
 * genuinely better for: pasting a line from somewhere else.
 */

import { useMemo, useState } from 'react';

import type { Shape } from '@/chess/annotations';
import { Position } from '@/chess/position';
import type { Fen, MoveIntent, San, Square, Uci } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { Chessboard } from '@/features/board/Chessboard';
import { cn } from '@/lib/cn';
import { resolveAnimationMs, usePreferences } from '@/stores/preferences-store';

export interface AcceptedMove {
  readonly uci: Uci;
  readonly san: San;
}

interface AnswerBoardProps {
  readonly fen: Fen;
  readonly moves: readonly AcceptedMove[];
  readonly onChange: (moves: readonly AcceptedMove[]) => void;
  /** One move, or a set of candidates. */
  readonly multiple: boolean;
  readonly orientation: 'w' | 'b';
}

export function AnswerBoard({ fen, moves, onChange, multiple, orientation }: AnswerBoardProps) {
  const preferences = usePreferences();
  const [raw, setRaw] = useState('');
  const [rawOpen, setRawOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const position = useMemo(() => Position.fromTrustedFen(fen), [fen]);
  const destinations = useMemo(() => {
    const map = new Map<Square, Square[]>();
    for (const move of position.legalMoves()) {
      const existing = map.get(move.from);
      if (existing) {
        if (!existing.includes(move.to)) existing.push(move.to);
      } else {
        map.set(move.from, [move.to]);
      }
    }
    return map;
  }, [position]);

  /* Accepted answers are drawn on the board, so the author sees the set. */
  const shapes = useMemo<Shape[]>(
    () =>
      moves.flatMap((move) => {
        const from = move.uci.slice(0, 2) as Square;
        const to = move.uci.slice(2, 4) as Square;
        return [{ kind: 'arrow' as const, from, to, brush: 'green' as const }];
      }),
    [moves],
  );

  const add = (uci: Uci, san: San) => {
    if (moves.some((move) => move.uci === uci)) return;
    onChange(multiple ? [...moves, { uci, san }] : [{ uci, san }]);
    setError(null);
  };

  const onMove = (intent: MoveIntent) => {
    const played = position.play(intent);
    if (!played.ok) return;
    add(played.value.uci, played.value.san);
  };

  const addRaw = () => {
    const tokens = raw
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const accepted: AcceptedMove[] = [];
    for (const token of tokens) {
      // Accept either notation here: someone pasting a line has SAN far more
      // often than UCI, and refusing it would be pedantry.
      const played = token.match(/^[a-h][1-8][a-h][1-8][qrbn]?$/i)
        ? position.playUci(token)
        : position.playSan(token);
      if (!played.ok) {
        setError(`${token}: ${played.error.message}`);
        return;
      }
      accepted.push({ uci: played.value.uci, san: played.value.san });
    }
    if (accepted.length === 0) return;
    onChange(multiple ? dedupe([...moves, ...accepted]) : [accepted[0] as AcceptedMove]);
    setRaw('');
    setError(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-[210px] shrink-0">
          <Chessboard
            fen={fen}
            orientation={orientation}
            destinations={destinations}
            onMove={onMove}
            isPromotion={(from, to) => position.requiresPromotion(from, to)}
            promotionColor={position.turn}
            shapes={shapes}
            theme={preferences.boardTheme}
            pieceSet={preferences.pieceSet}
            coordinates="none"
            animationMs={resolveAnimationMs(preferences.animationSpeed)}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-2xs text-tertiary">
            {multiple
              ? 'Play every move you would accept. They are stored as a set.'
              : 'Play the move you expect. Playing another replaces it.'}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {moves.length === 0 ? (
              <span className="text-2xs text-tertiary/70">No answer yet.</span>
            ) : (
              moves.map((move, index) => (
                <span
                  key={move.uci}
                  className="flex items-center gap-1 rounded-[3px] border border-line bg-surface-2 px-1.5 py-0.5 text-2xs text-primary"
                >
                  {multiple ? <span className="text-tertiary tabular">{index + 1}</span> : null}
                  {move.san}
                  <button
                    type="button"
                    aria-label={`Remove ${move.san}`}
                    className="text-tertiary hover:text-negative"
                    onClick={() => onChange(moves.filter((entry) => entry.uci !== move.uci))}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>

          {multiple && moves.length > 1 ? (
            <div className="mt-1.5 flex gap-1">
              {moves.map((move, index) => (
                <button
                  key={move.uci}
                  type="button"
                  disabled={index === 0}
                  onClick={() => onChange(swap(moves, index, index - 1))}
                  className={cn(
                    'rounded-[3px] border border-line px-1.5 py-0.5 text-[10px]',
                    index === 0 ? 'text-tertiary/40' : 'text-tertiary hover:text-secondary',
                  )}
                >
                  ↑ {move.san}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className="mt-2 text-[10px] text-tertiary underline-offset-2 hover:underline"
            onClick={() => setRawOpen((open) => !open)}
          >
            {rawOpen ? 'Hide notation entry' : 'Enter notation instead'}
          </button>

          {rawOpen ? (
            <div className="mt-1.5 flex gap-1.5">
              <input
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                placeholder="Nf3, e4 or g1f3"
                className="h-7 min-w-0 flex-1 rounded-[3px] border border-line bg-surface-inset px-2 text-[11px] text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60"
              />
              <Button onClick={addRaw} disabled={!raw.trim()}>
                Add
              </Button>
            </div>
          ) : null}

          {error ? <p className="mt-1 text-2xs text-negative">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

const dedupe = (moves: readonly AcceptedMove[]): AcceptedMove[] => {
  const seen = new Set<string>();
  return moves.filter((move) => (seen.has(move.uci) ? false : (seen.add(move.uci), true)));
};

const swap = (moves: readonly AcceptedMove[], from: number, to: number): AcceptedMove[] => {
  const next = [...moves];
  const moved = next[from] as AcceptedMove;
  next[from] = next[to] as AcceptedMove;
  next[to] = moved;
  return next;
};
