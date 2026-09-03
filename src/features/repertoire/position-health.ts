/**
 * What Kingfisher already knows about the position in front of you.
 *
 * Every fact here was being stored before Phase 10 and shown nowhere together:
 * the repertoire decision lived in one tab, the review schedule in Training,
 * the model games in a third panel, and whether an opponent file touched this
 * position was not surfaced at all. Gathering them is the whole feature.
 *
 * Deliberately not a score. A single number would have to weigh "reviewed 18
 * days ago" against "four model games" against "9.h4 is rising", and there is
 * no honest exchange rate between those. The panel reports facts and lets the
 * player judge; a mystery number would only teach them to distrust it.
 */

import type { RepertoireMove, ScheduleState } from '@/persistence/domain';

export interface PositionHealth {
  readonly mainResponse: string | null;
  readonly alternatives: readonly string[];
  readonly avoided: readonly string[];
  readonly note: string | null;
  readonly lastReviewedAt: number | null;
  readonly dueAt: number | null;
  readonly reviewCount: number;
  readonly lapses: number;
  readonly modelGames: number;
  readonly openingFiles: number;
}

/** The decision, reduced to the three things a player asks about it. */
export function summariseMoves(moves: readonly RepertoireMove[]): {
  mainResponse: string | null;
  alternatives: readonly string[];
  avoided: readonly string[];
} {
  const byRole = (role: RepertoireMove['role']) =>
    moves.filter((move) => move.role === role).map((move) => move.san);
  return {
    mainResponse: byRole('main')[0] ?? null,
    alternatives: byRole('alternative'),
    avoided: byRole('avoid'),
  };
}

/**
 * The soonest-due schedule among the items covering this position.
 *
 * Soonest rather than newest: what a player wants to know is when this
 * position next needs their attention, and the item due first is the one that
 * will bring it back.
 */
export function soonestSchedule(schedules: readonly ScheduleState[]): ScheduleState | null {
  if (schedules.length === 0) return null;
  return schedules.reduce((best, entry) => (entry.dueAt < best.dueAt ? entry : best));
}

const DAY_MS = 86_400_000;

/**
 * "18 days ago", "in 4 days", "today".
 *
 * Whole days, because review intervals are measured in days and reporting
 * "in 3 days, 4 hours" implies a precision the scheduler does not have.
 */
export function relativeDays(timestamp: number, now: number): string {
  const days = Math.round((timestamp - now) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}
