/**
 * Stable hash for a season report's five sections.
 *
 * The "First seen" line and the season log record a hash per section so a
 * later visit can answer "did this section change since you last looked?"
 * without re-reading every game. The hash is order-insensitive on rows
 * inside a section (the section counts are deterministic anyway) and
 * includes only the player's facts — section labels are not part of it.
 *
 * Implementation: a tiny FNV-1a string fold. No crypto; the hash is a
 * check, not a signature.
 */

import type {
  LongestPositionRow,
  PhaseRow,
  PerMoveNumberRow,
  SeasonReport,
  SeasonSection,
  SlowOpeningRow,
  TimeTroubleRow,
} from '@/season/season';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const fold = (hash: number, text: string): number => {
  let h = hash;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
};

const foldPhase = (h: number, row: PhaseRow): number =>
  fold(fold(fold(h, row.phase), String(row.moves)), String(row.totalSeconds));

const foldPerMove = (h: number, row: PerMoveNumberRow): number =>
  fold(
    fold(
      fold(fold(h, String(row.moveNumber)), String(row.averageSeconds)),
      String(row.gamesCounted),
    ),
    row.anyInTimeTrouble ? '1' : '0',
  );

const foldLongest = (h: number, row: LongestPositionRow): number => {
  let out = fold(fold(h, row.positionKey), String(row.totalSeconds));
  for (const g of row.games) {
    out = fold(
      fold(
        fold(fold(fold(out, g.gameId), String(g.moveNumber)), String(g.seconds)),
        g.evaluationChange ?? '?',
      ),
      g.result ?? '?',
    );
  }
  return out;
};

const foldTrouble = (h: number, row: TimeTroubleRow): number =>
  fold(fold(fold(h, String(row.moveNumber)), String(row.gamesInTrouble)), String(row.totalGames));

const foldOpening = (h: number, row: SlowOpeningRow): number => {
  let out = fold(fold(h, row.opening), String(row.averageRemainingSeconds));
  out = fold(out, String(row.games));
  out = fold(out, String(row.wins));
  out = fold(out, String(row.losses));
  out = fold(out, String(row.draws));
  out = fold(out, row.color);
  out = fold(out, row.fen);
  return out;
};

const hashRows = <T>(
  source: string,
  rows: readonly T[],
  foldRow: (h: number, row: T) => number,
) => {
  let out = fold(FNV_OFFSET, source);
  for (const row of rows) out = foldRow(out, row);
  return out.toString(16);
};

/** Five hashes per source bucket, in the same order as the rendered sections. */
export const hashReport = (report: SeasonReport): readonly string[] =>
  report.sections.flatMap((section: SeasonSection) => {
    const source = `${section.source.sourceLabel}:${section.totalGames}:${section.gamesWithClock}`;
    return [
      hashRows(source, section.phases, foldPhase),
      hashRows(source, section.perMoveNumber, foldPerMove),
      hashRows(source, section.longestPositions, foldLongest),
      hashRows(source, section.timeTrouble, foldTrouble),
      hashRows(source, section.slowestOpenings, foldOpening),
    ];
  });
