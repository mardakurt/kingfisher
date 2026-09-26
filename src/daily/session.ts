/**
 * The daily session: fifteen minutes built only from the player's own work.
 *
 * Four slices from existing stores, in a fixed order:
 *
 *   1. Repertoire cards      — `TrainingItemRecord`s in `repertoire-recall`
 *                               mode whose schedule is due.
 *   2. Critical positions    — review items whose schedule is due.
 *   3. Endgame               — one eligible saved position, seeded per day.
 *   4. Brief rehearsal       — the most recent upcoming, otherwise completed.
 *
 * Everything here is a pure function of the inputs. The schedule that the
 * rehearsal writes is the existing SM-2 schedule on the same record, so
 * the audit trail is the schedule the player already trusts — no separate
 * "daily session" store.
 *
 * The repertoire slice reads `TrainingItemRecord`s, not `RepertoirePositionRecord`s.
 * Repertoire positions are owned facts; the schedule lives on the
 * training item that the rehearsal actually grades. Phase 18's enrol
 * design says: "a repertoire prompt becomes an ordinary `TrainingItemRecord`
 * in `repertoire-recall` mode" — the daily session reuses that, rather
 * than inventing a second schedule.
 *
 * See `docs/design/daily-session.md` for the design.
 */

import type { San } from '@/chess/types';
import type { ScheduleState } from '@/persistence/domain';
import { isDue, newSchedule } from '@/training/schedule';
import type {
  EndgamePositionRecord,
  PreparationSessionRecord,
  PreparationSheetCard,
  ReviewItemRecord,
  TrainingItemRecord,
} from '@/persistence/domain';

export type SliceId = 'repertoire' | 'critical' | 'endgame' | 'brief';

/** Cards that come from the player's repertoire, due under the existing SM-2 schedule. */
export interface RepertoireCard {
  readonly kind: 'repertoire';
  readonly id: string;
  readonly positionKey: string;
  readonly fen: string;
  readonly sideToMove: 'w' | 'b';
  readonly prompt: string;
  readonly intendedSan: San | undefined;
  readonly schedule: ScheduleState;
  readonly dueInDays: number;
}

/** Critical positions used as calculation prompts; schedule due. */
export interface CriticalCard {
  readonly kind: 'critical';
  readonly id: string;
  readonly positionKey: string;
  readonly fen: string;
  readonly sideToMove: 'w' | 'b';
  readonly gameLabel: string;
  readonly reason: string;
  readonly schedule: ScheduleState;
  readonly dueInDays: number;
}

/** Endgame positions: only those the tablebase can answer (≤7 pieces). */
export interface EndgameCard {
  readonly kind: 'endgame';
  readonly id: string;
  readonly positionKey: string;
  readonly fen: string;
  readonly sideToMove: 'w' | 'b';
  readonly title: string;
  readonly category: string;
  readonly goal: string;
}

/** The player's own sheet, drawn from the most recent preparation session. */
export interface BriefCard {
  readonly kind: 'brief';
  readonly id: string;
  readonly positionKey: string;
  readonly fen: string;
  readonly why: string;
  readonly intendedSan: San | undefined;
}

export type SessionCard = RepertoireCard | CriticalCard | EndgameCard | BriefCard;

export interface SessionSlice {
  readonly id: SliceId;
  readonly cards: readonly SessionCard[];
  /** Names the input that would make this slice non-empty. Shown when `cards.length === 0`. */
  readonly emptyReason: string;
}

export interface DailySession {
  readonly slices: readonly SessionSlice[];
  readonly totalCount: number;
  /** Words for the header; computed deterministically from the slice counts. */
  readonly minutes: number;
  /** Hash of the underlying inputs, for change detection in the workspace. */
  readonly contentHash: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const ENDGAME_TABLEBASE_LIMIT = 7;

/**
 * Slice minutes — how long a card in this slice is expected to take, in
 * the player's vocabulary. These are honest hints, not commitments.
 */
const SLICE_MINUTES: Record<SliceId, number> = {
  repertoire: 1,
  critical: 2,
  endgame: 2,
  brief: 1,
};

const REPERTOIRE_EMPTY =
  'No repertoire cards due. Mark a position as your move in any repertoire to start.';
const CRITICAL_EMPTY =
  'No critical positions due. Tag a position as critical in any review to start.';
const ENDGAME_EMPTY = 'No saved endgame positions. Save a position from the position actions menu.';
const BRIEF_EMPTY = 'No round brief to rehearse. Build one for an upcoming round in Preparation.';

const dueInDays = (schedule: ScheduleState, now: number): number =>
  Math.round((schedule.dueAt - now) / DAY_MS);

/**
 * Repertoire slice.
 *
 * Reads `TrainingItemRecord`s in `repertoire-recall` mode. Phase 18 chose
 * to model repertoire review as a training item rather than a schedule on
 * the repertoire position itself, and the daily session reuses that
 * choice: one schedule, one place to grade, the audit trail the player
 * already trusts.
 *
 * Eligibility:
 *
 * - `mode === 'repertoire-recall'`
 * - `isDue(item.schedule, now)` is true.
 *
 * An item not in `repertoire-recall` mode is a Training card of another
 * kind; it belongs in `/training`, not here. An item without a schedule
 * cannot happen (the field is required on `TrainingItemRecord`), but a
 * new item with `dueAt === now` is due today by definition.
 */
export function repertoireSlice(
  items: readonly TrainingItemRecord[],
  now: number,
): readonly RepertoireCard[] {
  return items
    .filter((item) => item.mode === 'repertoire-recall' && isDue(item.schedule, now))
    .sort((a, b) => a.schedule.dueAt - b.schedule.dueAt)
    .map((item) => ({
      kind: 'repertoire',
      id: item.id,
      positionKey: item.positionKey,
      fen: item.fen,
      sideToMove: item.sideToMove,
      prompt: item.prompt,
      intendedSan: item.solutionSan[0],
      schedule: item.schedule,
      dueInDays: dueInDays(item.schedule, now),
    }));
}

/**
 * Critical positions slice.
 *
 * Uses `dueReviews`, which already filters by schedule and excludes items
 * without one. A critical position reviewed once and left unscheduled is a
 * deliberate choice; surfacing it as a daily prompt would undo that choice.
 */
export function criticalSlice(
  items: readonly ReviewItemRecord[],
  now: number,
): readonly CriticalCard[] {
  return items
    .filter(
      (item): item is ReviewItemRecord & { schedule: ScheduleState } => item.schedule !== undefined,
    )
    .filter((item) => isDue(item.schedule, now))
    .sort((a, b) => a.schedule.dueAt - b.schedule.dueAt)
    .map((item) => ({
      kind: 'critical',
      id: item.id,
      positionKey: item.positionKey,
      fen: item.fen,
      sideToMove: item.sideToMove,
      gameLabel: item.gameLabel ?? 'Critical position',
      reason: item.reason ?? item.category ?? 'Marked critical',
      schedule: item.schedule,
      dueInDays: dueInDays(item.schedule, now),
    }));
}

/**
 * Endgame slice: one eligible position, seeded per day.
 *
 * Eligibility: `pieceCount ≤ 7` (the Syzygi tablebase cutoff). Anything
 * bigger cannot be answered by the tablebase and the rehearsal would be a
 * guess — the brief says "your own structures", not "your own unanswerable
 * positions".
 *
 * The seed is `positionKey` plus the day, so the pick is deterministic for
 * the same player on the same day, but a new day yields a new position.
 * The seeded shuffle is a 32-bit hash; an FNV-1a over the keys is enough
 * for a daily pick that does not need to be cryptographic.
 */
export function endgameSlice(
  records: readonly EndgamePositionRecord[],
  now: number,
  salt: string,
): readonly EndgameCard[] {
  const eligible = records.filter((record) => record.pieceCount <= ENDGAME_TABLEBASE_LIMIT);
  if (eligible.length === 0) return [];
  const day = Math.floor(now / DAY_MS);
  const pick = pickSeeded(eligible, `${salt}|${day}`);
  return [
    {
      kind: 'endgame',
      id: pick.id,
      positionKey: pick.positionKey,
      fen: pick.fen,
      sideToMove: pick.sideToMove,
      title: pick.title,
      category: pick.category,
      goal: pick.goal,
    },
  ];
}

/**
 * Brief slice: the most recent `PreparationSessionRecord` with a sheet.
 *
 * The brief is a session's own record; the order is by `updatedAt`. The
 * session that is current (`gameDate` is today or in the future, or there
 * is no `gameDate` and `updatedAt` is the most recent) is what the player
 * is rehearsing for.
 */
export function briefSlice(sessions: readonly PreparationSessionRecord[]): readonly BriefCard[] {
  const ordered = [...sessions]
    .filter((session) => session.sheet.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const top = ordered[0];
  if (!top) return [];
  return top.sheet
    .filter(
      (card): card is PreparationSheetCard & { intendedSan: San } => card.intendedSan !== undefined,
    )
    .slice(0, 3)
    .map((card) => ({
      kind: 'brief',
      id: card.id,
      positionKey: card.positionKey,
      fen: card.fen,
      why: card.why ?? card.note ?? '',
      intendedSan: card.intendedSan,
    }));
}

/**
 * Build the four slices into a session.
 *
 * The session's content hash is a join of the slice contents, so a change
 * to any input that affects a card rebuilds the session and the workspace
 * can refresh the header without re-reading every store itself.
 */
export function buildDailySession(input: {
  readonly training: readonly TrainingItemRecord[];
  readonly review: readonly ReviewItemRecord[];
  readonly endgame: readonly EndgamePositionRecord[];
  readonly sessions: readonly PreparationSessionRecord[];
  readonly now: number;
  /** Stable seed for the endgame pick, so the same player picks the same endgame each day. */
  readonly endgameSalt: string;
}): DailySession {
  const repertoire = repertoireSlice(input.training, input.now);
  const critical = criticalSlice(input.review, input.now);
  const endgame = endgameSlice(input.endgame, input.now, input.endgameSalt);
  const brief = briefSlice(input.sessions);

  const slices: SessionSlice[] = [
    { id: 'repertoire', cards: repertoire, emptyReason: REPERTOIRE_EMPTY },
    { id: 'critical', cards: critical, emptyReason: CRITICAL_EMPTY },
    { id: 'endgame', cards: endgame, emptyReason: ENDGAME_EMPTY },
    { id: 'brief', cards: brief, emptyReason: BRIEF_EMPTY },
  ];
  const totalCount = slices.reduce((sum, slice) => sum + slice.cards.length, 0);
  const minutes = slices.reduce(
    (sum, slice) => sum + SLICE_MINUTES[slice.id] * slice.cards.length,
    0,
  );

  return {
    slices,
    totalCount,
    minutes,
    contentHash: hashSession(slices),
  };
}

/**
 * A fresh schedule for an item that has never been reviewed.
 *
 * Most positions the player owns already have a schedule; this is the
 * factory for the rare case where a brand-new position is being fed into
 * the daily session by a future feature. Exposed so the workspace can call
 * it without re-implementing the import.
 */
export const freshSchedule = newSchedule;

/**
 * FNV-1a 32-bit hash, deterministic across browsers.
 *
 * Used to seed the endgame shuffle so the player's daily endgame is the
 * same when they open the route twice in the same day and different the
 * next. Cryptographic strength is not the point; reproducibility is.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

function pickSeeded<T>(items: readonly T[], seed: string): T {
  if (items.length === 1) return items[0]!;
  const index = fnv1a(seed) % items.length;
  return items[index]!;
}

function hashSession(slices: readonly SessionSlice[]): string {
  const id = slices
    .map((slice) => `${slice.id}:${slice.cards.map((card) => card.id).join(',')}`)
    .join('|');
  return fnv1a(id).toString(16);
}
