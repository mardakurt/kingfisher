/**
 * Tactics puzzles: the rules of solving one, and the solver's rating.
 *
 * The puzzles are a curated subset of the Lichess puzzle database (CC0),
 * built by `scripts/build-puzzles.mjs`; each was replayed through Kingfisher's
 * rules at build time, and is replayed again here before it is shown, so a
 * row that does not play is refused rather than presented.
 *
 * The Lichess format, which this keeps: `fen` is the position *before* the
 * opponent's move; `moves[0]` is that move, and the solver answers from the
 * position after it. Every solver move in the solution is an only move, with
 * one exception the publisher states — "any move that checkmates should win
 * the puzzle" — so a checkmate is accepted wherever it is played.
 */

import { Position } from '@/chess/position';
import type { ChessMove, Color, Uci } from '@/chess/types';

import { GLICKO2_DEFAULT, glicko2Update, type Glicko2Rating } from './glicko2';

export interface Puzzle {
  readonly id: string;
  readonly fen: string;
  readonly moves: readonly Uci[];
  readonly rating: number;
  readonly deviation: number;
  /** -100 (worst) to 100 (best), from player votes at the source. */
  readonly popularity: number;
  readonly plays: number;
  readonly themes: readonly string[];
  readonly openings: readonly string[];
  /** Path of the source game on lichess.org, e.g. `yyznGmXs/black#34`. */
  readonly game?: string;
}

/**
 * One row of a shard, as `build-puzzles.mjs` writes it:
 * `[id, fen, moves, rating, deviation, popularity, plays, themes, openings, game]`.
 */
export type PuzzleRow = readonly [
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  string,
  string,
  string,
];

export function puzzleFromRow(row: PuzzleRow): Puzzle {
  const [id, fen, moves, rating, deviation, popularity, plays, themes, openings, game] = row;
  return {
    id,
    fen,
    moves: moves.split(' ').filter(Boolean) as Uci[],
    rating,
    deviation,
    popularity,
    plays,
    themes: themes.split(' ').filter(Boolean),
    openings: openings.split(' ').filter(Boolean),
    ...(game ? { game } : {}),
  };
}

export interface PuzzleLine {
  /** The position the solver is shown, after the opponent's move. */
  readonly start: Position;
  /** The opponent's move that set the puzzle, shown as the last move. */
  readonly setup: ChessMove;
  readonly solver: Color;
  /** Every move of the solution after the setup, with the positions they reach. */
  readonly solution: readonly ChessMove[];
}

/** The puzzle replayed through Kingfisher's rules, or why it does not play. */
export function puzzleLine(
  puzzle: Puzzle,
): { ok: true; line: PuzzleLine } | { ok: false; reason: string } {
  const initial = Position.fromFen(puzzle.fen);
  if (!initial.ok) return { ok: false, reason: `${puzzle.id}: ${initial.error.message}` };
  if (puzzle.moves.length < 2) return { ok: false, reason: `${puzzle.id}: no solution moves` };
  let position = initial.value;
  const played: ChessMove[] = [];
  for (const uci of puzzle.moves) {
    const move = position.playUci(uci);
    if (!move.ok) return { ok: false, reason: `${puzzle.id}: ${move.error.message}` };
    played.push(move.value);
    position = position.after(move.value);
  }
  const setup = played[0]!;
  const start = Position.fromTrustedFen(setup.after);
  return { ok: true, line: { start, setup, solver: start.turn, solution: played.slice(1) } };
}

export type PuzzleAnswer =
  | {
      readonly kind: 'correct';
      readonly move: ChessMove;
      /** The opponent's reply, when the solution continues. */
      readonly reply: ChessMove | null;
      readonly solved: boolean;
      /** True when an alternative checkmate was accepted in place of the listed move. */
      readonly alternativeMate: boolean;
    }
  | { readonly kind: 'wrong'; readonly move: ChessMove; readonly expected: ChessMove }
  | { readonly kind: 'illegal' };

/**
 * Judge the solver's move at `step` (0 is their first move). `position` is
 * where the board stands, which is the start or the position after the last
 * reply.
 */
export function answerPuzzle(
  line: PuzzleLine,
  step: number,
  position: Position,
  uci: string,
): PuzzleAnswer {
  const expected = line.solution[step * 2];
  const attempt = position.playUci(uci);
  if (!attempt.ok) return { kind: 'illegal' };
  const move = attempt.value;
  if (!expected) return { kind: 'illegal' };
  const mates = position.after(move).isCheckmate();
  if (move.uci === expected.uci || mates) {
    const reply = mates ? null : (line.solution[step * 2 + 1] ?? null);
    return {
      kind: 'correct',
      move,
      reply,
      solved: mates || step * 2 + 1 >= line.solution.length,
      alternativeMate: mates && move.uci !== expected.uci,
    };
  }
  return { kind: 'wrong', move, expected };
}

/** What a solver did on one puzzle, as the store keeps it. */
export interface PuzzleAttemptFacts {
  readonly puzzleRating: number;
  readonly puzzleDeviation: number;
  readonly solved: boolean;
  readonly attemptedAt: number;
}

export interface SolverRating extends Glicko2Rating {
  readonly attempts: number;
  readonly solved: number;
  /** True until the deviation falls under the provisional threshold. */
  readonly provisional: boolean;
}

/** A deviation above this is shown as provisional — the convention Lichess prints with "?". */
export const PROVISIONAL_DEVIATION = 110;

/**
 * The solver's rating: every attempt in order, each a one-game Glicko-2
 * period against the puzzle's published rating. Derived, never stored, so a
 * restored backup and the live store cannot disagree about it.
 */
export function solverRating(attempts: readonly PuzzleAttemptFacts[]): SolverRating {
  let rating: Glicko2Rating = GLICKO2_DEFAULT;
  let solved = 0;
  const ordered = [...attempts].sort((a, b) => a.attemptedAt - b.attemptedAt);
  for (const attempt of ordered) {
    if (attempt.solved) solved += 1;
    rating = glicko2Update(rating, [
      {
        opponentRating: attempt.puzzleRating,
        opponentDeviation: attempt.puzzleDeviation,
        score: attempt.solved ? 1 : 0,
      },
    ]);
  }
  return {
    ...rating,
    attempts: ordered.length,
    solved,
    provisional: rating.deviation > PROVISIONAL_DEVIATION,
  };
}

/**
 * The next puzzle: the closest in rating to `target` that matches the theme
 * (when one is chosen) and has not been attempted, picked deterministically
 * from the few nearest by `seed` so a session does not always open on the
 * same one.
 */
export function choosePuzzle(
  pool: readonly Puzzle[],
  options: {
    readonly target: number;
    readonly attempted: ReadonlySet<string>;
    readonly theme?: string | null;
    readonly seed: number;
  },
): Puzzle | null {
  const candidates = pool
    .filter((puzzle) => !options.attempted.has(puzzle.id))
    .filter((puzzle) => !options.theme || puzzle.themes.includes(options.theme))
    .sort(
      (a, b) =>
        Math.abs(a.rating - options.target) - Math.abs(b.rating - options.target) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 12);
  if (candidates.length === 0) return null;
  return candidates[Math.abs(Math.floor(options.seed)) % candidates.length]!;
}

/** Rating buckets the shards are split by: 100 points wide, named by their floor. */
export const PUZZLE_BUCKET_WIDTH = 100;
export const puzzleBucket = (rating: number): number =>
  Math.floor(rating / PUZZLE_BUCKET_WIDTH) * PUZZLE_BUCKET_WIDTH;
