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
  /**
   * Filter summary, so the catalog row can show what the build actually kept.
   * Optional — older catalog rows and custom-URL packs may not carry one.
   */
  readonly filter?: PackFilterSummary;
  /**
   * The current published pack's freshness — earliest and latest game years
   * the build retained. Carried here so the catalog UI can show "Recent
   * Theory, Oct 2025–Sep 2026" without having to fetch a manifest.
   */
  readonly window?: PackWindowSummary;
}

/** One-line summary of a pack's filters, suitable for a catalog row. */
export interface PackFilterSummary {
  readonly minRating?: number;
  readonly speeds?: readonly string[] | null;
  readonly excludeOnline?: boolean;
  readonly titles?: readonly string[];
}

/** Window the published pack actually covers, in human form. */
export interface PackWindowSummary {
  readonly firstYear?: number;
  readonly lastYear: number;
  /** Months the pack was assembled from, newest first. */
  readonly archiveMonths?: readonly (string | undefined)[];
}

const LICHESS_STANDARD_LICENSE: PackLicense = {
  id: 'CC0-1.0',
  name: 'Creative Commons Zero v1.0 Universal',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  attribution: 'Lichess standard rated games database — lichess.org, CC0 1.0',
};

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
      'Recent elite broadcast games, including online events. Ships with Kingfisher, works ' +
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
    filter: {
      minRating: 2400,
      titles: ['GM', 'IM', 'WGM'],
      excludeOnline: true,
    },
    window: {
      lastYear: 2026,
    },
  },
  {
    /*
      Phase 35 (PART BB): the v2 narrow-window Recent Theory pack.
      Same content shape as v1, with the last 6 months instead of
      24. Lives next to v1 in the catalog rather than replacing
      it: a user who installed v1 keeps using it until they choose
      otherwise, and the v1 directory remains immutable.

      Phase 39 (PART C): the v2 entry must have a distinct catalog
      id. The previous 'kingfisher-recent-theory' collision produced
      a duplicate React `key` warning in the catalog panel and in
      the Reference Coverage Panel. The narrow-window suffix keeps
      the historical v1 id intact and gives v2 a stable identity.
    */
    id: 'kingfisher-recent-theory-narrow',
    name: 'Recent Theory Reference (6 months)',
    description:
      'The last six months only, kept at a lower frequency threshold so ' +
      'that recent and rare continuations survive. A narrower window than ' +
      'the v1 pack; smaller download, faster cadence, same provenance.',
    manifestUrl: `${packRelease('reference-recent-v2')}manifest.json`,
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
    approximateBytes: 8_985_913,
    maxPositionPly: 40,
    license: LICHESS_BROADCAST_LICENSE,
    origin:
      'Built from the last six months of the Lichess broadcast archive ' +
      '(2026-03 through 2026-08): 11,280 games accepted from 223,248 ' +
      'candidates, 4,600 openable full scores, 250,498 position ' +
      'aggregates and 1,577 player identities. Published in the public, ' +
      'data-only mardakurt/kingfisher-data repository.',
    filter: {
      minRating: 2400,
      titles: ['GM', 'IM', 'WGM'],
      excludeOnline: true,
    },
    window: {
      firstYear: 2026,
      lastYear: 2026,
      archiveMonths: ['2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03'],
    },
  },
  {
    id: 'kingfisher-high-rated-online',
    name: 'High-Rated Online Reference',
    description:
      'Lichess rated games where both players are 2400 or better. ' +
      'Overwhelmingly blitz — 295,695 of 305,169 games — and one month of ' +
      'it. Answers what strong players are playing online, which is not the ' +
      'same question as how a line scores over the board.',
    manifestUrl: `${packRelease('reference-online-v1')}manifest.json`,
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
    approximateBytes: 85_722_979,
    maxPositionPly: 40,
    license: LICHESS_STANDARD_LICENSE,
    /*
      The speed mixture is in the first line of the origin because it is the
      thing most likely to be misread. Somebody who installs this and reads a
      percentage off it is reading blitz, and the row has to say so before they
      install rather than in a document afterwards.
    */
    origin:
      'Blitz 295,695 · rapid 9,429 · classical 48, from one month ' +
      '(2026-07) of the Lichess standard database: 89,288,421 games ' +
      'considered, 305,169 retained, 315,668 positions, ' +
      '12,315 players. Bullet and ultrabullet are excluded. Not ' +
      'over-the-board master practice. Published in the public, data-only ' +
      'mardakurt/kingfisher-data repository.',
    filter: {
      minRating: 2400,
      speeds: ['classical', 'rapid', 'blitz'],
      excludeOnline: false,
    },
    window: {
      lastYear: 2026,
      archiveMonths: ['2026-07'],
    },
  },
];

export const catalogPack = (id: string): CatalogPack | undefined =>
  CATALOG_PACKS.find((pack) => pack.id === id);

export const BUNDLED_PACK_ID = 'kingfisher-starter';
