import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { normalizeGame } from '@/persistence/import-game';
import type { GameRecord } from '@/persistence/types';

import { buildStyleReport, officerCount, SHORT_DRAW_MOVES } from './style';

/** Built through the real parser and normalizer, so the record shape is the stored one. */
function game(white: string, black: string, result: string, moves: string): GameRecord {
  const pgn = [
    `[Event "Test"]`,
    `[Date "2024.01.01"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`,
    '',
    `${moves} ${result}`,
  ].join('\n');
  return normalizeGame(parsePgn(pgn).games[0]!.tree);
}

const ME = 'Player, X';

describe('the style report', () => {
  it('separates the colours and counts each result once', () => {
    const report = buildStyleReport(
      [
        game(ME, 'A', '1-0', '1. e4 e5'),
        game(ME, 'B', '1/2-1/2', '1. e4 c5'),
        game('C', ME, '1-0', '1. d4 d5'),
        game('D', ME, '0-1', '1. d4 Nf6'),
        game('E', 'F', '1-0', '1. c4'), // not this player's game
      ],
      [ME],
    );
    expect(report.white).toEqual({ games: 2, wins: 1, draws: 1, losses: 0, score: 75 });
    expect(report.black).toEqual({ games: 2, wins: 1, draws: 0, losses: 1, score: 50 });
    expect(report.overall.games).toBe(4);
    expect(report.overall.score).toBe(62.5);
  });

  it('calls a draw short by its length, and says what short means', () => {
    const quick = game(ME, 'A', '1/2-1/2', '1. e4 e5 2. Nf3 Nc6');
    const report = buildStyleReport([quick], [ME]);
    expect(report.shortDraws).toBe(1);
    const measure = report.measures.find((entry) => entry.id === 'short-draws');
    expect(measure?.value).toBe(100);
    expect(measure?.definition).toContain(String(SHORT_DRAW_MOVES));
  });

  it('builds every sentence from its own figures, never from an adjective', () => {
    const report = buildStyleReport(
      [
        game(ME, 'A', '1-0', '1. e4 e5'),
        game(ME, 'B', '0-1', '1. e4 c5'),
        game(ME, 'C', '1-0', '1. d4 d5'),
      ],
      [ME],
    );
    const text = report.observations.map((entry) => entry.text).join(' ');
    expect(text).toContain('opens 1.e4 in 66.7% of games');
    expect(text).toContain('2 first moves cover 90%');
    expect(text).not.toMatch(/aggressive|positional|strong|weak|solid/i);
  });

  it('says nothing about a player with no games rather than inventing a profile', () => {
    const report = buildStyleReport([game('E', 'F', '1-0', '1. c4')], [ME]);
    expect(report.overall.games).toBe(0);
    expect(report.measures).toEqual([]);
    expect(report.observations).toEqual([]);
  });

  it('counts pieces besides kings and pawns', () => {
    expect(officerCount('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(14);
    expect(officerCount('8/5k2/8/8/3K4/8/4P3/8 w - - 0 1')).toBe(0);
  });
});
