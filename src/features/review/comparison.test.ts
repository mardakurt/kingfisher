import { describe, expect, it } from 'vitest';

import { cp, mate } from '@/chess/evaluation';
import { asSan, asUci } from '@/chess/types';
import {
  bandOfScore,
  compareCandidates,
  compareEstimate,
  describeEstimateComparison,
} from './comparison';

describe('bands', () => {
  it('places a score in the band a player would read off the bar', () => {
    expect(bandOfScore(cp(0))).toBe('equal');
    expect(bandOfScore(cp(45))).toBe('equal');
    expect(bandOfScore(cp(-50))).toBe('equal');
    expect(bandOfScore(cp(80))).toBe('slightly-white');
    expect(bandOfScore(cp(-120))).toBe('slightly-black');
    expect(bandOfScore(cp(400))).toBe('clearly-white');
    expect(bandOfScore(cp(-400))).toBe('clearly-black');
  });

  it('treats a mate as clearly decisive for whoever is delivering it', () => {
    expect(bandOfScore(mate(4))).toBe('clearly-white');
    expect(bandOfScore(mate(-2))).toBe('clearly-black');
  });
});

describe('comparing an estimate with engine evidence', () => {
  it('reports the distance without judging either opinion', () => {
    const comparison = compareEstimate({ band: 'equal', pawns: 0 }, cp(120));
    expect(comparison).not.toBeNull();
    expect(comparison?.yourBand).toBe('equal');
    expect(comparison?.engineBand).toBe('slightly-white');
    expect(comparison?.bandDistance).toBe(1);
    expect(comparison?.pawnDifference).toBe(1.2);
    expect(comparison?.engineScore).toBe('+1.20');
  });

  it('agrees loudly when the two readings land in one band', () => {
    const comparison = compareEstimate({ band: 'slightly-white' }, cp(90));
    expect(comparison?.bandDistance).toBe(0);
    expect(describeEstimateComparison(comparison!)).toContain('same band');
  });

  it('measures the extreme disagreement as four bands', () => {
    const comparison = compareEstimate({ band: 'clearly-white' }, cp(-500));
    expect(comparison?.bandDistance).toBe(4);
    expect(describeEstimateComparison(comparison!)).toContain('4 bands apart');
  });

  it('gives no pawn difference when the player only chose a band', () => {
    const comparison = compareEstimate({ band: 'equal' }, cp(30));
    expect(comparison?.pawnDifference).toBeUndefined();
    expect(comparison?.chanceDifference).toBeUndefined();
  });

  it('reports the difference in practical chances, not only in pawns', () => {
    const nearEqual = compareEstimate({ band: 'equal', pawns: 0.2 }, cp(50));
    const nearWinning = compareEstimate({ band: 'clearly-white', pawns: 6 }, cp(630));
    // The same 0.3-pawn gap matters far more near equality than near a win.
    expect(nearEqual?.chanceDifference ?? 0).toBeGreaterThan(nearWinning?.chanceDifference ?? 1);
  });

  it('says nothing at all without both opinions', () => {
    expect(compareEstimate(undefined, cp(0))).toBeNull();
    expect(compareEstimate({ band: 'equal' }, undefined)).toBeNull();
  });
});

describe('comparing candidates with engine lines', () => {
  const lines = [
    { rank: 1, moves: [asUci('d4d5')], score: cp(80) },
    { rank: 2, moves: [asUci('c4c5')], score: cp(35) },
    { rank: 3, moves: [asUci('g2g4')], score: cp(-40) },
  ];

  it('places each candidate at its engine rank and distance behind the first line', () => {
    const report = compareCandidates(
      [
        { uci: asUci('c4c5'), san: asSan('c5'), note: 'my choice' },
        { uci: asUci('d4d5'), san: asSan('d5') },
      ],
      lines,
      asUci('c4c5'),
    );

    expect(report.rows[0]).toMatchObject({
      san: 'c5',
      engineRank: 2,
      behindBestCp: 45,
      chosen: true,
      note: 'my choice',
    });
    expect(report.rows[1]).toMatchObject({ san: 'd5', engineRank: 1, behindBestCp: 0 });
    expect(report.bestScore).toBe('+0.80');
    expect(report.multiPv).toBe(3);
  });

  it('leaves a move the engine never offered without a number', () => {
    const report = compareCandidates([{ uci: asUci('h2h4'), san: asSan('h4') }], lines);
    expect(report.rows[0]?.engineRank).toBeUndefined();
    expect(report.rows[0]?.behindBestCp).toBeUndefined();
    expect(report.rows[0]?.engineScore).toBeUndefined();
  });

  it('names the lines the player did not consider, so the gap reads both ways', () => {
    const report = compareCandidates([{ uci: asUci('d4d5'), san: asSan('d5') }], lines);
    expect(report.unconsidered.map((line) => line.rank)).toEqual([2, 3]);
  });

  it('copes with no engine evidence at all', () => {
    const report = compareCandidates([{ uci: asUci('d4d5'), san: asSan('d5') }], []);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.engineRank).toBeUndefined();
    expect(report.bestScore).toBeUndefined();
    expect(report.unconsidered).toEqual([]);
  });

  it('does not double-count a move the engine returned twice', () => {
    const report = compareCandidates(
      [{ uci: asUci('d4d5'), san: asSan('d5') }],
      [
        { rank: 1, moves: [asUci('d4d5')], score: cp(80) },
        { rank: 2, moves: [asUci('d4d5'), asUci('e7e5')], score: cp(70) },
      ],
    );
    expect(report.rows[0]?.engineRank).toBe(1);
    expect(report.unconsidered).toEqual([]);
  });
});
