/**
 * Merging games into one tree.
 *
 * How a preparation file is built: the games that reached a line, laid over
 * each other so the moves they share are played once and every departure is a
 * variation. ChessBase does it by selecting games and pressing Enter; the
 * first game becomes the main line and the others hang off it where they
 * leave it. This is that operation, and it is pure: it reads the source trees
 * and returns a new one.
 *
 * What it keeps, and why:
 *
 * - Every move of every source tree, variations included. A game's own
 *   annotation is work somebody did.
 * - The annotations of a move the first time it is seen. When a later game
 *   plays a move already in the tree, the move is not added again; its
 *   comment is kept only if the move had none, its NAGs are joined, and its
 *   stored evaluation is kept only if the move had none. Nothing is averaged
 *   and nothing is overwritten.
 * - Which game each branch came from: the last move of every merged game's
 *   main line carries the game's label as a comment, so a branch in the
 *   merged tree can always be traced to the game that played it.
 *
 * What it does not do is join transpositions. A tree is a set of move orders,
 * and two move orders reaching one position are two paths in it. The result
 * counts the positions reached by more than one path (by `positionKey`, the
 * project's position identity), so the caller can say so; the position page
 * and the explorer are where transpositions are joined.
 *
 * The tree starts from the position most of the games start from; a game
 * that starts elsewhere cannot share it and is returned as skipped, with the
 * reason.
 */

import { START_FEN, positionKey } from '../fen';
import type { Evaluation } from '../evaluation';
import { addMove, createTree, mainlinePath, mustGetNode } from './tree';
import type { GameTree, MoveNode, NodeId } from './types';

export interface MergeSource {
  readonly tree: GameTree;
  /** How the merged tree names this game, e.g. `Carlsen – Caruana, Wijk 2024 · 1-0`. */
  readonly label: string;
}

export interface MergeResult {
  readonly tree: GameTree;
  /** The games laid into the tree, in order. */
  readonly merged: readonly string[];
  /** Games whose whole main line was already in the tree when their turn came. */
  readonly contained: readonly string[];
  readonly skipped: readonly { readonly label: string; readonly reason: string }[];
  /** Positions the tree reaches by more than one move order. */
  readonly transpositions: number;
}

export interface MergeOptions {
  /** Headers of the merged tree; `Event` defaults to "N games merged". */
  readonly headers?: Readonly<Record<string, string>>;
  /** Label each merged game's last main-line move (default true). */
  readonly labelGames?: boolean;
}

const joinNags = (a: readonly number[], b: readonly number[]): number[] => [
  ...a,
  ...b.filter((nag) => !a.includes(nag)),
];

const appendComment = (existing: string | undefined, text: string): string =>
  existing && existing.trim() ? `${existing.trim()} ${text}` : text;

export function mergeGames(
  sources: readonly MergeSource[],
  options: MergeOptions = {},
): MergeResult {
  const skipped: { label: string; reason: string }[] = [];
  const merged: string[] = [];
  const contained: string[] = [];
  if (sources.length === 0) {
    return {
      tree: createTree(START_FEN),
      merged,
      contained,
      skipped,
      transpositions: 0,
    };
  }

  /*
    The tree starts where most of the games start. Taking the first game's
    start instead let one endgame at the top of a list — the Library shows the
    newest first — decide that three opening games "started elsewhere".
    A tie goes to the earliest game.
  */
  const starts = new Map<string, { count: number; fen: GameTree['startFen'] }>();
  for (const source of sources) {
    const key = positionKey(source.tree.startFen);
    const entry = starts.get(key);
    starts.set(key, { count: (entry?.count ?? 0) + 1, fen: entry?.fen ?? source.tree.startFen });
  }
  const [startKey, start] = [...starts].reduce((best, candidate) =>
    candidate[1].count > best[1].count ? candidate : best,
  );
  let tree = createTree(start.fen);
  const labelGames = options.labelGames ?? true;

  for (const source of sources) {
    if (positionKey(source.tree.startFen) !== startKey) {
      skipped.push({
        label: source.label,
        reason: 'It starts from a different position, so it cannot share this tree.',
      });
      continue;
    }

    let added = 0;
    /** Where each of the source's nodes landed in the merged tree. */
    const landed = new Map<NodeId, NodeId>([[source.tree.rootId, tree.rootId]]);
    // Depth first, children in order: a source's main line is laid before its
    // variations, so the first game's main line is the merged main line.
    const stack: NodeId[] = [source.tree.rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      const node = mustGetNode(source.tree, id);
      const parentTarget = landed.get(id)!;
      for (const childId of node.children) {
        const child = mustGetNode(source.tree, childId);
        if (!child.move) continue;
        const result = addMove(tree, parentTarget, child.move, {
          nags: child.nags,
          shapes: child.shapes,
          meta: child.meta,
          ...(child.comment !== undefined ? { comment: child.comment } : {}),
          ...(child.preComment !== undefined ? { preComment: child.preComment } : {}),
          ...(child.evaluation !== undefined ? { evaluation: child.evaluation } : {}),
        });
        tree = result.existed ? keepFirst(result.tree, result.nodeId, child) : result.tree;
        if (!result.existed) added += 1;
        landed.set(childId, result.nodeId);
      }
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index]!);
      }
    }

    if (added === 0 && merged.length > 0) contained.push(source.label);
    merged.push(source.label);

    if (labelGames) {
      const line = mainlinePath(source.tree);
      const last = landed.get(line[line.length - 1]!);
      if (last && last !== tree.rootId) {
        const target = mustGetNode(tree, last);
        // Plain text: the serialiser writes the braces, and a brace inside a
        // PGN comment would end it early.
        const label = source.label.replace(/[{}]/g, '');
        if (!target.comment?.includes(label)) {
          tree = replace(tree, { ...target, comment: appendComment(target.comment, label) });
        }
      }
    }
  }

  const count = merged.length;
  tree = {
    ...tree,
    headers: {
      Event: `${count} ${count === 1 ? 'game' : 'games'} merged`,
      Site: '?',
      Date: '????.??.??',
      Round: '-',
      White: '?',
      Black: '?',
      Result: '*',
      ...(options.headers ?? {}),
    },
  };

  return { tree, merged, contained, skipped, transpositions: countTranspositions(tree) };
}

/** A move already in the tree keeps its annotations; the newcomer fills gaps. */
function keepFirst(tree: GameTree, id: NodeId, incoming: MoveNode): GameTree {
  const existing = mustGetNode(tree, id);
  const nags = joinNags(existing.nags, incoming.nags);
  const comment = existing.comment?.trim() ? existing.comment : incoming.comment;
  const evaluation: Evaluation | undefined = existing.evaluation ?? incoming.evaluation;
  const unchanged =
    nags.length === existing.nags.length &&
    comment === existing.comment &&
    evaluation === existing.evaluation;
  if (unchanged) return tree;
  return replace(tree, {
    ...existing,
    nags,
    ...(comment !== undefined ? { comment } : {}),
    ...(evaluation !== undefined ? { evaluation } : {}),
  });
}

function replace(tree: GameTree, node: MoveNode): GameTree {
  return { ...tree, nodes: { ...tree.nodes, [node.id]: node } };
}

/** How many positions the tree reaches by two or more different paths. */
export function countTranspositions(tree: GameTree): number {
  const seen = new Map<string, number>();
  for (const node of Object.values(tree.nodes)) {
    const key = positionKey(node.fen);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  let count = 0;
  for (const paths of seen.values()) if (paths > 1) count += 1;
  return count;
}
