import { describe, expect, it } from 'vitest';

import type { GameSearchQuery, GameSummary } from '@/persistence/types';

import { federatedSearch, supportedFilters } from './federated';
import type {
  DuplicateKeyPage,
  GameCollection,
  GameCollectionRef,
  TransferGame,
  TransferPage,
  WriteOutcome,
} from './types';

class StubCollection implements GameCollection {
  readonly ref: GameCollectionRef;

  constructor(
    id: string,
    name: string,
    kind: GameCollectionRef['kind'],
    private readonly rows: readonly Partial<GameSummary>[],
    private readonly fails = false,
  ) {
    this.ref = { id, kind, name };
  }

  async count() {
    return this.rows.length;
  }

  async read(
    _query: GameSearchQuery | null,
    _after: string | null,
    limit: number,
  ): Promise<TransferPage> {
    if (this.fails) throw new Error('That source could not be searched.');
    const page = this.rows.slice(0, limit);
    return {
      games: page.map((row, index): TransferGame => ({
        summary: {
          fingerprint: `${this.ref.id}-${index}`,
          white: 'W',
          black: 'B',
          whiteKey: 'w',
          blackKey: 'b',
          playerKeys: ['w', 'b'],
          result: '*',
          importedAt: index,
          ...row,
        } as Omit<GameSummary, 'id'>,
        pgn: '*',
        positions: [],
      })),
      nextAfter: this.rows.length > limit ? 'more' : null,
    };
  }

  async have() {
    return new Set<string>();
  }

  async write(): Promise<WriteOutcome> {
    return { written: 0, duplicates: 0, present: [] };
  }

  async removeByFingerprint() {
    return 0;
  }

  async duplicateKeys(): Promise<DuplicateKeyPage> {
    return { games: [], nextAfter: null };
  }
}

const mega = new StubCollection('sqlite:mega', 'Mega 2026', 'sqlite', [
  { white: 'Carlsen', black: 'Firouzja', date: '2024.02.01' },
  { white: 'Carlsen', black: 'Gukesh', date: '2025.04.10' },
]);
const local = new StubCollection('local', 'My games', 'indexeddb', [
  { white: 'Carlsen', black: 'Nepomniachtchi', date: '2026.01.05' },
]);

describe('searching several collections at once', () => {
  it('keeps every hit attributed to the collection it came from', async () => {
    const result = await federatedSearch([mega, local], { player: 'carlsen' });

    expect(result.hits).toHaveLength(3);
    const attribution = result.hits.map((hit) => `${hit.game.black} · ${hit.source.name}`);
    expect(attribution).toEqual([
      'Nepomniachtchi · My games',
      'Gukesh · Mega 2026',
      'Firouzja · Mega 2026',
    ]);
  });

  it('reports per-source counts rather than one merged total', async () => {
    const result = await federatedSearch([mega, local], {});
    expect(result.bySource).toEqual([
      { source: mega.ref, games: 2 },
      { source: local.ref, games: 1 },
    ]);
  });

  it('names a source that failed instead of returning a quietly shorter list', async () => {
    const broken = new StubCollection('sqlite:broken', 'Offline archive', 'sqlite', [], true);
    const result = await federatedSearch([mega, broken], {});

    expect(result.hits).toHaveLength(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.source.name).toBe('Offline archive');
  });

  it('says when a source had more to give than the page allowed', async () => {
    const result = await federatedSearch([mega], {}, { perSource: 1 });
    expect(result.truncated).toBe(true);
    expect(result.hits).toHaveLength(1);
  });

  it('sorts across sources, not within them', async () => {
    const result = await federatedSearch(
      [mega, local],
      {},
      { sortBy: 'date', sortDirection: 'asc' },
    );
    expect(result.hits.map((hit) => hit.game.date)).toEqual([
      '2024.02.01',
      '2025.04.10',
      '2026.01.05',
    ]);
  });
});

describe('which filters a selection of sources can honour', () => {
  it('offers the shared vocabulary of the selected kinds', () => {
    const fields = supportedFilters([mega, local]);
    expect(fields).toContain('player');
    expect(fields).toContain('eco');
    expect(fields).toContain('text');
  });

  it('offers the same fields for a single source', () => {
    expect(supportedFilters([local])).toEqual(supportedFilters([mega]));
  });

  it('offers nothing meaningful for an empty selection', () => {
    // Every field is trivially "supported by all zero sources"; the UI treats
    // an empty selection as nothing to search rather than as a full vocabulary.
    expect(supportedFilters([]).length).toBeGreaterThan(0);
  });
});
