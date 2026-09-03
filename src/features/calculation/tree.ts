/**
 * The tree a player builds while calculating, before any evidence is shown.
 *
 * Deliberately *not* the game tree. `GameTree` is the durable, revision-carrying
 * structure that analysis and studies are stored in, and calculation is neither
 * durable nor analysis: it is a scratch record of what someone looked at in the
 * eight minutes before they moved, most of which they will throw away. Putting
 * it in a game tree would mean an undo stack, a save path and a conflict story
 * for something whose whole value is that it is cheap and disposable until the
 * moment it is submitted.
 *
 * What it must preserve is *shape*. Flattening calculation into a list of lines
 * loses the thing a player most wants to see afterwards: where their analysis
 * actually forked, and which fork they never looked at. So a branch has
 * children, and the reveal comparison can point at the node where the engine
 * went somewhere the player did not.
 */

import type { San, Uci } from '@/chess/types';
import type { CalculationBranch, EvaluationEstimate } from '@/persistence/domain';

/** Where in the tree new moves are appended. Empty means the root. */
export type CalculationPath = readonly string[];

export interface CalculationTree {
  readonly branches: readonly CalculationBranch[];
  /** The path being extended, as branch ids from the root. */
  readonly path: CalculationPath;
}

export const EMPTY_TREE: CalculationTree = { branches: [], path: [] };

let sequence = 0;
/** Ids only need to be unique within one unsaved tree. */
const nextId = (): string => `c${(sequence += 1)}`;

/** Reset between tests, so ids are predictable when a test asserts on them. */
export function resetCalculationIds(): void {
  sequence = 0;
}

/**
 * Add a move at the current path, and descend into it.
 *
 * Playing a move that already exists at this point navigates to it rather than
 * duplicating it — a player replaying a line they already entered means "take
 * me back there", not "record it twice".
 */
export function addMove(
  tree: CalculationTree,
  move: { readonly uci: Uci; readonly san: San },
): CalculationTree {
  const siblings = childrenAt(tree.branches, tree.path);
  const existing = siblings.find((branch) => branch.uci === move.uci);
  if (existing) return { ...tree, path: [...tree.path, existing.id] };

  const created: CalculationBranch = {
    id: nextId(),
    uci: move.uci,
    san: move.san,
    children: [],
  };
  return {
    branches: insertAt(tree.branches, tree.path, created),
    path: [...tree.path, created.id],
  };
}

/** Remove a branch and everything below it. */
export function removeBranch(tree: CalculationTree, id: string): CalculationTree {
  const branches = pruneBranch(tree.branches, id);
  // A path through a removed branch has to stop somewhere valid.
  const cut = tree.path.indexOf(id);
  return { branches, path: cut < 0 ? tree.path : tree.path.slice(0, cut) };
}

export function annotate(
  tree: CalculationTree,
  id: string,
  change: { readonly note?: string; readonly estimate?: EvaluationEstimate },
): CalculationTree {
  return {
    ...tree,
    branches: mapBranches(tree.branches, id, (branch) => ({ ...branch, ...change })),
  };
}

/** Move the cursor without changing the tree. */
export const goTo = (tree: CalculationTree, path: CalculationPath): CalculationTree => ({
  ...tree,
  path: [...path],
});

/** Step back one move, or do nothing at the root. */
export const stepBack = (tree: CalculationTree): CalculationTree => ({
  ...tree,
  path: tree.path.slice(0, -1),
});

/** The branches at a path, i.e. the moves available to continue from there. */
export function childrenAt(
  branches: readonly CalculationBranch[],
  path: CalculationPath,
): readonly CalculationBranch[] {
  let level = branches;
  for (const id of path) {
    const found = level.find((branch) => branch.id === id);
    if (!found) return [];
    level = found.children;
  }
  return level;
}

/** The branch a path points at, or null at the root. */
export function branchAt(
  branches: readonly CalculationBranch[],
  path: CalculationPath,
): CalculationBranch | null {
  if (path.length === 0) return null;
  let found: CalculationBranch | null = null;
  let level = branches;
  for (const id of path) {
    const next = level.find((branch) => branch.id === id);
    if (!next) return null;
    found = next;
    level = next.children;
  }
  return found;
}

/** The moves along a path, for replaying it onto a board. */
export function movesAlong(
  branches: readonly CalculationBranch[],
  path: CalculationPath,
): readonly CalculationBranch[] {
  const moves: CalculationBranch[] = [];
  let level = branches;
  for (const id of path) {
    const found = level.find((branch) => branch.id === id);
    if (!found) break;
    moves.push(found);
    level = found.children;
  }
  return moves;
}

/**
 * Every root-to-leaf line, as a player would write them out.
 *
 * Used for the summary and the comparison. A branch with no children is a leaf
 * even if the player stopped there mid-thought, which is exactly the fact worth
 * recording: they stopped there.
 */
export interface CalculationLine {
  readonly branchId: string;
  readonly moves: readonly CalculationBranch[];
}

export function lines(branches: readonly CalculationBranch[]): readonly CalculationLine[] {
  const out: CalculationLine[] = [];
  const walk = (level: readonly CalculationBranch[], prefix: readonly CalculationBranch[]) => {
    for (const branch of level) {
      const moves = [...prefix, branch];
      if (branch.children.length === 0) out.push({ branchId: branch.id, moves });
      else walk(branch.children, moves);
    }
  };
  walk(branches, []);
  return out;
}

/** How many moves the player entered in total, across every branch. */
export function countMoves(branches: readonly CalculationBranch[]): number {
  return branches.reduce((total, branch) => total + 1 + countMoves(branch.children), 0);
}

/** The deepest line, in plies. The honest measure of "how far did I look". */
export function maxDepth(branches: readonly CalculationBranch[]): number {
  return branches.reduce((deepest, branch) => Math.max(deepest, 1 + maxDepth(branch.children)), 0);
}

/**
 * The candidate moves, i.e. the first move of each top-level branch.
 *
 * A calculation tree already contains the candidate list — the moves the player
 * considered at the position are exactly its roots — so it is derived rather
 * than maintained separately, and cannot fall out of step with the lines.
 */
export function candidatesOf(
  branches: readonly CalculationBranch[],
): readonly {
  readonly uci: Uci;
  readonly san: San;
  readonly note?: string;
  readonly line: readonly San[];
}[] {
  return branches.map((branch) => {
    // The principal line under a candidate: keep taking the first child, which
    // is the order the player entered them in.
    const line: San[] = [branch.san];
    let cursor = branch.children[0];
    while (cursor) {
      line.push(cursor.san);
      cursor = cursor.children[0];
    }
    return {
      uci: branch.uci,
      san: branch.san,
      ...(branch.note ? { note: branch.note } : {}),
      line,
    };
  });
}

// --- internals -------------------------------------------------------------

function insertAt(
  branches: readonly CalculationBranch[],
  path: CalculationPath,
  created: CalculationBranch,
): readonly CalculationBranch[] {
  if (path.length === 0) return [...branches, created];
  const [head, ...rest] = path;
  return branches.map((branch) =>
    branch.id === head ? { ...branch, children: insertAt(branch.children, rest, created) } : branch,
  );
}

function pruneBranch(
  branches: readonly CalculationBranch[],
  id: string,
): readonly CalculationBranch[] {
  return branches
    .filter((branch) => branch.id !== id)
    .map((branch) => ({ ...branch, children: pruneBranch(branch.children, id) }));
}

function mapBranches(
  branches: readonly CalculationBranch[],
  id: string,
  change: (branch: CalculationBranch) => CalculationBranch,
): readonly CalculationBranch[] {
  return branches.map((branch) =>
    branch.id === id
      ? change(branch)
      : { ...branch, children: mapBranches(branch.children, id, change) },
  );
}
