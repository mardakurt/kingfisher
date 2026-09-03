import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GameDatabase } from './database.mjs';

const POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

const entry = ({ fingerprint, white, black, result, year, rating, uci, san }) => ({
  game: {
    fingerprint,
    white,
    black,
    whiteKey: white.toLocaleLowerCase('en-US'),
    blackKey: black.toLocaleLowerCase('en-US'),
    result,
    date: `${year}.01.01`,
    year,
    event: 'Test event',
    site: 'Local',
    round: '1',
    whiteRating: rating,
    blackRating: rating - 50,
    eco: 'C20',
    opening: 'King Pawn',
    plyCount: 1,
    importedAt: year,
  },
  pgn: `[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n1. ${san} ${result}`,
  positions: [
    {
      positionKey: POSITION,
      ply: 0,
      moveUci: uci,
      moveSan: san,
      mover: 'w',
    },
  ],
});

describe('GameDatabase', () => {
  let directory;
  let database;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-sqlite-'));
    database = new GameDatabase(path.join(directory, 'games.sqlite'));
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('imports summaries and content atomically and rejects duplicate fingerprints', () => {
    const game = entry({
      fingerprint: 'game-1',
      white: 'Alpha',
      black: 'Beta',
      result: '1-0',
      year: 2026,
      rating: 2500,
      uci: 'e2e4',
      san: 'e4',
    });

    expect(database.insertGames([game])).toEqual({ imported: 1, duplicates: 0 });
    expect(database.insertGames([game])).toEqual({ imported: 0, duplicates: 1 });
    expect(database.count()).toBe(1);

    const result = database.search({ limit: 10, exactTotal: true });
    expect(result.total).toBe(1);
    expect(result.games[0]).toMatchObject({
      fingerprint: 'game-1',
      white: 'Alpha',
      black: 'Beta',
      result: '1-0',
      year: 2026,
      whiteRating: 2500,
      blackRating: 2450,
      eco: 'C20',
      opening: 'King Pawn',
    });
    expect(database.content(result.games[0].id)).toBe(game.pgn);
  });

  it('pages and filters summaries with truthful hasMore semantics', () => {
    database.insertGames([
      entry({
        fingerprint: 'game-1',
        white: 'Alpha',
        black: 'Beta',
        result: '1-0',
        year: 2026,
        rating: 2500,
        uci: 'e2e4',
        san: 'e4',
      }),
      entry({
        fingerprint: 'game-2',
        white: 'Gamma',
        black: 'Alpha',
        result: '1/2-1/2',
        year: 2025,
        rating: 2400,
        uci: 'd2d4',
        san: 'd4',
      }),
      entry({
        fingerprint: 'game-3',
        white: 'Delta',
        black: 'Epsilon',
        result: '0-1',
        year: 2024,
        rating: 2300,
        uci: 'e2e4',
        san: 'e4',
      }),
    ]);

    expect(database.search({ limit: 2, offset: 0 })).toMatchObject({
      hasMore: true,
      total: null,
      offset: 0,
      limit: 2,
    });
    expect(database.search({ limit: 2, offset: 2 })).toMatchObject({
      hasMore: false,
      total: null,
      offset: 2,
      limit: 2,
    });

    const alpha = database.search({ player: 'alpha', exactTotal: true });
    expect(alpha.total).toBe(2);
    expect(alpha.games.map((game) => game.fingerprint).sort()).toEqual(['game-1', 'game-2']);
    expect(database.search({ result: '0-1', exactTotal: true }).total).toBe(1);
    expect(database.search({ fromYear: 2025, minRating: 2400, exactTotal: true }).total).toBe(2);
  });

  it('aggregates positions and returns model games and matching players', () => {
    database.insertGames([
      entry({
        fingerprint: 'game-1',
        white: 'Alpha',
        black: 'Beta',
        result: '1-0',
        year: 2026,
        rating: 2500,
        uci: 'e2e4',
        san: 'e4',
      }),
      entry({
        fingerprint: 'game-2',
        white: 'Alphonse',
        black: 'Gamma',
        result: '1/2-1/2',
        year: 2025,
        rating: 2400,
        uci: 'e2e4',
        san: 'e4',
      }),
      entry({
        fingerprint: 'game-3',
        white: 'Delta',
        black: 'Alpha',
        result: '0-1',
        year: 2024,
        rating: 2300,
        uci: 'd2d4',
        san: 'd4',
      }),
    ]);

    const explorer = database.explore(POSITION);
    expect(explorer).toMatchObject({ totalGames: 3, white: 1, draws: 1, black: 1 });
    expect(explorer.moves).toEqual([
      expect.objectContaining({ uci: 'e2e4', games: 2, white: 1, draws: 1, black: 0 }),
      expect.objectContaining({ uci: 'd2d4', games: 1, white: 0, draws: 0, black: 1 }),
    ]);
    expect(database.gamesAtPosition(POSITION, 2).map((game) => game.fingerprint)).toEqual([
      'game-1',
      'game-2',
    ]);
    expect(database.players('alp')).toEqual([
      { name: 'Alpha', games: 2 },
      { name: 'Alphonse', games: 1 },
    ]);
    expect(database.aggregateIntegrity()).toEqual({
      positions: 3,
      aggregatedPositions: 3,
      aggregateRows: 2,
      filteredCacheKeys: 0,
      filteredAggregateRows: 0,
    });
    expect(database.explore(POSITION, 24, { minRating: 2450 })).toMatchObject({
      totalGames: 1,
      white: 1,
      draws: 0,
      black: 0,
    });
  });

  it('answers arbitrary filtered explorer boundaries exactly without counting repetitions twice', () => {
    const repeated = entry({
      fingerprint: 'game-1',
      white: 'Alpha',
      black: 'Beta',
      result: '1-0',
      year: 2026,
      rating: 2500,
      uci: 'e2e4',
      san: 'e4',
    });
    repeated.positions.push({ ...repeated.positions[0], ply: 8 });
    database.insertGames([
      repeated,
      entry({
        fingerprint: 'game-2',
        white: 'Gamma',
        black: 'Delta',
        result: '0-1',
        year: 2023,
        rating: 2499,
        uci: 'd2d4',
        san: 'd4',
      }),
    ]);

    expect(database.explore(POSITION, 24, { sinceYear: 2024, minRating: 2500 })).toMatchObject({
      totalGames: 1,
      white: 1,
      black: 0,
      moves: [expect.objectContaining({ uci: 'e2e4', games: 1 })],
    });
    expect(database.explore(POSITION, 24, { untilYear: 2023, maxRating: 2499 })).toMatchObject({
      totalGames: 1,
      black: 1,
      moves: [expect.objectContaining({ uci: 'd2d4', games: 1 })],
    });
  });

  it('answers a filter that excludes nothing exactly as the unfiltered explorer does', () => {
    // A repetition inside one game must not become a second game in either
    // path. The two paths read different tables, so this is the invariant
    // that keeps the fast exact cache honest.
    const repeated = entry({
      fingerprint: 'game-1',
      white: 'Alpha',
      black: 'Beta',
      result: '1-0',
      year: 2026,
      rating: 2500,
      uci: 'e2e4',
      san: 'e4',
    });
    repeated.positions.push({ ...repeated.positions[0], ply: 8 });
    database.insertGames([
      repeated,
      entry({
        fingerprint: 'game-2',
        white: 'Gamma',
        black: 'Delta',
        result: '0-1',
        year: 2023,
        rating: 2499,
        uci: 'e2e4',
        san: 'e4',
      }),
    ]);

    const unfiltered = database.explore(POSITION, 24);
    const permissive = database.explore(POSITION, 24, { sinceYear: 1, minRating: 1 });
    expect(permissive).toEqual(unfiltered);
    expect(unfiltered).toMatchObject({
      totalGames: 2,
      white: 1,
      black: 1,
      moves: [expect.objectContaining({ uci: 'e2e4', games: 2 })],
    });
  });

  it('searches indexed structure identities and deletes exact filters transactionally', () => {
    const structured = entry({
      fingerprint: 'game-1',
      white: 'Alpha',
      black: 'Beta',
      result: '1-0',
      year: 2026,
      rating: 2500,
      uci: 'e2e4',
      san: 'e4',
    });
    Object.assign(structured.positions[0], {
      fen: '8/8/8/3p4/3P4/8/8/8 w - - 0 1',
      nodeId: 'n-1',
      pawnSkeleton: '8/8/8/3p4/3P4/8/8/8',
      structureSignature: 'material:none|pawns:d4,d5',
      structureClaims: ['white:isolated:d4', 'open:c'],
    });
    database.insertGames([
      structured,
      entry({
        fingerprint: 'game-2',
        white: 'Other',
        black: 'Player',
        result: '0-1',
        year: 2024,
        rating: 2300,
        uci: 'd2d4',
        san: 'd4',
      }),
    ]);

    const found = database.searchStructures({
      mode: 'pawn-skeleton',
      pawnSkeleton: '8/8/8/3p4/3P4/8/8/8',
      positionKey: POSITION,
      structureSignature: '',
      claims: [],
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      game: { fingerprint: 'game-1' },
      position: { nodeId: 'n-1', structureClaims: ['white:isolated:d4', 'open:c'] },
    });

    expect(database.deleteGamesMatching({ player: 'alpha' })).toEqual({ deleted: 1 });
    expect(database.count()).toBe(1);
    expect(database.aggregateIntegrity()).toMatchObject({
      positions: 1,
      aggregatedPositions: 1,
      filteredCacheKeys: 0,
    });
    expect(database.clear()).toEqual({ deleted: 1 });
    expect(database.count()).toBe(0);
  });

  it('maintains explorer aggregates through deletion and an explicit rebuild', () => {
    database.insertGames([
      entry({
        fingerprint: 'game-1',
        white: 'Alpha',
        black: 'Beta',
        result: '1-0',
        year: 2026,
        rating: 2500,
        uci: 'e2e4',
        san: 'e4',
      }),
    ]);
    database.rebuildAggregates();
    expect(database.explore(POSITION).moves[0]).toMatchObject({ games: 1, lastPlayedYear: 2026 });
    database.deleteGamesByFingerprint(['game-1']);
    expect(database.explore(POSITION)).toMatchObject({ totalGames: 0, moves: [] });
    expect(database.aggregateIntegrity()).toMatchObject({ positions: 0, aggregatedPositions: 0 });
  });
});

/**
 * The Phase 10 search indexes.
 *
 * The interesting cases are not "does it find things" — they are the ones a
 * derived index gets wrong: a count that survives a deletion, an index a user
 * upgraded into, and a delete-by-filter that removes something other than
 * what the list showed.
 */
describe('player and metadata indexes', () => {
  let directory;
  let database;

  const player = (fingerprint, white, black) =>
    entry({
      fingerprint,
      white,
      black,
      result: '1-0',
      year: 2020,
      rating: 2700,
      uci: 'e2e4',
      san: 'e4',
    });

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-search-'));
    database = new GameDatabase(path.join(directory, 'games.sqlite'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('counts a player once per game they appear in, on either colour', () => {
    database.insertGames([
      player('a', 'Carlsen', 'Nakamura'),
      player('b', 'Nakamura', 'Carlsen'),
      player('c', 'Carlsen', 'Caruana'),
    ]);
    const found = database.players('carlsen');
    expect(found).toHaveLength(1);
    expect(found[0].games).toBe(3);
  });

  it('orders a prefix lookup by how many games each player has', () => {
    database.insertGames([
      player('a', 'Carlsen', 'Nakamura'),
      player('b', 'Carlsen', 'Caruana'),
      player('c', 'Caruana', 'Nakamura'),
    ]);
    const found = database.players('car');
    expect(found.map((row) => row.name)).toEqual(['Carlsen', 'Caruana']);
  });

  it('matches a prefix rather than a substring, as the key is normalized', () => {
    database.insertGames([player('a', 'Carlsen', 'Nakamura')]);
    expect(database.players('carl')).toHaveLength(1);
    // "arlsen" is inside the name but is not a prefix of it.
    expect(database.players('arlsen')).toHaveLength(0);
  });

  it('lists the busiest players for an empty prefix', () => {
    database.insertGames([player('a', 'Carlsen', 'Nakamura'), player('b', 'Carlsen', 'Caruana')]);
    expect(database.players('')[0].name).toBe('Carlsen');
  });

  /* The failure a derived count invites: a stale row nothing supports. */
  it('forgets a player whose last game was deleted', () => {
    database.insertGames([player('a', 'Carlsen', 'Nakamura'), player('b', 'Caruana', 'Giri')]);
    database.deleteGamesByFingerprint(['b']);
    expect(database.players('caruana')).toHaveLength(0);
    expect(database.players('carlsen')[0].games).toBe(1);
  });

  it('leaves no players behind after a clear', () => {
    database.insertGames([player('a', 'Carlsen', 'Nakamura')]);
    database.clear();
    expect(database.players('')).toHaveLength(0);
  });

  /*
    The migration, done for real. The tables are dropped behind the class's
    back so the reopened database is in exactly the state an upgrading user's
    is: games present, derived indexes absent.
  */
  it('builds the indexes for a database that predates them', () => {
    database.insertGames([player('a', 'Carlsen', 'Nakamura'), player('b', 'Carlsen', 'Giri')]);
    const file = path.join(directory, 'games.sqlite');

    const raw = new DatabaseSync(file);
    raw.exec('DROP TABLE IF EXISTS players');
    raw.exec('DROP TABLE IF EXISTS games_fts');
    raw.close();

    const reopened = new GameDatabase(file);
    expect(reopened.players('carlsen')[0].games).toBe(2);
    expect(reopened.search({ text: 'carlsen' }).games).toHaveLength(2);
  });

  it('finds a game by any indexed metadata field', () => {
    database.insertGames([player('a', 'Carlsen', 'Nakamura')]);
    expect(database.search({ text: 'carlsen' }).games).toHaveLength(1);
    expect(database.search({ text: 'nakamura' }).games).toHaveLength(1);
    expect(database.search({ text: 'Test event' }).games).toHaveLength(1);
    expect(database.search({ text: 'king pawn' }).games).toHaveLength(1);
  });

  it('matches on a partial word, so search works while you type', () => {
    database.insertGames([player('a', 'Carlsen', 'Nakamura')]);
    expect(database.search({ text: 'carls' }).games).toHaveLength(1);
  });

  it('requires every term, so a second word narrows rather than widens', () => {
    database.insertGames([player('a', 'Carlsen', 'Nakamura'), player('b', 'Caruana', 'Giri')]);
    expect(database.search({ text: 'carlsen nakamura' }).games).toHaveLength(1);
    expect(database.search({ text: 'carlsen giri' }).games).toHaveLength(0);
  });

  it('finds nothing for a term nothing carries', () => {
    database.insertGames([player('a', 'Carlsen', 'Nakamura')]);
    expect(database.search({ text: 'zzzznobody' }).games).toHaveLength(0);
  });

  /* Punctuation must be data, not FTS5 syntax. */
  it('does not let punctuation become query syntax', () => {
    database.insertGames([player('a', 'Vachier-Lagrave', 'Nakamura')]);
    expect(() => database.search({ text: '"' })).not.toThrow();
    expect(() => database.search({ text: 'carlsen*' })).not.toThrow();
    expect(database.search({ text: 'vachier-lagrave' }).games).toHaveLength(1);
  });

  /*
    The bug that would delete the wrong games: FTS prefix matching and LIKE
    substring matching do not select the same set, so the list and the delete
    must use the same one.
  */
  it('deletes exactly the games the same filter lists', () => {
    database.insertGames([player('a', 'Carlsen', 'Nakamura'), player('b', 'Caruana', 'Giri')]);
    const listed = database.search({ text: 'carlsen' }).games.map((game) => game.fingerprint);
    const { deleted } = database.deleteGamesMatching({ text: 'carlsen' });
    expect(deleted).toBe(listed.length);
    expect(database.search({ text: 'carlsen' }).games).toHaveLength(0);
    expect(database.search({ text: 'caruana' }).games).toHaveLength(1);
  });
});
