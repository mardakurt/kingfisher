import { describe, expect, it } from 'vitest';

import { START_FEN } from '@/chess/fen';
import { asSan, asUci } from '@/chess/types';
import type { DatabaseMove, ExplorerResult } from '@/database/types';
import { buildRadar } from './radar';

const move = (san: string, games: number, over: Partial<DatabaseMove> = {}): DatabaseMove => ({
  uci: asUci(`x${san}`),
  san: asSan(san),
  games,
  white: 0,
  draws: games,
  black: 0,
  ...over,
});

const result = (total: number, moves: readonly DatabaseMove[]): ExplorerResult => ({
  fen: START_FEN,
  source: { id: 'local', name: 'My games' },
  totalGames: total,
  white: 0,
  draws: total,
  black: 0,
  moves: [...moves],
});

describe('the theory radar', () => {
  it('reports the share of each move over three windows and orders by movement', () => {
    const radar = buildRadar(
      result(1000, [move('Nf3', 800), move('h4', 32)]),
      result(300, [move('Nf3', 214), move('h4', 26)]),
      result(100, [move('Nf3', 85), move('h4', 15)]),
      { currentYear: 2026 },
    );

    const h4 = radar.rows.find((row) => row.san === 'h4')!;
    expect(h4.allTime).toEqual({ games: 32, frequency: 3.2 });
    expect(h4.threeYear).toEqual({ games: 26, frequency: 8.7 });
    expect(h4.twelveMonth).toEqual({ games: 15, frequency: 15 });
    // The ordering number is two subtractions a reader can redo from the
    // columns beside it, not a smoothed score.
    expect(h4.shift).toBe(11.8);
    expect(radar.rows[0]!.san).toBe('h4');
    expect(radar.windows).toEqual({ allTime: 1000, threeYear: 300, twelveMonth: 100 });
  });

  it('never claims a novelty, and names the database in the strongest claim it makes', () => {
    const radar = buildRadar(
      result(1000, [move('Nf3', 990), move('Rb1', 10)]),
      result(200, [move('Nf3', 190), move('Rb1', 10)]),
      result(60, [move('Nf3', 50), move('Rb1', 10)]),
      { currentYear: 2026 },
    );

    const rb1 = radar.rows.find((row) => row.san === 'Rb1')!;
    const kinds = rb1.labels.map((label) => label.kind);
    expect(kinds).toContain('new-in-database');
    // The vocabulary has no room for a novelty claim.
    expect(kinds).not.toContain('novelty');

    const text = rb1.labels.map((label) => label.text).join(' ');
    expect(text).toContain('selected database');
    expect(text.toLowerCase()).not.toContain('novelty');
    expect(text.toLowerCase()).not.toContain('theoretical');
  });

  it('distinguishes "only recently seen" from "seen throughout"', () => {
    // Every Ra2 game is inside three years but not inside twelve months.
    const radar = buildRadar(
      result(500, [move('Ra2', 40), move('Nf3', 460)]),
      result(200, [move('Ra2', 40), move('Nf3', 160)]),
      result(50, [move('Ra2', 5), move('Nf3', 45)]),
      { currentYear: 2026 },
    );

    const ra2 = radar.rows.find((row) => row.san === 'Ra2')!;
    expect(ra2.labels.map((label) => label.kind)).toContain('first-seen-since');
    expect(ra2.labels.find((label) => label.kind === 'first-seen-since')!.text).toContain('2024');
  });

  it('says a move is falling out of use as readily as rising', () => {
    const radar = buildRadar(
      result(1000, [move('Bg5', 400), move('Nf3', 600)]),
      result(300, [move('Bg5', 60), move('Nf3', 240)]),
      result(100, [move('Bg5', 10), move('Nf3', 90)]),
      { currentYear: 2026 },
    );

    const bg5 = radar.rows.find((row) => row.san === 'Bg5')!;
    expect(bg5.shift).toBe(-30);
    expect(bg5.labels.map((label) => label.kind)).toContain('falling-out-of-use');
  });

  it('flags a sample too thin for its own percentages', () => {
    const thin = buildRadar(
      result(9, [move('e4', 5)]),
      result(4, [move('e4', 3)]),
      result(2, [move('e4', 2)]),
      { currentYear: 2026 },
    );
    expect(thin.thin).toBe(true);

    const solid = buildRadar(
      result(500, [move('e4', 300)]),
      result(200, [move('e4', 120)]),
      result(80, [move('e4', 50)]),
      { currentYear: 2026 },
    );
    expect(solid.thin).toBe(false);
  });

  it('leaves a move alone when nothing about it moved', () => {
    const radar = buildRadar(
      result(1000, [move('Nf3', 500), move('d4', 500)]),
      result(300, [move('Nf3', 150), move('d4', 150)]),
      result(100, [move('Nf3', 50), move('d4', 50)]),
      { currentYear: 2026 },
    );
    // Both moves sit at exactly 50% in every window: there is nothing to report.
    expect(radar.rows).toEqual([]);
  });

  it('does not invent a year for a source that reports none', () => {
    const radar = buildRadar(
      result(200, [move('Nf3', 100, { lastPlayedYear: 2026 }), move('d4', 100)]),
      result(100, [move('Nf3', 80), move('d4', 20)]),
      result(50, [move('Nf3', 45), move('d4', 5)]),
      { currentYear: 2026 },
    );
    expect(radar.rows.find((row) => row.san === 'Nf3')!.lastSeenYear).toBe(2026);
    expect(radar.rows.find((row) => row.san === 'd4')!.lastSeenYear).toBeUndefined();
  });
});
