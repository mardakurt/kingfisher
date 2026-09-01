/**
 * Everything Kingfisher knows about one position, gathered but never merged.
 *
 * The explorer's whole job is to put several kinds of evidence beside each
 * other. This module collects them; it does not reconcile them, weight them or
 * reduce them to a number. A move that the database plays 40% of the time, the
 * engine ranks third, and the user has marked `avoid` is three separate facts,
 * and the interesting cases are exactly the ones where they disagree.
 */

import { positionKey } from '@/chess/fen';
import type { Fen, San, Uci } from '@/chess/types';
import type { DatabaseMove, ExplorerResult } from '@/database/types';
import { moveScore } from '@/database/types';
import type { RepertoirePositionRecord, RepertoireRole } from '@/persistence/domain';
import type { EngineAnalysis } from '@/engine/types';

export interface MoveEvidence {
  readonly uci: Uci;
  readonly san: San;
  /** The selected source's numbers. */
  readonly database: DatabaseMove;
  readonly frequency: number;
  readonly score: number;
  /** Frequency in the recent window, when one was asked for. */
  readonly recentFrequency?: number;
  readonly recentGames?: number;
  /** How this move ranks in the engine's current lines, if it appears. */
  readonly engineRank?: number;
  readonly engineScore?: EngineAnalysis['lines'][number]['score'];
  /** What the user's repertoire says here. */
  readonly repertoireRole?: RepertoireRole;
  readonly repertoireExpected?: boolean;
  /** The user's own games with this move, from a personal-source lookup. */
  readonly personalGames?: number;
  readonly personalScore?: number;
}

export interface PositionHistory {
  readonly localGames: number;
  readonly personalGames: number;
  readonly studies: number;
  readonly repertoires: number;
  readonly trainingItems: number;
  readonly modelGames: number;
}

/**
 * Merge every source into one row per move.
 *
 * The database result decides which moves exist, because a move nobody has
 * played is not an opening-explorer row; engine-only candidates belong to the
 * engine panel, which is where they are shown.
 */
export function buildMoveEvidence(options: {
  readonly result: ExplorerResult;
  readonly sideToMove: 'w' | 'b';
  readonly recent?: ExplorerResult | null;
  readonly analysis?: EngineAnalysis | null;
  readonly repertoire?: RepertoirePositionRecord | null;
  readonly personal?: ExplorerResult | null;
}): readonly MoveEvidence[] {
  const { result, sideToMove, recent, analysis, repertoire, personal } = options;
  const total = result.totalGames || 1;
  const recentTotal = recent?.totalGames ?? 0;

  const recentByMove = new Map((recent?.moves ?? []).map((move) => [move.uci, move]));
  const personalByMove = new Map((personal?.moves ?? []).map((move) => [move.uci, move]));
  const engineByMove = new Map(
    (analysis?.lines ?? [])
      .filter((line) => line.moves[0])
      .map((line) => [line.moves[0] as Uci, line]),
  );

  return result.moves.map((move) => {
    const recentMove = recentByMove.get(move.uci);
    const personalMove = personalByMove.get(move.uci);
    const engineLine = engineByMove.get(move.uci);
    const repertoireMove = repertoire?.moves.find((entry) => entry.uci === move.uci);

    return {
      uci: move.uci,
      san: move.san,
      database: move,
      frequency: move.games / total,
      score: moveScore(move, sideToMove),
      ...(recentMove && recentTotal > 0
        ? { recentFrequency: recentMove.games / recentTotal, recentGames: recentMove.games }
        : {}),
      ...(engineLine ? { engineRank: engineLine.rank, engineScore: engineLine.score } : {}),
      ...(repertoireMove
        ? {
            repertoireRole: repertoireMove.role,
            repertoireExpected: repertoireMove.expected === true,
          }
        : {}),
      ...(personalMove
        ? {
            personalGames: personalMove.games,
            personalScore: moveScore(personalMove, sideToMove),
          }
        : {}),
    };
  });
}

/**
 * Which way a move's popularity is moving.
 *
 * Only stated where there is enough of both windows to mean anything. A move
 * played twice this year and once before is not "rising 100%", it is noise, and
 * saying otherwise would be the kind of invented trend the rest of the product
 * refuses to produce.
 */
export type Trend = 'rising' | 'falling' | 'steady' | 'insufficient';

export const MINIMUM_TREND_GAMES = 20;

export function trendOf(evidence: MoveEvidence): Trend {
  if (
    evidence.recentFrequency === undefined ||
    evidence.database.games < MINIMUM_TREND_GAMES ||
    (evidence.recentGames ?? 0) < 5
  ) {
    return 'insufficient';
  }
  const delta = evidence.recentFrequency - evidence.frequency;
  // A fifth of the move's own share, so a rare move needs a smaller absolute
  // change to count than a main line does.
  const threshold = Math.max(0.02, evidence.frequency * 0.2);
  if (delta > threshold) return 'rising';
  if (delta < -threshold) return 'falling';
  return 'steady';
}

/** A compact, factual line for the comparison panel. */
export function summariseEvidence(evidence: MoveEvidence): readonly (readonly [string, string])[] {
  const rows: [string, string][] = [
    ['Games', evidence.database.games.toLocaleString()],
    ['Frequency', `${Math.round(evidence.frequency * 100)}%`],
    ['Score', `${Math.round(evidence.score * 100)}%`],
  ];
  if (evidence.database.averageRating)
    rows.push(['Average Elo', String(evidence.database.averageRating)]);
  if (evidence.database.performance)
    rows.push(['Performance', String(evidence.database.performance)]);
  if (evidence.database.lastPlayedYear)
    rows.push(['Last played', String(evidence.database.lastPlayedYear)]);
  if (evidence.recentFrequency !== undefined) {
    rows.push(['Recent frequency', `${Math.round(evidence.recentFrequency * 100)}%`]);
  }
  if (evidence.engineRank !== undefined) rows.push(['Engine rank', `#${evidence.engineRank}`]);
  if (evidence.repertoireRole) {
    rows.push([
      'Repertoire',
      evidence.repertoireExpected ? 'expected reply' : evidence.repertoireRole,
    ]);
  }
  if (evidence.personalGames !== undefined) {
    rows.push([
      'My games',
      `${evidence.personalGames}, ${Math.round((evidence.personalScore ?? 0) * 100)}%`,
    ]);
  }
  return rows;
}

export const keyOf = (fen: Fen): string => positionKey(fen);
