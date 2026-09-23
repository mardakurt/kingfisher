import { describe, expect, it } from 'vitest';

import {
  materialMatches,
  materialOf,
  parseMaterialQuery,
  type MaterialQuery,
} from './material-query';

const query = (text: string): MaterialQuery => {
  const parsed = parseMaterialQuery(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.query;
};

// White rook and three pawns against Black bishop and two pawns.
const R_V_B = '8/5k2/1p4p1/8/2b5/8/1P3PP1/3R2K1 w - - 0 40';
// The same material with the colours swapped.
const B_V_R = '3r2k1/1p3pp1/8/2B5/8/1P4P1/5K2/8 b - - 0 40';
// Rook against rook.
const R_V_R = '8/5k2/6p1/3r4/8/8/5PP1/3R2K1 w - - 0 40';

describe('parseMaterialQuery', () => {
  it('reads the notations books use', () => {
    expect(query('R v B').label).toBe('R v B');
    expect(query('Q vs RR').label).toBe('Q v RR');
    expect(query('KRB versus KR').label).toBe('RB v R');
    expect(query('r against n').label).toBe('R v N');
    expect(query('RPP v R').label).toBe('RPP v R');
    expect(query('R v K').label).toBe('R v K');
  });

  it('turns pawns on only when a pawn is named', () => {
    expect(query('R v B').pawns).toBe(false);
    expect(query('RP v R').pawns).toBe(true);
  });

  it('names what it could not read', () => {
    const bad = parseMaterialQuery('R v X');
    expect(bad).toEqual({ ok: false, error: '"X" is not a piece. Use K, Q, R, B, N and P.' });
    expect(parseMaterialQuery('RB').ok).toBe(false);
    expect(parseMaterialQuery('R v ').ok).toBe(false);
    expect(parseMaterialQuery('').ok).toBe(false);
  });
});

describe('materialOf', () => {
  it('counts both sides from the placement field', () => {
    expect(materialOf(R_V_B)).toEqual({
      w: { q: 0, r: 1, b: 0, n: 0, p: 3 },
      b: { q: 0, r: 0, b: 1, n: 0, p: 2 },
    });
  });
});

describe('materialMatches', () => {
  it('matches either colour holding the first side, unless one is fixed', () => {
    expect(materialMatches(R_V_B, query('R v B'))).toBe(true);
    expect(materialMatches(B_V_R, query('R v B'))).toBe(true);
    expect(materialMatches(R_V_B, query('R v B'), 'w')).toBe(true);
    expect(materialMatches(B_V_R, query('R v B'), 'w')).toBe(false);
    expect(materialMatches(B_V_R, query('R v B'), 'b')).toBe(true);
  });

  it('ignores pawns unless named, and then counts them exactly', () => {
    expect(materialMatches(R_V_B, query('R v B'))).toBe(true);
    expect(materialMatches(R_V_B, query('RPPP v BPP'))).toBe(true);
    expect(materialMatches(R_V_B, query('RPP v BPP'))).toBe(false);
  });

  it('does not confuse equal material with the query', () => {
    expect(materialMatches(R_V_R, query('R v B'))).toBe(false);
    expect(materialMatches(R_V_R, query('R v R'))).toBe(true);
    expect(materialMatches(R_V_B, query('R v R'))).toBe(false);
  });
});
