import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { parsePgn } from '@/chess/pgn';
import type { Fen } from '@/chess/types';
import { normalizeGame } from '@/persistence/import-game';

import { buildOpeningTree } from './index';
import { chooseBookReply, describeChoice } from './sparring';

const game = (pgn: string) => {
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) throw new Error('fixture did not parse');
  return normalizeGame(parsed.tree);
};

/** Target has White in three games: 1.e4 twice, 1.d4 once. */
const games = [
  game('[White "Target"]\n[Black "A"]\n[Result "1-0"]\n[Date "2024.01.01"]\n\n1. e4 e5 2. Nf3 *'),
  game('[White "Target"]\n[Black "B"]\n[Result "1-0"]\n[Date "2025.01.01"]\n\n1. e4 c5 2. Nf3 *'),
  game('[White "Target"]\n[Black "C"]\n[Result "1/2-1/2"]\n[Date "2026.01.01"]\n\n1. d4 d5 *'),
];
const tree = buildOpeningTree(games, ['Target'], { playerColor: 'w' });
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' as Fen;
const AFTER_E4_D5 = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' as Fen;

describe('the sparring partner plays the opponent’s own moves', () => {
  it('chooses among their moves with the frequency they chose them', () => {
    // 1.e4 holds two of the three games: the first two thirds of the roll.
    expect(chooseBookReply(tree, START_FEN, () => 0)).toMatchObject({
      kind: 'book',
      edge: { san: 'e4', games: 2 },
    });
    expect(chooseBookReply(tree, START_FEN, () => 0.6)).toMatchObject({
      kind: 'book',
      edge: { san: 'e4' },
    });
    expect(chooseBookReply(tree, START_FEN, () => 0.7)).toMatchObject({
      kind: 'book',
      edge: { san: 'd4', games: 1 },
    });
    // A roll of exactly 1 is clamped rather than falling off the end.
    expect(chooseBookReply(tree, START_FEN, () => 1)).toMatchObject({
      kind: 'book',
      edge: { san: 'd4' },
    });
  });

  it('plays what they played in a position they reached, by position rather than move order', () => {
    expect(chooseBookReply(tree, AFTER_E4_E5, () => 0)).toMatchObject({
      kind: 'book',
      edge: { san: 'Nf3', games: 1 },
    });
  });

  it('says so when their games do not reach the position, and never invents a move', () => {
    expect(chooseBookReply(tree, AFTER_E4_D5)).toEqual({
      kind: 'out-of-book',
      reason: 'unreached',
    });
    expect(describeChoice({ kind: 'out-of-book', reason: 'unreached' }, 'Target')).toBe(
      "Target's games do not reach this position. The engine plays from here.",
    );
  });

  it('describes a book move with the count, the denominator and the share', () => {
    const choice = chooseBookReply(tree, START_FEN, () => 0);
    expect(describeChoice(choice, 'Target')).toBe(
      "Played in 2 of Target's 3 games here (67%), last in 2025",
    );
  });
});
