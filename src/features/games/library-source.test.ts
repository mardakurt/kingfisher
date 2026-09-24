import { describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/analysis-store', () => ({ useAnalysis: { getState: () => ({}) } }));

import { librarySource, LOCAL_SOURCE, queryForSource } from './library-source';

describe('the database the Library shows', () => {
  it('reads a collection id into a source', () => {
    expect(librarySource('local')).toBe(LOCAL_SOURCE);
    expect(librarySource(null)).toBe(LOCAL_SOURCE);
    expect(librarySource('sqlite:twic-2026', 'TWIC 2026')).toEqual({
      kind: 'companion',
      id: 'sqlite:twic-2026',
      key: 'twic-2026',
      name: 'TWIC 2026',
    });
  });

  it('asks My games every filter, and a companion database all but the one it cannot read', () => {
    const query = { player: 'tal', event: 'olympiad', timeClass: 'blitz', limit: 100 } as const;
    expect(queryForSource(query, LOCAL_SOURCE)).toEqual({ query, dropped: [] });
    expect(queryForSource(query, librarySource('sqlite:x', 'X'))).toEqual({
      query: { player: 'tal', event: 'olympiad', limit: 100 },
      dropped: ['time control'],
    });
  });
});
