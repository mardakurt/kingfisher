/**
 * Where a game left a reference population.
 *
 * ChessBase calls this "Find novelty" and "Novelty annotation": walk the game
 * against the reference database and stop at the first move nobody in it had
 * played. It is the question a player asks of every game they prepare from —
 * "where does this leave theory, and who got there before?" — and the
 * question a coach asks of a student's game.
 *
 * Kingfisher does not call the move a novelty (`radar.ts` states why: a
 * novelty is a claim about all of chess, and a population is not all of
 * chess). It says what is true: the move is not in *this source*, with these
 * filters, and this is what the source's games played instead. A different
 * source answers differently, and saying which one answered is the point.
 *
 * Three answers that are not "it left here" are kept apart, because each
 * would be a false statement if reported as a departure:
 *
 * - **past the source's depth** — a reference pack aggregates positions only
 *   to the ply its build kept, so an empty answer beyond it says nothing
 *   about what was played;
 * - **uncertain** — the source returned as many moves as were asked for and
 *   the game's move was not among them, so it may be further down the list;
 * - **followed** — the game never left the source within the plies read.
 *
 * Pure apart from the `explore` function it is handed, so the rules are
 * tested without a network or a pack.
 */

import { insertLine } from '@/chess/game';
import { mainlinePath, setComment } from '@/chess/tree/tree';
import type { GameTree, MoveNode, NodeId } from '@/chess/tree/types';
import { moveNumberOfPly } from '@/chess/tree/types';
import type { Fen } from '@/chess/types';
import type { DatabaseGameRef, DatabaseMove, ExplorerResult } from '@/database/types';

/** How many moves each query asks for; a list this long may have been cut. */
export const DEPARTURE_MOVE_LIMIT = 60;

/** How far into a game the walk reads before it stops asking. */
export const DEPARTURE_MAX_PLIES = 80;

export interface KnownPosition {
  /** The node whose position the source last knew, before the departing move. */
  readonly nodeId: NodeId;
  readonly ply: number;
  readonly totalGames: number;
  /** What the source's games played here, most frequent first. */
  readonly moves: readonly DatabaseMove[];
  /** Games that reached this position — ChessBase's predecessors. */
  readonly games: readonly DatabaseGameRef[];
}

export type Departure =
  | {
      readonly kind: 'left';
      readonly known: KnownPosition;
      /** The move the game played that no game in the source had. */
      readonly nodeId: NodeId;
      readonly label: string;
      readonly san: string;
    }
  | { readonly kind: 'not-in-source' }
  | {
      readonly kind: 'past-depth';
      readonly nodeId: NodeId;
      readonly ply: number;
      /** True when the source states its depth and this ply is past it. */
      readonly stated: boolean;
    }
  | {
      readonly kind: 'uncertain';
      readonly known: KnownPosition;
      readonly nodeId: NodeId;
      readonly label: string;
    }
  | {
      readonly kind: 'followed';
      /** The last position read, and how many of the source's games reached it. */
      readonly nodeId: NodeId;
      readonly ply: number;
      readonly totalGames: number;
      /** True when the walk stopped at the ply limit rather than the game's end. */
      readonly capped: boolean;
    };

export interface DepartureInput {
  readonly tree: GameTree;
  readonly explore: (fen: Fen, signal?: AbortSignal) => Promise<ExplorerResult>;
  /** The deepest ply the source records, when it states one (a pack's build depth). */
  readonly depthLimit?: number | null;
  readonly maxPlies?: number;
  readonly signal?: AbortSignal;
  /** Called after each position is read, for a progress line. */
  readonly onProgress?: (read: number) => void;
}

/** `14...Rac8` — how a move is named in a sentence. */
export function moveLabelOf(node: MoveNode): string {
  return `${moveNumberOfPly(node.ply)}${node.ply % 2 === 1 ? '.' : '...'}${node.move?.san ?? ''}`;
}

export async function findDeparture(input: DepartureInput): Promise<Departure> {
  const { tree, explore, signal } = input;
  const path = mainlinePath(tree);
  const maxPlies = input.maxPlies ?? DEPARTURE_MAX_PLIES;
  const root = tree.nodes[tree.rootId];
  const startPly = root?.ply ?? 0;

  let last: { nodeId: NodeId; ply: number; totalGames: number } | null = null;

  for (let index = 0; index < path.length; index += 1) {
    if (signal?.aborted) throw new DOMException('Stopped.', 'AbortError');
    const node = tree.nodes[path[index]!];
    if (!node) break;
    const next = path[index + 1] ? tree.nodes[path[index + 1]!] : undefined;

    if (node.ply - startPly >= maxPlies) {
      return {
        kind: 'followed',
        nodeId: node.id,
        ply: node.ply,
        totalGames: last?.totalGames ?? 0,
        capped: true,
      };
    }

    const result = await explore(node.fen, signal);
    input.onProgress?.(index + 1);

    if (result.totalGames === 0) {
      if (index === 0) return { kind: 'not-in-source' };
      /*
        The previous move was in the source and this position is not: only a
        source that stops recording can say that, and past its depth the
        silence is about the build, not about the game.
      */
      return {
        kind: 'past-depth',
        nodeId: node.id,
        ply: node.ply,
        stated: input.depthLimit != null && node.ply > input.depthLimit,
      };
    }

    last = { nodeId: node.id, ply: node.ply, totalGames: result.totalGames };
    if (!next?.move) {
      return {
        kind: 'followed',
        nodeId: node.id,
        ply: node.ply,
        totalGames: result.totalGames,
        capped: false,
      };
    }

    const played = result.moves.find((move) => move.uci === next.move?.uci && move.games > 0);
    if (played) continue;

    const known: KnownPosition = {
      nodeId: node.id,
      ply: node.ply,
      totalGames: result.totalGames,
      moves: result.moves,
      games: result.topGames ?? [],
    };
    if (result.truncated || result.moves.length >= DEPARTURE_MOVE_LIMIT) {
      return { kind: 'uncertain', known, nodeId: next.id, label: moveLabelOf(next) };
    }
    return { kind: 'left', known, nodeId: next.id, label: moveLabelOf(next), san: next.move.san };
  }

  return {
    kind: 'followed',
    nodeId: last?.nodeId ?? tree.rootId,
    ply: last?.ply ?? startPly,
    totalGames: last?.totalGames ?? 0,
    capped: false,
  };
}

/** `Nb8 372, Bb7 318, Na5 164` — the source's answer, in a clause. */
export function describeMoves(moves: readonly DatabaseMove[], count = 3): string {
  return moves
    .filter((move) => move.games > 0)
    .slice(0, count)
    .map((move) => `${move.san} ${move.games.toLocaleString('en-US')}`)
    .join(', ');
}

/**
 * The comment written on the departing move: a fact a reader can check,
 * naming the source, the count and what was played instead.
 */
export function departureComment(
  departure: Extract<Departure, { kind: 'left' }>,
  source: string,
): string {
  const games = departure.known.totalGames;
  const instead = describeMoves(departure.known.moves);
  return `Not in ${source}: ${games.toLocaleString('en-US')} ${games === 1 ? 'game' : 'games'} reached the position before it${
    instead ? `, and played ${instead}` : ''
  }.`;
}

/**
 * Write the departure into the game, as ChessBase's novelty annotation does,
 * but as facts: the departing move gets a comment naming the source and what
 * its games played, and the source's most played move goes in as a variation
 * with its count. Nothing is called a novelty and no glyph is added.
 *
 * Existing comments are kept and the note appended, so running it twice
 * against two sources leaves both answers side by side. Returns the tree
 * unchanged if the note is already there.
 */
export function markDeparture(
  tree: GameTree,
  departure: Extract<Departure, { kind: 'left' }>,
  source: string,
): GameTree {
  const node = tree.nodes[departure.nodeId];
  if (!node) return tree;
  const note = departureComment(departure, source);
  if (node.comment?.includes(note)) return tree;
  let next = setComment(tree, node.id, [node.comment, note].filter(Boolean).join(' '));

  const top = departure.known.moves.find((move) => move.games > 0);
  if (top) {
    const inserted = insertLine(next, departure.known.nodeId, [top.uci], 'uci');
    if (inserted.ok) {
      next = inserted.value.tree;
      const head = next.nodes[inserted.value.nodeId];
      const total = departure.known.totalGames;
      const count = `Most played in ${source}: ${top.games.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} ${total === 1 ? 'game' : 'games'}.`;
      if (head && !head.comment?.includes(count)) {
        next = setComment(next, head.id, [head.comment, count].filter(Boolean).join(' '));
      }
    }
  }
  return next;
}
