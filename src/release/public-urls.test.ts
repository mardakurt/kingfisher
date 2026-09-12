import { describe, expect, it } from 'vitest';

import { macosDownload } from './macos-download';
import { publicUrl } from './public-urls';

describe('publicUrl', () => {
  it('names the Vercel production host as the canonical landing', () => {
    // The Phase 33 audit (docs/operations/search-console.md)
    // commits to one canonical landing identity. Changing this
    // is a deliberate decision that needs a migration plan for
    // every existing IndexedDB-backed user.
    expect(publicUrl.landing).toBe('https://kingfisher-chess.vercel.app');
  });

  it('keeps the studio origin stable for IndexedDB continuity', () => {
    // The studio is where every player's local data lives. A
    // change here strands the existing data of every existing
    // user. The phase 33 handover documents the persistence /
    // migration analysis that has to happen *before* a change.
    expect(publicUrl.studio).toBe('https://kingfisher-roan.vercel.app');
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
