/**
 * Engine best-move arrows.
 *
 * The function under test is a pure projection of the engine store: given
 * one position and the two engine slots, what arrows should the board show?
 * Every chess-correctness invariant for the board lives in this file.
 *
 * The invariants under test are the ones Phase 42 PART T-AK calls out:
 *
 *   - a stale analysis must not produce an arrow on the new position;
 *   - one engine yields one arrow, two engines yield two;
 *   - two engines agreeing on the same move are flagged as such;
 *   - a stopped engine produces no arrow;
 *   - the preference is honoured.
 */

import { describe, expect, it } from 'vitest';

import type { Uci } from '@/chess/types';
import { START_FEN } from '@/chess/fen';

import { computeEngineArrows, uciToArrow, type EngineArrowInput } from './engine-arrows';

const EMPTY_SLOT: EngineArrowInput['primary'] = {
  analysis: null,
  analysedFen: null,
  identity: null,
};

const analysis = (bestMove: string | undefined): EngineArrowInput['primary']['analysis'] => ({
  bestMove: (bestMove as Uci | undefined) ?? undefined,
  lines: bestMove ? [{ moves: [bestMove as Uci] }] : [],
});

const PRIMARY_E4: EngineArrowInput['primary'] = {
  analysis: analysis('e2e4'),
  analysedFen: START_FEN,
  identity: { name: 'Stockfish' },
};

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

describe('engine best-move arrows', () => {
  it('returns nothing when the preference is off', () => {
    const arrows = computeEngineArrows(
      { primary: PRIMARY_E4, secondary: EMPTY_SLOT, comparing: false },
      START_FEN,
      false,
    );
    expect(arrows).toEqual([]);
  });

  it('returns nothing for a missing current position', () => {
    const arrows = computeEngineArrows(
      { primary: PRIMARY_E4, secondary: EMPTY_SLOT, comparing: false },
      null,
      true,
    );
    expect(arrows).toEqual([]);
  });

  it('returns one engine-a arrow when only the primary has analysed the current position', () => {
    const arrows = computeEngineArrows(
      { primary: PRIMARY_E4, secondary: EMPTY_SLOT, comparing: false },
      START_FEN,
      true,
    );
    expect(arrows).toEqual([
      {
        kind: 'arrow',
        identity: 'engine-a',
        engineName: 'Stockfish',
        from: 'e2',
        to: 'e4',
      },
    ]);
  });

  it('does NOT render an arrow when the analysis belongs to a different position (stale protection)', () => {
    const arrows = computeEngineArrows(
      {
        primary: {
          analysis: analysis('f3g5'),
          analysedFen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
          identity: { name: 'Stockfish' },
        },
        secondary: EMPTY_SLOT,
        comparing: false,
      },
      START_FEN,
      true,
    );
    expect(arrows).toEqual([]);
  });

  it('falls back to the first PV move when bestMove has not been reported yet', () => {
    const arrows = computeEngineArrows(
      {
        primary: {
          analysis: {
            bestMove: undefined,
            lines: [{ moves: ['d2d4' as Uci] }],
          },
          analysedFen: START_FEN,
          identity: { name: 'Stockfish' },
        },
        secondary: EMPTY_SLOT,
        comparing: false,
      },
      START_FEN,
      true,
    );
    expect(arrows[0]?.from).toBe('d2');
    expect(arrows[0]?.to).toBe('d4');
  });

  it('renders two distinguishable arrows when comparing two engines that disagree', () => {
    const arrows = computeEngineArrows(
      {
        primary: {
          analysis: analysis('e7e5'),
          analysedFen: AFTER_E4,
          identity: { name: 'Stockfish' },
        },
        secondary: {
          analysis: analysis('c7c5'),
          analysedFen: AFTER_E4,
          identity: { name: 'Lc0' },
        },
        comparing: true,
      },
      AFTER_E4,
      true,
    );
    expect(arrows).toHaveLength(2);
    const a = arrows.find((arrow) => arrow.identity === 'engine-a');
    const b = arrows.find((arrow) => arrow.identity === 'engine-b');
    expect(a?.engineName).toBe('Stockfish');
    expect(a?.from).toBe('e7');
    expect(a?.to).toBe('e5');
    expect(a?.agreedWith).toBeUndefined();
    expect(b?.engineName).toBe('Lc0');
    expect(b?.from).toBe('c7');
    expect(b?.to).toBe('c5');
    expect(b?.agreedWith).toBeUndefined();
  });

  it('flags agreement when both engines recommend the same move', () => {
    const arrows = computeEngineArrows(
      {
        primary: {
          analysis: analysis('e7e5'),
          analysedFen: AFTER_E4,
          identity: { name: 'Stockfish' },
        },
        secondary: {
          analysis: analysis('e7e5'),
          analysedFen: AFTER_E4,
          identity: { name: 'Lc0' },
        },
        comparing: true,
      },
      AFTER_E4,
      true,
    );
    expect(arrows).toHaveLength(2);
    expect(arrows[0]?.agreedWith).toBe('engine-b');
    expect(arrows[1]?.agreedWith).toBe('engine-a');
  });

  it('drops the secondary arrow when comparing is off', () => {
    const arrows = computeEngineArrows(
      {
        primary: {
          analysis: analysis('e7e5'),
          analysedFen: AFTER_E4,
          identity: { name: 'Stockfish' },
        },
        secondary: {
          analysis: analysis('c7c5'),
          analysedFen: AFTER_E4,
          identity: { name: 'Lc0' },
        },
        comparing: false,
      },
      AFTER_E4,
      true,
    );
    expect(arrows).toHaveLength(1);
    expect(arrows[0]?.identity).toBe('engine-a');
  });

  it('drops the secondary arrow when its slot has no analysis yet', () => {
    const arrows = computeEngineArrows(
      {
        primary: {
          analysis: analysis('e7e5'),
          analysedFen: AFTER_E4,
          identity: { name: 'Stockfish' },
        },
        secondary: EMPTY_SLOT,
        comparing: true,
      },
      AFTER_E4,
      true,
    );
    expect(arrows).toHaveLength(1);
    expect(arrows[0]?.identity).toBe('engine-a');
  });

  it('treats the king move as the castling arrow', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const arrows = computeEngineArrows(
      {
        primary: {
          analysis: analysis('e1g1'),
          analysedFen: fen,
          identity: { name: 'Stockfish' },
        },
        secondary: EMPTY_SLOT,
        comparing: false,
      },
      fen,
      true,
    );
    expect(arrows[0]?.from).toBe('e1');
    expect(arrows[0]?.to).toBe('g1');
  });

  it('ignores garbage UCI strings rather than producing malformed arrows', () => {
    const arrows = computeEngineArrows(
      {
        primary: {
          analysis: {
            bestMove: 'whatever' as unknown as Uci | undefined,
            lines: [],
          },
          analysedFen: START_FEN,
          identity: { name: 'Stockfish' },
        },
        secondary: EMPTY_SLOT,
        comparing: false,
      },
      START_FEN,
      true,
    );
    expect(arrows).toEqual([]);
  });
});

describe('uciToArrow', () => {
  it('parses a normal move', () => {
    expect(uciToArrow('e2e4' as Uci)).toEqual({ from: 'e2', to: 'e4' });
  });

  it('parses a promotion by ignoring the suffix', () => {
    expect(uciToArrow('e7e8q' as Uci)).toEqual({ from: 'e7', to: 'e8' });
  });

  it('parses a king-side castle as e1 → g1', () => {
    expect(uciToArrow('e1g1' as Uci)).toEqual({ from: 'e1', to: 'g1' });
  });

  it('parses a queen-side castle as e1 → c1', () => {
    expect(uciToArrow('e1c1' as Uci)).toEqual({ from: 'e1', to: 'c1' });
  });

  it('rejects out-of-board squares', () => {
    expect(uciToArrow('i9j0' as Uci)).toBeNull();
  });

  it('rejects too-short strings', () => {
    expect(uciToArrow('e2' as Uci)).toBeNull();
  });
});
