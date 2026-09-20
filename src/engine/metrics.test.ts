import { describe, expect, it } from 'vitest';

import { cp, mate } from '@/chess/evaluation';
import { START_FEN } from '@/chess/fen';
import { asUci } from '@/chess/types';
import type { EngineAnalysis } from './types';
import { depthSamples, describeDepthSample, describeGap, engineSessionMetrics } from './metrics';

const snapshot = (
  depth: number,
  top: string,
  firstCp: number,
  secondCp: number,
): EngineAnalysis => ({
  fen: START_FEN,
  depth,
  seldepth: depth,
  nodes: depth * 100,
  nps: 1_000,
  timeMs: depth * 10,
  lines: [
    { rank: 1, score: cp(firstCp), depth, moves: [asUci(top)] },
    { rank: 2, score: cp(secondCp), depth, moves: [asUci('d2d4')] },
  ],
  complete: false,
});

describe('engine session metrics', () => {
  it('counts stability by distinct depth, not update frequency', () => {
    const metrics = engineSessionMetrics([
      snapshot(10, 'e2e4', 20, 5),
      snapshot(10, 'e2e4', 22, 5),
      snapshot(11, 'g1f3', 10, 4),
      snapshot(12, 'g1f3', 15, 8),
    ]);
    expect(metrics.topMoveStableDepths).toBe(2);
    expect(metrics.topMoveChanges).toBe(1);
    expect(metrics.scoreSwingCp).toBe(12);
    expect(metrics.multiPvGap).toEqual({ kind: 'cp', centipawns: 7 });
    expect(metrics.nearEqualCandidates).toBe(2);
  });

  it('reports zeroes without inventing missing candidate separation', () => {
    expect(engineSessionMetrics([])).toEqual({
      topMoveStableDepths: 0,
      topMoveChanges: 0,
      scoreSwingCp: 0,
      nearEqualCandidates: 0,
    });
  });
});

describe('mate scores in the MultiPV gap', () => {
  const withScores = (
    top: EngineAnalysis['lines'][number]['score'],
    second: EngineAnalysis['lines'][number]['score'],
  ): EngineAnalysis => ({
    fen: START_FEN,
    depth: 20,
    seldepth: 24,
    nodes: 1_000,
    nps: 1_000,
    timeMs: 100,
    lines: [
      { rank: 1, score: top, depth: 20, moves: [asUci('e2e4')] },
      { rank: 2, score: second, depth: 20, moves: [asUci('d2d4')] },
    ],
    complete: false,
  });

  it('refuses to subtract a mate from an evaluation', () => {
    const metrics = engineSessionMetrics([withScores(mate(3), cp(200))]);
    expect(metrics.multiPvGap).toEqual({ kind: 'mate-vs-eval' });
    expect(describeGap(metrics.multiPvGap!)).toBe('mate vs evaluation');
  });

  it('compares two mates by how much faster the first one is', () => {
    const metrics = engineSessionMetrics([withScores(mate(3), mate(7))]);
    expect(metrics.multiPvGap).toEqual({ kind: 'mate-vs-mate', moves: 4 });
    expect(describeGap(metrics.multiPvGap!)).toBe('4 moves faster');
  });

  it('does not count a mate line as a near-equal candidate', () => {
    expect(engineSessionMetrics([withScores(mate(2), cp(0))]).nearEqualCandidates).toBe(0);
    expect(engineSessionMetrics([withScores(cp(10), cp(20))]).nearEqualCandidates).toBe(2);
  });
});

describe('depthSamples', () => {
  const at = (depth: number, cp: number, move: string): EngineAnalysis => ({
    fen: START_FEN,
    depth,
    seldepth: depth,
    nodes: depth * 1000,
    nps: 1000,
    timeMs: depth * 10,
    lines: [{ rank: 1, score: { kind: 'cp', cp }, depth, moves: [asUci(move)] }],
    complete: false,
  });

  it('keeps one sample per depth, in depth order, and marks where the top move changed', () => {
    const samples = depthSamples([
      at(3, 20, 'e2e4'),
      at(2, 10, 'd2d4'),
      at(3, 25, 'e2e4'),
      at(4, -5, 'g1f3'),
    ]);
    expect(samples.map((sample) => [sample.depth, sample.cp, sample.changed])).toEqual([
      [2, 10, false],
      // Depth 3 was reported twice; the later reading wins, and its move is
      // not the one depth 2 preferred.
      [3, 25, true],
      [4, -5, true],
    ]);
  });

  it('reads as a tooltip line', () => {
    const [sample] = depthSamples([at(18, 40, 'g1f3')]);
    expect(describeDepthSample(sample!)).toBe('d18 +0.4 g1f3');
  });
});
