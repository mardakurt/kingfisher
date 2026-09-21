import { describe, expect, it } from 'vitest';

import { isGame } from './database';
import { fixtureDatabase } from './fixtures';
import { prepareChessBaseGame } from './prepare';

describe('prepareChessBaseGame', () => {
  it('turns a ChessBase game into a game any collection can store, provenance intact', () => {
    const db = fixtureDatabase('world-ch', 'World-ch');
    const game = db.game(1);
    if (!isGame(game)) throw new Error(game.reason);
    const prepared = prepareChessBaseGame(game.pgn, null, 1_700_000_000_000);
    expect(prepared.summary).toMatchObject({
      white: 'Zukertort, Johannes Hermann',
      black: 'Steinitz, William',
      result: '0-1',
      date: '1886.01.11',
      year: 1886,
      eco: 'D11',
      importedAt: 1_700_000_000_000,
    });
    expect(prepared.summary.fingerprint).toMatch(/^[0-9a-f]+$/);
    expect(prepared.positions.length).toBeGreaterThan(80);
    expect(prepared.positions[0]).toMatchObject({ ply: 1, moveSan: 'd4' });
    expect(prepared.pgn).toContain('[Source "MainBase"]');
    expect(prepared.pgn).toContain('[ChessBaseFile "World-ch.cbh"]');
    expect(prepared.tree).toBeDefined();
  });

  it('refuses text that holds no game rather than storing it', () => {
    expect(() => prepareChessBaseGame('not a game', null)).toThrow(/No games/);
  });
});
