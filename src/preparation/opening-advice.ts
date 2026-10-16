/**
 * Openings to reconsider: where a player's own results are poor, and what a
 * named reference population plays there instead.
 *
 * The question a player brings is "which of my openings is costing me, and
 * what else is there?" Both halves are answerable from evidence Kingfisher
 * holds — the player's own games, and a reference source — so this answers
 * them and nothing else:
 *
 * - **Where:** a position in the player's games, with the player to move,
 *   where the move they chose most often has at least `minGames` games and
 *   scored under `maxScore` for them.
 * - **What else:** the moves the reference source played there more than
 *   `minReferenceGames` times that scored better *in that source* than the
 *   player's move did. Each with its own count and score, and the source
 *   named. A recommendation is never "the best move": it is "this scored
 *   better, in this many games of this population", and the player decides.
 *
 * Nothing is stored and nothing is invented: a position the source has no
 * games for, or where nothing scored better, is not reported.
 */

import type { Fen, San, Uci } from '@/chess/types';
import type { DatabaseMove, ExplorerResult } from '@/database/types';

import type { OpeningTree } from './index';

export interface AdviceMove {
  readonly san: San;
  readonly uci: Uci;
  readonly games: number;
  /** Score for the side to move, 0–1. */
  readonly score: number;
}

export interface OpeningAdvice {
  readonly color: 'w' | 'b';
  /** The moves from the start to the position, as played in the player's games. */
  readonly line: readonly San[];
  readonly fen: Fen;
  /** The player's most-played move here and how they scored with it. */
  readonly yours: AdviceMove;
  readonly source: { readonly id: string; readonly name: string };
  /** The player's move in the reference, when the reference has it. */
  readonly yoursInSource: AdviceMove | null;
  /** Moves that scored better in the reference, best first, at most two. */
  readonly alternatives: readonly AdviceMove[];
}

export interface OpeningAdviceOptions {
  /** One tree per colour, built from the player's own games. */
  readonly trees: { readonly w: OpeningTree; readonly b: OpeningTree };
  readonly explore: (fen: Fen) => Promise<ExplorerResult>;
  readonly minGames?: number;
  readonly maxScore?: number;
  readonly minReferenceGames?: number;
  readonly maxPlies?: number;
  readonly maxRows?: number;
}

/** Score for the side to move from a source's counts. */
export function moverScore(
  move: Pick<DatabaseMove, 'games' | 'white' | 'draws' | 'black'>,
  turn: 'w' | 'b',
): number {
  if (move.games === 0) return 0.5;
  const wins = turn === 'w' ? move.white : move.black;
  return (wins + move.draws / 2) / move.games;
}

interface Candidate {
  readonly color: 'w' | 'b';
  readonly line: readonly San[];
  readonly fen: Fen;
  readonly yours: AdviceMove;
}

/** Positions where the player is to move and their usual move scored badly. */
function candidates(
  tree: OpeningTree,
  color: 'w' | 'b',
  minGames: number,
  maxScore: number,
  maxPlies: number,
): Candidate[] {
  const found: Candidate[] = [];
  const seen = new Set<string>();
  const queue: { key: string; line: San[] }[] = [{ key: tree.rootKey, line: [] }];
  while (queue.length > 0) {
    const { key, line } = queue.shift()!;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = tree.nodes.get(key);
    if (!node || line.length >= maxPlies) continue;
    const turn = node.fen.split(' ')[1] === 'b' ? 'b' : 'w';
    if (turn === color && node.edges.length > 0) {
      const usual = [...node.edges].sort((a, b) => b.games - a.games)[0]!;
      const score = usual.playerScore / 100;
      if (usual.games >= minGames && score < maxScore) {
        found.push({
          color,
          line,
          fen: node.fen,
          yours: { san: usual.san, uci: usual.uci, games: usual.games, score },
        });
      }
    }
    for (const edge of node.edges) {
      if (edge.games >= minGames) queue.push({ key: edge.resultingKey, line: [...line, edge.san] });
    }
  }
  return found;
}

export async function openingAdvice(options: OpeningAdviceOptions): Promise<OpeningAdvice[]> {
  const minGames = options.minGames ?? 5;
  const maxScore = options.maxScore ?? 0.45;
  const minReferenceGames = options.minReferenceGames ?? 50;
  const maxPlies = options.maxPlies ?? 16;
  const maxRows = options.maxRows ?? 5;

  const all = [
    ...candidates(options.trees.w, 'w', minGames, maxScore, maxPlies),
    ...candidates(options.trees.b, 'b', minGames, maxScore, maxPlies),
  ].sort((a, b) => b.yours.games - a.yours.games);

  const advice: OpeningAdvice[] = [];
  // Asked about a bounded number of positions: three per row reported.
  for (const candidate of all.slice(0, maxRows * 3)) {
    if (advice.length >= maxRows) break;
    const result = await options.explore(candidate.fen);
    const turn = candidate.color;
    const scored = result.moves.map((move) => ({
      san: move.san,
      uci: move.uci,
      games: move.games,
      score: moverScore(move, turn),
    }));
    const yoursInSource = scored.find((move) => move.uci === candidate.yours.uci) ?? null;
    /*
      The bar an alternative must clear: the source's own record for the
      player's move when the source has enough games of it to be evidence,
      and otherwise the player's own score. Four lucky games of a rare move in
      the source must not hide everything that was played more often.
    */
    const bar =
      yoursInSource && yoursInSource.games >= minReferenceGames
        ? yoursInSource.score
        : candidate.yours.score;
    const alternatives = scored
      .filter(
        (move) =>
          move.uci !== candidate.yours.uci && move.games >= minReferenceGames && move.score > bar,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    if (alternatives.length === 0) continue;
    advice.push({
      color: candidate.color,
      line: candidate.line,
      fen: candidate.fen,
      yours: candidate.yours,
      source: result.source,
      yoursInSource,
      alternatives,
    });
  }
  return advice;
}
