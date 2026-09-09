/**
 * What a reference source says versus what the repertoire decided.
 *
 * A repertoire is a map from *positions* to intended moves; the question this
 * file answers is which high-frequency opponent replies the user has not filed a
 * response for. The check is position-keyed and therefore transposition-aware:
 * two move orders that reach the same canonical position are one entry.
 *
 * The coverage report does not invent scores. A "gap" is concrete: it is a
 * uci the source reports for this position at this frequency, and the
 * repertoire has no decision for it. "Frequency" is the source's own number,
 * and "source" is named, so the gap can be reproduced by re-running the
 * query.
 */

import type { DatabaseMove, ExplorerResult } from '@/database/types';
import type { RepertoirePositionRecord } from '@/persistence/domain';

export interface CoverageSource {
  /** Logical source id, e.g. 'kingfisher-elite-otb'. */
  readonly id: string;
  /** Display name, e.g. 'Elite OTB'. */
  readonly name: string;
  /** The source's answer for one position. */
  readonly result: ExplorerResult;
}

/**
 * One entry in the coverage table: a move the source reports at the
 * position, the repertoire has not decided what to do against it, and the
 * games/share are the source's own.
 */
export interface CoverageGap {
  readonly uci: string;
  readonly san: string;
  readonly games: number;
  readonly share: number;
  readonly averageRating?: number;
  /** True if this gap only exists because the source was queried, not the repertoire. */
  readonly recent: boolean;
}

export interface CoverageReport {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly positionKey: string;
  /** The moves the repertoire has already decided for. */
  readonly decided: readonly string[];
  /** The moves in the source's answer that the repertoire has not decided. */
  readonly gaps: readonly CoverageGap[];
  /** True when the repertoire has any decision at all here. */
  readonly hasDecision: boolean;
  /** Number of games the source saw at this position. */
  readonly totalGames: number;
}

/**
 * The minimum number of games a move needs in the source's answer before it
 * is reported as a gap. A move nobody has played is not a gap a user needs to
 * cover, and a move that has been played twice is not a finding either — the
 * floor is what lets the coverage report stay a list of facts.
 */
export const MINIMUM_COVERAGE_GAMES = 5;

/**
 * Compare one reference source's answer for a repertoire position against
 * the repertoire's own decisions, and return the moves the repertoire has
 * not recorded.
 */
export function computeCoverage(
  position: RepertoirePositionRecord,
  sources: readonly CoverageSource[],
): readonly CoverageReport[] {
  return sources.map((source) => coverageForOne(position, source));
}

function coverageForOne(
  position: RepertoirePositionRecord,
  source: CoverageSource,
): CoverageReport {
  /*
    Every role counts: "main", "alternative", "candidate" and "avoid" are all
    decisions. "Avoid" in particular still answers the position, because the
    user has decided what not to play — a gap is specifically a move the
    user has not decided about, not one they decided against.
  */
  const decidedUcis = new Set(position.moves.map((move) => move.uci));
  const decidedRoles = new Set(position.moves.map((move) => move.role));

  const gaps: CoverageGap[] = [];
  const total = source.result.totalGames;
  for (const move of source.result.moves) {
    if (decidedUcis.has(move.uci)) continue;
    if (move.games < MINIMUM_COVERAGE_GAMES) continue;
    gaps.push({
      uci: move.uci,
      san: move.san,
      games: move.games,
      share: total > 0 ? move.games / total : 0,
      ...(move.averageRating !== undefined && move.averageRating > 0
        ? { averageRating: move.averageRating }
        : {}),
      recent: false,
    });
  }
  gaps.sort((a, b) => b.games - a.games);

  return {
    sourceId: source.id,
    sourceName: source.name,
    positionKey: position.positionKey,
    decided: position.moves.map((move) => move.uci),
    gaps,
    hasDecision: decidedRoles.size > 0,
    totalGames: total,
  };
}

/**
 * Walk every position in the repertoire and return a coverage table.
 *
 * The caller is responsible for supplying the source query; this function
 * does not know how to address a reference pack. It is intentionally
 * separate from the panel so a test can pin the rule.
 */
export function walkRepertoireCoverage<
  T extends { readonly id: string; readonly name: string; queryPosition(key: string): Promise<ExplorerResult> },
>(params: {
  readonly positions: readonly RepertoirePositionRecord[];
  readonly sources: readonly T[];
}): Promise<readonly CoverageReport[]> {
  return Promise.all(
    params.positions.flatMap((position) =>
      params.sources.map(async (source) => {
        const result = await source.queryPosition(position.positionKey);
        return coverageForOne(position, { id: source.id, name: source.name, result });
      }),
    ),
  );
}

/**
 * Sort a coverage report by the most-played gap first. Used by the panel
 * to decide which row to surface above the rest.
 */
export function topGaps(report: CoverageReport, limit = 5): readonly CoverageGap[] {
  return report.gaps.slice(0, limit);
}

/** True when the report is one a reader should look at. */
export function isActionable(report: CoverageReport): boolean {
  return report.gaps.length > 0;
}

/** Re-export DatabaseMove for callers that want to read it from here. */
export type { DatabaseMove, ExplorerResult };