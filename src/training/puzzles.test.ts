import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { Position } from '@/chess/position';
import type { Uci } from '@/chess/types';

import {
  answerPuzzle,
  choosePuzzle,
  puzzleBucket,
  puzzleFromRow,
  puzzleLine,
  solverRating,
  type Puzzle,
  type PuzzleRow,
} from './puzzles';

/* The four sample rows printed on database.lichess.org under "Puzzles". */
const SAMPLE: PuzzleRow[] = [
  [
    '00sHx',
    'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17',
    'e8d7 a2e6 d7d8 f7f8',
    1760,
    80,
    83,
    72,
    'mate mateIn2 middlegame short',
    'Italian_Game Italian_Game_Classical_Variation',
    'yyznGmXs/black#34',
  ],
  [
    '00sJ9',
    'r3r1k1/p4ppp/2p2n2/1p6/3P1qb1/2NQR3/PPB2PP1/R1B3K1 w - - 5 18',
    'e3g3 e8e1 g1h2 e1c1 a1c1 f4h6 h2g1 h6c1',
    2671,
    105,
    87,
    325,
    'advantage attraction fork middlegame sacrifice veryLong',
    'French_Defense French_Defense_Exchange_Variation',
    'gyFeQsOE#35',
  ],
];

const line = (row: PuzzleRow) => {
  const result = puzzleLine(puzzleFromRow(row));
  if (!result.ok) throw new Error(result.reason);
  return result.line;
};

describe('a puzzle replayed through the rules', () => {
  it('starts after the opponent’s move, with the solver to play', () => {
    const l = line(SAMPLE[0]!);
    expect(l.setup.uci).toBe('e8d7');
    expect(l.solver).toBe('w');
    expect(l.solution.map((move) => move.uci)).toEqual(['a2e6', 'd7d8', 'f7f8']);
  });

  it('accepts the solution, plays the reply, and ends on the last move', () => {
    const l = line(SAMPLE[0]!);
    const first = answerPuzzle(l, 0, l.start, 'a2e6');
    expect(first).toMatchObject({ kind: 'correct', solved: false });
    if (first.kind !== 'correct') throw new Error('expected correct');
    expect(first.reply?.uci).toBe('d7d8');
    const after = Position.fromTrustedFen(first.reply!.after);
    const last = answerPuzzle(l, 1, after, 'f7f8');
    expect(last).toMatchObject({ kind: 'correct', solved: true, reply: null });
    if (last.kind !== 'correct') throw new Error('expected correct');
    expect(after.after(last.move).isCheckmate()).toBe(true);
  });

  it('names the expected move when the answer is wrong, and refuses an illegal one', () => {
    const l = line(SAMPLE[1]!);
    const wrong = answerPuzzle(l, 0, l.start, 'h7h6');
    expect(wrong.kind).toBe('wrong');
    if (wrong.kind === 'wrong') expect(wrong.expected.uci).toBe('e8e1');
    expect(answerPuzzle(l, 0, l.start, 'a1a8').kind).toBe('illegal');
  });

  it('accepts any checkmate, as the publisher states', () => {
    // A constructed mate-in-one with two mating moves, Ra8# and Rb8#:
    // Black's king is boxed in on h8 by its own g7 and h7 pawns.
    const puzzle: Puzzle = {
      id: 'alt',
      fen: '7k/2p3pp/8/8/8/8/1R4PP/R5K1 b - - 0 1',
      moves: ['c7c6', 'a1a8'] as Uci[],
      rating: 900,
      deviation: 80,
      popularity: 90,
      plays: 1000,
      themes: ['mateIn1'],
      openings: [],
    };
    const result = puzzleLine(puzzle);
    if (!result.ok) throw new Error(result.reason);
    const alt = answerPuzzle(result.line, 0, result.line.start, 'b2b8');
    expect(alt).toMatchObject({ kind: 'correct', solved: true, alternativeMate: true });
  });

  it('refuses a row whose moves do not play', () => {
    const broken = puzzleFromRow([
      ...SAMPLE[0]!.slice(0, 2),
      'e8d7 a2a7',
      ...SAMPLE[0]!.slice(3),
    ] as unknown as PuzzleRow);
    expect(puzzleLine(broken).ok).toBe(false);
  });
});

describe('the shipped puzzle set', () => {
  it('a spread of the committed shards plays through the rules (puzzles:check replays all)', () => {
    const manifest = JSON.parse(readFileSync('public/data/puzzles/manifest.json', 'utf8')) as {
      bands: { file: string; band: number; count: number }[];
      licence: string;
    };
    expect(manifest.licence).toBe('CC0-1.0');
    let total = 0;
    for (const band of manifest.bands) {
      const rows = JSON.parse(
        readFileSync(`public/data/puzzles/${band.file}`, 'utf8'),
      ) as PuzzleRow[];
      expect(rows).toHaveLength(band.count);
      for (const [index, row] of rows.entries()) {
        if (index % 25 !== 0) continue;
        const puzzle = puzzleFromRow(row);
        expect(puzzleBucket(puzzle.rating)).toBe(band.band);
        const result = puzzleLine(puzzle);
        if (!result.ok) throw new Error(result.reason);
        total += 1;
      }
    }
    expect(total).toBeGreaterThan(900);
  }, 60_000);
});

describe('the solver rating', () => {
  it('starts provisional and settles with attempts', () => {
    expect(solverRating([])).toMatchObject({ rating: 1500, attempts: 0, provisional: true });
    const attempts = Array.from({ length: 40 }, (_, i) => ({
      puzzleRating: 1500,
      puzzleDeviation: 75,
      solved: i % 2 === 0,
      attemptedAt: i,
    }));
    const rating = solverRating(attempts);
    expect(rating.attempts).toBe(40);
    expect(rating.solved).toBe(20);
    expect(rating.provisional).toBe(false);
    expect(Math.abs(rating.rating - 1500)).toBeLessThan(60);
  });

  it('replays attempts in time order, whatever order they are stored in', () => {
    const attempts = [
      { puzzleRating: 1200, puzzleDeviation: 80, solved: false, attemptedAt: 2 },
      { puzzleRating: 1800, puzzleDeviation: 80, solved: true, attemptedAt: 1 },
    ];
    expect(solverRating(attempts)).toEqual(solverRating([...attempts].reverse()));
  });
});

describe('choosing the next puzzle', () => {
  const pool = [800, 1000, 1200, 1400, 1600].map((rating) =>
    puzzleFromRow([
      `p${rating}`,
      '8/8/8/8/8/8/8/8 w - - 0 1',
      'a1a2 a2a3',
      rating,
      80,
      90,
      500,
      rating === 1200 ? 'fork' : 'pin',
      '',
      '',
    ]),
  );
  it('prefers the nearest unattempted puzzle and honours a theme', () => {
    const near = choosePuzzle(pool, { target: 1190, attempted: new Set(), seed: 0 });
    expect(near?.id).toBe('p1200');
    const skip = choosePuzzle(pool, { target: 1190, attempted: new Set(['p1200']), seed: 0 });
    expect(skip?.id).not.toBe('p1200');
    expect(
      choosePuzzle(pool, { target: 1600, attempted: new Set(), theme: 'fork', seed: 3 })?.id,
    ).toBe('p1200');
    expect(
      choosePuzzle(pool, { target: 1600, attempted: new Set(['p1200']), theme: 'fork', seed: 0 }),
    ).toBeNull();
  });
});
