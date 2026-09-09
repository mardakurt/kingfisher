import { describe, expect, it } from 'vitest';

import { describeError, formatDescribedError } from './describe-error';

class FakeDatabaseError extends Error {
  readonly remedy: string;
  constructor(message: string, remedy?: string) {
    super(message);
    this.name = 'DatabaseError';
    this.remedy = remedy ?? '';
  }
}

describe('describeError', () => {
  it('returns a DatabaseError message and remedy untouched', () => {
    const out = describeError(new FakeDatabaseError('Source is offline.', 'Try again later.'));
    expect(out.message).toBe('Source is offline.');
    expect(out.remedy).toBe('Try again later.');
  });

  it('returns a DatabaseError message alone when there is no remedy', () => {
    const out = describeError(new FakeDatabaseError('Source is offline.'));
    expect(out.message).toBe('Source is offline.');
    expect(out.remedy).toBeUndefined();
  });

  it('translates a fetch TypeError into "temporarily unavailable"', () => {
    const out = describeError(new TypeError('Failed to fetch'));
    expect(out.message).toBe('Reference data is temporarily unavailable.');
    expect(out.remedy).toMatch(/network connection/i);
  });

  it('translates an ERR_CONNECTION refused error', () => {
    const out = describeError(new Error('net::ERR_CONNECTION_REFUSED'));
    expect(out.message).toBe('Reference data is temporarily unavailable.');
  });

  it('translates a socket hang up', () => {
    const out = describeError(new Error('socket hang up'));
    expect(out.message).toBe('Reference data is temporarily unavailable.');
  });

  it('translates an AbortError into "cancelled"', () => {
    const out = describeError({ name: 'AbortError', message: 'aborted' });
    expect(out.message).toBe('The request was cancelled.');
  });

  it('translates a TimeoutError into "too long"', () => {
    const out = describeError({ name: 'TimeoutError', message: 'timed out' });
    expect(out.message).toBe('The request took too long.');
  });

  it('redacts filesystem paths in error messages', () => {
    const out = describeError(new Error('ENOENT: /Users/alice/secret/study.pgn'));
    expect(out.message).not.toContain('/Users/alice');
    expect(out.message).not.toContain('secret');
  });

  it('redacts OAuth-style tokens from error messages', () => {
    const out = describeError(new Error('Bearer abc123def456ghi789jkl012mno345pqr678stu901vwx234yz is invalid'));
    expect(out.message).not.toContain('abc123def456');
    expect(out.message).not.toContain('ghi789jkl');
  });

  it('redacts Authorization headers from error messages', () => {
    const out = describeError(new Error('Server rejected Authorization: Bearer my-secret-key'));
    expect(out.message).not.toContain('my-secret-key');
    expect(out.message).not.toMatch(/Authorization:\s*Bearer/i);
  });

  it('redacts private URL query strings', () => {
    const out = describeError(new Error('GET https://example.com/?token=my-secret-123&user=alice'));
    expect(out.message).not.toContain('my-secret-123');
    expect(out.message).not.toContain('alice');
  });

  it('redacts companion secrets from error messages', () => {
    const out = describeError(new Error('Companion auth failed: secret-abcdef0123456789'));
    expect(out.message).not.toContain('abcdef0123456789');
  });

  it('wraps a non-network Error in a generic prefix and includes the detail as remedy', () => {
    const out = describeError(new Error('SQLITE_BUSY'));
    expect(out.message).toBe('The action did not complete.');
    expect(out.remedy).toMatch(/SQLITE_BUSY/);
  });

  it('returns a placeholder for null/undefined', () => {
    expect(describeError(null).message).toMatch(/no error was reported/i);
    expect(describeError(undefined).message).toMatch(/no error was reported/i);
  });

  it('returns the string itself when given a string', () => {
    expect(describeError('oops').message).toBe('oops');
  });
});

describe('formatDescribedError', () => {
  it('joins message and remedy with a space when remedy is present', () => {
    expect(
      formatDescribedError({
        message: 'Reference data is temporarily unavailable.',
        remedy: 'Try again.',
      }),
    ).toBe('Reference data is temporarily unavailable. Try again.');
  });

  it('returns just the message when remedy is absent', () => {
    expect(formatDescribedError({ message: 'Cancelled.' })).toBe('Cancelled.');
  });
});
