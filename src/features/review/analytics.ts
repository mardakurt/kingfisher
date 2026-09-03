/**
 * Making months of decision records answer questions.
 *
 * Phase 8 established that the journal must record what the player thought
 * before the engine spoke, and must never be rewritten afterwards. That gives
 * this module something unusual to work with: a set of judgements made without
 * hindsight, each paired with the evidence that arrived later. Almost nothing
 * else in a chess application has that property.
 *
 * The questions worth asking of it are all of one shape — *where does my
 * assessment and the evidence diverge, and does that cluster anywhere?* — and
 * they are all answerable by counting. So everything here is a count, a
 * bucketed distribution, or a set of records the caller can open.
 *
 * The rules from the summary module carry over and get stricter:
 *
 * - No derived rating, index or score for the player. "Engine top move was
 *   among my candidates: 61 of 84" is a fact. "Calculation strength: 73" is a
 *   number invented to look like one.
 * - Every figure names its denominator, because a percentage over nine
 *   positions is a percentage over nine positions.
 * - Every bucket returns the ids behind it. A statistic that cannot be opened
 *   is decoration.
 */

import { scoreToCentipawns, type Score } from '@/chess/evaluation';
import type { DecisionRecord, StoredEngineEvidenceRecord } from '@/persistence/domain';
import { themeLabel } from '@/persistence/domain';

/**
 * A decision paired with whatever evidence was later stored for its position.
 *
 * Assembled by the caller, because only it knows which engine evidence the
 * user has chosen to trust. A decision with no evidence is not an error and is
 * not dropped — it simply cannot contribute to a comparison, and the counts
 * say so by naming how many were usable.
 */
export interface JournalEntry {
  readonly decision: DecisionRecord;
  readonly evidence?: StoredEngineEvidenceRecord;
}

export interface JournalFilter {
  readonly themes?: readonly string[];
  readonly sideToMove?: 'w' | 'b';
  /** Structure signature or pawn skeleton, matched exactly. */
  readonly structure?: string;
  readonly openingFileId?: string;
  readonly from?: number;
  readonly to?: number;
}

/** Every filter present narrows; an empty filter matches everything. */
export function matchesJournalFilter(entry: JournalEntry, filter: JournalFilter): boolean {
  const { decision } = entry;
  if (filter.from !== undefined && decision.createdAt < filter.from) return false;
  if (filter.to !== undefined && decision.createdAt > filter.to) return false;
  if (filter.sideToMove && decision.sideToMove !== filter.sideToMove) return false;
  if (filter.themes?.length) {
    const themes = new Set(decision.themes);
    if (!filter.themes.some((theme) => themes.has(theme))) return false;
  }
  return true;
}

// --- Evaluation calibration ------------------------------------------------

/**
 * How far the player's estimates sat from the evidence, in buckets.
 *
 * Buckets rather than a mean, because a mean of signed differences cancels
 * and a mean of absolute ones hides the shape. What a player wants to see is
 * "how often am I close, and how often am I a long way out" — which is a
 * histogram, and a very small one.
 */
export interface CalibrationBucket {
  readonly id: string;
  readonly label: string;
  /** Inclusive lower bound in pawns; the last bucket has no upper bound. */
  readonly from: number;
  readonly to?: number;
  readonly count: number;
  readonly decisionIds: readonly string[];
}

export interface CalibrationReport {
  /** Decisions that had both an estimate in pawns and stored evidence. */
  readonly compared: number;
  /** Decisions in the filtered set, including those nothing could be said about. */
  readonly total: number;
  readonly buckets: readonly CalibrationBucket[];
  /**
   * Signed mean, positive when the player's estimate was more optimistic for
   * White than the evidence. Reported alongside the buckets rather than
   * instead of them, and absent when there is nothing to average.
   */
  readonly meanSignedPawns?: number;
}

const BUCKETS: readonly { id: string; label: string; from: number; to?: number }[] = [
  { id: 'within-030', label: 'Within 0.30', from: 0, to: 0.3 },
  { id: '031-080', label: '0.31 – 0.80', from: 0.3, to: 0.8 },
  { id: '081-150', label: '0.81 – 1.50', from: 0.8, to: 1.5 },
  { id: 'over-150', label: 'More than 1.50', from: 1.5 },
];

export function evaluationCalibration(
  entries: readonly JournalEntry[],
  filter: JournalFilter = {},
): CalibrationReport {
  const matching = entries.filter((entry) => matchesJournalFilter(entry, filter));
  const buckets = BUCKETS.map((bucket) => ({ ...bucket, ids: [] as string[] }));
  let signedTotal = 0;
  let compared = 0;

  for (const entry of matching) {
    const pawns = entry.decision.estimate?.pawns;
    const score = entry.evidence?.score;
    if (pawns === undefined || score === undefined) continue;
    const enginePawns = scoreToCentipawns(score) / 100;
    const signed = pawns - enginePawns;
    signedTotal += signed;
    compared += 1;

    const absolute = Math.abs(signed);
    const bucket =
      buckets.find((candidate) =>
        candidate.to === undefined ? absolute > candidate.from : absolute <= candidate.to,
      ) ?? buckets.at(-1)!;
    bucket.ids.push(entry.decision.id);
  }

  return {
    compared,
    total: matching.length,
    buckets: buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      from: bucket.from,
      ...(bucket.to !== undefined ? { to: bucket.to } : {}),
      count: bucket.ids.length,
      decisionIds: bucket.ids,
    })),
    ...(compared > 0 ? { meanSignedPawns: round2(signedTotal / compared) } : {}),
  };
}

// --- Candidate coverage ----------------------------------------------------

/**
 * How often the engine's eventual first choice was on the player's list.
 *
 * The single most useful thing the journal can report, and the one most easily
 * turned into something it is not. It is a count of two sets, reported as
 * "n of m". It is *not* a measure of calculation ability: a player who
 * deliberately rejects the engine's move for a practical reason is counted as
 * a miss here, and the report says so rather than pretending the number is
 * cleaner than it is.
 */
export interface CoverageReport {
  readonly considered: number;
  readonly compared: number;
  readonly missedIds: readonly string[];
  readonly hitIds: readonly string[];
  /** Decisions where fewer than two candidates were listed at all. */
  readonly thinCandidateIds: readonly string[];
  readonly averageCandidates?: number;
}

export function candidateCoverage(
  entries: readonly JournalEntry[],
  filter: JournalFilter = {},
): CoverageReport {
  const matching = entries.filter((entry) => matchesJournalFilter(entry, filter));
  const hitIds: string[] = [];
  const missedIds: string[] = [];
  const thinCandidateIds: string[] = [];
  let candidateTotal = 0;

  for (const entry of matching) {
    candidateTotal += entry.decision.candidates.length;
    if (entry.decision.candidates.length < 2) thinCandidateIds.push(entry.decision.id);
    const top = entry.evidence?.pv[0];
    if (top === undefined) continue;
    const listed = entry.decision.candidates.some((candidate) => candidate.uci === top);
    (listed ? hitIds : missedIds).push(entry.decision.id);
  }

  return {
    considered: hitIds.length,
    compared: hitIds.length + missedIds.length,
    hitIds,
    missedIds,
    thinCandidateIds,
    ...(matching.length > 0 ? { averageCandidates: round2(candidateTotal / matching.length) } : {}),
  };
}

// --- Where the divergence clusters ------------------------------------------

/**
 * The themes that appear most often on the decisions that diverged most.
 *
 * A join, not a diagnosis. It says "of your twelve largest evaluation gaps,
 * seven are tagged trade decision" — which is a fact about tags the player
 * applied by hand, and is therefore their own observation reflected back at
 * them rather than the application's opinion about their chess.
 */
export interface DivergenceTheme {
  readonly theme: string;
  readonly label: string;
  readonly count: number;
  readonly decisionIds: readonly string[];
}

export function themesBehindLargestGaps(
  entries: readonly JournalEntry[],
  options: { readonly take?: number; readonly filter?: JournalFilter } = {},
): { readonly examined: number; readonly themes: readonly DivergenceTheme[] } {
  const take = options.take ?? 12;
  const matching = entries
    .filter((entry) => matchesJournalFilter(entry, options.filter ?? {}))
    .map((entry) => ({ entry, gap: gapOf(entry) }))
    .filter((row): row is { entry: JournalEntry; gap: number } => row.gap !== null)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, take);

  const counts = new Map<string, string[]>();
  for (const { entry } of matching) {
    for (const theme of entry.decision.themes) {
      counts.set(theme, [...(counts.get(theme) ?? []), entry.decision.id]);
    }
  }

  return {
    examined: matching.length,
    themes: [...counts]
      .map(([theme, ids]) => ({
        theme,
        label: themeLabel(theme),
        count: ids.length,
        decisionIds: ids,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

/**
 * The absolute distance between the player's estimate and the evidence.
 *
 * `null` rather than zero when either side is missing: a decision with no
 * number attached did not agree with the engine, it said nothing measurable,
 * and treating that as a perfect estimate would flatter every entry the player
 * did not bother to quantify.
 */
export function gapOf(entry: JournalEntry): number | null {
  const pawns = entry.decision.estimate?.pawns;
  const score = entry.evidence?.score;
  if (pawns === undefined || score === undefined) return null;
  return Math.abs(pawns - scoreToCentipawns(score) / 100);
}

/** Pawns from a stored score, for callers that only need the number. */
export const pawnsOf = (score: Score): number => round2(scoreToCentipawns(score) / 100);

const round2 = (value: number): number => Math.round(value * 100) / 100;
