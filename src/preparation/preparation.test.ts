import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { normalizeGame } from '@/persistence/import-game';
import { buildOpeningTree, buildPlayerProfile, compareWithRepertoire } from './index';

const game = (pgn: string) => {
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) throw new Error('fixture did not parse');
  return normalizeGame(parsed.tree);
};

describe('opponent preparation', () => {
  const games = [
    game(
      '[White "Target"]\n[Black "A"]\n[Result "1-0"]\n[Date "2024.01.01"]\n[WhiteElo "2400"]\n[Opening "Reti"]\n\n1. Nf3 d5 2. d4 *',
    ),
    game(
      '[White "Target"]\n[Black "B"]\n[Result "1/2-1/2"]\n[Date "2026.01.01"]\n[WhiteElo "2420"]\n[Opening "Queens Pawn"]\n\n1. d4 d5 2. Nf3 *',
    ),
    game('[White "Other"]\n[Black "C"]\n\n1. e4 *'),
  ];

  it('matches identity cautiously and reports factual profile totals', () => {
    const profile = buildPlayerProfile(games, [' target '], 2025);
    expect(profile.games).toBe(2);
    expect(profile.averageRating).toBe(2410);
    expect(profile.asWhite).toBe(2);
    expect(profile.asBlack).toBe(0);
    expect(profile.score).toBe(75);
    expect(profile.openings.find((opening) => opening.name === 'Queens Pawn')?.recentGames).toBe(1);
  });

  it('converges two move orders on the same canonical node', () => {
    const tree = buildOpeningTree(games, ['Target'], { playerColor: 'w' });
    const reached = [...tree.nodes.values()].filter((node) =>
      node.edges.some((edge) => edge.san === 'Nf3' || edge.san === 'd4'),
    );
    const transposedKeys = reached
      .flatMap((node) => node.edges)
      .filter((edge) => edge.san === 'Nf3' || edge.san === 'd4')
      .map((edge) => edge.resultingKey);
    expect(new Set(transposedKeys).size).toBeLessThan(transposedKeys.length);
  });

  it('separates observed prepared continuations from gaps without a score blend', () => {
    const tree = buildOpeningTree([games[0]!], ['Target']);
    const root = tree.nodes.get(tree.rootKey)!;
    const edge = root.edges[0]!;
    const comparison = compareWithRepertoire(root, [
      {
        id: 'rp',
        repertoireId: 'r',
        positionKey: edge.resultingKey,
        fen: edge.resultingFen,
        sideToMove: 'b',
        moves: [{ uci: 'd7d5' as never, san: 'd5' as never, role: 'main', updatedAt: 1 }],
        depth: 1,
        createdAt: 1,
        updatedAt: 1,
        revision: 0,
      },
    ]);
    expect(comparison.prepared.map((move) => move.san)).toEqual(['Nf3']);
    expect(comparison.gaps).toEqual([]);
  });
});
