import { describe, expect, it } from 'vitest';

import { evaluateUpdate, type UpdateCheckInput } from './update-check';

const GOOD_MANIFEST = {
  kingfisher: { version: '1.0.0' },
  htmlUrl: 'https://github.com/mardakurt/kingfisher/releases/tag/v1.0.0',
  desktop: [
    {
      name: 'Kingfisher-1.0.0-arm64.dmg',
      url: 'https://github.com/mardakurt/kingfisher/releases/download/v1.0.0/Kingfisher-1.0.0-arm64.dmg',
      sha256: 'a'.repeat(64),
      bytes: 1024,
    },
  ],
};

describe('evaluateUpdate', () => {
  it('returns "up-to-date" when the latest version equals the current one', () => {
    const input: UpdateCheckInput = {
      currentVersion: '1.0.0',
      manifest: GOOD_MANIFEST,
      arch: 'arm64',
    };
    expect(evaluateUpdate(input)).toEqual({ status: 'up-to-date' });
  });

  it('returns "up-to-date" when the latest version is older than current', () => {
    const input: UpdateCheckInput = {
      currentVersion: '1.0.0',
      manifest: {
        ...GOOD_MANIFEST,
        kingfisher: { version: '0.9.0' },
        desktop: [
          {
            name: 'Kingfisher-0.9.0-arm64.dmg',
            url: 'https://github.com/mardakurt/kingfisher/releases/download/v0.9.0/Kingfisher-0.9.0-arm64.dmg',
            sha256: 'a'.repeat(64),
            bytes: 1024,
          },
        ],
      },
      arch: 'arm64',
    };
    expect(evaluateUpdate(input)).toEqual({ status: 'up-to-date' });
  });

  it('returns "newer-available" with the matching asset when a newer version is published', () => {
    const input: UpdateCheckInput = {
      currentVersion: '0.9.0',
      manifest: GOOD_MANIFEST,
      arch: 'arm64',
    };
    const result = evaluateUpdate(input);
    expect(result.status).toBe('newer-available');
    if (result.status === 'newer-available') {
      expect(result.latestVersion).toBe('1.0.0');
      expect(result.download.arch).toBe('arm64');
      expect(result.download.url).toMatch(/^https:\/\//);
      expect(result.download.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('refuses an asset whose name does not match the version', () => {
    const input: UpdateCheckInput = {
      currentVersion: '0.9.0',
      manifest: {
        ...GOOD_MANIFEST,
        desktop: [
          {
            ...GOOD_MANIFEST.desktop[0],
            name: 'Kingfisher-1.0.0-arm64.dmg',
            // Version metadata is 2.0.0, but the asset name says 1.0.0.
          },
        ],
      },
      arch: 'arm64',
    };
    (input.manifest as { kingfisher: { version: string } }).kingfisher.version = '2.0.0';
    const result = evaluateUpdate(input);
    expect(result.status).toBe('unable-to-check');
  });

  it('refuses an asset whose sha256 is not a 64-character hex string', () => {
    const input: UpdateCheckInput = {
      currentVersion: '0.9.0',
      manifest: {
        ...GOOD_MANIFEST,
        kingfisher: { version: '1.0.0' },
        desktop: [{ ...GOOD_MANIFEST.desktop[0], sha256: 'not-a-sha' }],
      },
      arch: 'arm64',
    };
    const result = evaluateUpdate(input);
    expect(result.status).toBe('unable-to-check');
  });

  it('refuses an http:// download URL', () => {
    const input: UpdateCheckInput = {
      currentVersion: '0.9.0',
      manifest: {
        ...GOOD_MANIFEST,
        kingfisher: { version: '1.0.0' },
        desktop: [
          {
            ...GOOD_MANIFEST.desktop[0],
            url: 'http://example.com/Kingfisher-1.0.0-arm64.dmg',
          },
        ],
      },
      arch: 'arm64',
    };
    const result = evaluateUpdate(input);
    expect(result.status).toBe('unable-to-check');
  });

  it('reports no asset available when the running arch is not in the manifest', () => {
    const input: UpdateCheckInput = {
      currentVersion: '0.9.0',
      manifest: GOOD_MANIFEST,
      arch: 'x64',
    };
    const result = evaluateUpdate(input);
    expect(result.status).toBe('unable-to-check');
  });

  it('rejects a manifest with no version', () => {
    const input: UpdateCheckInput = {
      currentVersion: '0.9.0',
      manifest: { ...GOOD_MANIFEST, kingfisher: {} },
      arch: 'arm64',
    };
    expect(evaluateUpdate(input).status).toBe('unable-to-check');
  });

  it('rejects a manifest with a non-object body', () => {
    const input: UpdateCheckInput = {
      currentVersion: '0.9.0',
      manifest: 'not an object',
      arch: 'arm64',
    };
    expect(evaluateUpdate(input).status).toBe('unable-to-check');
  });

  it('rejects a manifest with a non-github release page URL', () => {
    const input: UpdateCheckInput = {
      currentVersion: '0.9.0',
      manifest: { ...GOOD_MANIFEST, htmlUrl: 'https://example.com/release' },
      arch: 'arm64',
    };
    expect(evaluateUpdate(input).status).toBe('unable-to-check');
  });

  it('returns "unable-to-check" when the current version is not semver', () => {
    const input: UpdateCheckInput = {
      currentVersion: 'unknown',
      manifest: GOOD_MANIFEST,
      arch: 'arm64',
    };
    expect(evaluateUpdate(input).status).toBe('unable-to-check');
  });
});
