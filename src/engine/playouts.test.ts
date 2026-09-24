import { describe, expect, it } from 'vitest';

import { cp, mate } from '@/chess/evaluation';
import { Position } from '@/chess/position';
import type { Fen, Uci } from '@/chess/types';

import {
  candidates,
  describePlayouts,
  playOut,
  type PlayoutOptions,
  type PlayoutSearchLine,
} from './playouts';

/*
  Scripted engines: the boundary (the search) is stubbed, the playout loop and
  Kingfisher's rules are real.
*/
const every = (fen: Fen): readonly PlayoutSearchLine[] =>
  Position.fromTrustedFen(fen)
    .legalMoves()
    .map((move) => ({ moves: [move.uci], score: cp(0) }));

const options = (overrides: Partial<PlayoutOptions> = {}): PlayoutOptions => ({
  playouts: 5,
  msPerMove: 50,
  multiPv: 3,
  marginCp: 30,
  maxPlies: 200,
  seed: 7,
  ...overrides,
});

const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1' as Fen;

describe('Monte Carlo playouts', () => {
  it('counts a won position as won, with the winner named', async () => {
    const engine = async (fen: Fen): Promise<readonly PlayoutSearchLine[]> =>
      fen === MATE_IN_ONE ? [{ moves: ['a1a8' as Uci], score: mate(1) }] : every(fen);
    const report = await playOut(MATE_IN_ONE, 'Scripted', options(), engine);
    expect(report).toMatchObject({ white: 5, black: 0, draws: 0, unfinished: 0, stopped: false });
    expect(report.playouts.every((playout) => playout.ending === 'checkmate')).toBe(true);
    expect(describePlayouts(report)).toBe(
      '5 playouts at 50 ms a move by Scripted: White won 5, drawn 0, Black won 0.',
    );
  });

  it('counts a game still going at the ply limit as unfinished, never as a result', async () => {
    const report = await playOut(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as Fen,
      'Random walker',
      options({ maxPlies: 6, playouts: 4 }),
      async (fen) => every(fen),
    );
    expect(report.unfinished).toBe(4);
    expect(report.white + report.black + report.draws).toBe(0);
    expect(report.playouts.every((playout) => playout.moves.length === 6)).toBe(true);
    expect(describePlayouts(report)).toContain('4 unfinished at 6 plies, not scored');
  });

  it('stops a shuffle by threefold repetition of the playout’s own positions', async () => {
    const shuffle: Record<string, Uci> = {
      g1f3: 'g8f6' as Uci,
    };
    void shuffle;
    const engine = async (fen: Fen): Promise<readonly PlayoutSearchLine[]> => {
      const position = Position.fromTrustedFen(fen);
      const knights = ['g1f3', 'f3g1', 'g8f6', 'f6g8'];
      const move = position.legalMoves().find((entry) => knights.includes(entry.uci));
      return [{ moves: [move!.uci], score: cp(0) }];
    };
    const report = await playOut(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as Fen,
      'Shuffler',
      options({ playouts: 1 }),
      engine,
    );
    expect(report.playouts[0]).toMatchObject({ ending: 'threefold-repetition' });
    expect(report.draws).toBe(1);
    expect(report.playouts[0]!.moves).toHaveLength(8);
  });

  it('draws among the lines within the margin, the same way for the same seed', async () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as Fen;
    const run = (seed: number) =>
      playOut(start, 'Walker', options({ maxPlies: 8, playouts: 3, seed }), async (fen) =>
        every(fen),
      );
    const first = await run(1);
    const again = await run(1);
    const other = await run(2);
    expect(again.playouts.map((p) => p.moves.join(' '))).toEqual(
      first.playouts.map((p) => p.moves.join(' ')),
    );
    expect(other.playouts.map((p) => p.moves.join(' '))).not.toEqual(
      first.playouts.map((p) => p.moves.join(' ')),
    );
    // Different playouts of one run differ: the draw is what makes them many games.
    expect(new Set(first.playouts.map((p) => p.moves.join(' '))).size).toBeGreaterThan(1);
  });

  it('keeps only moves within the margin, for the side to move', () => {
    const lines: PlayoutSearchLine[] = [
      { moves: ['e2e4' as Uci], score: cp(40) },
      { moves: ['d2d4' as Uci], score: cp(25) },
      { moves: ['g2g4' as Uci], score: cp(-80) },
    ];
    expect(candidates(lines, 'w', 20)).toEqual(['e2e4', 'd2d4']);
    // For Black, lower is better: -80 is best by a distance.
    expect(candidates(lines, 'b', 20)).toEqual(['g2g4']);
    // A forced mate outranks any centipawn score.
    expect(candidates([...lines, { moves: ['h2h4' as Uci], score: mate(3) }], 'w', 20)).toEqual([
      'h2h4',
    ]);
  });

  it('stops between moves when asked, and reports what it finished', async () => {
    const controller = new AbortController();
    let searched = 0;
    const report = await playOut(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as Fen,
      'Walker',
      options({ maxPlies: 4, playouts: 10 }),
      async (fen) => {
        searched += 1;
        if (searched === 10) controller.abort();
        return every(fen);
      },
      controller.signal,
    );
    expect(report.stopped).toBe(true);
    expect(report.playouts).toHaveLength(2);
    expect(describePlayouts(report)).toContain('Stopped after 2 of 10.');
  });

  it('refuses an engine move the rules do not allow', async () => {
    await expect(
      playOut(MATE_IN_ONE, 'Broken', options(), async () => [
        { moves: ['a1h8' as Uci], score: cp(0) },
      ]),
    ).rejects.toThrow(/not legal/);
  });
});
