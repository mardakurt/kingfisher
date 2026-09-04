import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { normalizeGame } from '@/persistence/prepare-game';
import { playerKey } from '@/persistence/schema/migrations';
import type { GameSummary } from '@/persistence/types';
import { classifyTree } from '@/theory/classify-games';
import { loadOpeningIndex } from '@/theory/openings';

import { aggregatePlayer, pointsFor, resolvePeriod, scorePercent } from './aggregate';
import {
  measureTendencies,
  playerGameView,
  TENDENCIES,
  TENDENCY_VERSION,
  type PlayerGameView,
} from './tendencies';

const index = await loadOpeningIndex();
const KEYS = new Set([playerKey('Carlsen, Magnus')]);

function summary(pgn: string): GameSummary {
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) throw new Error('fixture PGN did not parse');
  const base = normalizeGame(parsed.tree);
  const {
    tree: _tree,
    normalizedPgn: _pgn,
    ...rest
  } = { ...base, ...classifyTree(index, base.tree) };
  return rest;
}

function view(pgn: string, side: 'w' | 'b'): PlayerGameView {
  const parsed = parsePgn(pgn).games[0];
  if (!parsed) throw new Error('fixture PGN did not parse');
  return playerGameView(parsed.tree, side);
}

const header = (white: string, black: string, result: string, date: string, extra = ''): string =>
  `[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n[Date "${date}"]\n${extra}`;

const NAJDORF_WIN = `${header('Carlsen, Magnus', 'Firouzja, Alireza', '1-0', '2024.02.01', '[WhiteElo "2830"]\n[BlackElo "2760"]\n')}
1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 1-0`;

const NIMZO_DRAW = `${header('Gukesh, D', 'Carlsen, Magnus', '1/2-1/2', '2025.04.10', '[WhiteElo "2780"]\n[BlackElo "2840"]\n')}
1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O 1/2-1/2`;

const LOSS = `${header('Nepomniachtchi, Ian', 'Carlsen, Magnus', '1-0', '2019.06.01')}
1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

const OTHER_PEOPLE = `${header('Ding, Liren', 'Nepomniachtchi, Ian', '0-1', '2023.04.20')}
1. d4 d5 2. c4 e6 0-1`;

describe('what a collection can say about one player', () => {
  const games = [NAJDORF_WIN, NIMZO_DRAW, LOSS, OTHER_PEOPLE].map(summary);

  it('counts only the games that are actually theirs', () => {
    const profile = aggregatePlayer(games, KEYS);
    expect(profile.games).toBe(3);
    expect(profile.totalGames).toBe(4);
  });

  it('separates White and Black rather than reporting one blended score', () => {
    const profile = aggregatePlayer(games, KEYS);
    expect(profile.asWhite.games).toBe(1);
    expect(profile.asWhite.wins).toBe(1);
    expect(profile.asBlack.games).toBe(2);
    expect(profile.asBlack.draws).toBe(1);
    expect(profile.asBlack.losses).toBe(1);
    expect(profile.overall.points).toBe(1.5);
  });

  it('reports a rating range with the number of games it came from', () => {
    const profile = aggregatePlayer(games, KEYS);
    expect(profile.ratedGames).toBe(2);
    expect(profile.minRating).toBe(2830);
    expect(profile.maxRating).toBe(2840);
    expect(profile.averageRating).toBe(2835);
  });

  it('gives no rating figures at all when no game carries one', () => {
    const profile = aggregatePlayer([summary(LOSS)], KEYS);
    expect(profile.ratedGames).toBe(0);
    expect(profile.averageRating).toBeUndefined();
    expect(profile.minRating).toBeUndefined();
  });

  it('lists openings per colour, using the classification not the tag', () => {
    const profile = aggregatePlayer(games, KEYS);
    expect(profile.openingsAsWhite[0]?.label).toContain('Najdorf');
    expect(profile.openingsAsWhite[0]?.eco).toBe('B90');
    expect(profile.openingsAsBlack.map((entry) => entry.label)).toContain(
      'Nimzo-Indian Defense: Normal Variation',
    );
  });

  it('counts opponents from the player’s own side of the board', () => {
    const profile = aggregatePlayer(games, KEYS);
    const names = profile.opponents.map((entry) => entry.name).sort();
    expect(names).toEqual(['Firouzja, Alireza', 'Gukesh, D', 'Nepomniachtchi, Ian']);
    expect(profile.opponents.every((entry) => entry.name !== 'Carlsen, Magnus')).toBe(true);
  });

  it('reports the name as the games spell it, not the lookup key', () => {
    const profile = aggregatePlayer(games, KEYS);
    // The key is "carlsen, magnus"; the heading must not be.
    expect(profile.displayName).toBe('Carlsen, Magnus');
  });

  it('has no display name when it found no games', () => {
    expect(aggregatePlayer(games, new Set(['nobody'])).displayName).toBeNull();
  });

  it('reports a date range from the games it has', () => {
    const profile = aggregatePlayer(games, KEYS);
    expect(profile.firstYear).toBe(2019);
    expect(profile.lastYear).toBe(2025);
  });

  it('says nothing at all about a player with no games', () => {
    const profile = aggregatePlayer(games, new Set(['nobody']));
    expect(profile.games).toBe(0);
    expect(scorePercent(profile.overall)).toBeNull();
    expect(profile.openingsAsWhite).toEqual([]);
  });

  it('does not fold unfinished games into losses', () => {
    const unfinished = summary(`${header('Carlsen, Magnus', 'X', '*', '2026.01.01')}\n1. e4 *`);
    const profile = aggregatePlayer([unfinished], KEYS);
    expect(profile.overall.unknown).toBe(1);
    expect(profile.overall.losses).toBe(0);
    expect(scorePercent(profile.overall)).toBeNull();
  });
});

describe('scoring', () => {
  it('is from the named player’s side', () => {
    expect(pointsFor('1-0', 'w')).toBe(1);
    expect(pointsFor('1-0', 'b')).toBe(0);
    expect(pointsFor('0-1', 'b')).toBe(1);
    expect(pointsFor('1/2-1/2', 'w')).toBe(0.5);
    expect(pointsFor('*', 'w')).toBe(0);
  });

  it('excludes undecided games from the percentage denominator', () => {
    expect(scorePercent({ games: 3, wins: 1, draws: 0, losses: 1, unknown: 1, points: 1 })).toBe(
      50,
    );
  });
});

describe('periods', () => {
  const now = new Date('2026-09-04T00:00:00Z');

  it('resolves each named window to a stated year range', () => {
    expect(resolvePeriod({ id: 'last-5', label: '' }, now).fromYear).toBe(2022);
    expect(resolvePeriod({ id: 'last-3', label: '' }, now).fromYear).toBe(2024);
    expect(resolvePeriod({ id: 'all', label: '' }, now).fromYear).toBeUndefined();
  });
});

describe('factual tendencies', () => {
  it('carries a readable definition for every metric', () => {
    for (const tendency of TENDENCIES) {
      expect(tendency.definition.length).toBeGreaterThan(30);
      expect(tendency.name).not.toMatch(/aggressive|solid|risky|genius|weak/i);
    }
    expect(TENDENCY_VERSION).toMatch(/^d1\+t\d$/);
  });

  it('excludes a game that cannot answer, rather than counting it as a no', () => {
    /*
      Five moves, and the player never castled. That is not evidence of late
      castling — the game ended long before move 15 — so the metric must
      decline it rather than record a "no".
    */
    const short = view(`${header('P', 'Q', '*', '2024.01.01')}\n1. d4 d5 2. c4 e6 *`, 'w');
    const report = measureTendencies([short]);
    const castling = report.results.find((entry) => entry.id === 'delayed-castling');
    expect(castling?.denominator).toBe(0);
    expect(castling?.count).toBe(0);
  });

  it('answers "no" for a game where the player did castle early', () => {
    // Castling on move 4 settles the question; it is a real observation.
    const report = measureTendencies([view(NIMZO_DRAW, 'b')]);
    const castling = report.results.find((entry) => entry.id === 'delayed-castling');
    expect(castling?.denominator).toBe(1);
    expect(castling?.count).toBe(0);
  });

  it('does not ask a Black game about a White-only metric', () => {
    const report = measureTendencies([view(NIMZO_DRAW, 'b')]);
    const nf3 = report.results.find((entry) => entry.id === 'nf3-before-d4');
    expect(nf3?.denominator).toBe(0);
  });

  it('counts 1.Nf3 followed by d4, and not 1.d4 followed by Nf3', () => {
    const reti = view(
      `${header('P', 'Q', '*', '2024.01.01')}\n1. Nf3 d5 2. c4 e6 3. d4 Nf6 *`,
      'w',
    );
    const queensPawn = view(`${header('P', 'Q', '*', '2024.01.01')}\n1. d4 d5 2. Nf3 Nf6 *`, 'w');
    expect(measureTendencies([reti]).results.find((e) => e.id === 'nf3-before-d4')?.count).toBe(1);
    const other = measureTendencies([queensPawn]).results.find((e) => e.id === 'nf3-before-d4');
    expect(other?.count).toBe(0);
    expect(other?.denominator).toBe(1);
  });

  it('detects opposite-side castling from the position, not from the moves', () => {
    const opposite = view(
      `${header('P', 'Q', '*', '2024.01.01')}\n` +
        '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O ' +
        '8. Qd2 Nc6 9. O-O-O d5 *',
      'w',
    );
    const report = measureTendencies([opposite]);
    const row = report.results.find((entry) => entry.id === 'opposite-side-castling');
    expect(row?.count).toBe(1);
    expect(row?.denominator).toBe(1);
  });

  it('sees the queens leave the board', () => {
    // The Berlin endgame, where the queens come off on move eight.
    const traded = view(
      `${header('P', 'Q', '*', '2024.01.01')}\n` +
        '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6 6. Bxc6 dxc6 ' +
        '7. dxe5 Nf5 8. Qxd8+ Kxd8 *',
      'w',
    );
    const row = measureTendencies([traded]).results.find((e) => e.id === 'queens-off-by-20');
    expect(row?.count).toBe(1);
    expect(row?.denominator).toBe(1);
  });

  it('cannot answer the queen question for a short game with queens still on', () => {
    const row = measureTendencies([view(NIMZO_DRAW, 'b')]).results.find(
      (e) => e.id === 'queens-off-by-20',
    );
    expect(row?.denominator).toBe(0);
  });

  it('reports how many games it examined, so a sample is visibly a sample', () => {
    const report = measureTendencies([view(NAJDORF_WIN, 'w'), view(NIMZO_DRAW, 'b')]);
    expect(report.examined).toBe(2);
    expect(report.averagePlies).toBeGreaterThan(0);
  });

  it('reports nothing rather than zeroes for an empty sample', () => {
    const report = measureTendencies([]);
    expect(report.examined).toBe(0);
    expect(report.averagePlies).toBeNull();
    expect(report.results.every((entry) => entry.denominator === 0)).toBe(true);
  });
});
