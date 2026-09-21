/**
 * How often each repertoire position is actually reached — in the player's
 * own games, and in a named population — so a repertoire can be read in the
 * order it is met rather than the order it was written.
 *
 * Two counts, two columns, never one number: "reached in 9 of your 40 games"
 * and "reached in 3.1% of Elite OTB" are different facts from different
 * populations, and the rule against merging populations applies to a
 * player's own games as much as to two packs. A position with neither is the
 * one this exists to find: the line drilled forty times that nobody has
 * played against you and hardly anybody plays at all.
 */
import type { RepertoirePositionRecord } from '@/persistence/domain';

export interface ReferenceReach {
  readonly source: string;
  readonly games: number;
  readonly total: number;
}

export interface PositionReach {
  readonly position: RepertoirePositionRecord;
  /** Games of the player's own, on the repertoire's side, that reached it; null until counted. */
  readonly own: number | null;
  readonly reference: ReferenceReach | null;
}

/** The population share, or 0 when the source has nothing at the root. */
export const referenceShare = (reach: ReferenceReach | null): number =>
  reach && reach.total > 0 ? reach.games / reach.total : 0;

/**
 * Most met first: by the player's own games, then by the population's share,
 * then shallowest — the order a player thinks of their repertoire in.
 */
export function rankByReach(rows: readonly PositionReach[]): PositionReach[] {
  return [...rows].sort(
    (a, b) =>
      (b.own ?? 0) - (a.own ?? 0) ||
      referenceShare(b.reference) - referenceShare(a.reference) ||
      a.position.depth - b.position.depth ||
      a.position.positionKey.localeCompare(b.position.positionKey),
  );
}

/**
 * The positions nobody plays against you: none of your games, and under the
 * floor in the population — deepest first, because the deep branch of a rare
 * line is where the wasted drilling is. A row whose counts have not arrived
 * is not "never reached"; it is unknown, and left out.
 */
export function neverReached(
  rows: readonly PositionReach[],
  minimumShare: number,
): PositionReach[] {
  return rows
    .filter(
      (row) =>
        row.own === 0 && row.reference !== null && referenceShare(row.reference) < minimumShare,
    )
    .sort(
      (a, b) =>
        b.position.depth - a.position.depth ||
        a.position.positionKey.localeCompare(b.position.positionKey),
    );
}

/** The share below which a population is said not to reach a position. */
export const RARE_SHARE = 0.005;
