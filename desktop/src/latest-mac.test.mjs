/**
 * Tests for the latest-mac.yml parser. The parser is the security
 * boundary between the GitHub release (or a staging feed) and the
 * updater, so a bad parse must never quietly become a download.
 */

import { describe, expect, it } from 'vitest';

import { parseLatestMac } from './latest-mac.mjs';

const GOOD = {
  version: '1.1.0',
  path: 'Kingfisher-1.1.0-arm64-mac.zip',
  sha512: 'A'.repeat(88),
  size: 1024 * 1024,
  releaseDate: '2026-09-10T00:00:00.000Z',
  files: [
    {
      url: 'https://github.com/mardakurt/kingfisher/releases/download/v1.1.0/Kingfisher-1.1.0-arm64-mac.zip',
      sha512: 'A'.repeat(88),
      size: 1024 * 1024,
      arch: 'arm64',
    },
  ],
};

describe('parseLatestMac', () => {
  it('accepts a well-formed feed', () => {
    const r = parseLatestMac(GOOD);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.info.version).toBe('1.1.0');
      expect(r.info.files).toHaveLength(1);
      expect(r.info.files[0].arch).toBe('arm64');
    }
  });

  it('rejects a non-object body', () => {
    expect(parseLatestMac(null).ok).toBe(false);
    expect(parseLatestMac('latest').ok).toBe(false);
    expect(parseLatestMac([]).ok).toBe(false);
  });

  it('rejects a missing or malformed version', () => {
    const r1 = parseLatestMac({ ...GOOD, version: undefined });
    expect(r1.ok).toBe(false);
    const r2 = parseLatestMac({ ...GOOD, version: '1.1' });
    expect(r2.ok).toBe(false);
    const r3 = parseLatestMac({ ...GOOD, version: 'v1.1.0' });
    expect(r3.ok).toBe(false);
  });

  it('rejects a missing files array', () => {
    const r = parseLatestMac({ ...GOOD, files: undefined });
    expect(r.ok).toBe(false);
  });

  it('rejects an empty files array', () => {
    const r = parseLatestMac({ ...GOOD, files: [] });
    expect(r.ok).toBe(false);
  });

  it('rejects a file with a non-https url', () => {
    const r = parseLatestMac({
      ...GOOD,
      files: [{ ...GOOD.files[0], url: 'http://example.com/x.zip' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a file with a malformed sha512', () => {
    const r = parseLatestMac({
      ...GOOD,
      files: [{ ...GOOD.files[0], sha512: 'not-a-hash' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a file with a non-positive size', () => {
    const r = parseLatestMac({
      ...GOOD,
      files: [{ ...GOOD.files[0], size: 0 }],
    });
    expect(r.ok).toBe(false);
  });

  it('skips malformed file entries without rejecting the whole feed', () => {
    const r = parseLatestMac({
      ...GOOD,
      files: [{ not: 'a file' }, GOOD.files[0]],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.info.files).toHaveLength(1);
  });

  it('rejects a feed with no parseable file entries', () => {
    const r = parseLatestMac({
      ...GOOD,
      files: [{ not: 'a file' }, { still: 'not' }],
    });
    expect(r.ok).toBe(false);
  });
});
