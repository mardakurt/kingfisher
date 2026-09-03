import { describe, expect, it } from 'vitest';

import { START_FEN, positionKey } from '@/chess/fen';
import { asUci } from '@/chess/types';
import type { DecisionRecord, StoredEngineEvidenceRecord } from '@/persistence/domain';
import {
  candidateCoverage,
  evaluationCalibration,
  gapOf,
  matchesJournalFilter,
  themesBehindLargestGaps,
  type JournalEntry,
} from './analytics';

let counter = 0;

function entry(options: {
  /** The player's estimate in pawns; omitted means they gave no number. */
  estimate?: number;
  /** The engine's score in pawns; omitted means no evidence was stored. */
  engine?: number;
  candidates?: readonly string[];
  /** The engine's eventual first move, in UCI. */
  top?: string;
  themes?: readonly string[];
  sideToMove?: 'w' | 'b';
  createdAt?: number;
}): JournalEntry {
  counter += 1;
  const decision = {
    id: `d${counter}`,
    positionKey: positionKey(START_FEN),
    fen: START_FEN,
    sideToMove: options.sideToMove ?? 'w',
    candidates: (options.candidates ?? []).map((uci) => ({
      uci: asUci(uci),
      san: uci,
    })),
    ...(options.estimate !== undefined
      ? { estimate: { band: 'equal' as const, pawns: options.estimate } }
      : {}),
    themes: [...(options.themes ?? [])],
    createdAt: options.createdAt ?? 1_000,
    updatedAt: options.createdAt ?? 1_000,
    revision: 0,
  } as unknown as DecisionRecord;

  if (options.engine === undefined) return { decision };
  const evidence = {
    id: `e${counter}`,
    score: { kind: 'cp', cp: Math.round(options.engine * 100) },
    pv: options.top ? [asUci(options.top)] : [],
  } as unknown as StoredEngineEvidenceRecord;
  return { decision, evidence };
}

describe('evaluation calibration', () => {
  it('buckets the distance between the estimate and the evidence', () => {
    const entries = [
      entry({ estimate: 0.2, engine: 0.3 }), // 0.10 → within 0.30
      entry({ estimate: 0.0, engine: 0.3 }), // 0.30 → within 0.30, on the edge
      entry({ estimate: 0.1, engine: 0.7 }), // 0.60 → 0.31–0.80
      entry({ estimate: 1.5, engine: 0.4 }), // 1.10 → 0.81–1.50
      entry({ estimate: -0.2, engine: 2.5 }), // 2.70 → more than 1.50
    ];

    const report = evaluationCalibration(entries);

    expect(report.total).toBe(5);
    expect(report.compared).toBe(5);
    const counts = Object.fromEntries(report.buckets.map((bucket) => [bucket.id, bucket.count]));
    expect(counts).toEqual({
      'within-030': 2,
      '031-080': 1,
      '081-150': 1,
      'over-150': 1,
    });
    // Every bucket opens: a statistic that cannot be drilled into is decoration.
    for (const bucket of report.buckets) {
      expect(bucket.decisionIds).toHaveLength(bucket.count);
    }
  });

  it('counts a decision it cannot compare rather than dropping it silently', () => {
    const report = evaluationCalibration([
      entry({ estimate: 0.2, engine: 0.3 }),
      entry({ estimate: 0.2 }), // no evidence stored
      entry({ engine: 0.3 }), // no number given
    ]);

    expect(report.total).toBe(3);
    // Only one could be compared, and the report says so rather than reporting
    // 100% agreement over a set of one.
    expect(report.compared).toBe(1);
  });

  it('reports the signed mean so a systematic lean is visible', () => {
    // Consistently more optimistic for White than the evidence.
    const report = evaluationCalibration([
      entry({ estimate: 0.5, engine: 0.0 }),
      entry({ estimate: 1.0, engine: 0.4 }),
      entry({ estimate: 0.3, engine: -0.1 }),
    ]);
    expect(report.meanSignedPawns).toBeGreaterThan(0);

    // Nothing to average is absent, not zero.
    expect(evaluationCalibration([entry({ estimate: 0.5 })]).meanSignedPawns).toBeUndefined();
  });

  it('narrows on every filter it is given', () => {
    const entries = [
      entry({ estimate: 0.2, engine: 0.3, themes: ['calculation'], sideToMove: 'w' }),
      entry({ estimate: 0.2, engine: 0.3, themes: ['trade-decision'], sideToMove: 'b' }),
    ];

    expect(evaluationCalibration(entries, {}).total).toBe(2);
    expect(evaluationCalibration(entries, { themes: ['calculation'] }).total).toBe(1);
    expect(evaluationCalibration(entries, { sideToMove: 'b' }).total).toBe(1);
    expect(evaluationCalibration(entries, { from: 2_000 }).total).toBe(0);
  });
});

describe('candidate coverage', () => {
  it('counts how often the engine top move was on the list, and names both sets', () => {
    const entries = [
      entry({ candidates: ['e2e4', 'd2d4'], engine: 0.2, top: 'e2e4' }),
      entry({ candidates: ['e2e4', 'd2d4'], engine: 0.2, top: 'g1f3' }),
      entry({ candidates: ['c2c4'], engine: 0.2, top: 'c2c4' }),
    ];

    const report = candidateCoverage(entries);

    expect(report.considered).toBe(2);
    expect(report.compared).toBe(3);
    expect(report.hitIds).toHaveLength(2);
    expect(report.missedIds).toHaveLength(1);
    // A single-candidate decision is worth surfacing on its own terms.
    expect(report.thinCandidateIds).toHaveLength(1);
    expect(report.averageCandidates).toBeCloseTo(5 / 3, 2);
  });

  it('does not count a decision the engine never answered', () => {
    const report = candidateCoverage([
      entry({ candidates: ['e2e4'], engine: 0.2, top: 'e2e4' }),
      entry({ candidates: ['e2e4'] }), // no evidence at all
      entry({ candidates: ['e2e4'], engine: 0.2 }), // evidence, but no PV
    ]);

    expect(report.compared).toBe(1);
    expect(report.considered).toBe(1);
  });
});

describe('where divergence clusters', () => {
  it('joins the largest gaps to the themes the player assigned by hand', () => {
    const entries = [
      entry({ estimate: 0.0, engine: 3.0, themes: ['trade-decision'] }),
      entry({ estimate: 0.0, engine: 2.5, themes: ['trade-decision', 'calculation'] }),
      entry({ estimate: 0.0, engine: 2.0, themes: ['trade-decision'] }),
      entry({ estimate: 0.0, engine: 0.05, themes: ['king-safety'] }),
    ];

    const report = themesBehindLargestGaps(entries, { take: 3 });

    expect(report.examined).toBe(3);
    expect(report.themes[0]).toMatchObject({
      theme: 'trade-decision',
      label: 'Trade decision',
      count: 3,
    });
    // The small-gap decision is outside the three examined, so its theme is
    // absent rather than counted at zero.
    expect(report.themes.some((theme) => theme.theme === 'king-safety')).toBe(false);
    expect(report.themes[0]!.decisionIds).toHaveLength(3);
  });

  it('treats an unquantified estimate as unmeasurable, never as agreement', () => {
    expect(gapOf(entry({ engine: 1.0 }))).toBeNull();
    expect(gapOf(entry({ estimate: 1.0 }))).toBeNull();
    expect(gapOf(entry({ estimate: 0.4, engine: 1.0 }))).toBeCloseTo(0.6, 5);

    // A decision with no number cannot enter the "largest gaps" list at all,
    // which is what stops silence from looking like a perfect estimate.
    const report = themesBehindLargestGaps([entry({ engine: 5, themes: ['calculation'] })]);
    expect(report.examined).toBe(0);
    expect(report.themes).toEqual([]);
  });
});

describe('the journal filter', () => {
  it('matches everything when empty and narrows on each present field', () => {
    const one = entry({ themes: ['calculation'], sideToMove: 'w', createdAt: 5_000 });
    expect(matchesJournalFilter(one, {})).toBe(true);
    expect(matchesJournalFilter(one, { themes: ['calculation'] })).toBe(true);
    expect(matchesJournalFilter(one, { themes: ['king-safety'] })).toBe(false);
    expect(matchesJournalFilter(one, { sideToMove: 'w' })).toBe(true);
    expect(matchesJournalFilter(one, { sideToMove: 'b' })).toBe(false);
    expect(matchesJournalFilter(one, { from: 1_000, to: 9_000 })).toBe(true);
    expect(matchesJournalFilter(one, { from: 6_000 })).toBe(false);
  });
});
