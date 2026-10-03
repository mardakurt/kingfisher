/**
 * Costly moves: where an opponent's own games show them giving the game away.
 *
 * ChessBase's preparation screen has a "Blunder report". Kingfisher does not
 * use that word — a label pinned to a number reads as a verdict about a
 * person (`src/review/annotate.ts`) — but the question behind it is a good
 * one: in which kind of position does this player go wrong, and how often?
 * The answer here is counted, not graded: a move is costly when the engine's
 * scores before and after it say the mover gave up at least the threshold in
 * win chance, and every count comes with the moves it is out of, the engine,
 * and the time it was given.
 *
 * Phases are stated rules, not judgements: the opening is the first twelve
 * moves, an endgame is a position with at most six pieces besides kings and
 * pawns (the Style report's line), and the middlegame is the rest.
 *
 * Pure: the engine is a function passed in. `costly-moves.test.ts`.
 */

import { winningChances, type Score } from '@/chess/evaluation';
import { Position } from '@/chess/position';
import { mainlinePath } from '@/chess/tree/tree';
import type { Fen } from '@/chess/types';
import type { GameRecord } from '@/persistence/types';
import { playerKey } from '@/persistence/schema/migrations';
import { moveLabel, COST_THRESHOLDS, type CostThreshold } from '@/review/annotate';

import { ENDGAME_PIECES, officerCount } from './style';

/** The last full move counted as opening. */
export const OPENING_MOVES = 12;

export type Phase = 'opening' | 'middlegame' | 'endgame';
export const PHASES: readonly Phase[] = ['opening', 'middlegame', 'endgame'];

export interface EngineView {
  /** From White's point of view, as every engine score in Kingfisher. */
  readonly score: Score;
  readonly bestSan?: string;
  readonly depth: number;
}

export type Evaluate = (fen: Fen) => Promise<EngineView | null>;

export interface CostlyMove {
  readonly gameId: string;
  readonly white: string;
  readonly black: string;
  readonly date?: string;
  readonly event?: string;
  /** The node the move was played *from*, to open the game there. */
  readonly nodeId: string;
  readonly ply: number;
  /** `23.` or `23…`. */
  readonly label: string;
  readonly playedSan: string;
  readonly bestSan?: string;
  readonly before: Score;
  readonly after: Score;
  /** Win chance the mover gave up, 0–1. */
  readonly cost: number;
  readonly phase: Phase;
  readonly colour: 'w' | 'b';
}

export interface Tally {
  readonly moves: number;
  readonly costly: number;
}

export interface CostlyReport {
  readonly threshold: CostThreshold;
  readonly games: number;
  readonly moves: number;
  readonly costly: readonly CostlyMove[];
  readonly byPhase: Readonly<Record<Phase, Tally>>;
  readonly byColour: Readonly<Record<'w' | 'b', Tally>>;
  /** Games with at least one costly move. */
  readonly gamesWithCostly: number;
  /** Moves the engine gave no answer for, and which are therefore not counted. */
  readonly unanswered: number;
}

/** The phase of the position a move was played from. */
export function phaseOf(fen: string): Phase {
  if (officerCount(fen) <= ENDGAME_PIECES) return 'endgame';
  const fullmove = Number(fen.split(' ')[5] ?? '1');
  return fullmove <= OPENING_MOVES ? 'opening' : 'middlegame';
}

/** Win chance the mover gave up between two White-relative scores. */
export function costOf(before: Score, after: Score, mover: 'w' | 'b'): number {
  const white = winningChances(before) - winningChances(after);
  return Math.max(0, mover === 'w' ? white : -white);
}

/** The score of a position the game ended in, without asking an engine. */
function terminalScore(fen: Fen): Score | null {
  const position = Position.fromFen(fen);
  if (!position.ok) return null;
  if (position.value.isCheckmate()) {
    // The side to move is mated: the other side has won.
    return { kind: 'mate', moves: position.value.turn === 'w' ? -1 : 1 };
  }
  if (position.value.isStalemate() || position.value.isInsufficientMaterial()) {
    return { kind: 'cp', cp: 0 };
  }
  return null;
}

export interface GameMoves {
  readonly game: GameRecord;
  readonly colour: 'w' | 'b';
  /** Each of the opponent's moves: the position before and after. */
  readonly moves: readonly {
    readonly nodeId: string;
    readonly ply: number;
    readonly san: string;
    readonly before: Fen;
    readonly after: Fen;
  }[];
}

/** The opponent's moves in one game, or null when the game is not theirs. */
export function opponentMoves(game: GameRecord, aliases: readonly string[]): GameMoves | null {
  const keys = new Set(aliases.map(playerKey).filter(Boolean));
  const colour = keys.has(game.whiteKey) ? 'w' : keys.has(game.blackKey) ? 'b' : null;
  if (!colour) return null;
  const path = mainlinePath(game.tree);
  const moves: GameMoves['moves'][number][] = [];
  for (let index = 1; index < path.length; index += 1) {
    const node = game.tree.nodes[path[index]!];
    const parent = game.tree.nodes[path[index - 1]!];
    if (!node?.move || !parent) continue;
    const mover = parent.fen.split(' ')[1] === 'b' ? 'b' : 'w';
    if (mover !== colour) continue;
    moves.push({
      nodeId: parent.id,
      ply: parent.ply,
      san: node.move.san,
      before: parent.fen,
      after: node.fen,
    });
  }
  return { game, colour, moves };
}

/**
 * Read one game's opponent moves through the engine, asking about each
 * position once. A finished position (mate, stalemate) is scored by the rules,
 * not the engine.
 */
export async function evaluateGame(
  moves: GameMoves,
  evaluate: Evaluate,
  cache: Map<string, EngineView | null>,
  signal?: AbortSignal,
): Promise<{ readonly entries: readonly CostlyMove[]; readonly unanswered: number }> {
  const view = async (fen: Fen): Promise<EngineView | null> => {
    const terminal = terminalScore(fen);
    if (terminal) return { score: terminal, depth: 0 };
    if (cache.has(fen)) return cache.get(fen) ?? null;
    const answer = await evaluate(fen);
    cache.set(fen, answer);
    return answer;
  };
  const entries: CostlyMove[] = [];
  let unanswered = 0;
  const { game, colour } = moves;
  for (const move of moves.moves) {
    if (signal?.aborted) break;
    const before = await view(move.before);
    const after = await view(move.after);
    if (!before || !after) {
      unanswered += 1;
      continue;
    }
    entries.push({
      gameId: game.id,
      white: game.white,
      black: game.black,
      ...(game.date ? { date: game.date } : {}),
      ...(game.event ? { event: game.event } : {}),
      nodeId: move.nodeId,
      ply: move.ply,
      label: moveLabel(move.ply, colour),
      playedSan: move.san,
      ...(before.bestSan && before.bestSan !== move.san ? { bestSan: before.bestSan } : {}),
      before: before.score,
      after: after.score,
      cost: costOf(before.score, after.score, colour),
      phase: phaseOf(move.before),
      colour,
    });
  }
  return { entries, unanswered };
}

/** Every evaluated move, counted against the threshold. */
export function summarise(
  entries: readonly CostlyMove[],
  options: {
    readonly threshold: CostThreshold;
    readonly games: number;
    readonly unanswered: number;
  },
): CostlyReport {
  const limit = COST_THRESHOLDS[options.threshold];
  const zero = (): { moves: number; costly: number } => ({ moves: 0, costly: 0 });
  const byPhase = { opening: zero(), middlegame: zero(), endgame: zero() };
  const byColour = { w: zero(), b: zero() };
  const costly: CostlyMove[] = [];
  const gamesWith = new Set<string>();
  for (const entry of entries) {
    const isCostly = entry.cost >= limit;
    byPhase[entry.phase].moves += 1;
    byColour[entry.colour].moves += 1;
    if (!isCostly) continue;
    byPhase[entry.phase].costly += 1;
    byColour[entry.colour].costly += 1;
    costly.push(entry);
    gamesWith.add(entry.gameId);
  }
  return {
    threshold: options.threshold,
    games: options.games,
    moves: entries.length,
    costly: costly.sort((a, b) => b.cost - a.cost),
    byPhase,
    byColour,
    gamesWithCostly: gamesWith.size,
    unanswered: options.unanswered,
  };
}
