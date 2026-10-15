import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { layoutOpeningMap } from '@/database/opening-map';
import { normalizeGame } from '@/persistence/import-game';

import { buildOpeningTree } from './index';
import { openingMapFromTree } from './opening-map';

const game = (white: string, black: string, result: string, moves: string) => {
  const parsed = parsePgn(
    `[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`,
  ).games[0];
  if (!parsed) throw new Error('fixture did not parse');
  return normalizeGame(parsed.tree);
};

// Target as White: 1.e4 three times (won two, lost one), 1.d4 once (drew).
const GAMES = [
  game('Target', 'A', '1-0', '1. e4 c5 2. Nf3 d6'),
  game('Target', 'B', '1-0', '1. e4 c5 2. Nc3 Nc6'),
  game('Target', 'C', '0-1', '1. e4 e5 2. Nf3 Nc6'),
  game('Target', 'D', '1/2-1/2', '1. d4 d5 2. c4 e6'),
];

describe('openingMapFromTree', () => {
  const tree = buildOpeningTree(GAMES, ['Target'], { playerColor: 'w' });

  it("draws the player's moves with their share and the player's own score", () => {
    const map = openingMapFromTree(tree, tree.rootKey, 'Target')!;
    expect(map.scoreFor).toBe('Target');
    expect(map.source.name).toBe('Target’s games');
    expect(map.totalGames).toBe(4);
    expect(map.queries).toBe(0);

    const [e4, d4] = map.children;
    expect(e4!.san).toBe('e4');
    expect(e4!.share).toBeCloseTo(3 / 4);
    expect(e4!.score).toBeCloseTo(2 / 3, 2);
    expect(d4!.san).toBe('d4');
    expect(d4!.score).toBeCloseTo(0.5);

    const c5 = e4!.children.find((node) => node.san === 'c5')!;
    expect(c5.share).toBeCloseTo(2 / 3);
    expect(c5.ofGames).toBe(3);
    // Both games after 1.e4 c5 were won.
    expect(c5.score).toBeCloseTo(1);
    expect(c5.sanLine).toEqual(['e4', 'c5']);
  });

  it('stops at the depth asked, and lays out inside its parents', () => {
    const map = openingMapFromTree(tree, tree.rootKey, 'Target', { depth: 2 })!;
    const blocks = layoutOpeningMap(map);
    expect(Math.max(...blocks.map((block) => block.row))).toBe(1);
    const e4 = blocks.find((block) => block.node.sanLine.join(' ') === 'e4')!;
    for (const block of blocks.filter((entry) => entry.node.sanLine[0] === 'e4')) {
      expect(block.x).toBeGreaterThanOrEqual(e4.x);
      expect(block.x + block.width).toBeLessThanOrEqual(e4.x + e4.width + 1e-9);
    }
  });

  it('is nothing for a position the games never reached', () => {
    expect(openingMapFromTree(tree, 'no such position', 'Target')).toBeNull();
  });
});
