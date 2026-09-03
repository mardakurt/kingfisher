/**
 * What two engines said about one position.
 *
 * Strictly a report of observed output. Two engines disagreeing is information
 * about the position — it is where the sharp, unclear and long-term-compensation
 * positions are — but the disagreement itself is the finding. Converting it
 * into "the position is unclear" would be Kingfisher inventing a judgement out
 * of two numbers, which is exactly what the rest of the application refuses to
 * do with engine, database and repertoire evidence.
 *
 * A neural engine and an alpha-beta engine differ *systematically*, not
 * randomly: MCTS is optimistic in closed positions and pessimistic about
 * long forcing lines. That is worth knowing and worth showing, and it is still
 * not a verdict.
 */

import { scoreToCentipawns, type Score } from '@/chess/evaluation';
import type { San, Uci } from '@/chess/types';

import type { EngineAnalysis, PrincipalVariation } from './types';

export interface EngineReading {
  readonly engineId: string;
  readonly name: string;
  readonly family: 'alphabeta' | 'neural' | 'unknown';
  readonly analysis: EngineAnalysis | null;
}

export interface ComparedMove {
  readonly uci: Uci;
  readonly san?: San;
  /** Rank in each engine's own list, or null where it did not appear. */
  readonly ranks: Readonly<Record<string, number | null>>;
  readonly scores: Readonly<Record<string, Score | null>>;
}

export type Agreement = 'agree' | 'differ' | 'incomplete';

export interface EngineComparison {
  readonly readings: readonly EngineReading[];
  /** Agreement on the *top* move only; a shared candidate list is not agreement. */
  readonly topMove: Agreement;
  /** Each engine's first move, in reading order. */
  readonly topMoves: readonly (Uci | null)[];
  /**
   * Absolute difference between the two top evaluations, in centipawns.
   *
   * Undefined when either side is a mate score, for the same reason the
   * MultiPV gap refuses to subtract one: the difference would be arithmetic on
   * two things that are not the same kind of quantity.
   */
  readonly evaluationGapCp?: number;
  /** Plies the two principal variations share from the root. */
  readonly pvAgreementPlies: number;
  /** Every move either engine put in its top lines. */
  readonly moves: readonly ComparedMove[];
}

const top = (analysis: EngineAnalysis | null): PrincipalVariation | undefined => analysis?.lines[0];

export function compareEngines(readings: readonly EngineReading[]): EngineComparison {
  const tops = readings.map((reading) => top(reading.analysis));
  const topMoves = tops.map((line) => line?.moves[0] ?? null);

  const complete = topMoves.every((move) => move !== null);
  const topMove: Agreement = !complete
    ? 'incomplete'
    : new Set(topMoves).size === 1
      ? 'agree'
      : 'differ';

  const first = tops[0]?.score;
  const second = tops[1]?.score;
  const evaluationGapCp =
    first && second && first.kind === 'cp' && second.kind === 'cp'
      ? Math.abs(scoreToCentipawns(first) - scoreToCentipawns(second))
      : undefined;

  // How far the two engines walk the same line before parting.
  let pvAgreementPlies = 0;
  const [a, b] = [tops[0]?.moves ?? [], tops[1]?.moves ?? []];
  while (
    pvAgreementPlies < Math.min(a.length, b.length) &&
    a[pvAgreementPlies] === b[pvAgreementPlies]
  ) {
    pvAgreementPlies += 1;
  }

  interface MoveEntry {
    ranks: Record<string, number | null>;
    scores: Record<string, Score | null>;
    san?: San;
  }

  const byMove = new Map<Uci, MoveEntry>();
  const blank = (): MoveEntry => ({
    ranks: Object.fromEntries(readings.map((reading) => [reading.engineId, null])),
    scores: Object.fromEntries(readings.map((reading) => [reading.engineId, null])),
  });

  for (const reading of readings) {
    for (const line of reading.analysis?.lines ?? []) {
      const move = line.moves[0];
      if (!move) continue;
      const entry = byMove.get(move) ?? blank();
      entry.ranks[reading.engineId] = line.rank;
      entry.scores[reading.engineId] = line.score;
      if (!entry.san && line.san?.[0]) entry.san = line.san[0];
      byMove.set(move, entry);
    }
  }

  const moves = [...byMove.entries()]
    .map(([uci, entry]) => ({
      uci,
      ...(entry.san ? { san: entry.san } : {}),
      ranks: entry.ranks,
      scores: entry.scores,
    }))
    // Best combined placing first; a move only one engine considered sorts by
    // that engine's rank alone rather than being pushed to the bottom.
    .sort((left, right) => bestRank(left.ranks) - bestRank(right.ranks));

  return {
    readings,
    topMove,
    topMoves,
    ...(evaluationGapCp !== undefined ? { evaluationGapCp } : {}),
    pvAgreementPlies,
    moves,
  };
}

const bestRank = (ranks: Readonly<Record<string, number | null>>): number =>
  Math.min(...Object.values(ranks).map((rank) => rank ?? 99));

/** A one-line summary of the comparison, in plain factual language. */
export function describeComparison(comparison: EngineComparison): string {
  const [first, second] = comparison.readings;
  if (!first || !second) return 'One engine.';
  if (comparison.topMove === 'incomplete') return 'Waiting for both engines.';

  if (comparison.topMove === 'agree') {
    const gap = comparison.evaluationGapCp;
    const shared = comparison.pvAgreementPlies;
    return gap === undefined
      ? `Both prefer the same move; ${shared} ply of the line shared.`
      : `Both prefer the same move, ${(gap / 100).toFixed(2)} apart, sharing ${shared} ply.`;
  }
  return comparison.evaluationGapCp === undefined
    ? 'The engines prefer different moves.'
    : `Different moves, ${(comparison.evaluationGapCp / 100).toFixed(2)} apart.`;
}
