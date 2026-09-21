import { describe, expect, it } from 'vitest';

import { parsePgn } from '@/chess/pgn/parse';
import type { GameTree } from '@/chess/tree/types';

import { clockSummary, formatThink } from './clock';

const tree = (pgn: string): GameTree => {
  const { games } = parsePgn(pgn);
  const game = games[0];
  if (!game) throw new Error('no game');
  return game.tree;
};

describe('clockSummary', () => {
  it('reads think times from clock readings and the control, per side', () => {
    const summary = clockSummary(
      tree(`[TimeControl "600+5"]

1. e4 {[%clk 0:09:58]} e5 {[%clk 0:09:50]} 2. Nf3 {[%clk 0:09:33]} Nc6 {[%clk 0:09:52]} *`),
    );
    expect(summary.available).toBe(true);
    expect(summary.control).toEqual({ initialSeconds: 600, incrementSeconds: 5 });
    // White: 600+5−598 = 7 s, then 598+5−573 = 30 s.
    expect(summary.w.moves).toBe(2);
    expect(summary.w.longest.map((m) => [m.san, m.seconds])).toEqual([
      ['Nf3', 30],
      ['e4', 7],
    ]);
    expect(summary.w.totalThinkSeconds).toBe(37);
    // Black: 600+5−590 = 15 s, then 590+5−592 = 3 s.
    expect(summary.b.longest.map((m) => [m.san, m.seconds])).toEqual([
      ['e5', 15],
      ['Nc6', 3],
    ]);
    expect(summary.b.finalRemaining).toBe(592);
    expect(summary.w.timeTroubleFrom).toBeNull();
  });

  it('prefers an explicit [%emt] and skips the first move when the control is unknown', () => {
    const summary = clockSummary(
      tree(`1. e4 {[%emt 0:00:12][%clk 1:29:48]} e5 {[%clk 1:29:30]} 2. Nf3 {[%clk 1:29:00]} *`),
    );
    expect(summary.control).toBeNull();
    expect(summary.w.longest.map((m) => [m.san, m.seconds])).toEqual([
      ['Nf3', 48],
      ['e4', 12],
    ]);
    // Black's first move has no prior reading and no control to start from.
    expect(summary.b.moves).toBe(0);
    expect(summary.b.finalRemaining).toBe(5370);
  });

  it('marks where a side fell into time trouble under a classical control', () => {
    const pgn = `[TimeControl "40/7200:3600"]

${shuffle(32)} *`;
    const summary = clockSummary(tree(pgn));
    expect(summary.control?.periodMoves).toBe(40);
    // White spends 200 s a move: at a third of 7200 after move 24 (7200−4800 = 2400), which the rule counts.
    expect(summary.w.timeTroubleFrom?.moveNumber).toBe(24);
    expect(summary.w.timeTroubleFrom?.remaining).toBe(2400);
    expect(summary.b.timeTroubleFrom).toBeNull();
  });

  it('reports no facts for a game without clock commands', () => {
    const summary = clockSummary(tree('1. e4 e5 2. Nf3 Nc6 *'));
    expect(summary.available).toBe(false);
    expect(summary.w.moves).toBe(0);
    expect(summary.w.longest).toEqual([]);
  });
});

describe('formatThink', () => {
  it('formats seconds as m:ss and hours when needed', () => {
    expect(formatThink(7)).toBe('0:07');
    expect(formatThink(252)).toBe('4:12');
    expect(formatThink(3725)).toBe('1:02:05');
  });
});

const clock = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** A legal 32-move shuffle (knights out and back) with clock readings. */
function shuffle(moves: number): string {
  const cycle = ['Nf3', 'Nc6', 'Ng1', 'Nb8'];
  const out: string[] = [];
  let white = 7200;
  let black = 7200;
  for (let move = 1; move <= moves; move += 1) {
    white -= 200;
    black -= 20;
    const w = cycle[((move - 1) * 2) % 4];
    const b = cycle[((move - 1) * 2 + 1) % 4];
    out.push(`${move}. ${w} {[%clk ${clock(white)}]} ${b} {[%clk ${clock(black)}]}`);
  }
  return out.join(' ');
}
