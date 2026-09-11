import { describe, expect, it } from 'vitest';

import {
  buildSourceComparison,
  meetsTrendSampleThreshold,
  normalizeSourceMoveStats,
} from './multi-source-comparison';
import type { ReferenceSource } from './types';

const elite: ReferenceSource = {
  id: 'lichess-masters',
  name: 'Lichess Masters',
  description: '',
  kind: 'online',
  state: 'ready',
  installed: true,
  enabled: true,
  updateAvailable: false,
  offline: false,
  capabilities: ['explorer'],
};

const recent: ReferenceSource = {
  id: 'recent-theory',
  name: 'Recent Theory',
  description: '',
  kind: 'online',
  state: 'ready',
  installed: true,
  enabled: true,
  updateAvailable: false,
  offline: false,
  capabilities: ['explorer'],
};

describe('multi-source comparison', () => {
  it('normalizes a single move into the per-source shape', () => {
    const stats = normalizeSourceMoveStats({
      source: elite,
      games: 250,
      frequency: 0.4,
      score: 0.55,
    });
    expect(stats.games).toBe(250);
    expect(stats.frequency).toBe(0.4);
    expect(stats.score).toBe(0.55);
    expect(stats.sourceId).toBe('lichess-masters');
  });

  it('trend threshold refuses a tiny sample even when delta is large', () => {
    expect(meetsTrendSampleThreshold({ games: 3, baselineGames: 200 })).toBe(false);
    expect(meetsTrendSampleThreshold({ games: 100, baselineGames: 200 })).toBe(true);
    /* Both sides under the threshold — still refuse. */
    expect(meetsTrendSampleThreshold({ games: 30, baselineGames: 30 })).toBe(false);
  });

  it('comparison builder never merges sources', () => {
    const result = buildSourceComparison({
      positionKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      sources: [elite, recent],
      rows: [
        {
          move: 'e2e4',
          san: 'e4',
          perSource: {
            'lichess-masters': {
              sourceId: 'lichess-masters',
              sourceName: 'Lichess Masters',
              games: 100,
              frequency: 0.6,
            },
            'recent-theory': {
              sourceId: 'recent-theory',
              sourceName: 'Recent Theory',
              games: 200,
              frequency: 0.7,
              baselineFrequency: 0.4,
              trendDeltaPp: 30,
            },
          },
        },
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.sources).toHaveLength(2);
    expect(result.rows[0]?.perSource['lichess-masters']?.frequency).toBe(0.6);
    expect(result.rows[0]?.perSource['recent-theory']?.frequency).toBe(0.7);
  });

  it('anyUnavailable reports when any source has an absence', () => {
    const result = buildSourceComparison({
      positionKey: 'k',
      fen: 'k',
      sources: [elite, recent],
      rows: [
        {
          move: 'e2e4',
          perSource: {
            'lichess-masters': {
              sourceId: 'lichess-masters',
              sourceName: 'Lichess Masters',
              games: 0,
              frequency: 0,
              absence: { kind: 'network-failed', message: 'timeout' },
            },
            'recent-theory': {
              sourceId: 'recent-theory',
              sourceName: 'Recent Theory',
              games: 100,
              frequency: 0.6,
            },
          },
        },
      ],
    });
    expect(result.anyUnavailable).toBe(true);
  });

  it('distinguishes zero games from unavailable', () => {
    const result = buildSourceComparison({
      positionKey: 'k',
      fen: 'k',
      sources: [elite],
      rows: [
        {
          move: 'e2e4',
          perSource: {
            'lichess-masters': {
              sourceId: 'lichess-masters',
              sourceName: 'Lichess Masters',
              games: 0,
              frequency: 0,
              absence: { kind: 'zero-games' },
            },
          },
        },
      ],
    });
    /* Zero games is not an unavailability — the source answered. */
    expect(result.anyUnavailable).toBe(false);
  });
});
