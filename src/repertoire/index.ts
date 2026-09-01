/**
 * Repertoire logic.
 *
 * Pure functions over repertoire records and game trees: no React, no storage,
 * no engine. The one idea everything here rests on is that a repertoire maps
 * *canonical positions* to intended moves, never move sequences to move
 * sequences. See ADR 0010.
 *
 * The consequence worth stating plainly: `1.Nf3 d5 2.d4` and `1.d4 d5 2.Nf3`
 * produce one entry, not two, because they are one position. Nothing in this
 * file special-cases transpositions — they simply cannot arise as duplicates.
 */

import { positionKey } from '@/chess/fen';
import { mustGetNode, nodePath } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { Fen, Uci } from '@/chess/types';
import type {
  PositionKey,
  RepertoireMove,
  RepertoirePositionRecord,
  RepertoireRole,
} from '@/persistence/domain';
import type { DatabaseMove } from '@/database/types';

/** Positions indexed by their canonical key, for O(1) lookup while walking. */
export type RepertoireIndex = ReadonlyMap<PositionKey, RepertoirePositionRecord>;

export const indexPositions = (positions: readonly RepertoirePositionRecord[]): RepertoireIndex =>
  new Map(positions.map((position) => [position.positionKey, position]));

export const lookup = (
  index: RepertoireIndex,
  fen: Fen | string,
): RepertoirePositionRecord | undefined => index.get(positionKey(fen));

/** The role a repertoire assigns to one move, if any. */
export function roleOf(
  position: RepertoirePositionRecord | undefined,
  uci: Uci | string,
): RepertoireRole | null {
  const move = position?.moves.find((candidate) => candidate.uci === uci);
  return move && !move.expected ? move.role : null;
}

/** Whether a move is a recorded opponent continuation at this position. */
export const isExpectedReply = (
  position: RepertoirePositionRecord | undefined,
  uci: Uci | string,
): boolean => position?.moves.some((move) => move.uci === uci && move.expected === true) ?? false;

/**
 * Merge a move into a position's move list.
 *
 * Re-adding a move updates its role and note rather than appending a second
 * copy, which is what makes "add this line" idempotent — a user replaying the
 * same preparation twice must not end up with two entries for one move.
 */
export function mergeMove(
  moves: readonly RepertoireMove[],
  move: RepertoireMove,
): RepertoireMove[] {
  const existing = moves.findIndex((candidate) => candidate.uci === move.uci);
  if (existing < 0) return [...moves, move];
  const next = [...moves];
  next[existing] = { ...moves[existing], ...move };
  return next;
}

export interface LineEntry {
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  readonly sideToMove: 'w' | 'b';
  readonly move: RepertoireMove;
  /** Plies from the start of this line — what the repertoire records as depth. */
  readonly depth: number;
  /**
   * The move's real half-move number in the game.
   *
   * Not the same as `depth` once a line starts from a position rather than
   * from move one: adding "2.d4" from a board opened at a Caro-Kann position
   * must not be shown as "1.d4".
   */
  readonly ply: number;
}

/**
 * Turn a path through a game tree into repertoire entries.
 *
 * Only positions where it is the repertoire's own turn produce entries: a
 * repertoire records what *you* intend to play. The opponent's moves are the
 * branches you must have an answer to, and they are represented by the position
 * they lead to, not by an entry of their own.
 */
export function lineToEntries(
  tree: GameTree,
  nodeId: NodeId,
  color: 'w' | 'b',
  role: RepertoireRole = 'main',
  note?: string,
): LineEntry[] {
  const path = nodePath(tree, nodeId);
  const entries: LineEntry[] = [];

  for (let index = 0; index < path.length - 1; index += 1) {
    const parent = mustGetNode(tree, path[index] as NodeId);
    const child = mustGetNode(tree, path[index + 1] as NodeId);
    const move = child.move;
    if (!move) continue;
    if (move.color !== color) continue;

    entries.push({
      positionKey: positionKey(parent.fen),
      fen: parent.fen,
      sideToMove: move.color,
      depth: index,
      ply: child.ply,
      move: {
        uci: move.uci,
        san: move.san,
        role,
        ...(note && index === path.length - 2 ? { note } : {}),
        updatedAt: 0,
      },
    });
  }

  return entries;
}

/**
 * Preserve the whole line as repertoire knowledge.
 *
 * Own-side moves retain their selected role. Opponent moves are explicitly
 * marked as expected continuations, which lets game analysis distinguish an
 * opponent deviation from a position that was never prepared at all.
 */
export function lineToKnowledge(
  tree: GameTree,
  nodeId: NodeId,
  color: 'w' | 'b',
  role: RepertoireRole = 'main',
  note?: string,
): LineEntry[] {
  const path = nodePath(tree, nodeId);
  const entries: LineEntry[] = [];

  for (let index = 0; index < path.length - 1; index += 1) {
    const parent = mustGetNode(tree, path[index] as NodeId);
    const child = mustGetNode(tree, path[index + 1] as NodeId);
    const move = child.move;
    if (!move) continue;
    const own = move.color === color;

    entries.push({
      positionKey: positionKey(parent.fen),
      fen: parent.fen,
      sideToMove: move.color,
      depth: index,
      ply: child.ply,
      move: {
        uci: move.uci,
        san: move.san,
        role: own ? role : 'main',
        ...(!own ? { expected: true } : {}),
        ...(note && index === path.length - 2 ? { note } : {}),
        // The repository stamps the real time when the entry is written.
        updatedAt: 0,
      },
    });
  }

  return entries;
}

// --- Coverage ---------------------------------------------------------------

export interface RepertoireCoverage {
  /** Positions where the repertoire says what to play. */
  readonly answeredPositions: number;
  /** Entries recorded but marked `candidate` — decided, but not trusted yet. */
  readonly candidatePositions: number;
  /** Positions carrying only `avoid` moves, i.e. a decision with no answer. */
  readonly unansweredPositions: number;
  readonly totalMoves: number;
  /** Own moves by role, so the headline numbers can be checked against parts. */
  readonly mainMoves: number;
  readonly alternativeMoves: number;
  readonly candidateMoves: number;
  readonly avoidMoves: number;
  /** Recorded opponent continuations; excluded from prepared-position counts. */
  readonly expectedReplies: number;
  readonly maxDepth: number;
  /** Plies, averaged over positions that have any move at all. */
  readonly averageDepth: number;
}

const hasPlayableMove = (position: RepertoirePositionRecord): boolean =>
  position.moves.some(
    (move) => !move.expected && (move.role === 'main' || move.role === 'alternative'),
  );

export function coverage(positions: readonly RepertoirePositionRecord[]): RepertoireCoverage {
  let answered = 0;
  let candidates = 0;
  let unanswered = 0;
  let totalMoves = 0;
  let expectedReplies = 0;
  let maxDepth = 0;
  let depthSum = 0;
  let depthCount = 0;
  const byRole: Record<RepertoireRole, number> = {
    main: 0,
    alternative: 0,
    candidate: 0,
    avoid: 0,
  };

  for (const position of positions) {
    const ownMoves = position.moves.filter((move) => !move.expected);
    totalMoves += ownMoves.length;
    for (const move of ownMoves) byRole[move.role] += 1;
    expectedReplies += position.moves.length - ownMoves.length;
    maxDepth = Math.max(maxDepth, position.depth);

    if (hasPlayableMove(position)) {
      answered += 1;
      depthSum += position.depth;
      depthCount += 1;
    } else if (ownMoves.some((move) => move.role === 'candidate')) {
      candidates += 1;
    } else if (ownMoves.length > 0) {
      unanswered += 1;
    }
  }

  return {
    answeredPositions: answered,
    candidatePositions: candidates,
    unansweredPositions: unanswered,
    totalMoves,
    mainMoves: byRole.main,
    alternativeMoves: byRole.alternative,
    candidateMoves: byRole.candidate,
    avoidMoves: byRole.avoid,
    expectedReplies,
    maxDepth,
    averageDepth: depthCount === 0 ? 0 : Math.round((depthSum / depthCount) * 10) / 10,
  };
}

// --- Gaps -------------------------------------------------------------------

export interface RepertoireGap {
  readonly positionKey: PositionKey;
  readonly fen: Fen;
  /** The opponent move that reaches a position you have not answered. */
  readonly opponentMove: DatabaseMove;
  /** How many local games played that opponent move here. */
  readonly games: number;
  readonly depth: number;
}

export interface GapInput {
  /** The repertoire position the opponent is moving from. */
  readonly position: RepertoirePositionRecord;
  /** What the local database says was played from the resulting positions. */
  readonly replies: readonly {
    readonly move: DatabaseMove;
    /** Canonical key of the position the move leads to. */
    readonly resultingKey: PositionKey;
    readonly resultingFen: Fen;
  }[];
}

/**
 * Opponent moves that lead somewhere the repertoire has nothing to say.
 *
 * This is the professional question the position-keyed model makes cheap: for
 * each move opponents actually play here, is the position it produces one we
 * have prepared? Gaps are reported with their local game counts so the user can
 * spend preparation time where the evidence is, not on every legal move.
 */
export function findGaps(
  index: RepertoireIndex,
  inputs: readonly GapInput[],
  minimumGames = 1,
): RepertoireGap[] {
  const gaps: RepertoireGap[] = [];

  for (const input of inputs) {
    for (const reply of input.replies) {
      if (reply.move.games < minimumGames) continue;
      const answer = index.get(reply.resultingKey);
      if (answer && hasPlayableMove(answer)) continue;

      gaps.push({
        positionKey: reply.resultingKey,
        fen: reply.resultingFen,
        opponentMove: reply.move,
        games: reply.move.games,
        depth: input.position.depth + 1,
      });
    }
  }

  // Most-played first: that is where preparation time is best spent.
  gaps.sort((a, b) => b.games - a.games || a.depth - b.depth);

  /*
    One unprepared position is one hole, however many move orders reach it.
    Two opponent moves that transpose into the same position would otherwise be
    reported as two jobs, and preparing either one would silently close both —
    which is precisely the confusion the position-keyed model exists to avoid.
    The most-played route survives, because that is the one worth naming.
  */
  const seen = new Set<PositionKey>();
  return gaps.filter((gap) => {
    if (seen.has(gap.positionKey)) return false;
    seen.add(gap.positionKey);
    return true;
  });
}

// --- Deviation --------------------------------------------------------------

export interface Deviation {
  /** Ply at which the game left the repertoire. */
  readonly ply: number;
  readonly nodeId: NodeId;
  readonly playedUci: Uci;
  readonly playedSan: string;
  /** What the repertoire expected instead. */
  readonly expected: readonly RepertoireMove[];
  /** Which side left the book. */
  readonly color: 'w' | 'b';
}

export interface DeviationReport {
  /** Plies that matched the repertoire before anything diverged. */
  readonly inBookPlies: number;
  /** The first divergence by the repertoire's own side, if any. */
  readonly own: Deviation | null;
  /** The first divergence by the opponent, if any. */
  readonly opponent: Deviation | null;
}

/**
 * Where a game left the prepared lines.
 *
 * Reports both sides separately and never conflates them: "you deviated on move
 * 9" and "your opponent left your preparation on move 9" are opposite pieces of
 * news, and a tool that muddles them is worse than one that says nothing.
 *
 * An opponent move is only a deviation where the repertoire actually recorded
 * expectations for that position; a position with no recorded opponent replies
 * is unprepared, not deviated from.
 */
export function findDeviation(
  tree: GameTree,
  nodeId: NodeId,
  color: 'w' | 'b',
  index: RepertoireIndex,
): DeviationReport {
  const path = nodePath(tree, nodeId);
  let inBookPlies = 0;
  let own: Deviation | null = null;
  let opponent: Deviation | null = null;

  for (let step = 0; step < path.length - 1; step += 1) {
    const parent = mustGetNode(tree, path[step] as NodeId);
    const child = mustGetNode(tree, path[step + 1] as NodeId);
    const move = child.move;
    if (!move) continue;

    const position = index.get(positionKey(parent.fen));
    const isOwn = move.color === color;

    if (isOwn) {
      const expected =
        position?.moves.filter((candidate) => !candidate.expected && candidate.role !== 'avoid') ??
        [];
      if (expected.length === 0) break;
      if (!expected.some((candidate) => candidate.uci === move.uci)) {
        own ??= {
          ply: child.ply,
          nodeId: child.id,
          playedUci: move.uci,
          playedSan: move.san,
          expected,
          color: move.color,
        };
        break;
      }
    } else if (position) {
      // Opponent replies are recorded on their own position entries; a move we
      // never wrote down is a hole in preparation, reported once.
      const expected = position.moves.filter((candidate) => candidate.expected);
      if (expected.length > 0 && !expected.some((candidate) => candidate.uci === move.uci)) {
        opponent ??= {
          ply: child.ply,
          nodeId: child.id,
          playedUci: move.uci,
          playedSan: move.san,
          expected,
          color: move.color,
        };
        break;
      }
    }

    inBookPlies = step + 1;
  }

  return { inBookPlies, own, opponent };
}
