import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BUNDLED_PACK_ID, CATALOG_PACKS, catalogPack, packRelease } from './catalog';

/**
 * The catalog is what a user reads *before* installing, so it is the one place
 * in the reference system where a number can be wrong without anything
 * failing. These tests exist because it was: the starter row advertised
 * explorer depth 29 for weeks after the pack it ships was rebuilt to 40.
 */
describe('the published reference catalog', () => {
  it('downloads optional data from the public data-only repository', () => {
    expect(packRelease('reference-elite-v2')).toBe(
      'https://mardakurt.github.io/kingfisher-data/reference-elite-v2/',
    );
    for (const pack of CATALOG_PACKS) {
      // Release-asset URLs redirect without CORS headers, so a browser cannot
      // install from them at all. Pages can.
      expect(pack.manifestUrl).not.toContain('mardakurt/kingfisher/releases');
    }
  });

  it('states every pack’s Explorer depth, in plies rather than full moves', () => {
    for (const pack of CATALOG_PACKS) {
      expect(pack.maxPositionPly, pack.id).toBeTypeOf('number');
      // 40 plies is 20 full moves. A row claiming 40 *moves* would be a pack
      // indexing to move 40, which nothing here builds.
      expect(pack.maxPositionPly, pack.id).toBeLessThanOrEqual(60);
    }
  });

  it('describes the bundled pack as the build actually ships it', () => {
    const shipped = JSON.parse(
      readFileSync('public/reference/kingfisher-starter/manifest.json', 'utf8'),
    ) as {
      maxPositionPly: number;
      compressedBytes: number;
      counts: { games: number; positions: number; players: number };
    };
    const row = catalogPack(BUNDLED_PACK_ID);
    expect(row?.maxPositionPly).toBe(shipped.maxPositionPly);
    expect(row?.approximateBytes).toBe(shipped.compressedBytes);
    // The origin line quotes counts; they have to be the ones in the pack.
    for (const count of [shipped.counts.games, shipped.counts.positions, shipped.counts.players]) {
      expect(row?.origin).toContain(count.toLocaleString('en-US'));
    }
  });

  it('offers more than one installable source, so a fresh profile has a choice', () => {
    const installable = CATALOG_PACKS.filter((pack) => !pack.bundled);
    expect(installable.length).toBeGreaterThanOrEqual(2);
    expect(CATALOG_PACKS.filter((pack) => pack.bundled)).toHaveLength(1);
  });
});
