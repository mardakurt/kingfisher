import { describe, expect, it } from 'vitest';

import {
  PGN_HINT_THRESHOLD,
  QUERY_HARD_CEILING,
  QUERY_MAX_LENGTH,
  assessQuery,
} from './query-limits';

describe('assessQuery', () => {
  it('accepts a small query', () => {
    expect(assessQuery('carlsen')).toEqual({ ok: true, suggestPgn: false });
  });

  it('accepts an empty query', () => {
    expect(assessQuery('')).toEqual({ ok: true, suggestPgn: false });
  });

  it('rejects a query longer than the search cap', () => {
    const result = assessQuery('a'.repeat(QUERY_MAX_LENGTH + 1));
    expect(result.ok).toBe(false);
    expect(result.suggestPgn).toBe(false);
    expect(result.reason).toMatch(/too long/i);
  });

  it('suggests the PGN importer for a long PGN-shaped paste', () => {
    const result = assessQuery('1.'.repeat(PGN_HINT_THRESHOLD));
    expect(result.ok).toBe(false);
    expect(result.suggestPgn).toBe(true);
  });

  it('rejects anything past the hard ceiling', () => {
    const result = assessQuery('a'.repeat(QUERY_HARD_CEILING + 1));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/PGN importer/i);
  });
});
