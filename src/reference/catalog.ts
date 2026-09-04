/**
 * The reference packs this build knows how to obtain.
 *
 * One entry per pack, with its licence and its origin, in the same spirit as
 * the engine catalogue: nothing is fetched from anywhere not named here, and
 * every entry carries the terms it is distributed under so the catalog UI can
 * show them rather than hide them in a document.
 *
 * `bundled` packs ship inside the application and install from its own static
 * assets — no network, and no possibility of a download failing on a fresh
 * profile. Everything else is fetched, verified against the digests in its own
 * manifest, and can be removed again.
 */

import type { PackLicense } from './pack';
import type { SourceCapability } from './types';

export interface CatalogPack {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Where `manifest.json` lives; chunk files are resolved relative to it. */
  readonly manifestUrl: string;
  readonly bundled: boolean;
  readonly capabilities: readonly SourceCapability[];
  /** Roughly what installing costs, for the row before a manifest is fetched. */
  readonly approximateBytes: number;
  readonly license: PackLicense;
  /** One line on where the data came from, shown before installation. */
  readonly origin: string;
}

const LICHESS_BROADCAST_LICENSE: PackLicense = {
  id: 'CC-BY-SA-4.0',
  name: 'Creative Commons Attribution-ShareAlike 4.0 International',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  attribution: 'Lichess broadcast archive — lichess.org, CC BY-SA 4.0',
};

/**
 * Where installable packs are published.
 *
 * Release assets of this repository rather than a second repository or a
 * server: the data is versioned with the build that reads it, there is no
 * infrastructure to keep alive for a project that may be dormant for a year,
 * and a release is immutable in a way a directory on a host is not.
 *
 * One release tag per pack, because release assets share a flat namespace and
 * two packs both containing `explorer-000.kfp.gz` would otherwise collide. The
 * tag carries the pack version, so installing an update is downloading from a
 * different tag rather than hoping an asset was replaced in place.
 */
export const packRelease = (tag: string): string =>
  `https://github.com/mardakurt/kingfisher/releases/download/${tag}/`;

export const CATALOG_PACKS: readonly CatalogPack[] = [
  {
    id: 'kingfisher-starter',
    name: 'Kingfisher Starter Reference',
    description:
      'Recent elite over-the-board games. Ships with Kingfisher, works ' +
      'offline, and is what the opening explorer, player search and model ' +
      'games read before anything is imported.',
    manifestUrl: '/reference/kingfisher-starter/manifest.json',
    bundled: true,
    capabilities: [
      'explorer',
      'games',
      'player-search',
      'player-profiles',
      'position-report',
      'model-games',
      'preparation',
    ],
    approximateBytes: 12_000_000,
    license: LICHESS_BROADCAST_LICENSE,
    origin: 'Built from the Lichess broadcast archive, the most recent three years.',
  },
  {
    id: 'kingfisher-elite-otb',
    name: 'Elite OTB Reference',
    description:
      'Every official over-the-board tournament game relayed by Lichess ' +
      'since 2020, with per-position statistics, the full player table and ' +
      'the games themselves.',
    manifestUrl: `${packRelease('reference-elite-v1')}manifest.json`,
    bundled: false,
    capabilities: [
      'explorer',
      'games',
      'player-search',
      'player-profiles',
      'position-report',
      'model-games',
      'preparation',
    ],
    approximateBytes: 113_000_000,
    license: LICHESS_BROADCAST_LICENSE,
    origin:
      'Built from the whole Lichess broadcast archive, 2020 to the present: ' +
      '422,059 games, 249,245 full scores, 684,269 positions, 34,114 players. ' +
      'Published as assets of this repository’s reference-elite-v1 release, ' +
      'which are downloadable only while that repository is public.',
  },
];

export const catalogPack = (id: string): CatalogPack | undefined =>
  CATALOG_PACKS.find((pack) => pack.id === id);

export const BUNDLED_PACK_ID = 'kingfisher-starter';
