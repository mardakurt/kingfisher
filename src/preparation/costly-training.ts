/**
 * Turn the costly moves in a set of games into drills.
 *
 * The costly-moves report names the moves that cost the most, and Training
 * already schedules positions to recall; this is the bridge. Each drill puts
 * the position before the mistake on the board and accepts the move the engine
 * preferred there. What the drill is allowed to claim is exactly what the
 * report measured, so the explanation says which move was played, which one
 * the engine preferred, how far it searched and what the difference cost —
 * and the answer is labelled as engine-derived (`answerSource: 'engine'`),
 * never presented as theory.
 *
 * A move with no preferred alternative (the engine agreed, or gave none) is
 * not a drill: there is nothing to train. The same position reached in two
 * games is one drill, the costlier occasion kept, because the training
 * schedule is keyed by position.
 */

import { positionKey } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { createTree } from '@/chess/tree/tree';
import type { Fen, San, Uci } from '@/chess/types';

import type { CostlyMove } from './costly-moves';

export interface CostlyDrill {
  readonly positionKey: string;
  readonly fen: Fen;
  readonly sideToMove: 'w' | 'b';
  readonly prompt: string;
  readonly solutionUci: readonly Uci[];
  readonly solutionSan: readonly San[];
  readonly explanation: string;
  readonly tags: readonly string[];
  readonly source: {
    readonly kind: 'game';
    readonly id: string;
    readonly label: string;
    readonly nodeId: string;
  };
}

/** `cost` is a fraction of winning chances; people read it as percentage points. */
const points = (cost: number) => Math.round(cost * 100);

function gameLabel(move: CostlyMove): string {
  const year = move.date?.slice(0, 4);
  return [`${move.white} – ${move.black}`, move.event, year && /^\d{4}$/.test(year) ? year : null]
    .filter(Boolean)
    .join(', ');
}

/** The UCI for `san` in `fen`, or null when the move is not legal there. */
function uciOf(fen: Fen, san: string): Uci | null {
  const tree = createTree(fen);
  const played = playSanAt(tree, tree.rootId, san);
  if (!played.ok) return null;
  return played.value.tree.nodes[played.value.nodeId]?.move?.uci ?? null;
}

export function drillsFromCostlyMoves(moves: readonly CostlyMove[]): readonly CostlyDrill[] {
  const best = new Map<string, { move: CostlyMove; drill: CostlyDrill }>();
  for (const move of moves) {
    if (!move.fenBefore || !move.bestSan || move.bestSan === move.playedSan) continue;
    const uci = uciOf(move.fenBefore, move.bestSan);
    if (!uci) continue;
    const key = positionKey(move.fenBefore);
    const known = best.get(key);
    if (known && known.move.cost >= move.cost) continue;
    const label = gameLabel(move);
    const depth = move.depth ? ` at depth ${move.depth}` : '';
    best.set(key, {
      move,
      drill: {
        positionKey: key,
        fen: move.fenBefore,
        sideToMove: move.colour,
        prompt: `${move.label} — find a better move than ${move.playedSan}.`,
        solutionUci: [uci],
        solutionSan: [move.bestSan as San],
        explanation: `In ${label}, ${move.playedSan} was played here. The engine preferred ${move.bestSan}${depth}; the move played gave up about ${points(move.cost)} percentage points of winning chances.`,
        tags: ['costly-move', move.phase],
        source: { kind: 'game', id: move.gameId, label, nodeId: move.nodeId },
      },
    });
  }
  return [...best.values()].sort((a, b) => b.move.cost - a.move.cost).map((entry) => entry.drill);
}
