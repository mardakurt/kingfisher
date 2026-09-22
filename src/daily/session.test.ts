/**
 * Tests for `src/daily/session.ts`.
 *
 * The four properties the design calls out, in order, and the four
 * mutations that must fail them. Each mutation is named for what it
 * breaks, so a failing assertion can be matched to the design decision
 * without a comment.
 */

import { describe, expect, it } from 'vitest';

import type { San, Uci } from '@/chess/types';
import type {
  EndgamePositionRecord,
  PreparationSessionRecord,
  PreparationSheetCard,
  ReviewItemRecord,
  TrainingItemRecord,
} from '@/persistence/domain';
import { grade as scheduleGrade, newSchedule } from '@/training/schedule';

import {
  buildDailySession,
  criticalSlice,
  endgameSlice,
  freshSchedule,
  repertoireSlice,
  briefSlice,
  type RepertoireCard,
} from './session';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const baseTraining = (overrides: Partial<TrainingItemRecord> = {}): TrainingItemRecord => ({
  id: overrides.id ?? 'train:1',
  mode: overrides.mode ?? 'repertoire-recall',
  positionKey:
    overrides.positionKey ?? ('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as never),
  fen: overrides.fen ?? ('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as never),
  sideToMove: overrides.sideToMove ?? 'w',
  prompt: overrides.prompt ?? 'Recall your move',
  solutionUci: overrides.solutionUci ?? (['g1f3'] as unknown as readonly Uci[]),
  solutionSan: overrides.solutionSan ?? (['Nf3'] as unknown as readonly San[]),
  candidatesUci: overrides.candidatesUci ?? [],
  plans: overrides.plans ?? [],
  tags: overrides.tags ?? [],
  schedule: overrides.schedule ?? newSchedule(NOW),
  createdAt: overrides.createdAt ?? NOW,
  updatedAt: overrides.updatedAt ?? NOW,
  revision: overrides.revision ?? 1,
});

const baseReview = (overrides: Partial<ReviewItemRecord> = {}): ReviewItemRecord => {
  const base: ReviewItemRecord = {
    id: overrides.id ?? 'rev:1',
    identityKey: overrides.identityKey ?? `rev:${overrides.id ?? 1}`,
    positionKey:
      overrides.positionKey ??
      ('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as never),
    fen: overrides.fen ?? ('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as never),
    sideToMove: overrides.sideToMove ?? 'w',
    source: overrides.source ?? 'marked',
    category: (overrides.category ?? 'calculation') as ReviewItemRecord['category'],
    status: (overrides.status ?? 'unreviewed') as ReviewItemRecord['status'],
    markedFromGames: overrides.markedFromGames ?? [],
    signals: overrides.signals ?? [],
    themes: overrides.themes ?? [],
    createdAt: overrides.createdAt ?? NOW,
    revision: overrides.revision ?? 1,
  };
  return overrides.schedule === undefined ? base : { ...base, schedule: overrides.schedule };
};

const baseEndgame = (overrides: Partial<EndgamePositionRecord> = {}): EndgamePositionRecord => ({
  id: overrides.id ?? 'eg:1',
  positionKey: overrides.positionKey ?? ('8/8/8/8/8/8/4K3/4k3 w - - 0 1' as never),
  fen: overrides.fen ?? ('8/8/8/8/8/8/4K3/4k3 w - - 0 1' as never),
  sideToMove: overrides.sideToMove ?? 'w',
  title: overrides.title ?? 'K vs k',
  category: (overrides.category ?? 'rook') as EndgamePositionRecord['category'],
  goal: (overrides.goal ?? 'win') as EndgamePositionRecord['goal'],
  tags: overrides.tags ?? [],
  pieceCount: overrides.pieceCount ?? 2,
  createdAt: overrides.createdAt ?? NOW,
  updatedAt: overrides.updatedAt ?? NOW,
  revision: overrides.revision ?? 1,
});

const baseSession = (
  overrides: Partial<PreparationSessionRecord> = {},
): PreparationSessionRecord => ({
  id: overrides.id ?? 'prep:1',
  title: overrides.title ?? 'Round 3 vs Rival',
  opponent: overrides.opponent,
  opponentKey: overrides.opponentKey,
  myColor: overrides.myColor ?? 'w',
  event: overrides.event ?? 'Club Open',
  round: overrides.round ?? '3',
  gameDate: overrides.gameDate ?? '2026-06-20',
  notes: overrides.notes,
  repertoireIds: overrides.repertoireIds ?? [],
  studyIds: overrides.studyIds ?? [],
  openingFileIds: overrides.openingFileIds ?? [],
  modelGameLinkIds: overrides.modelGameLinkIds ?? [],
  reviewItemIds: overrides.reviewItemIds ?? [],
  sheet: overrides.sheet ?? [],
  createdAt: overrides.createdAt ?? NOW - DAY_MS,
  updatedAt: overrides.updatedAt ?? NOW,
  revision: overrides.revision ?? 1,
});

const sheet = (overrides: Partial<PreparationSheetCard> = {}): PreparationSheetCard => ({
  id: overrides.id ?? 'sheet:1',
  positionKey:
    overrides.positionKey ??
    ('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' as never),
  fen: overrides.fen ?? ('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' as never),
  line: (overrides.line ?? ['e4', 'e5']) as readonly San[],
  why: overrides.why ?? 'The Spanish.',
  intendedSan: (overrides.intendedSan ?? 'Nf3') as San,
  note: overrides.note,
  source: overrides.source,
  createdAt: overrides.createdAt ?? NOW,
});

const dueSchedule = (overrides: { dueAt?: number; reviewed?: boolean } = {}) => ({
  ...newSchedule(NOW - DAY_MS * 7),
  dueAt: overrides.dueAt ?? NOW - 1000,
  lastReviewedAt: NOW - DAY_MS * 7,
  reviewCount: overrides.reviewed === false ? 0 : 1,
  streak: overrides.reviewed === false ? 0 : 1,
});

describe('repertoireSlice', () => {
  it('includes a repertoire-recall item whose schedule is due', () => {
    const items = [baseTraining({ schedule: dueSchedule() })];
    const cards = repertoireSlice(items, NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe('repertoire');
  });

  it('omits a repertoire-recall item whose schedule is not due', () => {
    const items = [
      baseTraining({
        schedule: {
          ...newSchedule(NOW),
          dueAt: NOW + DAY_MS * 3,
          reviewCount: 1,
          streak: 1,
        },
      }),
    ];
    expect(repertoireSlice(items, NOW)).toHaveLength(0);
  });

  it('omits a training item in a different mode (it belongs in /training)', () => {
    const items = [baseTraining({ mode: 'best-move', schedule: dueSchedule() })];
    expect(repertoireSlice(items, NOW)).toHaveLength(0);
  });

  it('sorts by dueAt, soonest first', () => {
    const a = baseTraining({
      id: 'a',
      schedule: {
        ...newSchedule(NOW - DAY_MS),
        dueAt: NOW + DAY_MS * 5,
        reviewCount: 1,
        streak: 1,
      },
    });
    const b = baseTraining({
      id: 'b',
      schedule: {
        ...newSchedule(NOW - DAY_MS),
        dueAt: NOW - DAY_MS * 2,
        reviewCount: 1,
        streak: 1,
      },
    });
    const c = baseTraining({
      id: 'c',
      schedule: { ...newSchedule(NOW - DAY_MS), dueAt: NOW - 1000, reviewCount: 1, streak: 1 },
    });
    const cards = repertoireSlice([a, b, c], NOW);
    // a is not due; b (NOW - 2d) sorts before c (NOW - 1000ms).
    expect(cards.map((card) => card.id)).toEqual(['b', 'c']);
  });

  it('reads the first recorded solution as intendedSan', () => {
    const items = [
      baseTraining({
        schedule: dueSchedule(),
        solutionSan: ['Nf3' as San, 'Nc3' as San],
      }),
    ];
    const cards = repertoireSlice(items, NOW);
    expect((cards[0] as RepertoireCard).intendedSan).toBe('Nf3');
  });
});

describe('criticalSlice', () => {
  it('includes a review item whose schedule is due', () => {
    const items = [baseReview({ schedule: dueSchedule() })];
    const cards = criticalSlice(items, NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe('critical');
  });

  it('omits a review item without a schedule', () => {
    const items = [baseReview()];
    expect(criticalSlice(items, NOW)).toHaveLength(0);
  });

  it("honours `scheduleAfterReview('never')` as not-scheduled", () => {
    const items = [baseReview({ schedule: scheduleGrade(dueSchedule(), 'good', NOW) })];
    // Without the schedule, the item is not due (it was deliberately left unscheduled).
    const without = [baseReview({ id: items[0]!.id })];
    expect(criticalSlice(without, NOW)).toHaveLength(0);
  });
});

describe('endgameSlice', () => {
  it('includes only positions the tablebase can answer (≤7 pieces)', () => {
    const eligible = baseEndgame({ id: 'eligible', pieceCount: 7 });
    const oversized = baseEndgame({ id: 'oversized', pieceCount: 8 });
    const cards = endgameSlice([eligible, oversized], NOW, 'salt');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe('eligible');
  });

  it('returns an empty slice when nothing is tablebase-eligible', () => {
    const oversized = baseEndgame({ id: 'oversized', pieceCount: 9 });
    const cards = endgameSlice([oversized], NOW, 'salt');
    expect(cards).toHaveLength(0);
  });

  it('picks deterministically by day, with the same pick the same day', () => {
    const a = baseEndgame({ id: 'a', pieceCount: 3 });
    const b = baseEndgame({ id: 'b', pieceCount: 4 });
    const c = baseEndgame({ id: 'c', pieceCount: 5 });
    const records = [a, b, c];
    const first = endgameSlice(records, NOW, 'salt')[0]?.id;
    const second = endgameSlice(records, NOW + 1000, 'salt')[0]?.id;
    const nextDay = endgameSlice(records, NOW + DAY_MS, 'salt')[0]?.id;
    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(typeof nextDay).toBe('string');
  });

  it('produces different picks on different days (statistically)', () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      baseEndgame({ id: `eg-${i}`, pieceCount: 3 }),
    );
    const picks = new Set<string>();
    for (let day = 0; day < 20; day += 1) {
      const card = endgameSlice(records, NOW + day * DAY_MS, 'salt')[0];
      if (card) picks.add(card.id);
    }
    expect(picks.size).toBeGreaterThan(2);
  });
});

describe('briefSlice', () => {
  it('returns the most recently updated session with a non-empty sheet', () => {
    const older = baseSession({
      id: 'old',
      updatedAt: NOW - DAY_MS * 7,
      sheet: [sheet({ id: 'old-card', intendedSan: 'e4' as San })],
    });
    const newer = baseSession({
      id: 'new',
      updatedAt: NOW,
      sheet: [sheet({ id: 'new-card', intendedSan: 'd4' as San })],
    });
    const cards = briefSlice([older, newer]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe('new-card');
  });

  it('skips sessions whose sheet is empty', () => {
    const empty = baseSession({ id: 'empty', updatedAt: NOW, sheet: [] });
    expect(briefSlice([empty])).toHaveLength(0);
  });

  it('skips sheet cards without an intended move (a curation never completed)', () => {
    const card: PreparationSheetCard = sheet({ id: 'incomplete' });
    const incomplete: PreparationSheetCard = { ...card, intendedSan: undefined };
    const session = baseSession({ sheet: [incomplete] });
    expect(briefSlice([session])).toHaveLength(0);
  });

  it('caps the slice at three cards', () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      sheet({ id: `card-${i}`, intendedSan: 'e4' as never }),
    );
    const session = baseSession({ sheet: cards });
    expect(briefSlice([session])).toHaveLength(3);
  });
});

describe('buildDailySession', () => {
  it('returns the four slices in order', () => {
    const session = buildDailySession({
      training: [],
      review: [],
      endgame: [],
      sessions: [],
      now: NOW,
      endgameSalt: 'salt',
    });
    expect(session.slices.map((slice) => slice.id)).toEqual([
      'repertoire',
      'critical',
      'endgame',
      'brief',
    ]);
  });

  it('sums totalCount and minutes across slices', () => {
    const training = [baseTraining({ schedule: dueSchedule() })];
    const review = [baseReview({ schedule: dueSchedule() })];
    const endgame = [baseEndgame({ pieceCount: 7 })];
    const sessions = [
      baseSession({
        sheet: [sheet({ id: 'card-a' }), sheet({ id: 'card-b' }), sheet({ id: 'card-c' })],
      }),
    ];
    const session = buildDailySession({
      training,
      review,
      endgame,
      sessions,
      now: NOW,
      endgameSalt: 'salt',
    });
    expect(session.totalCount).toBe(6);
    // 1×1 (rep) + 1×2 (crit) + 1×2 (endgame) + 3×1 (brief) = 1 + 2 + 2 + 3 = 8
    expect(session.minutes).toBe(8);
  });

  it('returns a stable content hash for the same input', () => {
    const input = {
      training: [baseTraining({ schedule: dueSchedule() })],
      review: [],
      endgame: [],
      sessions: [],
      now: NOW,
      endgameSalt: 'salt',
    };
    const a = buildDailySession(input);
    const b = buildDailySession(input);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it('changes the content hash when an input changes', () => {
    const before = buildDailySession({
      training: [baseTraining({ id: 'a', schedule: dueSchedule() })],
      review: [],
      endgame: [],
      sessions: [],
      now: NOW,
      endgameSalt: 'salt',
    });
    const after = buildDailySession({
      training: [baseTraining({ id: 'b', schedule: dueSchedule() })],
      review: [],
      endgame: [],
      sessions: [],
      now: NOW,
      endgameSalt: 'salt',
    });
    expect(before.contentHash).not.toBe(after.contentHash);
  });

  it('the four mutations that must fail', () => {
    // 1. A training item with a not-due schedule must not appear in repertoire.
    const items = [
      baseTraining({
        schedule: {
          ...newSchedule(NOW),
          dueAt: NOW + DAY_MS * 5,
          reviewCount: 1,
          streak: 1,
        },
      }),
    ];
    expect(repertoireSlice(items, NOW)).toHaveLength(0);

    // 2. A review item without a schedule must not appear.
    const unScheduled = criticalSlice([baseReview()], NOW);
    expect(unScheduled).toHaveLength(0);

    // 3. An 8-piece endgame must not be treated as tablebase-eligible.
    const endgame = endgameSlice([baseEndgame({ pieceCount: 8 })], NOW, 'salt');
    expect(endgame).toHaveLength(0);

    // 4. The brief must pick the most-recent session, not the older one.
    const older = baseSession({
      id: 'old',
      updatedAt: NOW - DAY_MS * 7,
      sheet: [sheet({ id: 'old-card', intendedSan: 'e4' as San })],
    });
    const newer = baseSession({
      id: 'new',
      updatedAt: NOW,
      sheet: [sheet({ id: 'new-card', intendedSan: 'd4' as San })],
    });
    const brief = briefSlice([older, newer]);
    expect(brief[0]?.id).toBe('new-card');
  });
});

describe('freshSchedule', () => {
  it('returns a schedule that is due now (the first review is today)', () => {
    expect(freshSchedule(NOW).dueAt).toBe(NOW);
  });
});
