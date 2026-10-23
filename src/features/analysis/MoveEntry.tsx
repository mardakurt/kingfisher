'use client';

/**
 * Moves typed rather than dragged.
 *
 * The board took a move only from a pointer: a person entering a game from a
 * scoresheet clicked two squares sixty times, and a person who does not use a
 * mouse could not play a move at all. This field takes the move as it is
 * written — `Nf3`, `exd5`, `e8=Q`, `0-0`, `e2e4` — and plays it through the
 * same handler as the board, so a capturing tool (calculation, training)
 * receives a typed move exactly as it would a dragged one.
 *
 * `matchMoveInput` matches against the position's legal moves, so the field
 * cannot play an illegal move, and an input two moves answer is never
 * guessed. The field stays open after a move, because entering a line is
 * several moves in a row; Escape closes it and gives the keys back to the
 * board.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { matchMoveInput } from '@/chess/move-input';
import type { Position } from '@/chess/position';
import type { MoveIntent } from '@/chess/types';
import { moveIntent } from '@/chess/moves';
import { Close } from '@/components/icons';
import { useUi } from '@/stores/ui-store';

/** More than this many candidates is a list nobody reads; the count says the rest. */
const SHOWN_CANDIDATES = 8;

export function MoveEntry({
  position,
  onMove,
  showCandidates,
}: {
  readonly position: Position;
  readonly onMove: (intent: MoveIntent) => void;
  /** False where the workspace withholds legal-move hints. */
  readonly showCandidates: boolean;
}) {
  const setOpen = useUi((state) => state.setMoveEntryOpen);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const legal = useMemo(() => position.legalMoves(), [position]);
  const match = useMemo(() => matchMoveInput(legal, text), [legal, text]);

  const play = (intent: MoveIntent) => {
    onMove(intent);
    setText('');
    setProblem(null);
    input.current?.focus();
  };

  const submit = () => {
    if (text.trim() === '') return;
    if (match.move) {
      play(moveIntent(match.move));
      return;
    }
    if (match.ambiguous) {
      setProblem(
        `“${text.trim()}” could be ${match.candidates.map((move) => move.san).join(' or ')}.`,
      );
      return;
    }
    setProblem(
      legal.length === 0
        ? 'There are no legal moves in this position.'
        : `“${text.trim()}” is not a legal move here.`,
    );
  };

  const close = () => {
    setOpen(false);
  };

  const shown = showCandidates && text.trim() !== '' ? match.candidates : [];

  return (
    <div
      className="mx-auto mt-1.5 flex w-full max-w-[860px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1"
      data-move-entry
    >
      <form
        className="flex h-8 min-w-[12rem] flex-1 items-center gap-1.5 rounded-[var(--radius-panel)] bg-surface-2 pl-2.5 pr-1 focus-within:ring-2 focus-within:ring-accent/40 sm:max-w-[18rem]"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="move-entry-input">
          Type a move
        </label>
        <input
          ref={input}
          id="move-entry-input"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
          }}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={`${position.turn === 'w' ? 'White' : 'Black'} to move — Nf3, exd5, e2e4`}
          aria-invalid={problem ? true : undefined}
          aria-describedby="move-entry-status"
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[13px] text-primary outline-none placeholder:font-sans placeholder:text-tertiary"
        />
        <button
          type="button"
          aria-label="Close move entry (Esc)"
          title="Close move entry (Esc)"
          onClick={close}
          data-touch-target
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-tertiary hover:bg-surface-3 hover:text-primary"
        >
          <Close className="size-3" />
        </button>
      </form>
      <div
        id="move-entry-status"
        role="status"
        aria-live="polite"
        className="flex min-w-0 flex-wrap items-center gap-1 text-[11px]"
      >
        {problem ? (
          <span className="text-negative" data-move-entry-problem>
            {problem}
          </span>
        ) : match.move ? (
          <span className="text-secondary">
            Enter plays <span className="font-medium text-primary">{match.move.san}</span>
          </span>
        ) : null}
        {!problem && !match.move
          ? shown.slice(0, SHOWN_CANDIDATES).map((move) => (
              <button
                key={move.uci}
                type="button"
                onClick={() => play(moveIntent(move))}
                data-touch-target
                className="rounded-[var(--radius-control)] bg-surface-2 px-1.5 py-0.5 font-mono text-primary hover:bg-surface-3"
              >
                {move.san}
              </button>
            ))
          : null}
        {!problem && !match.move && shown.length > SHOWN_CANDIDATES ? (
          <span className="text-tertiary">+{shown.length - SHOWN_CANDIDATES} more</span>
        ) : null}
      </div>
    </div>
  );
}
