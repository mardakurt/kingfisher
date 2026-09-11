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

  it('says what population an online pack is, before anybody installs it', () => {
    /*
      The High-Rated Online pack is 97% blitz and one month long. Both facts
      change what a percentage read off it means, and both have to be on the
      row a user reads *before* installing — not in a document they find
      afterwards. Part of shipping it was agreeing not to market it as master
      practice.
    */
    const online = catalogPack('kingfisher-high-rated-online');
    expect(online, 'the high-rated online pack is not in the catalog').toBeDefined();
    expect(online?.license.id).toBe('CC0-1.0');
    expect(online?.description.toLowerCase()).toContain('blitz');
    expect(online?.description).toContain('2400');
    expect(online?.origin).toContain('295,695');
    expect(online?.origin.toLowerCase()).toContain('bullet');
    // It must not claim to be over-the-board practice, which is what the other
    // two packs are.
    expect(online?.origin.toLowerCase()).toContain('not');
    expect(online?.origin.toLowerCase()).toContain('over-the-board');
  });

  it('gives every pack a licence it can actually be redistributed under', () => {
    for (const pack of CATALOG_PACKS) {
      expect(['CC0-1.0', 'CC-BY-SA-4.0'], pack.id).toContain(pack.license.id);
      expect(pack.license.attribution ?? '', pack.id).not.toBe('');
      expect(pack.license.url, pack.id).toMatch(/^https:\/\//);
    }
  });

  it('offers more than one installable source, so a fresh profile has a choice', () => {
    const installable = CATALOG_PACKS.filter((pack) => !pack.bundled);
    expect(installable.length).toBeGreaterThanOrEqual(3);
    expect(CATALOG_PACKS.filter((pack) => pack.bundled)).toHaveLength(1);
  });

  /*
    Phase 39 (PART C): a duplicate catalog `id` produces a duplicate
    React `key` warning in the catalog panel and in any list that
    renders `CATALOG_PACKS.map(...)`. The Phase 35 v2 narrow-window
    pack accidentally reused the v1 id; that single line was the
    entire cause of the warning in the Reference Coverage Panel. The
    contract this test pins is the only thing that would have caught
    it earlier and the only thing that will catch the next time.
  */
  it('gives every catalog entry a unique id, so React lists never warn about keys', () => {
    const ids = CATALOG_PACKS.map((pack) => pack.id);
    expect(new Set(ids).size, `duplicate catalog ids: ${ids.join(', ')}`).toBe(ids.length);
  });
});
