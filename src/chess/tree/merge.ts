/**
 * Merging games into one tree.
 *
 * A preparation file is built by merging the games that reached a line:
 * ChessBase selects them in a list and folds them into one notation, the
 * first game as the main line and every other one as a variation where it
 * leaves what is already there. A HIARCS user asked for the same thing in the
 * same words — "merge selected games into a single move tree" — because it is
 * how a player turns forty games of an opponent's Najdorf into something that
 * can be read in one sitting.
 *
 * Three things here go further than a plain merge, and each follows from a
 * rule of this codebase rather than from a wish list:
 *
 * - **Every game says where it left the tree.** The move at which a game
 *   first adds something new carries the game's name as a pre-comment, so a
 *   branch in the merged file is never anonymous: it is "Carlsen – Caruana,
 *   2024, ½–½", and a reader can tell a top game's idea from a blitz game's.
 * - **Transpositions are named, not duplicated silently.** Two move orders
 *   reaching one position are the same position (`positionKey`). When a
 *   game's new branch arrives at a position the tree already holds on a
 *   different path, the branch is kept — it is the game — and its first such
 *   move says which line it transposes to.
 * - **Nothing is dropped without a reason.** A game that starts from another
 *   position cannot share a root and is refused, by name. A game already
 *   entirely contained in the tree is reported as such rather than counted
 *   as "merged".
 *
 * Annotations: a node that exists in the tree keeps its own comment, glyphs
 * and arrows; a node a game adds brings that game's. So the first game's
 * notes win where games overlap, which is ChessBase's rule and the only one
 * that never rewrites a comment someone else wrote.
 *
 * The merge builds its node map in place and freezes it at the end. Going
 * through `addMove` once per move copies the whole map every time, which is
 * quadratic, and a merge of a few hundred games is exactly what this is for.
 */

import { positionKey } from '../fen';
import type { GameTree, MoveNode, NodeId } from './types';
import { moveNumberOfPly } from './types';

export interface MergeSource {
  readonly tree: GameTree;
  /** How the game is named in the merged tree, e.g. "Anand – Carlsen, Chennai 2013". */
  readonly label: string;
}

export type MergeOutcome =
  /** The game added at least one move. */
  | { readonly kind: 'branched'; readonly nodeId: NodeId; readonly move: string }
  /** Every move of the game was already in the tree. */
  | { readonly kind: 'contained' }
  /** It could not share a root with the first game. */
  | { readonly kind: 'refused'; readonly reason: string };

export interface MergedGame {
  readonly label: string;
  readonly outcome: MergeOutcome;
  /** Set when the game's new branch reached a position the tree already held. */
  readonly transposesTo?: string;
}

export interface MergeReport {
  readonly games: readonly MergedGame[];
  /** Moves added to the first game's tree by the others. */
  readonly addedMoves: number;
}

export interface MergeResult {
  readonly tree: GameTree;
  readonly report: MergeReport;
}

/** `9.h3` or `9...Na5` — how a move is referred to in prose. */
export function moveLabel(node: MoveNode): string {
  const san = node.move?.san ?? '';
  return `${moveNumberOfPly(node.ply)}${node.ply % 2 === 1 ? '.' : '...'}${san}`;
}

/**
 * Fold `sources` into one tree.
 *
 * The first source is the base: its moves are the main line and its start
 * position is the tree's. Headers name the merge, not any one game. Throws
 * only for an empty list; everything else is reported per game.
 */
export function mergeGames(sources: readonly MergeSource[]): MergeResult {
  const base = sources[0];
  if (!base) throw new Error('Nothing to merge.');

  const nodes: Record<NodeId, MoveNode> = { ...base.tree.nodes };
  let nextId = base.tree.nextId;
  const rootKey = positionKey(base.tree.nodes[base.tree.rootId]?.fen ?? base.tree.startFen);

  /*
    Where each position first appears, for naming transpositions. Built from
    the base and extended as games add nodes, so a later game can transpose
    into an earlier game's branch as well as into the main line.
  */
  const firstAt = new Map<string, NodeId>();
  const index = (id: NodeId) => {
    const node = nodes[id];
    if (!node) return;
    const key = positionKey(node.fen);
    if (!firstAt.has(key)) firstAt.set(key, id);
  };
  for (const id of Object.keys(nodes)) index(id);

  const report: MergedGame[] = [{ label: base.label, outcome: baseOutcome(base.tree) }];
  let addedMoves = 0;

  for (const source of sources.slice(1)) {
    const tree = source.tree;
    const root = tree.nodes[tree.rootId];
    if (!root || positionKey(root.fen) !== rootKey) {
      report.push({
        label: source.label,
        outcome: {
          kind: 'refused',
          reason: 'It starts from a different position, so it cannot share this tree’s root.',
        },
      });
      continue;
    }

    let branch: { nodeId: NodeId; move: string } | null = null;
    let transposesTo: string | undefined;
    const mainline = new Set(lineIds(tree));

    /*
      Depth-first over the game's own tree, so its variations come along too.
      `into` is the node in the merged tree that corresponds to `from`.
    */
    const stack: { from: NodeId; into: NodeId }[] = [{ from: tree.rootId, into: base.tree.rootId }];
    while (stack.length > 0) {
      const { from, into } = stack.pop()!;
      const current = tree.nodes[from];
      if (!current) continue;
      /*
        Children are attached in their own order — a game's main move before
        its alternatives — and only the descent is reversed onto the stack.
      */
      const descend: { from: NodeId; into: NodeId }[] = [];
      for (const childId of current.children) {
        const child = tree.nodes[childId];
        const parent = nodes[into];
        if (!child?.move || !parent) continue;
        const existing = parent.children.find((id) => nodes[id]?.move?.uci === child.move?.uci);
        if (existing) {
          descend.push({ from: childId, into: existing });
          continue;
        }

        const id = `n${nextId}`;
        nextId += 1;
        addedMoves += 1;
        const onGameMainline = mainline.has(childId);
        const opensBranch = onGameMainline && branch === null;

        const key = positionKey(child.fen);
        const earlier = firstAt.get(key);
        /*
          A position met again on the same path is a repetition, not a
          transposition, and naming it would send the reader backwards.
        */
        const transposition =
          onGameMainline &&
          transposesTo === undefined &&
          earlier &&
          nodes[earlier] &&
          !isAncestor(nodes, earlier, into)
            ? moveLabel(nodes[earlier]!)
            : undefined;
        if (transposition) transposesTo = transposition;

        const notes = [child.comment, transposition ? `Transposes to ${transposition}.` : undefined]
          .filter((part): part is string => Boolean(part && part.trim()))
          .join(' ');
        const preNotes = [opensBranch ? source.label : undefined, child.preComment]
          .filter((part): part is string => Boolean(part && part.trim()))
          .join(' — ');

        const node: MoveNode = {
          id,
          parentId: into,
          children: [],
          move: child.move,
          fen: child.fen,
          ply: parent.ply + 1,
          nags: [...child.nags],
          shapes: [...child.shapes],
          meta: child.meta,
          ...(notes ? { comment: notes } : {}),
          ...(preNotes ? { preComment: preNotes } : {}),
          ...(child.evaluation ? { evaluation: child.evaluation } : {}),
        };
        nodes[id] = node;
        nodes[into] = { ...parent, children: [...parent.children, id] };
        index(id);
        if (opensBranch) branch = { nodeId: id, move: moveLabel(node) };
        descend.push({ from: childId, into: id });
      }
      stack.push(...descend.reverse());
    }

    report.push({
      label: source.label,
      outcome: branch ? { kind: 'branched', ...branch } : { kind: 'contained' },
      ...(transposesTo ? { transposesTo } : {}),
    });
  }

  const merged = report.filter((entry) => entry.outcome.kind !== 'refused').length;
  const headers: Record<string, string> = {
    Event: `Merged: ${merged} ${merged === 1 ? 'game' : 'games'}`,
    Result: '*',
  };
  for (const key of ['FEN', 'SetUp'] as const) {
    const value = base.tree.headers[key];
    if (value) headers[key] = value;
  }

  /*
    The file's table of contents, as the comment before the first move: which
    games are in it and where each one starts. ChessBase's merge leaves the
    reader to find the branches; this says where they are, and it travels
    with the file through PGN.
  */
  const root = nodes[base.tree.rootId];
  if (root) {
    const contents = contentsOf({ games: report, addedMoves });
    nodes[base.tree.rootId] = {
      ...root,
      comment: [root.comment, contents].filter(Boolean).join(' '),
    };
  }

  return {
    tree: {
      rootId: base.tree.rootId,
      nodes: Object.freeze(nodes),
      startFen: base.tree.startFen,
      headers,
      nextId,
    },
    report: { games: report, addedMoves },
  };
}

function isAncestor(
  nodes: Readonly<Record<NodeId, MoveNode>>,
  candidate: NodeId,
  from: NodeId,
): boolean {
  let id: NodeId | null = from;
  while (id) {
    if (id === candidate) return true;
    id = nodes[id]?.parentId ?? null;
  }
  return false;
}

function lineIds(tree: GameTree): NodeId[] {
  const out: NodeId[] = [];
  let id: NodeId | undefined = tree.nodes[tree.rootId]?.children[0];
  while (id) {
    out.push(id);
    id = tree.nodes[id]?.children[0];
  }
  return out;
}

function baseOutcome(tree: GameTree): MergeOutcome {
  const first = tree.nodes[tree.rootId]?.children[0];
  const node = first ? tree.nodes[first] : undefined;
  return node
    ? { kind: 'branched', nodeId: node.id, move: moveLabel(node) }
    : { kind: 'contained' };
}

/**
 * `Merged from 3 games: A – B (main line); C – D from 2...Nc6; E – F: already
 * contained.` Refused games are named too, so the file says what it is not.
 */
export function contentsOf(report: MergeReport): string {
  const entries = report.games.map((entry, index) => {
    if (entry.outcome.kind === 'refused')
      return `${entry.label}: not merged, another starting position`;
    if (entry.outcome.kind === 'contained') return `${entry.label}: already contained`;
    const where = index === 0 ? 'main line' : `from ${entry.outcome.move}`;
    const transposes = entry.transposesTo ? `, transposing to ${entry.transposesTo}` : '';
    return `${entry.label} (${where}${transposes})`;
  });
  const merged = report.games.filter((entry) => entry.outcome.kind !== 'refused').length;
  return `Merged from ${merged} ${merged === 1 ? 'game' : 'games'}: ${entries.join('; ')}.`;
}

/** One sentence for a notification: what the merge did, with its refusals. */
export function describeMerge(report: MergeReport): string {
  const merged = report.games.filter((entry) => entry.outcome.kind !== 'refused').length;
  const contained = report.games.filter((entry) => entry.outcome.kind === 'contained').length;
  const refused = report.games.filter((entry) => entry.outcome.kind === 'refused').length;
  const parts = [
    `${merged} ${merged === 1 ? 'game' : 'games'} in one tree`,
    `${report.addedMoves} ${report.addedMoves === 1 ? 'move' : 'moves'} added to the first game`,
  ];
  if (contained > 0) parts.push(`${contained} already contained`);
  if (refused > 0) parts.push(`${refused} refused: a different starting position`);
  return `${parts.join('; ')}.`;
}
