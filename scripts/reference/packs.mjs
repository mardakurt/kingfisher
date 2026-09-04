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
    version: '1',
    output: 'public/reference/kingfisher-starter',
    source: LICHESS_BROADCAST,
    transformation: TRANSFORMATION,
    /** Recent enough to be current theory, small enough to commit. */
    files: (digests) => broadcastMonths(digests).slice(0, 36),
    limits: {
      minRating: 2200,
      openRating: 2600,
      maxRating: 2900,
      titles: ['GM', 'IM', 'WGM'],
      openTitles: ['GM'],
      minPlies: 12,
      maxPly: 30,
      minGames: 3,
      maxMoves: 24,
      topGames: 6,
      gamesPerPlayer: 120,
      recentYears: 2,
    },
    shards: { explorer: 64, game: 16, players: 4, playergames: 4 },
  },

  elite: {
    id: 'kingfisher-elite-otb',
    name: 'Elite OTB Reference',
    description:
      'The full Lichess broadcast archive: every official over-the-board ' +
      'tournament game relayed since 2020, with per-position statistics, a ' +
      'player table and the games themselves.',
    version: '1',
    output: '.packs/kingfisher-elite-otb',
    source: LICHESS_BROADCAST,
    transformation: TRANSFORMATION,
    files: (digests) => broadcastMonths(digests),
    limits: {
      minRating: 2000,
      openRating: 2200,
      maxRating: 2900,
      titles: ['GM', 'IM', 'WGM', 'WIM', 'FM'],
      openTitles: ['GM', 'IM'],
      minPlies: 10,
      maxPly: 36,
      minGames: 2,
      maxMoves: 32,
      topGames: 8,
      gamesPerPlayer: 300,
      recentYears: 3,
    },
    shards: { explorer: 96, game: 48, players: 8, playergames: 8 },
  },
};
