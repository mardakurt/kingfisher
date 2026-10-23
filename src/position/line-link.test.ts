import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { insertLine } from '@/chess/game';
import { expect as unwrap } from '@/chess/result';
import { createTree, mainlinePath } from '@/chess/tree/tree';

import { lineFromLink, lineLink } from './line-link';

const BASE = 'https://kingfisherchess.app/analysis';

describe('lineLink', () => {
  it('writes the moves to the current one, and no position for the standard start', () => {
    const start = createTree(START_FEN);
    const line = unwrap(insertLine(start, start.rootId, ['e4', 'c5', 'Nf3'], 'san'));
    const second = line.nodeIds[1]!;
    expect(lineLink(BASE, line.tree, second)).toBe(`${BASE}?moves=e2e4%2Cc7c5`);
    expect(lineLink(BASE, line.tree, line.tree.rootId)).toBe(BASE);
  });

  it('carries the starting position when it is not the standard one', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const tree = createTree(fen as never);
    const played = unwrap(insertLine(tree, tree.rootId, ['e4'], 'san'));
    const link = new URL(lineLink(BASE, played.tree, played.nodeId));
    expect(link.searchParams.get('fen')).toBe(fen);
    expect(link.searchParams.get('moves')).toBe('e2e4');
  });

  it('leaves out everything that is not chess', () => {
    const start = createTree(START_FEN, { White: 'Secret, Person', Event: 'Private' });
    const line = unwrap(insertLine(start, start.rootId, ['d4'], 'san'));
    expect(lineLink(BASE, line.tree, line.nodeId)).toBe(`${BASE}?moves=d2d4`);
  });
});

describe('lineFromLink', () => {
  it('replays the line and opens on its last move', () => {
    const line = lineFromLink(START_FEN, 'e2e4,c7c5,g1f3');
    expect(line.played).toBe(3);
    expect(mainlinePath(line.tree)).toHaveLength(4);
    expect(line.tree.nodes[line.currentId]?.move?.san).toBe('Nf3');
  });

  it('round-trips what lineLink writes', () => {
    const start = createTree(START_FEN);
    const made = unwrap(insertLine(start, start.rootId, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], 'san'));
    const link = new URL(lineLink(BASE, made.tree, made.nodeId));
    const read = lineFromLink(START_FEN, link.searchParams.get('moves')!);
    expect(read.tree.nodes[read.currentId]?.fen).toBe(made.tree.nodes[made.nodeId]?.fen);
  });

  it('stops at the first move that is not legal, and says how far it got', () => {
    const line = lineFromLink(START_FEN, 'e2e4 e7e5 e1e3 g8f6');
    expect(line).toMatchObject({ played: 2, requested: 4 });
    expect(line.tree.nodes[line.currentId]?.move?.san).toBe('e5');
  });
});
