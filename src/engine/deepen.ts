/**
 * Deepening a position into a tree: ChessBase's Deep Analysis, as evidence.
 *
 * Deep Analysis leaves an engine running on a position and grows a tree of
 * the lines worth playing, deeper each hour; a professional starts it at
 * night and reads the tree in the morning. The useful part is the tree and
 * the places the engine changed its mind on the way; the part a player
 * cannot check is a single number presented as the answer.
 *
 * So this grows the tree and reports only what the searches said:
 *
 * - **Breadth first, inside a margin.** Every position is searched with
 *   MultiPV; the moves kept are the best and any other within `marginCp` of
 *   it for the side to move (at most `breadth`). Each kept move is expanded
 *   in turn, one ply at a time, until `maxPlies` or the position `budget`.
 * - **Every evaluation belongs to a search of that position.** A node's
 *   `evaluation` is the result of searching it, with depth, nodes and time. A
 *   node never searched carries only the score its parent's search gave the
 *   move (`lineScore`), and says so.
 * - **Where the engine changed its mind.** The parent's line predicted a
 *   reply; the child's own search may prefer another. That is the most
 *   useful fact a deepening produces — the moment the shallow line was wrong
 *   — and it is reported with both moves and both depths.
 * - **The tree's own verdict, beside the first one.** The backed-up score
 *   (minimax over the tree, from each side's point of view) is printed next
 *   to the root's own search, never instead of it.
 *
 * Pure apart from the `evaluate` function it is handed, which is how the
 * rules are tested without an engine.
 */

import type { Score } from '@/chess/evaluation';
import { Position } from '@/chess/position';
import type { Fen, San, Uci } from '@/chess/types';

export interface DeepenSearchLine {
  readonly moves: readonly Uci[];
  /** From White's point of view. */
  readonly score: Score;
  readonly depth: number;
}

export interface DeepenSearch {
  readonly lines: readonly DeepenSearchLine[];
  readonly depth: number;
  readonly nodes: number;
  readonly timeMs: number;
}

export interface DeepenOptions {
  /** How many moves at most are kept at each position, 1–4. */
  readonly breadth: number;
  /** How far behind the best a kept move may be, for the side to move. */
  readonly marginCp: number;
  /** How many plies below the start the tree may grow. */
  readonly maxPlies: number;
  /** How many positions may be searched in all. */
  readonly budget: number;
}

export interface DeepNode {
  readonly fen: Fen;
  /** Plies below the start; the start is 0. */
  readonly depthFromRoot: number;
  readonly move?: { readonly uci: Uci; readonly san: San };
  /** The score the parent's search gave this move, when there was a parent. */
  readonly lineScore?: Score;
  /** The reply the parent's line expected after this move. */
  readonly predicted?: Uci;
  /**
   * Set once the position has been taken off the frontier — searched, or
   * passed over at the depth limit. What makes a saved tree resumable: the
   * positions still to search are exactly the unvisited ones, in the
   * breadth-first order the frontier would have held them.
   */
  visited?: true;
  /** Set once this position has been searched itself. */
  evaluation?: {
    readonly score: Score;
    readonly depth: number;
    readonly nodes: number;
    readonly timeMs: number;
    readonly bestMove: Uci;
  };
  readonly children: DeepNode[];
}

export interface ChangedMind {
  readonly node: DeepNode;
  /** The move leading here, and the reply the parent's line expected. */
  readonly expected: { readonly uci: Uci; readonly san?: San };
  readonly found: { readonly uci: Uci; readonly san?: San };
}

export interface DeepenResult {
  readonly root: DeepNode;
  readonly searched: number;
  /** True when it stopped because it was asked to, not because it finished. */
  readonly stopped: boolean;
}

const moverSign = (fen: Fen): 1 | -1 => (fen.split(' ')[1] === 'b' ? -1 : 1);

/** A score as a number to compare, from White's point of view; mates at the ends. */
export function scoreValue(score: Score): number {
  if (score.kind === 'cp') return score.cp;
  const base = 100_000 - Math.abs(score.moves);
  return score.moves >= 0 ? base : -base;
}

/** Where a stopped run left off: its tree and how many positions it searched. */
export interface DeepenCheckpoint {
  readonly root: DeepNode;
  readonly searched: number;
}

/** The positions still to search in a saved tree, in the order the run would have reached them. */
export function pendingFrontier(root: DeepNode): DeepNode[] {
  const pending: DeepNode[] = [];
  const level: DeepNode[] = [root];
  while (level.length > 0) {
    const node = level.shift()!;
    if (!node.visited) pending.push(node);
    level.push(...node.children);
  }
  return pending;
}

export async function deepen(
  start: Fen,
  options: DeepenOptions,
  evaluate: (fen: Fen, signal?: AbortSignal) => Promise<DeepenSearch>,
  signal?: AbortSignal,
  onProgress?: (searched: number, path: readonly DeepNode[]) => void,
  /**
   * Resume a run from its checkpoint instead of starting fresh; called back
   * after every position, so a reload, a sleep or a quit costs at most the
   * search in flight.
   */
  resume?: DeepenCheckpoint,
  onCheckpoint?: (checkpoint: DeepenCheckpoint) => void,
): Promise<DeepenResult> {
  if (resume && resume.root.fen !== start) {
    throw new Error('The saved deep analysis started from another position.');
  }
  const root: DeepNode = resume?.root ?? { fen: start, depthFromRoot: 0, children: [] };
  const frontier: DeepNode[] = resume ? pendingFrontier(root) : [root];
  // For the progress line: the moves from the start to the node searched.
  const parents = new Map<DeepNode, DeepNode>();
  const link = (node: DeepNode) => {
    for (const child of node.children) {
      parents.set(child, node);
      link(child);
    }
  };
  link(root);
  const pathOf = (node: DeepNode): DeepNode[] => {
    const out: DeepNode[] = [];
    for (let at: DeepNode | undefined = node; at && at !== root; at = parents.get(at)) {
      out.unshift(at);
    }
    return out;
  };
  let searched = resume?.searched ?? 0;

  while (frontier.length > 0 && searched < options.budget) {
    if (signal?.aborted) return { root, searched, stopped: true };
    const node = frontier[0]!;
    if (node.depthFromRoot >= options.maxPlies) {
      frontier.shift();
      node.visited = true;
      continue;
    }

    let search: DeepenSearch;
    try {
      search = await evaluate(node.fen, signal);
    } catch (error) {
      // The node stays on the frontier, unvisited: a resumed run searches it again.
      if (signal?.aborted) return { root, searched, stopped: true };
      throw error;
    }
    frontier.shift();
    node.visited = true;
    searched += 1;
    const lines = search.lines.filter((line) => line.moves.length > 0);
    const top = lines[0];
    if (!top) {
      onCheckpoint?.({ root, searched });
      continue;
    }
    node.evaluation = {
      score: top.score,
      depth: top.depth || search.depth,
      nodes: search.nodes,
      timeMs: search.timeMs,
      bestMove: top.moves[0]!,
    };
    onProgress?.(searched, pathOf(node));

    const sign = moverSign(node.fen);
    const best = sign * scoreValue(top.score);
    const position = Position.fromTrustedFen(node.fen);
    const kept = lines
      .filter((line) => best - sign * scoreValue(line.score) <= options.marginCp)
      .slice(0, Math.max(1, Math.min(4, options.breadth)));
    for (const line of kept) {
      const played = position.playUci(line.moves[0]!);
      if (!played.ok) continue;
      const child: DeepNode = {
        fen: played.value.after,
        depthFromRoot: node.depthFromRoot + 1,
        move: { uci: played.value.uci, san: played.value.san },
        lineScore: line.score,
        ...(line.moves[1] ? { predicted: line.moves[1] } : {}),
        children: [],
      };
      node.children.push(child);
      parents.set(child, node);
      frontier.push(child);
    }
    onCheckpoint?.({ root, searched });
  }
  return { root, searched, stopped: false };
}

/**
 * The tree's backed-up score at a node: its own search at a leaf, the parent's
 * score for the move where it was never searched, and otherwise the best
 * child for the side to move.
 */
export function backedUp(node: DeepNode): Score | undefined {
  if (node.children.length === 0) return node.evaluation?.score ?? node.lineScore;
  const sign = moverSign(node.fen);
  let bestScore: Score | undefined;
  for (const child of node.children) {
    const score = backedUp(child);
    if (!score) continue;
    if (!bestScore || sign * scoreValue(score) > sign * scoreValue(bestScore)) bestScore = score;
  }
  return bestScore ?? node.evaluation?.score;
}

/** The line the tree prefers: at each node, the child with the best backed-up score. */
export function principalLine(root: DeepNode): DeepNode[] {
  const line: DeepNode[] = [];
  let node = root;
  while (node.children.length > 0) {
    const sign = moverSign(node.fen);
    let next: DeepNode | undefined;
    let value = -Infinity;
    for (const child of node.children) {
      const score = backedUp(child);
      if (!score) continue;
      const v = sign * scoreValue(score);
      if (v > value) {
        value = v;
        next = child;
      }
    }
    if (!next) break;
    line.push(next);
    node = next;
  }
  return line;
}

/** Every searched position whose own best move was not the reply its parent's line expected. */
export function changedMinds(root: DeepNode): ChangedMind[] {
  const out: ChangedMind[] = [];
  const walk = (node: DeepNode) => {
    for (const child of node.children) {
      if (child.predicted && child.evaluation && child.evaluation.bestMove !== child.predicted) {
        const position = Position.fromTrustedFen(child.fen);
        const expected = position.playUci(child.predicted);
        const found = position.playUci(child.evaluation.bestMove);
        out.push({
          node: child,
          expected: {
            uci: child.predicted,
            ...(expected.ok ? { san: expected.value.san } : {}),
          },
          found: {
            uci: child.evaluation.bestMove,
            ...(found.ok ? { san: found.value.san } : {}),
          },
        });
      }
      walk(child);
    }
  };
  walk(root);
  return out;
}

export const countMoves = (node: DeepNode): number =>
  node.children.reduce((sum, child) => sum + 1 + countMoves(child), 0);

/** The positions a budget buys at a breadth and depth, for the form's estimate. */
export function positionsFor(breadth: number, maxPlies: number): number {
  let total = 0;
  let level = 1;
  for (let ply = 0; ply < maxPlies; ply += 1) {
    total += level;
    level *= breadth;
  }
  return total;
}
