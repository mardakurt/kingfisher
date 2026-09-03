'use client';

/**
 * The board you calculate on.
 *
 * Unlike the answer board, moves played here *advance* the position: entering
 * 1...Rd8 2.Qe2 walks the line the way a player calculates it, rather than
 * collecting two moves at one position. That is the whole difference between
 * recording candidates and recording a search.
 *
 * It also carries the blindfold. Hiding the pieces is not a gimmick — it is
 * how visualisation is trained — and doing it here rather than in a separate
 * mode means everything else about the workflow is unchanged when you turn it
 * on: the same tree, the same entry, the same record at the end.
 */

import { useMemo } from 'react';

import { Position } from '@/chess/position';
import { isOk } from '@/chess/result';
import type { Fen, Square } from '@/chess/types';
import type { MoveIntent } from '@/chess/types';
import { Chessboard } from '@/features/board/Chessboard';
import { usePreferences } from '@/stores/preferences-store';
import { cn } from '@/lib/cn';

import { movesAlong, type CalculationTree } from './tree';
import type { BoardVisibility } from './calculation-store';

export function CalculationBoard({
  rootFen,
  tree,
  visibility,
  onPlay,
}: {
  readonly rootFen: Fen;
  readonly tree: CalculationTree;
  readonly visibility: BoardVisibility;
  readonly onPlay: (move: { uci: string; san: string }) => void;
}) {
  const preferences = usePreferences();

  /**
   * The position at the end of the current path.
   *
   * Replayed from the root every time rather than cached: a calculation line
   * is a handful of moves, replaying it is free, and a cache here would be one
   * more thing that can disagree with the tree.
   */
  const position = useMemo(() => {
    let current = Position.fromTrustedFen(rootFen);
    for (const move of movesAlong(tree.branches, tree.path)) {
      const played = current.advanceSan(String(move.san));
      if (!isOk(played)) break;
      current = played.value.next;
    }
    return current;
  }, [rootFen, tree]);

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

  const onMove = (intent: MoveIntent) => {
    const played = position.play(intent);
    if (!played.ok) return;
    onPlay({ uci: played.value.uci, san: played.value.san });
  };

  return (
    <div className="relative">
      <Chessboard
        fen={position.fen}
        orientation={position.turn}
        destinations={destinations}
        onMove={onMove}
        isPromotion={(from, to) => position.requiresPromotion(from, to)}
        promotionColor={position.turn}
        theme={preferences.boardTheme}
        pieceSet={preferences.pieceSet}
        coordinates={visibility === 'blank' ? 'none' : 'outside'}
      />
      {/*
        The blindfold is an overlay rather than a different board, so the
        squares underneath stay clickable and a move can still be entered by
        dragging between squares you cannot see. That is the exercise.
      */}
      {visibility !== 'full' ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center',
            visibility === 'blank' ? 'bg-surface-1' : 'backdrop-blur-[6px]',
          )}
          aria-hidden
        >
          <span className="rounded-[4px] bg-surface-2/90 px-2 py-1 text-[10px] text-tertiary">
            {visibility === 'blank' ? 'Blank board' : 'Pieces hidden'}
          </span>
        </div>
      ) : null}
      {/*
        The position is always available to assistive technology, because
        hiding it is a training choice the sighted user made about themselves,
        not a property of the position.
      */}
      <p className="sr-only" aria-live="polite">
        {position.fen}
      </p>
    </div>
  );
}
