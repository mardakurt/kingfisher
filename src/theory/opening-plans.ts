/**
 * Where the pieces actually went.
 *
 * ChessBase's opening report leads with plans: which squares the knights head
 * for, which pawn advance breaks the position open, where the rooks end up.
 * Those are the most useful things it says and the least checkable — the
 * report gives a square and a percentage and no way to ask what the
 * denominator was.
 *
 * Kingfisher can answer the same question and show its working, because it is
 * arithmetic over a population somebody named. Given the games that reached a
 * position, this replays each one's recorded continuation and counts where
 * each piece standing on the board got to. The output is a count and a
 * denominator, never a score:
 *
 *     White's knight on g1 reached f3 in 1,204 of 1,431 games (84.1%).
 *     ...b7-b5 was played in 612 of 1,431 games (42.8%), typically by move 11.
 *
 * ## What this is not
 *
 * It is **not an evaluation** and it is **not a plan**. A plan is a claim about
 * intent, and this module has no access to intent — it observes that a lot of
 * strong players put a knight on f3, which is evidence for a plan and not the
 * same thing as one. Prose that says "White prepares a kingside expansion"
 * belongs in a variation brief, where a person wrote it and is accountable for
 * it. See `variation-briefs.ts`, and AGENTS.md on keeping curated knowledge
 * distinguishable from population-derived facts.
 *
 * It is also **not the explorer**. The explorer reports the next move. This
 * reports where a piece ended up over the following twenty plies, which no
 * count of next moves can tell you.
 *
 * ## Replaying, not validating
 *
 * The continuations here are moves Kingfisher already parsed, validated and
 * stored at import. This module replays them onto a board to learn which piece
 * made each move; it does not generate moves and does not decide legality, so
 * it needs no rules engine and does not touch the chess.js boundary. A move
 * that does not correspond to a piece on the board stops that game's replay
 * rather than guessing — see `replay`.
 */

import { fileOf, makeSquare, rankOf, squareIndex } from '../chess/board';
import { type FenParts, parseFen } from '../chess/fen';
import type { Color, Piece, PieceType, Square } from '../chess/types';

/** How far past the report position a plan is looked for, in plies. */
export const DEFAULT_WINDOW = 30;

/** A game's recorded continuation from the report position, as UCI moves. */
export type Continuation = readonly string[];

export interface PieceDestination {
  readonly color: Color;
  readonly piece: PieceType;
  /** Where the piece stood in the report position. */
  readonly from: Square;
  /** The square it reached. */
  readonly to: Square;
  /** Games in which it reached that square within the window. */
  readonly games: number;
  /** Games examined. Every one of them had this piece on `from`. */
  readonly denominator: number;
  /** Median ply, counted from the report position, at which it first arrived. */
  readonly medianPly: number;
}

export interface PawnAdvance {
  readonly color: Color;
  /** Where the pawn stood in the report position. */
  readonly from: Square;
  /** The square it advanced to. */
  readonly to: Square;
  /** True when the pawn arrived by capturing rather than by pushing. */
  readonly capture: boolean;
  /** What it became, when the advance was a promotion. */
  readonly promotedTo?: PieceType;
  readonly games: number;
  readonly denominator: number;
  readonly medianPly: number;
}

export interface PlanEvidence {
  /** Games replayed. The denominator behind every row. */
  readonly games: number;
  /**
   * Games that could not be replayed from this position at all, and so are in
   * no denominator. Never silently dropped: a population this is large in is a
   * population the caller assembled wrongly.
   */
  readonly abandoned: number;
  readonly window: number;
  readonly destinations: readonly PieceDestination[];
  readonly advances: readonly PawnAdvance[];
}

interface Arrival {
  readonly color: Color;
  readonly piece: PieceType;
  readonly origin: Square;
  readonly square: Square;
  readonly capture: boolean;
  /** Plies past the report position, counting from zero. */
  readonly ply: number;
}

/** One tracked piece: what it is, and where it started. */
interface Tracked {
  readonly color: Color;
  readonly piece: PieceType;
  readonly origin: Square;
}

const KEY = (origin: Square, square: Square) => `${origin}>${square}`;

/**
 * Replay one continuation, reporting where each piece first arrived.
 *
 * A piece keeps the origin square it occupied in the report position for as
 * long as it survives, which is what makes "the knight from g1" a thing that
 * can be counted at all. A promoted pawn keeps its pawn origin and changes
 * type, so a queen that appears on d8 is attributed to the pawn that walked
 * there rather than to the queen that started there.
 *
 * Returns `null` when the replay cannot continue — a move whose origin square
 * is empty means this game's stored line does not start from the position it
 * was fetched for, and counting the rest of it would be counting a different
 * game.
 */
function replay(start: FenParts, moves: Continuation, window: number): readonly Arrival[] | null {
  const board = new Map<Square, Tracked>();
  for (let index = 0; index < 64; index += 1) {
    const piece: Piece | null = start.board[index] ?? null;
    if (!piece) continue;
    const square = squareFromIndex(index);
    board.set(square, { color: piece.color, piece: piece.type, origin: square });
  }

  const seen = new Set<string>();
  const arrivals: Arrival[] = [];
  const limit = Math.min(moves.length, window);

  for (let ply = 0; ply < limit; ply += 1) {
    const move = parseMove(moves[ply] ?? '');
    if (!move) return null;
    const mover = board.get(move.from);
    if (!mover) return null;

    const captured = board.get(move.to);
    // A pawn that changes file without landing on an occupied square took en
    // passant; the pawn it removed is beside the destination, not on it.
    const enPassant =
      mover.piece === 'p' && fileOf(move.from) !== fileOf(move.to) && captured === undefined;
    if (enPassant) {
      const victim = makeSquare(fileOf(move.to), rankOf(move.from));
      if (victim) board.delete(victim);
    }

    board.delete(move.from);
    board.set(move.to, {
      color: mover.color,
      piece: move.promotion ?? mover.piece,
      origin: mover.origin,
    });

    const arrive = (tracked: Tracked, square: Square, piece: PieceType, capture: boolean) => {
      const identity = KEY(tracked.origin, square);
      if (seen.has(identity)) return;
      seen.add(identity);
      arrivals.push({ color: tracked.color, piece, origin: tracked.origin, square, capture, ply });
    };

    arrive(mover, move.to, move.promotion ?? mover.piece, captured !== undefined || enPassant);

    /*
      Castling in UCI is the king moving two files. The rook travels with it
      and keeps its own origin, so "the rook from a8" stays countable — and it
      arrives on d1 or f1 in the same ply, which is a fact the report wants:
      castling is how a rook reaches the centre files in most openings, and a
      tracker that only followed the king would never say so.
    */
    if (mover.piece === 'k' && Math.abs(fileOf(move.to) - fileOf(move.from)) === 2) {
      const rank = rankOf(move.from);
      const kingside = fileOf(move.to) > fileOf(move.from);
      const rookFrom = makeSquare(kingside ? 7 : 0, rank);
      const rookTo = makeSquare(kingside ? 5 : 3, rank);
      if (rookFrom && rookTo) {
        const rook = board.get(rookFrom);
        if (rook) {
          board.delete(rookFrom);
          board.set(rookTo, rook);
          arrive(rook, rookTo, rook.piece, false);
        }
      }
    }
  }

  return arrivals;
}

const squareFromIndex = (index: number): Square => {
  const square = makeSquare(index % 8, Math.floor(index / 8));
  // `squareIndex` and `makeSquare` are inverses over 0..63; this is the
  // narrowing the type system cannot see rather than a real branch.
  if (!square) throw new Error(`board index out of range: ${index}`);
  return square;
};

function parseMove(uci: string): { from: Square; to: Square; promotion?: PieceType } | null {
  if (typeof uci !== 'string' || uci.length < 4 || uci.length > 5) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (!isSquareText(from) || !isSquareText(to)) return null;
  const promotion = uci.length === 5 ? (uci[4] ?? '').toLowerCase() : null;
  if (promotion !== null && !'nbrq'.includes(promotion)) return null;
  return {
    from: from as Square,
    to: to as Square,
    ...(promotion ? { promotion: promotion as PieceType } : {}),
  };
}

const isSquareText = (value: string): boolean => /^[a-h][1-8]$/.test(value);

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return Math.round(((sorted[middle - 1] ?? upper) + upper) / 2);
};

/**
 * Count where the pieces went, across a population.
 *
 * `minimumGames` is the floor below which a destination is not reported at
 * all. It exists because "the bishop went to b4 in one of three games" is a
 * true statement that reads as a plan, and the brief this implements is
 * explicit that a move is not a plan because it happened once.
 */
export function planEvidence(
  fen: string,
  continuations: readonly Continuation[],
  options: { window?: number; minimumGames?: number } = {},
): PlanEvidence | null {
  const parsed = parseFen(fen);
  if (!parsed.ok) return null;
  const window = Math.max(1, options.window ?? DEFAULT_WINDOW);
  const floor = Math.max(1, options.minimumGames ?? 2);

  const counts = new Map<string, { arrival: Arrival; games: number; plies: number[] }>();
  let replayed = 0;
  let abandoned = 0;

  for (const moves of continuations) {
    const arrivals = replay(parsed.value, moves, window);
    if (!arrivals) {
      // The stored line does not start from the position it was fetched for.
      // Counting the rest of it would be counting a different game.
      abandoned += 1;
      continue;
    }
    replayed += 1;
    for (const arrival of arrivals) {
      const identity = `${arrival.origin}>${arrival.square}`;
      const slot = counts.get(identity);
      if (slot) {
        slot.games += 1;
        slot.plies.push(arrival.ply);
      } else {
        counts.set(identity, { arrival, games: 1, plies: [arrival.ply] });
      }
    }
  }

  if (replayed === 0) return null;

  const destinations: PieceDestination[] = [];
  const advances: PawnAdvance[] = [];
  for (const { arrival, games, plies } of counts.values()) {
    if (games < floor) continue;
    const shared = {
      color: arrival.color,
      from: arrival.origin,
      to: arrival.square,
      games,
      denominator: replayed,
      medianPly: median(plies),
    };
    /*
      What the piece was in the *report* position decides which list it goes
      in — not what it is now, and not which rank it started on. A report
      position is rarely the initial one, so a pawn may stand anywhere; and a
      promoted pawn belongs in the advances, as the pawn that walked there
      rather than as a queen that materialised.
    */
    const started = parsed.value.board[squareIndex(arrival.origin)];
    if (started?.type === 'p') {
      advances.push({
        ...shared,
        capture: arrival.capture,
        ...(arrival.piece === 'p' ? {} : { promotedTo: arrival.piece }),
      });
      continue;
    }
    destinations.push({ ...shared, piece: arrival.piece });
  }

  const byFrequency = <T extends { games: number; from: string; to: string }>(a: T, b: T) =>
    b.games - a.games || a.from.localeCompare(b.from) || a.to.localeCompare(b.to);

  return {
    games: replayed,
    abandoned,
    window,
    destinations: destinations.sort(byFrequency),
    advances: advances.sort(byFrequency),
  };
}

/**
 * The most common destination for each piece, one row per piece.
 *
 * A knight that visited f3, e5 and g4 produces three rows in `destinations`
 * and one here, which is what a report wants when it has room for a sentence
 * per piece rather than a table.
 */
export function principalDestinations(
  evidence: PlanEvidence,
  options: { minimumShare?: number } = {},
): readonly PieceDestination[] {
  const share = options.minimumShare ?? 0.25;
  const best = new Map<Square, PieceDestination>();
  for (const row of evidence.destinations) {
    if (row.games / row.denominator < share) continue;
    const held = best.get(row.from);
    if (!held || row.games > held.games) best.set(row.from, row);
  }
  return [...best.values()].sort((a, b) => b.games - a.games);
}

/**
 * Pawn advances that are candidate breaks: a push of two or more ranks from
 * the pawn's original square, or any push past the middle of the board.
 *
 * Deliberately a shape rule and not a chess judgement. Whether ...b5 is a
 * break in this structure is a question with a real answer that this module
 * has no way to reach, so it reports the advance and its frequency and leaves
 * the word "break" to whoever wrote the brief.
 */
export function significantAdvances(
  evidence: PlanEvidence,
  options: { minimumShare?: number } = {},
): readonly PawnAdvance[] {
  const share = options.minimumShare ?? 0.15;
  return evidence.advances.filter((advance) => {
    if (advance.games / advance.denominator < share) return false;
    if (advance.capture) return false;
    const travelled = Math.abs(rankOf(advance.to) - rankOf(advance.from));
    const crossed = advance.color === 'w' ? rankOf(advance.to) >= 3 : rankOf(advance.to) <= 4;
    return travelled >= 2 || crossed;
  });
}
