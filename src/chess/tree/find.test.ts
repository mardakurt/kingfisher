import { describe, expect, it } from 'vitest';

import { positionKey } from '../fen';
import { parsePgn } from '../pgn';
import { nodeAtPly, nodeAtPosition } from './find';

describe('finding where to open a game', () => {
  it('finds a main-line node by ply, and a transposed position by its key', () => {
    const tree = parsePgn('1. c4 e6 2. d4 Nf6 (2... d5) 3. Nc3 *').games[0]!.tree;
    const four = nodeAtPly(tree, 4)!;
    expect(tree.nodes[four]!.move?.san).toBe('Nf6');
    // Reached by 1.d4 Nf6 2.c4 e6 in another game: the same position.
    const nimzo = positionKey('rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 1 3');
    expect(nodeAtPosition(tree, nimzo)).toBe(four);
    expect(nodeAtPly(tree, 40)).toBeNull();
    expect(nodeAtPosition(tree, '8/8/8/8/8/8/8/K6k w - -')).toBeNull();
  });
});
