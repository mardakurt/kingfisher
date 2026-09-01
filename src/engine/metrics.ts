import { scoreToCentipawns, type Score } from '@/chess/evaluation';
import type { EngineAnalysis } from './types';

/**
 * What separates the top two lines.
 *
 * A centipawn gap is only meaningful when both lines are centipawn scores.
 * Mate scores clamp to a fixed value, so subtracting one from an evaluation
 * produces a number that looks precise and means nothing — "gap 8.00" between
 * mate in three and +2.00 is not a gap, it is a change of subject.
 */
export type MultiPvGap =
  | { readonly kind: 'cp'; readonly centipawns: number }
  | { readonly kind: 'mate-vs-mate'; readonly moves: number }
  | { readonly kind: 'mate-vs-eval' };

export interface EngineSessionMetrics {
  readonly topMoveStableDepths: number;
  readonly topMoveChanges: number;
  readonly scoreSwingCp: number;
  readonly multiPvGap?: MultiPvGap;
  readonly nearEqualCandidates: number;
}

export function engineSessionMetrics(
  snapshots: readonly EngineAnalysis[],
  nearEqualCp = 20,
): EngineSessionMetrics {
  const byDepth = new Map<number, EngineAnalysis>();
  for (const snapshot of snapshots) {
    if (snapshot.depth > 0 && snapshot.lines[0]?.moves[0]) byDepth.set(snapshot.depth, snapshot);
  }
  const samples = [...byDepth.values()].sort((a, b) => a.depth - b.depth);
  const topMoves = samples.map((snapshot) => snapshot.lines[0]?.moves[0]).filter(Boolean);
  let topMoveChanges = 0;
  for (let index = 1; index < topMoves.length; index += 1) {
    if (topMoves[index] !== topMoves[index - 1]) topMoveChanges += 1;
  }

  let topMoveStableDepths = 0;
  const latestMove = topMoves.at(-1);
  for (let index = topMoves.length - 1; index >= 0; index -= 1) {
    if (topMoves[index] !== latestMove) break;
    topMoveStableDepths += 1;
  }

  const scores = samples.map((snapshot) => scoreToCentipawns(snapshot.lines[0]!.score));
  const scoreSwingCp = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;
  const current = samples.at(-1);
  const top = current?.lines[0];
  const second = current?.lines[1];
  const multiPvGap = top && second ? gapBetween(top.score, second.score) : undefined;
  /*
    Counting near-equal candidates only makes sense among evaluations. A mate
    line is not "within 0.20" of anything, so it is excluded rather than folded
    in through its clamped value.
  */
  const nearEqualCandidates =
    top && top.score.kind === 'cp'
      ? current!.lines.filter(
          (line) =>
            line.score.kind === 'cp' &&
            Math.abs(scoreToCentipawns(top.score) - scoreToCentipawns(line.score)) <= nearEqualCp,
        ).length
      : 0;

  return {
    topMoveStableDepths,
    topMoveChanges,
    scoreSwingCp,
    ...(multiPvGap ? { multiPvGap } : {}),
    nearEqualCandidates,
  };
}

function gapBetween(top: Score, second: Score): MultiPvGap {
  if (top.kind === 'mate' && second.kind === 'mate') {
    return { kind: 'mate-vs-mate', moves: Math.abs(Math.abs(top.moves) - Math.abs(second.moves)) };
  }
  if (top.kind === 'mate' || second.kind === 'mate') return { kind: 'mate-vs-eval' };
  return { kind: 'cp', centipawns: Math.abs(top.cp - second.cp) };
}

/** How the gap reads in a status line. */
export function describeGap(gap: MultiPvGap): string {
  if (gap.kind === 'cp') return (gap.centipawns / 100).toFixed(2);
  if (gap.kind === 'mate-vs-mate') {
    return gap.moves === 0 ? 'both mating' : `${gap.moves} moves faster`;
  }
  return 'mate vs evaluation';
}
