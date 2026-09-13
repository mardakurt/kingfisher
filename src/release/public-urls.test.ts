import { describe, expect, it } from 'vitest';

import { macosDownload } from './macos-download';
import { publicUrl } from './public-urls';

describe('publicUrl', () => {
  it('names kingfisherchess.app as the canonical landing', () => {
    // One canonical identity for the metadata, the sitemap and every
    // printed link. Changing it is a deliberate public-surface change.
    expect(publicUrl.landing).toBe('https://kingfisherchess.app');
  });

  it('points the application at the analysis board on the same origin', () => {
    // The origin is where every player's local data lives; a change
    // strands the existing data of every existing user. The move
    // from kingfisher-roan.vercel.app was made on 2026-09-13, before
    // the first announcement, with the old origin left serving.
    expect(publicUrl.studio).toBe('https://kingfisherchess.app/analysis');
    expect(publicUrl.web).toBe('https://kingfisherchess.app');
  });

  it('exposes a downloadable DMG URL that resolves to the current release', () => {
    // The DMG file is named after the current version so the
    // landing download button and the install guide cannot
    // drift. A change to the version requires a coordinated
    // build + release + landing + install-guide update.
    // The name comes from the descriptor, which names the published build.
    expect(publicUrl.macosDmg).toContain(`Kingfisher-${macosDownload.version}-arm64.dmg`);
    expect(publicUrl.macosDmg).toBe(macosDownload.url);
  });

  it('exposes GitHub URLs for the repository, issues and discussions', () => {
    expect(publicUrl.repository).toMatch(/^https:\/\/github\.com\/mardakurt\/kingfisher$/);
    expect(publicUrl.issues).toMatch(/\/issues$/);
    expect(publicUrl.discussions).toMatch(/\/discussions$/);
  });

  it('does not include a trailing slash on any URL', () => {
    // Concatenation paths rely on the canonical URL having no
    // trailing slash.
    for (const [name, value] of Object.entries(publicUrl)) {
      if (typeof value !== 'string') continue;
      expect(value.endsWith('/'), `${name} ends with /`).toBe(false);
    }
  });
});
