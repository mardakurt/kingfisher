import { describe, expect, it } from 'vitest';

import {
  chunkFile,
  chunkId,
  decodeExplorerLine,
  decodeGameLine,
  decodePlayerGamesLine,
  decodePlayerLine,
  encodeExplorerLine,
  encodeGameLine,
  encodePlayerGamesLine,
  encodePlayerLine,
  packDate,
  shardOf,
  type PackGame,
  type PackPlayer,
  type PackPosition,
} from './pack';

/**
 * The pack codec is the contract between a build script and a browser that
 * will read its output months later. These tests are round-trips rather than
 * assertions about the text, because the text is an implementation detail and
 * the round-trip is the promise.
 */

// gitleaks:allow — a literal PGN position key used in the pack
// test fixture. It is not a credential. The Phase 24 security
// review at docs/security/phase-24-security-review.md documents
// the four `generic-api-key` false positives this file produces.
const POSITION: PackPosition = {
  key: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6',
  moves: [
    {
      san: 'Nf3',
      uci: 'g1f3',
      games: 29926,
      white: 9110,
      draws: 14520,
      black: 6296,
      averageRating: 2445,
      lastYear: 2026,
      recentGames: 15815,
      recentWhite: 4800,
      recentDraws: 7700,
      recentBlack: 3315,
    },
    {
      san: 'Nc3',
      uci: 'b1c3',
      games: 2162,
      white: 700,
      draws: 900,
      black: 562,
      averageRating: 0,
      lastYear: 0,
      recentGames: 0,
      recentWhite: 0,
      recentDraws: 0,
      recentBlack: 0,
    },
  ],
  games: ['abc123', 'def456'],
};

describe('the explorer line codec', () => {
  it('round-trips a position with its moves and its top games', () => {
    expect(decodeExplorerLine(encodeExplorerLine(POSITION))).toEqual(POSITION);
  });

  it('round-trips a position nobody has a stored game for', () => {
    const empty = { ...POSITION, games: [] };
    expect(decodeExplorerLine(encodeExplorerLine(empty))).toEqual(empty);
  });

  it('rejects a line that is not one', () => {
    expect(decodeExplorerLine('')).toBeNull();
    expect(decodeExplorerLine('no separators here')).toBeNull();
    expect(decodeExplorerLine('|leading pipe|')).toBeNull();
  });
});

const GAME: PackGame = {
  id: 'g1',
  white: 'Carlsen, Magnus',
  black: 'So, Wesley',
  result: '1-0',
  year: 2025,
  date: '2025.06.14',
  event: 'Norway Chess 2025',
  eco: 'B90',
  opening: 'Sicilian Defense: Najdorf Variation',
  whiteElo: 2837,
  blackElo: 2751,
  url: 'https://lichess.org/broadcast/x/y/z',
  moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
};

describe('the game line codec', () => {
  it('round-trips a game', () => {
    expect(decodeGameLine(encodeGameLine(GAME))).toEqual(GAME);
  });

  it('keeps a field separator out of the fields it would break', () => {
    const awkward = { ...GAME, event: 'Weird\tEvent\nName', white: 'A\tB' };
    const decoded = decodeGameLine(encodeGameLine(awkward));
    expect(decoded?.event).toBe('Weird Event Name');
    expect(decoded?.white).toBe('A B');
    expect(decoded?.moves).toBe(GAME.moves);
  });

  it('normalises the several date shapes sources use', () => {
    expect(packDate('20241230')).toBe('2024.12.30');
    expect(packDate('2024.12.30')).toBe('2024.12.30');
    expect(packDate('2024-12-30')).toBe('2024.12.30');
    expect(packDate('')).toBe('');
    expect(packDate('2024.??.??')).toBe('2024.??.??');
  });
});

describe('the player codecs', () => {
  const player: PackPlayer = {
    key: 'magnus carlsen',
    id: 'carlsen, magnus',
    name: 'Carlsen, Magnus',
    fideId: '1503014',
    title: 'GM',
    games: 544,
    firstYear: 2023,
    lastYear: 2026,
    peakRating: 2900,
    lastRating: 2869,
  };

  it('round-trips a spelling that belongs to another identity', () => {
    expect(decodePlayerLine(encodePlayerLine(player))).toEqual(player);
  });

  it('treats a row that is its own identity as one, without storing it twice', () => {
    const own = { ...player, key: 'carlsen, magnus' };
    const encoded = encodePlayerLine(own);
    expect(encoded.split('\t')[1]).toBe('');
    expect(decodePlayerLine(encoded)).toEqual(own);
  });

  it('round-trips a player game list', () => {
    const entry = { key: 'carlsen, magnus', games: ['a', 'b', 'c'] };
    expect(decodePlayerGamesLine(encodePlayerGamesLine(entry))).toEqual(entry);
    expect(decodePlayerGamesLine(encodePlayerGamesLine({ key: 'x', games: [] }))).toEqual({
      key: 'x',
      games: [],
    });
  });
});

describe('sharding', () => {
  it('names a chunk the same way the build script and the reader both do', () => {
    expect(chunkId('explorer', 7)).toBe('explorer-007');
    expect(chunkFile('players', 0)).toBe('players-000.kfp.gz');
  });

  it('spreads keys across shards rather than piling them into one', () => {
    const counts = new Array(16).fill(0);
    for (let index = 0; index < 4000; index += 1) {
      counts[shardOf(`position-key-${index} w KQkq -`, 16)] += 1;
    }
    // A uniform hash puts 250 in each; this only has to rule out a hash that
    // ignores most of the key, which would leave shards empty.
    expect(Math.min(...counts)).toBeGreaterThan(150);
    expect(Math.max(...counts)).toBeLessThan(400);
  });

  it('is stable, because an installed pack outlives the build that made it', () => {
    expect(shardOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 64)).toBe(
      shardOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 64),
    );
  });
});
