import { describe, expect, it } from 'vitest';

import { SETTINGS_INDEX, searchSettings } from './settings-index';

describe('searchSettings', () => {
  /*
    The five queries §17 names by example. They are asserted individually
    rather than in a loop because each one is a claim about a different
    failure: "threads" and "token" only work because the keyword lists carry
    words the labels do not.
  */
  it('finds the engine thread count', () => {
    expect(searchSettings('threads')[0]?.id).toBe('engine-threads');
  });

  it('finds the piece set', () => {
    expect(searchSettings('piece set')[0]?.id).toBe('piece-set');
  });

  it('finds credentials from the word a user would actually type', () => {
    const ids = searchSettings('token').map((entry) => entry.id);
    expect(ids).toContain('lichess-token');
  });

  it('finds compact density', () => {
    expect(searchSettings('compact')[0]?.id).toBe('compact');
  });

  it('finds the tablebase configuration, which lives under the companion', () => {
    const ids = searchSettings('tablebase').map((entry) => entry.id);
    expect(ids).toContain('companion');
  });

  it('finds Lc0 without the label mentioning it', () => {
    expect(searchSettings('lc0').map((entry) => entry.id)).toContain('engine-choice');
  });

  it('ranks an exact label above a keyword match', () => {
    expect(searchSettings('hash')[0]?.id).toBe('engine-hash');
  });

  it('returns nothing for an empty query rather than the whole list', () => {
    expect(searchSettings('   ')).toEqual([]);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(searchSettings('zzzznotasetting')).toEqual([]);
  });
});

describe('the index itself', () => {
  it('has unique ids, so a jump target is unambiguous', () => {
    const ids = SETTINGS_INDEX.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('explains every entry, because "Hash (MB)" explains nothing', () => {
    for (const entry of SETTINGS_INDEX) {
      expect(entry.description.length).toBeGreaterThan(20);
    }
  });
});
