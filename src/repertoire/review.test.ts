/**
 * The repertoire review session.
 *
 * Two claims carry the feature and both are asserted directly: a position is
 * one prompt however many ways lead to it, and the scheduling is the one the
 * training queue already uses rather than a second system that happens to look
 * similar.
 *
 * Everything else — which mode asks what, why a prompt is where it is in the
 * order — is checked through `reasons`, which is what a player sees, rather
 * than through the ordering number, which they never do.
 */

import { describe, expect, it } from 'vitest';

import type {
  RepertoireMove,
  RepertoirePositionRecord,
  ScheduleState,
  TrainingItemRecord,
} from '@/persistence/domain';
import { DAY_MS, newSchedule, stageOf } from '@/training/schedule';

import { buildReviewSession, describePromptReason, promptStatus, summariseSession } from './review';

const NOW = 1_700_000_000_000;

const move = (uci: string, san: string, expected = false): RepertoireMove =>
  ({
    uci,
    san,
    role: 'main',
    updatedAt: NOW,
    ...(expected ? { expected: true } : {}),
  }) as unknown as RepertoireMove;

const position = (
  key: string,
  sideToMove: 'w' | 'b',
  moves: readonly RepertoireMove[],
  depth = 2,
): RepertoirePositionRecord =>
  ({
    id: `pos-${key}-${depth}`,
    repertoireId: 'rep-1',
    positionKey: key,
    fen: `${key} 0 1`,
    sideToMove,
    moves,
    depth,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
  }) as unknown as RepertoirePositionRecord;

const card = (positionKey: string, schedule: ScheduleState): TrainingItemRecord =>
  ({
    id: `item-${positionKey}-${schedule.dueAt}`,
    mode: 'repertoire-recall',
    positionKey,
    fen: `${positionKey} 0 1`,
    sideToMove: 'w',
    prompt: 'Play your move',
    solutionUci: [],
    solutionSan: [],
    candidatesUci: [],
    plans: [],
    tags: [],
    schedule,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
  }) as unknown as TrainingItemRecord;

const scheduled = (over: Partial<ScheduleState>): ScheduleState => ({
  ...newSchedule(NOW),
  ...over,
});

describe('a position is one prompt, however many move orders reach it', () => {
  it('collapses two records that are the same position', () => {
    /*
      The Nimzo/Queen's Indian move order: 1.d4 Nf6 2.c4 e6 3.Nf3 and
      1.Nf3 Nf6 2.c4 e6 3.d4 arrive at the same position. Asking twice would
      make the player answer the same question in one session and let the
      scheduler count one memory as two.
    */
    const prompts = buildReviewSession(
      {
        colour: 'w',
        positions: [
          position('same-position', 'w', [move('d2d4', 'd4')], 4),
          position('same-position', 'w', [move('d2d4', 'd4')], 6),
        ],
      },
      { now: NOW },
    );
    expect(prompts).toHaveLength(1);
  });

  it('keeps the shortest route to it, because that is how a player names it', () => {
    const prompts = buildReviewSession(
      {
        colour: 'w',
        positions: [
          position('same-position', 'w', [move('d2d4', 'd4')], 6),
          position('same-position', 'w', [move('d2d4', 'd4')], 4),
        ],
      },
      { now: NOW },
    );
    expect(prompts[0]?.depth).toBe(4);
  });

  it('accepts every answer any route recorded', () => {
    // A move recorded on one path is still a move the repertoire plays in that
    // position, so the prompt must accept it however the player got there.
    const prompts = buildReviewSession(
      {
        colour: 'w',
        positions: [
          position('same-position', 'w', [move('d2d4', 'd4')], 4),
          position('same-position', 'w', [move('g1f3', 'Nf3')], 6),
        ],
      },
      { now: NOW },
    );
    expect(prompts).toHaveLength(1);
    expect([...(prompts[0]?.solutionUci ?? [])].sort()).toEqual(['d2d4', 'g1f3']);
  });

  it('counts the transpositions it collapsed rather than hiding them', () => {
    const input = {
      colour: 'w' as const,
      positions: [
        position('a', 'w', [move('d2d4', 'd4')], 4),
        position('a', 'w', [move('d2d4', 'd4')], 6),
        position('b', 'w', [move('c2c4', 'c4')], 4),
      ],
    };
    const prompts = buildReviewSession(input, { now: NOW });
    expect(summariseSession(input, prompts, { now: NOW })).toMatchObject({
      prompts: 2,
      transpositions: 1,
    });
  });

  it('reviews a position with two cards on the sooner of them', () => {
    /*
      Nothing stops two training cards existing for one position — one made
      from a game, one from a study. A due card must not be able to hide behind
      a distant one.
    */
    const prompts = buildReviewSession(
      {
        colour: 'w',
        positions: [position('key', 'w', [move('d2d4', 'd4')])],
        existingItems: [
          card('key', scheduled({ dueAt: NOW + 30 * DAY_MS, reviewCount: 4, streak: 4 })),
          card('key', scheduled({ dueAt: NOW - 2 * DAY_MS, reviewCount: 2, streak: 2 })),
        ],
      },
      { now: NOW },
    );
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.schedule.dueAt).toBe(NOW - 2 * DAY_MS);
    expect(prompts[0]?.reasons).toContainEqual({ kind: 'due', overdueDays: 2 });
  });
});

describe('what each drill mode asks about', () => {
  const positions = [
    position('mine', 'w', [move('d2d4', 'd4')]),
    position('theirs', 'b', [move('g8f6', 'Nf6', true)]),
    position('branching', 'w', [move('c2c4', 'c4'), move('g1f3', 'Nf3')]),
  ];

  const keys = (mode: 'my-move' | 'opponent-reply' | 'full-branch' | 'critical') =>
    buildReviewSession({ colour: 'w', positions }, { mode, now: NOW })
      .map((prompt) => prompt.positionKey)
      .sort();

  it('asks only about your own moves in my-move', () => {
    expect(keys('my-move')).toEqual(['branching', 'mine']);
  });

  it('asks only about the replies you expect in opponent-reply', () => {
    expect(keys('opponent-reply')).toEqual(['theirs']);
  });

  it('asks about everything in full-branch', () => {
    expect(keys('full-branch')).toEqual(['branching', 'mine', 'theirs']);
  });

  it('asks only where the repertoire records more than one answer in critical', () => {
    // The positions where a player is most likely to have forgotten which of
    // their own options they settled on.
    expect(keys('critical')).toEqual(['branching']);
  });

  it('leaves an expected opponent move out of your own side of the repertoire', () => {
    const prompts = buildReviewSession(
      {
        colour: 'w',
        positions: [position('mixed', 'w', [move('d2d4', 'd4'), move('e2e4', 'e4', true)])],
      },
      { mode: 'my-move', now: NOW },
    );
    expect(prompts[0]?.solutionUci).toEqual(['d2d4']);
  });

  it('counts the positions a mode does not ask about', () => {
    const input = { colour: 'w' as const, positions };
    const prompts = buildReviewSession(input, { mode: 'my-move', now: NOW });
    expect(summariseSession(input, prompts, { mode: 'my-move', now: NOW }).outsideMode).toBe(1);
  });
});

describe('the schedule is the training queue’s, not a second one', () => {
  it('gives a position never drilled a fresh schedule and says it is new', () => {
    const prompts = buildReviewSession(
      { colour: 'w', positions: [position('key', 'w', [move('d2d4', 'd4')])] },
      { now: NOW },
    );
    expect(prompts[0]?.unseen).toBe(true);
    expect(prompts[0]?.schedule).toEqual(newSchedule(NOW));
    expect(prompts[0]?.reasons).toContainEqual({ kind: 'new' });
  });

  it('carries an existing card’s schedule through unchanged', () => {
    const existing = scheduled({
      dueAt: NOW + 5 * DAY_MS,
      intervalDays: 12,
      lastReviewedAt: NOW - 7 * DAY_MS,
      reviewCount: 6,
      streak: 5,
    });
    const prompts = buildReviewSession(
      {
        colour: 'w',
        positions: [position('key', 'w', [move('d2d4', 'd4')])],
        existingItems: [card('key', existing)],
      },
      { now: NOW },
    );
    expect(prompts[0]?.schedule).toEqual(existing);
    expect(prompts[0]?.unseen).toBe(false);
  });

  it('reports the facts the queue shows: last reviewed, next due, interval', () => {
    const existing = scheduled({
      dueAt: NOW + 5 * DAY_MS,
      intervalDays: 12,
      lastReviewedAt: NOW - 7 * DAY_MS,
      reviewCount: 6,
      streak: 5,
    });
    const [prompt] = buildReviewSession(
      {
        colour: 'w',
        positions: [position('key', 'w', [move('d2d4', 'd4')])],
        existingItems: [card('key', existing)],
      },
      { now: NOW },
    );
    expect(promptStatus(prompt!, NOW)).toEqual({
      stage: stageOf(existing),
      lastReviewedAt: NOW - 7 * DAY_MS,
      nextDueAt: NOW + 5 * DAY_MS,
      intervalDays: 12,
      due: false,
    });
  });

  it('can restrict a session to what is due', () => {
    const prompts = buildReviewSession(
      {
        colour: 'w',
        positions: [
          position('due', 'w', [move('d2d4', 'd4')]),
          position('later', 'w', [move('c2c4', 'c4')]),
        ],
        existingItems: [
          card('due', scheduled({ dueAt: NOW - DAY_MS, reviewCount: 3, streak: 3 })),
          card('later', scheduled({ dueAt: NOW + 20 * DAY_MS, reviewCount: 3, streak: 3 })),
        ],
      },
      { dueOnly: true, now: NOW },
    );
    expect(prompts.map((prompt) => prompt.positionKey)).toEqual(['due']);
  });

  it('treats a position that has never been drilled as due', () => {
    // A fresh schedule is due immediately, which is what makes "due only" a
    // usable first session rather than an empty one.
    const prompts = buildReviewSession(
      { colour: 'w', positions: [position('key', 'w', [move('d2d4', 'd4')])] },
      { dueOnly: true, now: NOW },
    );
    expect(prompts).toHaveLength(1);
  });
});

describe('why a prompt is where it is', () => {
  const withReasons = (
    existing: ScheduleState | null,
    extra: Partial<Parameters<typeof buildReviewSession>[0]> = {},
  ) =>
    buildReviewSession(
      {
        colour: 'w',
        positions: [position('key', 'w', [move('d2d4', 'd4')])],
        ...(existing ? { existingItems: [card('key', existing)] } : {}),
        ...extra,
      },
      { now: NOW },
    )[0]?.reasons ?? [];

  it('reports how overdue a card is, in days', () => {
    expect(
      withReasons(scheduled({ dueAt: NOW - 9 * DAY_MS, reviewCount: 3, streak: 3 })),
    ).toContainEqual({ kind: 'due', overdueDays: 9 });
  });

  it('reports lapses against the reviews they happened in', () => {
    expect(
      withReasons(scheduled({ dueAt: NOW + DAY_MS, reviewCount: 8, streak: 1, lapses: 3 })),
    ).toContainEqual({ kind: 'lapsed', lapses: 3, reviews: 8 });
  });

  it('reports how often a named population reaches the position', () => {
    expect(
      withReasons(null, {
        population: {
          source: 'Elite OTB',
          games: new Map([['key', { games: 1200, total: 9600 }]]),
        },
      }),
    ).toContainEqual({
      kind: 'population',
      source: 'Elite OTB',
      games: 1200,
      total: 9600,
      share: 0.125,
    });
  });

  it('reports what one opponent actually reached', () => {
    expect(
      withReasons(null, {
        opponent: { name: 'Nepomniachtchi', games: new Map([['key', 7]]) },
      }),
    ).toContainEqual({ kind: 'opponent', player: 'Nepomniachtchi', games: 7 });
  });

  it('says nothing about a population that was not consulted', () => {
    expect(withReasons(null).map((reason) => reason.kind)).not.toContain('population');
    expect(withReasons(null).map((reason) => reason.kind)).not.toContain('opponent');
  });

  it('puts a lapsed card above one that is merely due', () => {
    const prompts = buildReviewSession(
      {
        colour: 'w',
        positions: [
          position('forgotten', 'w', [move('d2d4', 'd4')]),
          position('due', 'w', [move('c2c4', 'c4')]),
        ],
        existingItems: [
          card(
            'forgotten',
            scheduled({ dueAt: NOW - DAY_MS, reviewCount: 9, streak: 0, lapses: 4 }),
          ),
          card('due', scheduled({ dueAt: NOW - DAY_MS, reviewCount: 4, streak: 4 })),
        ],
      },
      { now: NOW },
    );
    expect(prompts.map((prompt) => prompt.positionKey)).toEqual(['forgotten', 'due']);
  });

  it('never puts an ordering number in what the reader is given', () => {
    const [prompt] = buildReviewSession(
      { colour: 'w', positions: [position('key', 'w', [move('d2d4', 'd4')])] },
      { now: NOW },
    );
    expect(Object.keys(prompt!).sort()).toEqual([
      'depth',
      'fen',
      'positionKey',
      'reasons',
      'schedule',
      'sideToMove',
      'solutionSan',
      'solutionUci',
      'unseen',
    ]);
  });
});

describe('putting a reason into words', () => {
  it('keeps the denominator in the sentence', () => {
    expect(
      describePromptReason({
        kind: 'population',
        source: 'Elite OTB',
        games: 1200,
        total: 9600,
        share: 0.125,
      }),
    ).toBe('reached in 12.5% of Elite OTB (1,200 of 9,600)');
    expect(describePromptReason({ kind: 'lapsed', lapses: 3, reviews: 8 })).toBe(
      'answered wrongly 3 of 8 times',
    );
  });

  it('says how overdue, not just that it is overdue', () => {
    expect(describePromptReason({ kind: 'due', overdueDays: 0 })).toBe('due today');
    expect(describePromptReason({ kind: 'due', overdueDays: 1 })).toBe('1 day overdue');
    expect(describePromptReason({ kind: 'due', overdueDays: 12 })).toBe('12 days overdue');
  });

  it('names the opponent and the branching', () => {
    expect(describePromptReason({ kind: 'opponent', player: 'Ding', games: 4 })).toBe(
      'Ding reached it 4 times',
    );
    expect(describePromptReason({ kind: 'branching', answers: 3 })).toBe('3 answers recorded here');
    expect(describePromptReason({ kind: 'new' })).toBe('never drilled');
  });
});
