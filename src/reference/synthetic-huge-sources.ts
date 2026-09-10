/**
 * Synthetic huge-source fixtures.
 *
 * Phase 31 added a storage-quota warning for offline installs. Phase 32
 * (PART AA) asks for tiny metadata/manifest fixtures whose
 * `installableSize` represents 1 GB / 5 GB / 20 GB logical packs, so
 * the catalog UI, the confirm dialog and the `verdictForInstall`
 * code path are exercised in a real browser without downloading any
 * payload.
 *
 * The fixture is exported as a getter; it is *not* merged into the
 * production catalog. The owner can attach it to the visible catalog
 * in a build flavour when needed; the default build stays as the
 * maintainer set it.
 */

import type { CatalogPack } from './catalog';

const LICHESS_BROADCAST_LICENSE = {
  id: 'lichess-broadcast-cc0',
  name: 'Lichess Broadcast Database (CC0)',
  url: 'https://database.lichess.org/',
} as const;

const GB = 1024 * 1024 * 1024;

function syntheticCatalogPack(
  id: string,
  name: string,
  installableSize: number,
  description: string,
): CatalogPack {
  return {
    id,
    name,
    description,
    // The URL is not real. The catalog row is a render test, not a
    // download test. Pressing Install for one of these in a browser
    // will fail at the manifest fetch, which is the honest answer.
    manifestUrl: `/reference/synthetic/${id}/manifest.json`,
    bundled: false,
    capabilities: ['explorer', 'games', 'player-search', 'player-profiles'],
    approximateBytes: installableSize,
    maxPositionPly: 40,
    license: LICHESS_BROADCAST_LICENSE,
    origin: description,
  };
}

/**
 * The three sizes the brief asks for. The actual manifest files are
 * never created; the catalog row is a render test, and the install
 * path is exercised through `verdictForInstall` unit tests, not a
 * real download.
 */
export const SYNTHETIC_HUGE_SOURCES: readonly CatalogPack[] = [
  syntheticCatalogPack(
    'kingfisher-synthetic-1gb',
    'Synthetic Reference · 1 GB',
    1 * GB,
    'Synthetic 1 GB reference pack. Catalog-row render test only — no manifest ' +
      'is published and pressing Install will answer 404. The row exists so the ' +
      'huge-source UX in the catalog, the confirm dialog and the storage-quota ' +
      'verdict code path are exercised in a real browser.',
  ),
  syntheticCatalogPack(
    'kingfisher-synthetic-5gb',
    'Synthetic Reference · 5 GB',
    5 * GB,
    'Synthetic 5 GB reference pack. Catalog-row render test only. Use the row ' +
      'to see how the "Use online" hint sits next to the install size, and how ' +
      'the confirm dialog phrases a shortfall when the install would overflow the ' +
      'reported free space.',
  ),
  syntheticCatalogPack(
    'kingfisher-synthetic-20gb',
    'Synthetic Reference · 20 GB',
    20 * GB,
    'Synthetic 20 GB reference pack. Catalog-row render test only. The pack is ' +
      'clearly unreasonable for a browser install; the row is here to prove the ' +
      'UI does not overflow, the size formatter does not invent a unit, and the ' +
      'shortfall arithmetic is honest about the difference.',
  ),
];
