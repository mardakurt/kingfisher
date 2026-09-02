import { describe, expect, it } from 'vitest';

import { positionKey, START_FEN } from '@/chess/fen';
import { playSanAt } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree, mustGetNode } from '@/chess/tree/tree';
import type { GameTree, NodeId } from '@/chess/tree/types';
import type { San } from '@/chess/types';

import { formatRoute, mergeRoutes, routesFromTree } from './transpositions';
import type { TranspositionRouteView } from './transpositions';

/** Plays a line, returning the tree and the id of its final node. */
function play(moves: readonly string[], from?: { tree: GameTree; at: NodeId }) {
  let tree = from?.tree ?? createTree(START_FEN);
  let cursor = from?.at ?? tree.rootId;
  for (const san of moves) {
    const played = unwrap(playSanAt(tree, cursor, san));
    tree = played.tree;
    cursor = played.nodeId;
  }
  return { tree, at: cursor };
}

const keyAt = (tree: GameTree, id: NodeId) => positionKey(mustGetNode(tree, id).fen);

const route = (moves: string[], overrides: Partial<TranspositionRouteView> = {}) =>
  ({
    moves: moves as San[],
    count: 1,
    source: 'local-games',
    ...overrides,
  }) as TranspositionRouteView;

describe('finding move orders inside a stored tree', () => {
  it('reports the order that reached a position', () => {
    const queensGambit = play(['d4', 'Nf6', 'c4', 'e6']);
    const key = keyAt(queensGambit.tree, queensGambit.at);

    const found = routesFromTree(queensGambit.tree, key, { label: 'QGD', chapterId: 'c1' });
    expect(found).toHaveLength(1);
    expect(found[0]!.moves).toEqual(['d4', 'Nf6', 'c4', 'e6']);
    expect(found[0]!.source).toBe('study');
    expect(found[0]!.chapterId).toBe('c1');
  });

  it('finds a second order in a variation of the same chapter', () => {
    /*
      A genuine transposition: 1.d4 Nf6 2.c4 e6 and 1.c4 Nf6 2.d4 e6 reach the
      identical position. 1.Nf3 orders do *not* — they leave a knight on f3 —
      which is exactly the distinction the canonical position key draws and the
      reason routes are read off stored games rather than guessed.
    */
    const main = play(['d4', 'Nf6', 'c4', 'e6']);
    const key = keyAt(main.tree, main.at);
    const withVariation = play(['c4', 'Nf6', 'd4', 'e6'], {
      tree: main.tree,
      at: main.tree.rootId,
    });

    const found = routesFromTree(withVariation.tree, key, { label: 'QGD', chapterId: 'c1' });
    const signatures = found.map((entry) => entry.moves.join(' '));
    expect(signatures).toContain('d4 Nf6 c4 e6');
    expect(signatures).toContain('c4 Nf6 d4 e6');
  });

  it('does not treat a different position as a transposition', () => {
    // 1.Nf3 Nf6 2.d4 e6 3.c4 has a knight on f3, so it is not the same position.
    const main = play(['d4', 'Nf6', 'c4', 'e6']);
    const key = keyAt(main.tree, main.at);
    const other = play(['Nf3', 'Nf6', 'd4', 'e6', 'c4'], {
      tree: main.tree,
      at: main.tree.rootId,
    });

    const signatures = routesFromTree(other.tree, key, { label: 'QGD', chapterId: 'c1' }).map(
      (entry) => entry.moves.join(' '),
    );
    expect(signatures).not.toContain('Nf3 Nf6 d4 e6 c4');
  });

  it('ignores the root, which has no move order to report', () => {
    const tree = createTree(START_FEN);
    expect(routesFromTree(tree, positionKey(START_FEN), { label: 'S', chapterId: 'c' })).toEqual(
      [],
    );
  });

  it('reports nothing for a position the tree never reaches', () => {
    const { tree } = play(['e4', 'e5']);
    const elsewhere = play(['d4', 'd5']);
    expect(
      routesFromTree(tree, keyAt(elsewhere.tree, elsewhere.at), { label: 'S', chapterId: 'c' }),
    ).toEqual([]);
  });
});

describe('merging routes from several sources', () => {
  it('sums identical orders and keeps every source that produced them', () => {
    const merged = mergeRoutes([
      route(['d4', 'Nf6'], { source: 'local-games', count: 11 }),
      route(['d4', 'Nf6'], { source: 'study', count: 1, chapterId: 'c1', nodeId: 'n1' }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.total).toBe(12);
    expect(merged[0]!.bySource).toEqual([
      { source: 'local-games', count: 11 },
      { source: 'study', count: 1 },
    ]);
  });

  it('keeps different orders apart', () => {
    const merged = mergeRoutes([route(['d4', 'Nf6']), route(['Nf3', 'Nf6'])]);
    expect(merged).toHaveLength(2);
  });

  it('orders by how often each was actually played', () => {
    const merged = mergeRoutes([
      route(['Nf3', 'd5', 'd4'], { count: 2 }),
      route(['d4', 'd5', 'Nf3'], { count: 30 }),
    ]);
    expect(merged[0]!.moves).toEqual(['d4', 'd5', 'Nf3']);
  });

  it('prefers the shorter order when two are equally attested', () => {
    const merged = mergeRoutes([
      route(['Nf3', 'Nf6', 'd4', 'e6', 'c4'], { count: 5 }),
      route(['d4', 'Nf6', 'c4', 'e6'], { count: 5 }),
    ]);
    expect(merged[0]!.moves).toHaveLength(4);
  });

  it('excludes the order the user is already on', () => {
    const merged = mergeRoutes(
      [route(['d4', 'Nf6', 'c4', 'e6'], { count: 9 }), route(['Nf3', 'd5'], { count: 3 })],
      ['d4', 'Nf6', 'c4', 'e6'] as San[],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.moves).toEqual(['Nf3', 'd5']);
  });

  it('makes a study route openable and leaves a game route alone', () => {
    const merged = mergeRoutes([
      route(['d4'], { source: 'study', chapterId: 'c1', nodeId: 'n7', label: 'Chapter 2' }),
      route(['e4'], { source: 'local-games' }),
    ]);
    const byMove = new Map(merged.map((entry) => [entry.signature, entry]));
    expect(byMove.get('d4')!.openable).toEqual({
      chapterId: 'c1',
      nodeId: 'n7',
      label: 'Chapter 2',
    });
    expect(byMove.get('e4')!.openable).toBeUndefined();
  });

  it('keeps the first study occurrence when the same order appears twice', () => {
    const merged = mergeRoutes([
      route(['d4'], { source: 'study', chapterId: 'first', nodeId: 'n1', label: 'One' }),
      route(['d4'], { source: 'study', chapterId: 'second', nodeId: 'n2', label: 'Two' }),
    ]);
    expect(merged[0]!.openable?.chapterId).toBe('first');
    expect(merged[0]!.total).toBe(2);
  });

  it('returns nothing when there is nothing stored', () => {
    expect(mergeRoutes([])).toEqual([]);
  });
});

describe('rendering a move order', () => {
  it('numbers moves the way a player writes them', () => {
    expect(formatRoute(['d4', 'Nf6', 'c4', 'e6'] as San[])).toBe('1.d4 Nf6 2.c4 e6');
  });

  it('handles an odd number of moves', () => {
    expect(formatRoute(['e4', 'c5', 'Nf3'] as San[])).toBe('1.e4 c5 2.Nf3');
  });

  it('marks a line that starts on Black’s move', () => {
    expect(formatRoute(['c5', 'Nf3'] as San[], 1)).toBe('1...c5 2.Nf3');
  });

  it('renders an empty order as nothing rather than as a stray number', () => {
    expect(formatRoute([])).toBe('');
  });
});
