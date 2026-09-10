/**
 * The packs Kingfisher knows how to build.
 *
 * `starter` is committed to the repository and ships with the application, so
 * its filters exist to hold it to a size a clone can carry. `elite` is the
 * same pipeline with the filters opened up, published as a release asset and
 * installed on demand.
 *
 * Both are built from the same upstream archive under the same licence. The
 * difference between them is a threshold, not a different provenance story.
 */

import { LICHESS_BROADCAST, LICHESS_STANDARD } from './sources.mjs';

/*
 * Phase 29 (PART BB) wants candidate pack builds to live outside
 * the project. The `output` for non-starter packs is therefore
 * the external `packs` cache path. `starter` stays in
 * `public/reference/kingfisher-starter` because it ships with the
 * app and must be committed. Developers can override with
 * `KINGFISHER_PACKS_DIR`; tests and benchmarks can `import`
 * `cachePaths` to learn the resolved location.
 */
const { cachePaths } = await import('../cache-paths.mjs');
const externalPacks = cachePaths.packs;

/** Standard-database months, newest first, as the published digest list names them. */
const standardMonths = (digests) =>
  [...digests.keys()]
    .filter((file) => /^lichess_db_standard_rated_\d{4}-\d{2}\.pgn\.zst$/.test(file))
    .sort()
    .reverse();

/** Broadcast months, newest first, as the published digest list names them. */
const broadcastMonths = (digests) =>
  [...digests.keys()]
    .filter((file) => /^lichess_db_broadcast_\d{4}-\d{2}\.pgn\.zst$/.test(file))
    .sort()
    .reverse();

const TRANSFORMATION =
  'Games were parsed, filtered by rating and length, deduplicated, replayed ' +
  "through Kingfisher's own rules code, and reduced to per-position move " +
  'aggregates, a player table and full game scores. No move was altered.';

export const PACK_DEFINITIONS = {
  starter: {
    id: 'kingfisher-starter',
    name: 'Kingfisher Starter Reference',
    description:
      'Recent elite broadcast games, including online events, bundled with Kingfisher so the ' +
      'opening explorer, player search and model games work before anything ' +
      'is installed or imported.',
    version: '2',
    output: 'public/reference/kingfisher-starter',
    source: LICHESS_BROADCAST,
    transformation: TRANSFORMATION,
    /** Recent enough to be current theory, small enough to commit. */
    files: (digests) => broadcastMonths(digests).slice(0, 36),
    limits: {
      minRating: 2200,
      openRating: 2600,
      maxRating: 2900,
      excludeOnline: true,
      titles: ['GM', 'IM', 'WGM'],
      openTitles: ['GM'],
      minPlies: 12,
      // Query positions through twenty full moves. The scanner writes the
      // position *before* each indexed move, so ply 40 requires move index 40.
      maxPly: 41,
      minGames: 3,
      // Below this depth a position has to be genuinely common; at and beyond
      // it, the games that reached it are the evidence. Measured in
      // docs/data/reference-packs.md.
      deepFromPly: 18,
      deepMinGames: 2,
      maxMoves: 256,
      topGames: 6,
      gamesPerPlayer: 120,
      recentYears: 2,
    },
    shards: { explorer: 64, game: 16, players: 4, playergames: 4 },
  },

  /**
   * What is being played right now, rather than what has been played most.
   *
   * The other two packs answer "how has this position scored"; this one
   * answers "is anybody still playing it". That is a different question, and
   * it wants a different threshold: a line played twice in the last two years
   * by 2500s is news, and a frequency filter tuned for a seven-year archive
   * would delete exactly the rows a preparation session is looking for.
   *
   * Small on purpose. It is meant to be reinstalled often.
   */
  recent: {
    id: 'kingfisher-recent-theory',
    name: 'Recent Theory Reference',
    description:
      'The last two years of rating- and title-filtered Lichess broadcast ' +
      'games, kept at a low frequency threshold so that recent and rare ' +
      'continuations survive. A recency source, not a weight-of-evidence one.',
    version: '1',
    output: `${externalPacks}/kingfisher-recent-theory`,
    source: LICHESS_BROADCAST,
    transformation: TRANSFORMATION,
    files: (digests) => broadcastMonths(digests).slice(0, 24),
    limits: {
      minRating: 2400,
      openRating: 2500,
      maxRating: 2900,
      excludeOnline: true,
      titles: ['GM', 'IM', 'WGM'],
      openTitles: ['GM', 'IM'],
      minPlies: 12,
      // Query positions through twenty full moves, as the other packs do.
      maxPly: 41,
      // Two games, not one, in the shallow half: a single game there would
      // index one player's whole score as "theory".
      minGames: 2,
      // Past this depth the games that reached the position are the evidence,
      // which is the entire point of a recency source. Measured in
      // docs/data/reference-packs.md.
      deepFromPly: 18,
      deepMinGames: 1,
      maxMoves: 256,
      topGames: 6,
      gamesPerPlayer: 60,
      recentYears: 1,
    },
    shards: { explorer: 48, game: 24, players: 4, playergames: 4 },
  },

  /**
   * Phase 35 (PART BB): the same idea, with a narrower window.
   *
   * `recent` is two years; this one is six months. The brief
   * measured the tradeoff and the 6-month candidate has the best
   * bytes-per-freshness. The narrower window means:
   *   - smaller download (the 6 most recent Lichess broadcast
   *     months are roughly 130 MB compressed);
   *   - faster publication cadence (six months is short enough to
   *     rebuild every release);
   *   - same per-position population, so the comparisons that
   *     work for v1 also work for v2.
   *
   * v1 remains published and served from the same catalog; v2 is
   * an additional entry, not a replacement. The install path lets
   * the user choose either one and re-use the bytes they already
   * downloaded because the chunk format is content-addressed.
   */
  'recent-v2': {
    id: 'kingfisher-recent-theory',
    name: 'Recent Theory Reference',
    description:
      'The last six months of rating- and title-filtered Lichess broadcast ' +
      'games, kept at a low frequency threshold so that recent and rare ' +
      'continuations survive. A narrower window than the v1 pack; same ' +
      'provenance, smaller download, faster cadence.',
    version: '2',
    output: `${externalPacks}/kingfisher-recent-theory-v2`,
    source: LICHESS_BROADCAST,
    transformation: TRANSFORMATION,
    files: (digests) => broadcastMonths(digests).slice(0, 6),
    limits: {
      minRating: 2400,
      openRating: 2500,
      maxRating: 2900,
      excludeOnline: true,
      titles: ['GM', 'IM', 'WGM'],
      openTitles: ['GM', 'IM'],
      minPlies: 12,
      // Same query depth as v1 — the population is smaller but the
      // query shape is what users have learned to expect.
      maxPly: 41,
      // Two games, not one, in the shallow half. A single six-month
      // sample can mislead; two is the threshold at which a recent
      // source stops indexing the same player's whole score as
      // "theory".
      minGames: 2,
      // At depth, one game is enough: a recency source values
      // recent evidence more than multiple older ones.
      deepFromPly: 18,
      deepMinGames: 1,
      maxMoves: 256,
      topGames: 6,
      // Smaller per-player cap because the window is narrower;
      // 60 is still a generous game sample for an active GM/IM.
      gamesPerPlayer: 60,
      recentYears: 1,
    },
    // 6 months of high-rated games is a smaller population than 24
    // months; the shard counts are tightened accordingly to keep
    // the per-shard size useful. Shard count is a publishing
    // concern, not a query one — the reader sees a single binary
    // chunk file regardless of how many shards the publisher
    // produced.
    shards: { explorer: 24, game: 16, players: 4, playergames: 4 },
  },

  elite: {
    id: 'kingfisher-elite-otb',
    name: 'Elite OTB Reference',
    description:
      'Rating- and title-filtered Lichess broadcast games since 2020, excluding ' +
      'explicit bot, engine and online event labels. Broadcast metadata is ' +
      'not proof of complete over-the-board coverage.',
    version: '2',
    output: `${externalPacks}/kingfisher-elite-otb`,
    source: LICHESS_BROADCAST,
    transformation: TRANSFORMATION,
    files: (digests) => broadcastMonths(digests),
    limits: {
      minRating: 2000,
      openRating: 2000,
      maxRating: 2900,
      excludeOnline: true,
      titles: ['GM', 'IM', 'WGM', 'WIM', 'FM'],
      openTitles: ['GM', 'IM', 'WGM', 'WIM', 'FM'],
      minPlies: 10,
      // Query positions through twenty full moves.
      maxPly: 41,
      minGames: 2,
      // Past this depth the games that reached the position are the evidence.
      // Measured in docs/data/reference-packs.md.
      deepFromPly: 28,
      deepMinGames: 1,
      maxMoves: 256,
      topGames: 8,
      gamesPerPlayer: 300,
      recentYears: 3,
    },
    shards: { explorer: 96, game: 48, players: 8, playergames: 8 },
  },

  /**
   * What strong players are playing online, right now.
   *
   * The other two packs answer "how has this position scored over the board".
   * This answers a different question, from a population three orders of
   * magnitude larger and moving faster.
   *
   * Two thresholds decide what it is, and both were measured on 1,294,431 real
   * games before being chosen — see `docs/data/high-rated-online.md`.
   *
   * **Bullet and ultrabullet are excluded.** They are 73% of all games where
   * both players are 2200 or better, so a pack that simply took "rated and
   * strong" would mostly be a record of what strong players do with sixty
   * seconds and no intention of following theory, and every aggregate in it
   * would be a weighted average of two populations that disagree.
   *
   * **Both players 2400 or better.** At 2200 the retained population is 1.74%
   * of all games — 1.6 million a month, four times the whole Elite pack from a
   * single month of input. At 2400 it is 0.405%, about 380,000 a month, which
   * over a three-month window is a pack of comparable weight to the existing
   * references drawn from a genuinely strong population.
   *
   * The source is streamed and never stored: one month is roughly 29 GB
   * compressed, and a game is rejected on its headers before its movetext is
   * ever tokenised.
   */
  online: {
    id: 'kingfisher-high-rated-online',
    name: 'High-Rated Online Reference',
    description:
      'Lichess rated games where both players are 2400 or better, in classical, ' +
      'rapid and blitz. Bullet and ultrabullet are excluded because they ' +
      'dominate the high-rated population and are not played as theory.',
    version: '1',
    output: `${externalPacks}/kingfisher-high-rated-online`,
    source: LICHESS_STANDARD,
    transformation:
      'Games were streamed from the published archive, filtered by speed and ' +
      "rating on their headers, deduplicated, replayed through Kingfisher's " +
      'own rules code, and reduced to per-position move aggregates, a player ' +
      'table and full game scores. No move was altered.',
    /** Newest first; `--months` decides how many. */
    files: (digests, months = 3) => standardMonths(digests).slice(0, Math.max(1, months)),
    limits: {
      minRating: 2400,
      openRating: 2400,
      // Online ratings run higher than over-the-board ones, and the ceiling
      // here exists to exclude nothing real — only impossible values.
      maxRating: 4000,
      /*
        The whole point of the pack, so it is a scan limit rather than a
        reduce-time one: a game outside these speeds is rejected before its
        moves are read, which is what makes ninety million games a month
        tractable.
      */
      speeds: ['classical', 'rapid', 'blitz'],
      excludeOnline: false,
      titles: [],
      openTitles: [],
      minPlies: 12,
      maxPly: 41,
      minGames: 3,
      deepFromPly: 20,
      deepMinGames: 2,
      maxMoves: 256,
      topGames: 6,
      gamesPerPlayer: 120,
      recentYears: 1,
    },
    shards: { explorer: 96, game: 48, players: 8, playergames: 8 },
  },
};
