/**
 * Phase 41 — multi-source comparison normalization.
 *
 * A serious player wants to look at the same canonical position across
 * several databases at once: Lichess masters, recent theory, online
 * games, their own games. The numbers must NOT be merged. "34%" means
 * nothing without knowing which population produced it.
 *
 * This module gives every surface a single normalization: every source
 * produces a `SourceMoveStats` row per move, and the row is missing
 * (not zero) when the source had nothing to say. The `SourceAbsence`
 * distinguishes "0 games" from "unavailable" from "filter unsupported"
 * from "network failed" — chess-data correctness, per the brief.
 */
import type { ReferenceSource } from './types';

export type SourceAbsence =
  | { readonly kind: 'zero-games' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'not-loaded' }
  | { readonly kind: 'unsupported-filter' }
  | { readonly kind: 'network-failed'; readonly message?: string };

export interface SourceMoveStats {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceVersion?: string;
  /** Sample size. */
  readonly games: number;
  /** Fraction of source games playing this move, in [0, 1]. */
  readonly frequency: number;
  /** Fraction of source games that won/drew/lost from the side that
      played the move, from the position's perspective. */
  readonly score?: number;
  /** Recent-theory baseline frequency, where the source supports it. */
  readonly baselineFrequency?: number;
  /** Trend delta, in percentage points. */
  readonly trendDeltaPp?: number;
  /** Window the source drew from, e.g. "Mar–Aug 2026". */
  readonly window?: string;
  /** Rating context the source provided. */
  readonly rating?: string;
  /** When the source didn't have data for this move, the absence kind. */
  readonly absence?: SourceAbsence;
}

export interface ComparisonRow {
  /** UCI move, canonical. */
  readonly move: string;
  /** San, where the source produced one. */
  readonly san?: string;
  readonly perSource: Readonly<Record<string, SourceMoveStats | undefined>>;
}

export interface SourceComparison {
  /** Canonical position key the rows were computed for. */
  readonly positionKey: string;
  readonly fen: string;
  readonly rows: readonly ComparisonRow[];
  /** Source ids in display order. */
  readonly sources: readonly { readonly id: string; readonly name: string }[];
  /** True if at least one source is unavailable for any reason. */
  readonly anyUnavailable: boolean;
}

/**
 * Normalize a candidate move with raw numbers into a row with
 * per-source stats. The renderer never sees raw counts from the
 * source code — it sees a uniform shape and an explicit absence
 * when the source didn't answer.
 */
export function normalizeSourceMoveStats(input: {
  readonly source: ReferenceSource;
  readonly games: number;
  readonly frequency: number;
  readonly score?: number;
  readonly baselineFrequency?: number;
  readonly trendDeltaPp?: number;
  readonly window?: string;
  readonly rating?: string;
}): SourceMoveStats {
  const result: SourceMoveStats = {
    sourceId: input.source.id,
    sourceName: input.source.name,
    games: input.games,
    frequency: input.frequency,
    ...(input.score !== undefined ? { score: input.score } : {}),
    ...(input.baselineFrequency !== undefined
      ? { baselineFrequency: input.baselineFrequency }
      : {}),
    ...(input.trendDeltaPp !== undefined ? { trendDeltaPp: input.trendDeltaPp } : {}),
    ...(input.window ? { window: input.window } : {}),
    ...(input.rating ? { rating: input.rating } : {}),
  };
  return result;
}

export function absenceFor(kind: SourceAbsence['kind'], message?: string): SourceAbsence {
  if (kind === 'network-failed') {
    return message ? { kind, message } : { kind };
  }
  return { kind };
}

/**
 * Insufficient-sample guard for trend claims.
 *
 * A move can be "insufficient sample" even when the raw percentage
 * delta looks dramatic. Three games is not a trend, even if all three
 * played the move. The threshold is a small N so a single user can
 * still see the comparison; the renderer is responsible for hiding
 * the delta when the sample fails.
 */
export const TREND_MINIMUM_SAMPLE = 50;

/**
 * True when the sample is large enough to display a trend delta.
 * Below this, the trend field stays undefined in the row.
 */
export function meetsTrendSampleThreshold(input: {
  readonly games: number;
  readonly baselineGames?: number;
}): boolean {
  if (input.games < TREND_MINIMUM_SAMPLE) return false;
  if (input.baselineGames !== undefined && input.baselineGames < TREND_MINIMUM_SAMPLE) {
    return false;
  }
  return true;
}

/**
 * Build a comparison table from one position's data across many
 * sources. The renderer never invents cells; if a source didn't
 * produce a stat for a move, the cell is `undefined`. This is the
 * honest surface the brief asks for.
 */
export function buildSourceComparison(input: {
  readonly positionKey: string;
  readonly fen: string;
  readonly sources: readonly ReferenceSource[];
  readonly rows: readonly ComparisonRow[];
}): SourceComparison {
  return {
    positionKey: input.positionKey,
    fen: input.fen,
    rows: input.rows,
    sources: input.sources.map((s) => ({ id: s.id, name: s.name })),
    anyUnavailable: input.rows.some((row) =>
      Object.values(row.perSource).some(
        (stats) => stats?.absence && stats.absence.kind !== 'zero-games',
      ),
    ),
  };
}
