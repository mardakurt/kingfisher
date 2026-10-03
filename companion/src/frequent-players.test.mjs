/**
 * Frequent players in a companion collection, in both position layouts.
 *
 * The expectations are written out by hand from the games below, not derived
 * from the implementation: who made each move from the start position, in how
 * many distinct games, under each filter.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as kit from '../../src/companion-kit/import-kit.ts';
import { GameDatabase } from './database.mjs';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -';

const game = ({ id, white, black, year, rating, uci, san, repeat = false, reply = null }) => {
  const positions = [{ positionKey: START, ply: 0, moveUci: uci, moveSan: san, mover: 'w' }];
  // A game that returns to the start position and plays the same move again is
  // one game. Import keeps one row per (game, position, move), so this pins the
  // end-to-end count rather than the query's own de-duplication.
  if (repeat)
    positions.push({ positionKey: START, ply: 4, moveUci: uci, moveSan: san, mover: 'w' });
  if (reply)
    positions.push({
      positionKey: AFTER_E4,
      ply: 1,
      moveUci: reply.uci,
      moveSan: reply.san,
      mover: 'b',
    });
  return {
    game: {
      fingerprint: id,
      white,
      black,
      whiteKey: white.toLocaleLowerCase('en-US'),
      blackKey: black.toLocaleLowerCase('en-US'),
      result: '1-0',
      date: `${year}.01.01`,
      year,
      event: 'Test',
      site: 'Local',
      round: '1',
      whiteRating: rating,
      blackRating: rating,
      eco: 'C20',
      opening: 'Test',
      plyCount: positions.length,
      importedAt: year,
    },
    pgn: `[White "${white}"]\n[Black "${black}"]\n[Result "1-0"]\n\n1. ${san} 1-0`,
    positions,
  };
};

const GAMES = [
  game({
    id: 'g1',
    white: 'Alpha',
    black: 'Zed',
    year: 2026,
    rating: 2500,
    uci: 'e2e4',
    san: 'e4',
    reply: { uci: 'c7c5', san: 'c5' },
  }),
  game({
    id: 'g2',
    white: 'Alpha',
    black: 'Zed',
    year: 2025,
    rating: 2500,
    uci: 'e2e4',
    san: 'e4',
    reply: { uci: 'c7c5', san: 'c5' },
  }),
  game({
    id: 'g3',
    white: 'Beta',
    black: 'Yan',
    year: 2024,
    rating: 2300,
    uci: 'e2e4',
    san: 'e4',
    reply: { uci: 'e7e5', san: 'e5' },
  }),
  game({
    id: 'g4',
    white: 'Gamma',
    black: 'Zed',
    year: 2026,
    rating: 2400,
    uci: 'd2d4',
    san: 'd4',
  }),
  game({ id: 'g5', white: '?', black: 'Zed', year: 2026, rating: 2600, uci: 'e2e4', san: 'e4' }),
  game({
    id: 'g6',
    white: 'Alpha',
    black: 'Yan',
    year: 2026,
    rating: 2500,
    uci: 'e2e4',
    san: 'e4',
    repeat: true,
  }),
];

const movers = (result, uci) => result.moves.find((move) => move.uci === uci)?.frequentPlayers;

for (const layout of ['rows', 'postings']) {
  describe(`frequent players, ${layout} layout`, () => {
    let directory;
    let database;
    const open = (options = {}) =>
      new GameDatabase(path.join(directory, `${layout}.sqlite`), {
        ...(layout === 'postings' ? { layout, kit } : {}),
        ...options,
      });

    beforeEach(() => {
      directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-frequent-'));
      database = open();
      database.insertGames(GAMES);
    });

    afterEach(() => {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    });

    it('names each move’s movers by distinct games, and not a game with no name', () => {
      const result = database.explore(START);
      expect(result.totalGames).toBe(6);
      // g1, g2, g6 — g6 reached the position twice and counts once; g5 is "?".
      expect(movers(result, 'e2e4')).toEqual([
        { name: 'Alpha', games: 3 },
        { name: 'Beta', games: 1 },
      ]);
      expect(movers(result, 'd2d4')).toEqual([{ name: 'Gamma', games: 1 }]);
      expect(result.frequentPlayersOmitted).toBeUndefined();
    });

    it('credits the side to move, so Black’s replies name Black', () => {
      const result = database.explore(AFTER_E4);
      expect(movers(result, 'c7c5')).toEqual([{ name: 'Zed', games: 2 }]);
      expect(movers(result, 'e7e5')).toEqual([{ name: 'Yan', games: 1 }]);
    });

    it('applies the same filters as the counts beside them', () => {
      // Rating ≥ 2450 drops Beta (2300) and Gamma (2400).
      const rated = database.explore(START, 24, { minRating: 2450 });
      expect(movers(rated, 'e2e4')).toEqual([{ name: 'Alpha', games: 3 }]);
      expect(rated.moves.find((move) => move.uci === 'd2d4')).toBeUndefined();
      // 2026 only: Alpha's g1 and g6.
      const recent = database.explore(START, 24, { sinceYear: 2026 });
      expect(movers(recent, 'e2e4')).toEqual([{ name: 'Alpha', games: 2 }]);
      expect(movers(recent, 'd2d4')).toEqual([{ name: 'Gamma', games: 1 }]);
      // One player's games: nobody else is credited.
      const beta = database.explore(START, 24, { player: 'beta', playerColor: 'w' });
      expect(movers(beta, 'e2e4')).toEqual([{ name: 'Beta', games: 1 }]);
    });

    it('says it left them out above its budget, rather than naming nobody', () => {
      database.close();
      database = open({ frequentPlayersMaxGames: 5 });
      const result = database.explore(START);
      expect(result.frequentPlayersOmitted).toEqual({ games: 6, limit: 5 });
      expect(movers(result, 'e2e4')).toBeUndefined();
      // Below it, the same database answers.
      expect(movers(database.explore(AFTER_E4), 'c7c5')).toEqual([{ name: 'Zed', games: 2 }]);
    });
  });
}
