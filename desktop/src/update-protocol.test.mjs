/**
 * The release-manifest parser is the security boundary between the
 * public GitHub release page and the desktop shell. A bug here is
 * either an update that never ships or an update that ships wrong.
 *
 * The tests below pin the contract Phase 35 ships. The same parser
 * runs in the main process and the renderer; if a test on either side
 * fails, both sides have to change together, which is the point.
 */

import { describe, expect, it } from 'vitest';

import {
  ALLOWED_RELEASE_HOSTS,
  MAX_UPDATE_BYTES,
  STATUS,
  assetForArch,
  compareSemver,
  isAllowedReleaseHost,
  parseReleaseManifest,
  parseSemver,
} from './update-protocol.mjs';

const GOOD_MANIFEST = {
  kingfisher: { version: '1.1.0', tag: 'v1.1.0' },
  htmlUrl: 'https://github.com/mardakurt/kingfisher/releases/tag/v1.1.0',
  desktop: [
    {
      name: 'Kingfisher-1.1.0-arm64.dmg',
      url: 'https://github.com/mardakurt/kingfisher/releases/download/v1.1.0/Kingfisher-1.1.0-arm64.dmg',
      sha256: 'a'.repeat(64),
      bytes: 1024 * 1024 * 150,
    },
  ],
};

describe('parseReleaseManifest', () => {
  it('accepts a well-formed manifest', () => {
    const result = parseReleaseManifest(GOOD_MANIFEST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.version).toBe('1.1.0');
      expect(result.manifest.tag).toBe('v1.1.0');
      expect(result.manifest.assets).toHaveLength(1);
      expect(result.manifest.assets[0].arch).toBe('arm64');
    }
  });

  it('rejects a missing kingfisher section', () => {
    const r = parseReleaseManifest({ ...GOOD_MANIFEST, kingfisher: undefined });
    expect(r.ok).toBe(false);
  });

  it('rejects a non-string version', () => {
    const r = parseReleaseManifest({ ...GOOD_MANIFEST, kingfisher: { version: 11, tag: 'v11' } });
    expect(r.ok).toBe(false);
  });

  it('rejects a tag that does not match the version', () => {
    const r = parseReleaseManifest({
      ...GOOD_MANIFEST,
      kingfisher: { version: '1.1.0', tag: 'v1.0.0' },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a non-github release page URL', () => {
    const r = parseReleaseManifest({ ...GOOD_MANIFEST, htmlUrl: 'https://example.com/x' });
    expect(r.ok).toBe(false);
  });

  it('rejects a manifest with no desktop array', () => {
    const r = parseReleaseManifest({ ...GOOD_MANIFEST, desktop: undefined });
    expect(r.ok).toBe(false);
  });

  it('rejects an asset whose name does not match the version', () => {
    const r = parseReleaseManifest({
      ...GOOD_MANIFEST,
      kingfisher: { version: '1.1.0', tag: 'v1.1.0' },
      desktop: [
        {
          name: 'Kingfisher-1.0.0-arm64.dmg',
          url: 'https://github.com/mardakurt/kingfisher/releases/download/v1.1.0/Kingfisher-1.0.0-arm64.dmg',
          sha256: 'a'.repeat(64),
          bytes: 1024,
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an asset whose sha256 is malformed', () => {
    const r = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [{ ...GOOD_MANIFEST.desktop[0], sha256: 'not-a-sha' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an asset whose bytes are missing or non-positive', () => {
    const r1 = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [{ ...GOOD_MANIFEST.desktop[0], bytes: 0 }],
    });
    expect(r1.ok).toBe(false);
    const r2 = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [{ ...GOOD_MANIFEST.desktop[0], bytes: '150 MB' }],
    });
    expect(r2.ok).toBe(false);
  });

  it('rejects an asset whose size exceeds the configured ceiling', () => {
    const r = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [{ ...GOOD_MANIFEST.desktop[0], bytes: MAX_UPDATE_BYTES + 1 }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an http download URL', () => {
    const r = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [
        {
          ...GOOD_MANIFEST.desktop[0],
          url: 'http://example.com/Kingfisher-1.1.0-arm64.dmg',
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a download URL whose host is not in the allow-list', () => {
    const r = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [
        {
          ...GOOD_MANIFEST.desktop[0],
          url: 'https://example.com/Kingfisher-1.1.0-arm64.dmg',
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a download URL with credentials', () => {
    const r = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [
        {
          ...GOOD_MANIFEST.desktop[0],
          url: 'https://user:pass@github.com/x.dmg',
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a download URL with a non-default port', () => {
    const r = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [
        {
          ...GOOD_MANIFEST.desktop[0],
          url: 'https://github.com:8443/x.dmg',
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('accepts a release-assets host for the download URL', () => {
    const r = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [
        {
          ...GOOD_MANIFEST.desktop[0],
          url: 'https://release-assets.githubusercontent.com/x/Kingfisher-1.1.0-arm64.dmg',
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('skips malformed entries without rejecting the whole manifest', () => {
    const r = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [{ not: 'an asset' }, GOOD_MANIFEST.desktop[0]],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.assets).toHaveLength(1);
  });
});

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.1.0', '1.1.0')).toBe(0);
  });
  it('returns >0 when a is newer than b', () => {
    expect(compareSemver('1.1.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });
  it('returns <0 when a is older than b', () => {
    expect(compareSemver('1.0.0', '1.1.0')).toBeLessThan(0);
  });
  it('never falls for the 1.10 vs 1.2 lexicographic trap', () => {
    expect(compareSemver('1.10.0', '1.2.0')).toBeGreaterThan(0);
    expect(compareSemver('1.2.0', '1.10.0')).toBeLessThan(0);
  });
  it('returns 0 for a non-semver a (safe fallback, never a crash)', () => {
    expect(compareSemver('latest', '1.0.0')).toBe(0);
  });
});

describe('parseSemver', () => {
  it('parses a triple', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
  });
  it('rejects pre-release tags', () => {
    expect(parseSemver('1.2.3-rc.1')).toBeNull();
  });
  it('rejects build metadata', () => {
    expect(parseSemver('1.2.3+build.5')).toBeNull();
  });
  it('rejects v-prefixed strings', () => {
    expect(parseSemver('v1.2.3')).toBeNull();
  });
});

describe('isAllowedReleaseHost', () => {
  it('allows the canonical GitHub hosts', () => {
    for (const host of [
      'github.com',
      'api.github.com',
      'release-assets.githubusercontent.com',
      'objects.githubusercontent.com',
    ]) {
      expect(isAllowedReleaseHost(host), host).toBe(true);
    }
  });
  it('rejects everything else', () => {
    for (const host of ['githubusercontent.com', 'raw.githubusercontent.com', 'example.com', '']) {
      expect(isAllowedReleaseHost(host), host).toBe(false);
    }
  });
});

describe('assetForArch', () => {
  it('returns the matching asset when present', () => {
    const result = parseReleaseManifest({
      ...GOOD_MANIFEST,
      desktop: [
        GOOD_MANIFEST.desktop[0],
        { ...GOOD_MANIFEST.desktop[0], name: 'Kingfisher-1.1.0-x64.dmg' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(assetForArch(result.manifest, 'arm64')?.filename).toBe('Kingfisher-1.1.0-arm64.dmg');
      expect(assetForArch(result.manifest, 'x64')?.filename).toBe('Kingfisher-1.1.0-x64.dmg');
      expect(assetForArch(result.manifest, 'arm64')).not.toBeNull();
    }
  });

  it('returns null when the architecture has no published build', () => {
    const result = parseReleaseManifest(GOOD_MANIFEST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(assetForArch(result.manifest, 'x64')).toBeNull();
    }
  });
});

describe('STATUS', () => {
  it('exposes the verdicts the menu and dialog render against', () => {
    expect(STATUS.UP_TO_DATE).toBe('up-to-date');
    expect(STATUS.NEWER_AVAILABLE).toBe('newer-available');
    expect(STATUS.UNABLE).toBe('unable-to-check');
    expect(STATUS.DOWNLOADING).toBe('downloading');
    expect(STATUS.VERIFYING).toBe('verifying');
    expect(STATUS.READY).toBe('ready');
    expect(STATUS.FAILED).toBe('failed');
    expect(STATUS.CANCELED).toBe('canceled');
  });
});

describe('the allow-list size', () => {
  it('is exactly the GitHub release hosts and nothing else', () => {
    // The allow-list is a security boundary. If you add a host,
    // intentionally or by mistake, this test asks you to come
    // here and explain why. A list with one unexpected host is
    // better caught at review time than in production.
    expect(ALLOWED_RELEASE_HOSTS.size).toBe(4);
  });
});
