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
  /**
   * Phase 85: a pack rebuilt on a schedule names its channel file on the
   * mirror, which says which version is current. `manifestUrl` is then only
   * the fallback when the channel cannot be read.
   */
  readonly channelUrl?: string;
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

/**
 * Phase 85: the second mirror, for packs that would take the first past
 * GitHub Pages' one-gigabyte site limit (Elite OTB v3 with its history is
 * 427 MB). Same rules: versioned directories, never replaced.
 */
export const largePackRelease = (tag: string): string =>
  `https://mardakurt.github.io/kingfisher-data-packs/${tag}/`;

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
    /*
     * Phase 53: a note for the user who reads the catalog row and decides
     * 24 MB is too small for what they want. The starter pack's size is the
     * trade-off that made it a *bundled* pack instead of an optional
     * download — bigger means a fatter download for every fresh profile,
     * which the user already had to weigh once. The answer for someone who
     * wants more games on the same machine is below the row: the Elite OTB
     * pack is 18× the size and 2× the games, the Recent Theory packs are
     * narrower windows, and the High-Rated Online pack covers online play
     * the starter deliberately leaves out. The catalog UI surfaces them in
     * this same list, so the trade-off is one row away rather than one
     * document away.
     */
    approximateBytes: 24_290_847,
    maxPositionPly: 40,
    license: LICHESS_BROADCAST_LICENSE,
    origin:
      'Built from the most recent four years of the Lichess broadcast ' +
      'archive: 206,451 games, 300,413 positions, ' +
      '13,738 players. For more games on the same machine install the ' +
      'Elite OTB Reference (407,538 games, 339 MB) or one of the Recent ' +
      'Theory Reference variants from this same catalog.',
  },
  {
    id: 'kingfisher-elite-otb',
    name: 'Elite OTB Reference',
    description:
      'Rating- and title-filtered Lichess broadcast games since 2020, with ' +
      'per-position statistics, player indexes and selected full scores. ' +
      'Broadcast coverage is not a complete census of over-the-board chess.',
    // Phase 85: v3 is v2's population through 2026-08 with each position's
    // dated, rated history, on the second mirror (see `largePackRelease`).
    manifestUrl: `${largePackRelease('reference-elite-v3')}manifest.json`,
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
    approximateBytes: 426_701_086,
    maxPositionPly: 40,
    license: LICHESS_BROADCAST_LICENSE,
    origin:
      'Built from the whole Lichess broadcast archive, 2020-01 through 2026-08: ' +
      '425,022 games, all with full scores, 5,669,429 ' +
      'positions and 34,261 players, and each position’s games by year and ' +
      'Elo class with its earliest games. Published in the public, data-only ' +
      'mardakurt/kingfisher-data-packs repository.',
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
    // Phase 85: v2 was published under v1's id and could not be installed from
    // this row; v3 is the first build of the monthly cycle, under this row's id,
    // and the channel names whichever month's build is current.
    manifestUrl: `${packRelease('reference-recent-v3')}manifest.json`,
    channelUrl: `${packRelease('channels')}recent-theory-6m.json`,
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
