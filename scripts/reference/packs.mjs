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

import { LICHESS_BROADCAST } from './sources.mjs';

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
      'Recent elite over-the-board games, bundled with Kingfisher so the ' +
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
    output: '.packs/kingfisher-recent-theory',
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

  elite: {
    id: 'kingfisher-elite-otb',
    name: 'Elite OTB Reference',
    description:
      'Rating- and title-filtered Lichess broadcast games since 2020, excluding ' +
      'explicit bot, engine and online event labels. Broadcast metadata is ' +
      'not proof of complete over-the-board coverage.',
    version: '2',
    output: '.packs/kingfisher-elite-otb',
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
};
