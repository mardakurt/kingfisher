import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn';
import { normalizeGame } from '@/persistence/import-game';
import type { GameRecord } from '@/persistence/types';
import {
  buildDossier,
  comparePeriods,
  firstMoveOf,
  moveOrderFingerprints,
  openingFamilyOf,
  THIN_SAMPLE,
} from './dossier';

/**
 * Games are built through the real PGN parser and the real normalizer, so what
 * these tests exercise is the same record shape the application stores. A
 * hand-written fixture would let a field drift and the tests would not notice.
 */
function game(options: {
  white: string;
  black: string;
  year: number;
  moves: string;
  result?: string;
  opening?: string;
  whiteElo?: number;
}): GameRecord {
  const pgn = [
    `[Event "Test"]`,
    `[Date "${options.year}.01.01"]`,
    `[White "${options.white}"]`,
    `[Black "${options.black}"]`,
    `[Result "${options.result ?? '1/2-1/2'}"]`,
    ...(options.opening ? [`[Opening "${options.opening}"]`] : []),
    ...(options.whiteElo ? [`[WhiteElo "${options.whiteElo}"]`] : []),
    '',
    `${options.moves} ${options.result ?? '1/2-1/2'}`,
  ].join('\n');
  const parsed = parsePgn(pgn).games[0]!;
  return normalizeGame(parsed.tree);
}

const asWhite = (moves: string, year: number, over: Partial<Parameters<typeof game>[0]> = {}) =>
  game({ white: 'Player, X', black: 'Other, O', year, moves, ...over });

describe('the opponent dossier', () => {
  it('separates the two colours and reports the evidence each rests on', () => {
    const games = [
      asWhite('1. e4 c5 2. Nf3 d6', 2026, { whiteElo: 2700, result: '1-0' }),
      asWhite('1. e4 e5 2. Nf3 Nc6', 2025, { whiteElo: 2680 }),
      game({ white: 'Other, O', black: 'Player, X', year: 2026, moves: '1. d4 Nf6 2. c4 e6' }),
    ];

    const dossier = buildDossier('player, x', games, { recentFromYear: 2025 });

    expect(dossier.games).toBe(3);
    expect(dossier.white.games).toBe(2);
    expect(dossier.black.games).toBe(1);
    expect(dossier.ratingRange).toEqual({ low: 2680, high: 2700 });
    expect(dossier.dateRange).toEqual({ from: 2025, to: 2026 });
    // 1.e4 in both White games, so 100% of that side.
    expect(dossier.white.firstMoves[0]).toMatchObject({ label: 'e4', games: 2, frequency: 100 });
    // Black's own first move, not White's.
    expect(dossier.black.firstMoves[0]).toMatchObject({ label: 'Nf6', games: 1 });
  });

  it('is empty rather than wrong when the player has no games', () => {
    const dossier = buildDossier('nobody', [asWhite('1. e4 e5', 2026)]);
    expect(dossier.games).toBe(0);
    expect(dossier.white.firstMoves).toEqual([]);
    expect(dossier.ratingRange).toBeUndefined();
  });

  it('reads the opening family from the header rather than classifying moves', () => {
    const named = asWhite('1. d4 Nf6 2. c4 e6 3. g3', 2026, {
      opening: 'Catalan Opening: Closed Variation',
    });
    expect(openingFamilyOf(named)).toBe('Catalan Opening');
    // No header and no ECO is an absence, not a guess.
    expect(openingFamilyOf(asWhite('1. d4 Nf6', 2026))).toBeNull();
    expect(firstMoveOf(named, 'w')).toBe('d4');
    expect(firstMoveOf(named, 'b')).toBe('Nf6');
  });
});

describe('recent versus historical', () => {
  it('reports the change in percentage points and the sample under it', () => {
    const games = [
      // Historical: two Catalans, one QGD.
      asWhite('1. d4 Nf6', 2019, { opening: 'Catalan Opening' }),
      asWhite('1. d4 Nf6', 2020, { opening: 'Catalan Opening' }),
      asWhite('1. d4 d5', 2021, { opening: 'Queen’s Gambit Declined' }),
      // Recent: two Londons, one Catalan.
      asWhite('1. d4 d5 2. Bf4', 2025, { opening: 'London System' }),
      asWhite('1. d4 Nf6 2. Bf4', 2026, { opening: 'London System' }),
      asWhite('1. d4 Nf6 2. c4', 2026, { opening: 'Catalan Opening' }),
    ];

    const result = comparePeriods(games, 'Player, X', 'w', 2025);

    expect(result.historicalTotal).toBe(3);
    expect(result.recentTotal).toBe(3);
    const london = result.rows.find((row) => row.label === 'London System')!;
    expect(london).toMatchObject({
      historicalGames: 0,
      historicalFrequency: 0,
      recentGames: 2,
      recentFrequency: 66.7,
      change: 66.7,
    });
    const catalan = result.rows.find((row) => row.label === 'Catalan Opening')!;
    expect(catalan.change).toBeCloseTo(33.3 - 66.7, 1);

    // Largest movement first, in either direction: a line they abandoned is as
    // much preparation as one they took up.
    expect(Math.abs(result.rows[0]!.change)).toBeGreaterThanOrEqual(
      Math.abs(result.rows[1]!.change),
    );
  });

  it('flags a sample too thin to read as a repertoire change', () => {
    const games = [asWhite('1. d4', 2026, { opening: 'London System' })];
    const result = comparePeriods(games, 'Player, X', 'w', 2025);
    expect(result.thin).toBe(true);
    expect(THIN_SAMPLE).toBeGreaterThan(1);
  });
});

describe('move-order fingerprints', () => {
  it('reports only move orders that actually occurred, with the games behind them', () => {
    const games = [
      asWhite('1. Nf3 Nf6 2. d4 e6 3. c4 d5', 2026),
      asWhite('1. Nf3 d5 2. d4 Nf6', 2025),
      asWhite('1. d4 Nf6 2. c4 e6 3. Nf3 d5', 2024),
    ];

    const prints = moveOrderFingerprints(games, 'Player, X', 'w', 2025);
    const nf3First = prints.find((print) => print.id === 'nf3-before-d4')!;

    expect(nf3First).toMatchObject({ games: 2, frequency: 66.7, recentGames: 2 });
    expect(nf3First.gameIds).toHaveLength(2);
    // The claim is openable: every id names a game the user can look at.
    expect(new Set(nf3First.gameIds).size).toBe(2);
    // A pattern nobody played is absent, not zero.
    expect(prints.some((print) => print.id === 'early-h3')).toBe(false);
  });

  it('recognises an anti-Sicilian move order and does not confuse it with the Open', () => {
    const rossolimo = asWhite('1. e4 c5 2. Nf3 Nc6 3. Bb5 g6', 2026);
    const open = asWhite('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6', 2026);

    const anti = moveOrderFingerprints([rossolimo], 'Player, X', 'w', 2025);
    expect(anti.map((print) => print.id)).toContain('anti-sicilian-bb5');
    expect(anti.map((print) => print.id)).not.toContain('open-sicilian');

    const sicilian = moveOrderFingerprints([open], 'Player, X', 'w', 2025);
    expect(sicilian.map((print) => print.id)).toContain('open-sicilian');
    expect(sicilian.map((print) => print.id)).not.toContain('anti-sicilian-bb5');
  });

  it('applies a colour-specific pattern only to the colour it belongs to', () => {
    const blackH6 = game({
      white: 'Other, O',
      black: 'Player, X',
      year: 2026,
      moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4 h6',
    });
    const prints = moveOrderFingerprints([blackH6], 'Player, X', 'b', 2025);
    expect(prints.map((print) => print.id)).toContain('early-h6');
    // `early-h3` is a White pattern and cannot appear in a Black list at all.
    expect(prints.map((print) => print.id)).not.toContain('early-h3');
  });
});
