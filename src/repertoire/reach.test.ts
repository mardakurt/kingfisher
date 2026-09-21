import { describe, expect, it } from 'vitest';

import type { RepertoirePositionRecord } from '@/persistence/domain';

import { neverReached, rankByReach, RARE_SHARE, type PositionReach } from './reach';
import { buildReviewSession, describePromptReason } from './review';

const position = (key: string, depth: number): RepertoirePositionRecord =>
  ({
    id: `p-${key}`,
    repertoireId: 'r',
    positionKey: key,
    fen: `${key} w - - 0 1`,
    sideToMove: 'w',
    moves: [{ uci: 'e2e4', san: 'e4', role: 'main' }],
    depth,
    createdAt: 1,
    updatedAt: 1,
  }) as unknown as RepertoirePositionRecord;

const row = (
  key: string,
  depth: number,
  own: number | null,
  reference: { games: number; total: number } | null,
): PositionReach => ({
  position: position(key, depth),
  own,
  reference: reference ? { source: 'Starter', ...reference } : null,
});

describe('rankByReach', () => {
  it('orders by own games, then population share, then depth', () => {
    const ranked = rankByReach([
      row('deep-rare', 8, 0, { games: 1, total: 1000 }),
      row('met-often', 4, 9, { games: 10, total: 1000 }),
      row('popular', 2, 0, { games: 400, total: 1000 }),
      row('met-often-shallow', 2, 9, { games: 5, total: 1000 }),
      row('unknown', 3, null, null),
    ]);
    expect(ranked.map((r) => r.position.positionKey)).toEqual([
      'met-often',
      'met-often-shallow',
      'popular',
      'deep-rare',
      'unknown',
    ]);
  });
});

describe('neverReached', () => {
  it('keeps only positions with none of your games and a rare population share, deepest first', () => {
    const rows = [
      row('deep-rare', 8, 0, { games: 1, total: 1000 }),
      row('shallow-rare', 3, 0, { games: 0, total: 1000 }),
      row('popular', 2, 0, { games: 400, total: 1000 }),
      row('met', 4, 2, { games: 0, total: 1000 }),
      row('uncounted', 5, null, null),
      row('no-source', 6, 0, null),
    ];
    expect(neverReached(rows, RARE_SHARE).map((r) => r.position.positionKey)).toEqual([
      'deep-rare',
      'shallow-rare',
    ]);
  });
});

describe('the review session orders by what your games reach', () => {
  it('puts the position met in your games before an equal one never met, and says so', () => {
    const positions = [position('never', 2), position('met', 2)];
    const prompts = buildReviewSession(
      {
        positions,
        colour: 'w',
        own: { games: new Map([['met', 7]]), of: 40 },
      },
      { mode: 'my-move', dueOnly: false },
    );
    expect(prompts.map((prompt) => prompt.positionKey)).toEqual(['met', 'never']);
    const reason = prompts[0]?.reasons.find((entry) => entry.kind === 'reached');
    expect(reason).toEqual({ kind: 'reached', games: 7, of: 40 });
    expect(describePromptReason(reason!)).toBe('reached in 7 of your 40 games');
    expect(prompts[1]?.reasons.some((entry) => entry.kind === 'reached')).toBe(false);
  });

  it('changes nothing when no own-game counts are supplied', () => {
    const positions = [position('b', 2), position('a', 2)];
    const prompts = buildReviewSession(
      { positions, colour: 'w' },
      { mode: 'my-move', dueOnly: false },
    );
    expect(prompts.map((prompt) => prompt.positionKey)).toEqual(['a', 'b']);
  });
});
