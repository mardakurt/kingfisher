/**
 * Putting the player's answers beside the evidence — and calling it that.
 *
 * This module deliberately computes no verdict. It reports where the player's
 * estimate sits relative to the engine's, whether a candidate they considered
 * appears among the engine's lines and at what rank, and how far the moves are
 * apart in the engine's own numbers. Every one of those is a comparison
 * between two opinions, one of which happens to be a machine's.
 *
 * That is not false modesty. An engine at one second per position is evidence,
 * not truth: it changes its mind at greater depth, it is weakest in exactly the
 * closed positions where a human plan matters most, and only a tablebase result
 * is a fact. So nothing here says "correct", "wrong", "mistake" or "blunder",
 * and no function returns a score for the player.
 */

import { formatScore, scoreToCentipawns, winningChances, type Score } from '@/chess/evaluation';
import type { DecisionCandidate, EvaluationBandId } from '@/persistence/domain';
import type { Uci } from '@/chess/types';

export const BANDS: readonly { readonly id: EvaluationBandId; readonly label: string }[] = [
  { id: 'clearly-white', label: 'Clearly better for White' },
  { id: 'slightly-white', label: 'Slightly better for White' },
  { id: 'equal', label: 'Equal' },
  { id: 'slightly-black', label: 'Slightly better for Black' },
  { id: 'clearly-black', label: 'Clearly better for Black' },
];

export const bandLabel = (id: EvaluationBandId): string =>
  BANDS.find((band) => band.id === id)?.label ?? id;

/** Where the bands sit, in centipawns from White's point of view. */
const BAND_ORDER: readonly EvaluationBandId[] = [
  'clearly-black',
  'slightly-black',
  'equal',
  'slightly-white',
  'clearly-white',
];

/**
 * The band an engine score falls in.
 *
 * The thresholds are stated rather than tuned: ±50 centipawns for "equal" and
 * ±150 for "slightly better" are the conventional reading of an evaluation
 * bar, and they exist here only so the two opinions can be placed on one
 * scale. They are not a claim about what is objectively equal.
 */
export function bandOfScore(score: Score): EvaluationBandId {
  if (score.kind === 'mate') return score.moves >= 0 ? 'clearly-white' : 'clearly-black';
  if (score.cp > 150) return 'clearly-white';
  if (score.cp > 50) return 'slightly-white';
  if (score.cp >= -50) return 'equal';
  if (score.cp >= -150) return 'slightly-black';
  return 'clearly-black';
}

export interface EstimateComparison {
  readonly yourBand: EvaluationBandId;
  readonly yourBandLabel: string;
  readonly yourPawns?: number;
  readonly engineBand: EvaluationBandId;
  readonly engineBandLabel: string;
  readonly engineScore: string;
  /** How many bands apart, 0–4. Reported, never scored. */
  readonly bandDistance: number;
  /** Pawns, only when the player gave a number to compare. */
  readonly pawnDifference?: number;
  /**
   * Difference in expected result for White, 0–1.
   *
   * Included because it is the honest measure of how much a gap matters: the
   * distance between +0.2 and +0.5 changes practical chances far more than the
   * distance between +6.0 and +6.3, and centipawns hide that.
   */
  readonly chanceDifference?: number;
}

export function compareEstimate(
  estimate: { readonly band: EvaluationBandId; readonly pawns?: number } | undefined,
  engineScore: Score | undefined,
): EstimateComparison | null {
  if (!estimate || !engineScore) return null;
  const engineBand = bandOfScore(engineScore);
  const yourIndex = BAND_ORDER.indexOf(estimate.band);
  const engineIndex = BAND_ORDER.indexOf(engineBand);
  const comparison: EstimateComparison = {
    yourBand: estimate.band,
    yourBandLabel: bandLabel(estimate.band),
    ...(estimate.pawns !== undefined ? { yourPawns: estimate.pawns } : {}),
    engineBand,
    engineBandLabel: bandLabel(engineBand),
    engineScore: formatScore(engineScore, { alwaysSign: true }),
    bandDistance: Math.abs(yourIndex - engineIndex),
    ...(estimate.pawns !== undefined
      ? {
          pawnDifference:
            Math.round((scoreToCentipawns(engineScore) / 100 - estimate.pawns) * 100) / 100,
          chanceDifference:
            Math.round(
              Math.abs(
                winningChances(engineScore) -
                  winningChances({ kind: 'cp', cp: Math.round(estimate.pawns * 100) }),
              ) * 1000,
            ) / 1000,
        }
      : {}),
  };
  return comparison;
}

/** One engine line, reduced to what a comparison needs. */
export interface EngineLine {
  readonly rank: number;
  readonly moves: readonly Uci[];
  readonly score: Score;
  readonly san?: readonly string[];
}

export interface CandidateComparison {
  readonly uci: Uci;
  readonly san: string;
  readonly note?: string;
  /** 1-based engine rank, when the engine offered this move at all. */
  readonly engineRank?: number;
  readonly engineScore?: string;
  /**
   * Centipawns behind the engine's own first choice.
   *
   * Absent when the engine did not offer the move: that means "not in the
   * lines this search returned", which is not the same as "bad" and must not
   * be rendered as a number.
   */
  readonly behindBestCp?: number;
  readonly chosen: boolean;
}

export interface CandidateReport {
  readonly rows: readonly CandidateComparison[];
  /** Engine lines the player did not list, so the gap is visible both ways. */
  readonly unconsidered: readonly EngineLine[];
  readonly bestScore?: string;
  readonly multiPv: number;
}

export function compareCandidates(
  candidates: readonly DecisionCandidate[],
  lines: readonly EngineLine[],
  chosenUci?: Uci,
): CandidateReport {
  const ordered = [...lines].sort((a, b) => a.rank - b.rank);
  const best = ordered[0];
  const byMove = new Map<string, EngineLine>();
  for (const line of ordered) {
    const first = line.moves[0];
    if (first && !byMove.has(first)) byMove.set(first, line);
  }

  const rows = candidates.map((candidate): CandidateComparison => {
    const line = byMove.get(candidate.uci);
    return {
      uci: candidate.uci,
      san: candidate.san,
      ...(candidate.note ? { note: candidate.note } : {}),
      ...(line
        ? {
            engineRank: line.rank,
            engineScore: formatScore(line.score, { alwaysSign: true }),
            behindBestCp: best
              ? Math.abs(scoreToCentipawns(best.score) - scoreToCentipawns(line.score))
              : undefined,
          }
        : {}),
      chosen: candidate.uci === chosenUci,
    };
  });

  const considered = new Set(candidates.map((candidate) => candidate.uci));
  const unconsidered = ordered.filter((line) => {
    const first = line.moves[0];
    return first !== undefined && !considered.has(first);
  });

  return {
    rows,
    unconsidered,
    ...(best ? { bestScore: formatScore(best.score, { alwaysSign: true }) } : {}),
    multiPv: ordered.length,
  };
}

/**
 * A sentence for the comparison header.
 *
 * Written as an observation with its own hedge attached, because this is the
 * line a player reads fastest and the one most likely to be mistaken for a
 * verdict if it is phrased like one.
 */
export function describeEstimateComparison(comparison: EstimateComparison): string {
  if (comparison.bandDistance === 0) {
    return `Your reading and the engine's are in the same band (${comparison.engineBandLabel.toLowerCase()}).`;
  }
  if (comparison.bandDistance === 1) {
    return `One band apart: you said ${comparison.yourBandLabel.toLowerCase()}, the engine reports ${comparison.engineScore}.`;
  }
  return `${comparison.bandDistance} bands apart: you said ${comparison.yourBandLabel.toLowerCase()}, the engine reports ${comparison.engineScore}.`;
}
