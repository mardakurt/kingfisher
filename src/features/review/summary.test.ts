import { describe, expect, it } from 'vitest';

import { START_FEN, positionKey } from '@/chess/fen';
import type { ReviewItemRecord } from '@/persistence/domain';
import {
  PERIODS,
  countThemes,
  improvementReport,
  itemsWithTheme,
  periodStart,
  reviewedItems,
  themeTrends,
} from './summary';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

let counter = 0;
const item = (over: Partial<ReviewItemRecord> = {}): ReviewItemRecord => {
  counter += 1;
  return {
    id: `review-${counter}`,
    identityKey: `key-${counter}`,
    positionKey: positionKey(START_FEN),
    fen: START_FEN,
    sideToMove: 'w',
    source: 'marked',
    status: 'reviewed',
    signals: [],
    themes: [],
    createdAt: NOW - DAY,
    reviewedAt: NOW - DAY,
    revision: 0,
    ...over,
  };
};

describe('reviewed items', () => {
  it('counts reviewed and converted, and nothing else', () => {
    const items = [
      item({ status: 'reviewed' }),
      item({ status: 'converted' }),
      item({ status: 'unreviewed' }),
      item({ status: 'ignored' }),
    ];
    expect(reviewedItems(items)).toHaveLength(2);
  });

  it('orders newest first and respects a cutoff', () => {
    const old = item({ reviewedAt: NOW - 100 * DAY });
    const recent = item({ reviewedAt: NOW - DAY });
    expect(reviewedItems([old, recent])[0]?.id).toBe(recent.id);
    expect(reviewedItems([old, recent], NOW - 30 * DAY)).toHaveLength(1);
  });
});

describe('theme counts', () => {
  it('counts a position once per theme it carries', () => {
    const counts = countThemes([
      { themes: ['calculation', 'trade-decision'] },
      { themes: ['calculation'] },
      { themes: [] },
    ]);
    expect(counts).toEqual([
      { theme: 'calculation', label: 'Calculation', count: 2 },
      { theme: 'trade-decision', label: 'Trade decision', count: 1 },
    ]);
  });

  it('labels a user tag readably without inventing one', () => {
    expect(countThemes([{ themes: ['my-own-thing'] }])[0]?.label).toBe('My own thing');
  });

  it('breaks equal counts alphabetically, so the order is stable', () => {
    const counts = countThemes([{ themes: ['king-safety'] }, { themes: ['calculation'] }]);
    expect(counts.map((entry) => entry.theme)).toEqual(['calculation', 'king-safety']);
  });
});

describe('theme trends', () => {
  it('reports counts per window and nothing about direction', () => {
    const records = [
      { themes: ['calculation'], at: NOW - 5 * DAY },
      { themes: ['calculation'], at: NOW - 40 * DAY },
      { themes: ['king-safety'], at: NOW - 40 * DAY },
    ];
    const trends = themeTrends(records, [
      { from: NOW - 30 * DAY, to: NOW },
      { from: NOW - 90 * DAY, to: NOW - 30 * DAY },
    ]);

    expect(trends[0]).toEqual({ theme: 'calculation', label: 'Calculation', counts: [1, 1] });
    const safety = trends.find((trend) => trend.theme === 'king-safety');
    expect(safety?.counts).toEqual([0, 1]);
    // No field claims a direction.
    expect(Object.keys(trends[0] ?? {})).toEqual(['theme', 'label', 'counts']);
  });

  it('treats window boundaries as half-open, so nothing is counted twice', () => {
    const at = NOW - 30 * DAY;
    const trends = themeTrends(
      [{ themes: ['calculation'], at }],
      [
        { from: at, to: NOW },
        { from: NOW - 90 * DAY, to: at },
      ],
    );
    expect(trends[0]?.counts).toEqual([1, 0]);
  });
});

describe('improvement report', () => {
  const reviewItems = [
    item({
      status: 'reviewed',
      themes: ['calculation', 'trade-decision'],
      gameId: 'game-a',
      reviewedAt: NOW - 2 * DAY,
    }),
    item({
      status: 'converted',
      themes: ['calculation'],
      gameId: 'game-a',
      reviewedAt: NOW - 3 * DAY,
    }),
    item({
      status: 'reviewed',
      themes: ['king-safety'],
      gameId: 'game-b',
      reviewedAt: NOW - 4 * DAY,
      signals: [{ kind: 'repertoire-deviation', detail: 'left the Najdorf' }],
    }),
    item({ status: 'unreviewed', createdAt: NOW - DAY }),
    item({ status: 'reviewed', themes: ['calculation'], reviewedAt: NOW - 200 * DAY }),
  ];

  const report = improvementReport({
    reviewItems,
    decisions: [
      {
        id: 'd1',
        positionKey: positionKey(START_FEN),
        fen: START_FEN,
        sideToMove: 'w',
        candidates: [],
        themes: [],
        createdAt: NOW - 2 * DAY,
        updatedAt: NOW - 2 * DAY,
        revision: 0,
      },
    ],
    trainingItems: [],
    from: NOW - 30 * DAY,
    to: NOW,
  });

  const figure = (id: string) => report.figures.find((entry) => entry.id === id);

  it('counts distinct games rather than positions', () => {
    expect(figure('games-reviewed')?.value).toBe(2);
    expect(figure('positions-reviewed')?.value).toBe(3);
  });

  it('leaves the waiting queue outside the period, and says so', () => {
    expect(figure('positions-waiting')?.value).toBe(1);
    expect(figure('positions-waiting')?.detail).toContain('queue is a queue');
  });

  it('counts decisions and repertoire deviations in the window', () => {
    expect(figure('decisions-recorded')?.value).toBe(1);
    expect(figure('repertoire-deviations')?.value).toBe(1);
  });

  it('ranks the themes of the period', () => {
    expect(report.themes.map((entry) => entry.theme)).toEqual([
      'calculation',
      'king-safety',
      'trade-decision',
    ]);
    expect(report.themes[0]?.count).toBe(2);
  });

  it('publishes no single figure describing the player', () => {
    const ids = report.figures.map((entry) => entry.id).join(' ');
    expect(ids).not.toContain('accuracy');
    expect(ids).not.toContain('score');
    expect(ids).not.toContain('rating');
  });

  it('gives every countable figure somewhere to go', () => {
    const countable = report.figures.filter(
      (entry) => entry.value > 0 && entry.id !== 'games-reviewed',
    );
    expect(countable.every((entry) => entry.drillTo !== undefined)).toBe(true);
  });
});

describe('drill-down', () => {
  it('returns the actual positions behind a count', () => {
    const items = [
      item({ themes: ['calculation'], reviewedAt: NOW - DAY }),
      item({ themes: ['calculation'], reviewedAt: NOW - 100 * DAY }),
      item({ themes: ['king-safety'], reviewedAt: NOW - DAY }),
    ];
    expect(itemsWithTheme(items, 'calculation')).toHaveLength(2);
    expect(itemsWithTheme(items, 'calculation', NOW - 30 * DAY)).toHaveLength(1);
    expect(itemsWithTheme(items, 'nothing')).toEqual([]);
  });
});

describe('periods', () => {
  it('offers thirty days, ninety days and all time', () => {
    expect(PERIODS.map((period) => period.id)).toEqual(['30d', '90d', 'all']);
    expect(periodStart(PERIODS[0]!, NOW)).toBe(NOW - 30 * DAY);
    expect(periodStart(PERIODS[2]!, NOW)).toBe(0);
  });
});
