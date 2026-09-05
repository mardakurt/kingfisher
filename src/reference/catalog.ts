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
  /** Deepest Explorer query position in the currently published pack, in plies. */
  readonly maxPositionPly?: number;
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
 * Versioned directories in the public data-only repository's Pages site.
 * GitHub release download redirects do not supply browser CORS permission;
 * the Pages mirror does. Release assets remain an archival/manual download.
 * Published version directories are never replaced by the build pipeline.
 */
export const packRelease = (tag: string): string =>
  `https://mardakurt.github.io/kingfisher-data/${tag}/`;

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
    approximateBytes: 12_348_080,
    maxPositionPly: 40,
    license: LICHESS_BROADCAST_LICENSE,
    origin:
      'Built from the most recent three years of the Lichess broadcast ' +
      'archive: 172,376 games, 246,870 positions, ' +
      '12,522 players.',
  },
  {
    id: 'kingfisher-elite-otb',
    name: 'Elite OTB Reference',
    description:
      'Rating- and title-filtered Lichess broadcast games since 2020, with ' +
      'per-position statistics, player indexes and selected full scores. ' +
      'Broadcast coverage is not a complete census of over-the-board chess.',
    manifestUrl: `${packRelease('reference-elite-v2')}manifest.json`,
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
    approximateBytes: 339_326_787,
    maxPositionPly: 40,
    license: LICHESS_BROADCAST_LICENSE,
    origin:
      'Built from the whole Lichess broadcast archive, 2020 to the present: ' +
      '407,538 games, all with full scores, 5,438,808 ' +
      'positions and 33,607 players. Published in the public, ' +
      'data-only mardakurt/kingfisher-data repository.',
  },
  {
    id: 'kingfisher-recent-theory',
    name: 'Recent Theory Reference',
    description:
      'The last two years only, kept at a lower frequency threshold so that ' +
      'rare and recent continuations survive. Answers "is anybody still ' +
      'playing this", which is a different question from "how does it score".',
    manifestUrl: `${packRelease('reference-recent-v1')}manifest.json`,
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
    approximateBytes: 33_847_971,
    maxPositionPly: 40,
    license: LICHESS_BROADCAST_LICENSE,
    origin:
      'Built from the last two years of the Lichess broadcast archive: ' +
      '44,200 games, 918,069 positions, ' +
      '2,567 players. Published in the public, ' +
      'data-only mardakurt/kingfisher-data repository.',
  },
];

export const catalogPack = (id: string): CatalogPack | undefined =>
  CATALOG_PACKS.find((pack) => pack.id === id);

export const BUNDLED_PACK_ID = 'kingfisher-starter';
