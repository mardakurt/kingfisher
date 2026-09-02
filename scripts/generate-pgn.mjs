/**
 * Deterministic synthetic PGN collections for benchmarking.
 *
 * Generated rather than committed: a 10,000-game fixture is megabytes of
 * repository nobody should clone, and the interesting property is the shape of
 * the data, not its exact contents. The seed makes runs comparable.
 *
 *   node scripts/generate-pgn.mjs 10000 > /tmp/bench.pgn
 *
 * Also importable, so the benchmarks can generate a collection in process
 * rather than shelling out and parsing megabytes back off a pipe:
 *
 *   import { generateGames } from './generate-pgn.mjs';
 */

import { pathToFileURL } from 'node:url';

const PLAYERS = [
  'Carlsen, M',
  'Nepomniachtchi, I',
  'Ding, L',
  'Caruana, F',
  'Firouzja, A',
  'Nakamura, H',
  'Giri, A',
  'So, W',
  'Rapport, R',
  'Duda, J',
  'Aronian, L',
  'Vachier-Lagrave, M',
  'Radjabov, T',
  'Grischuk, A',
  'Mamedyarov, S',
];

const OPENINGS = [
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5', 'Nb3', 'Be6'],
  ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'd5', 'Nc3', 'Be7', 'Bg5', 'O-O', 'e3', 'h6', 'Bh4', 'b6'],
  ['Nf3', 'd5', 'd4', 'Nf6', 'c4', 'e6', 'Nc3', 'Be7', 'Bg5', 'O-O', 'e3', 'h6', 'Bh4', 'b6'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'],
  ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6', 'g3', 'd5', 'cxd5', 'Nxd5', 'Bg2', 'Nb6', 'O-O', 'Be7'],
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6'],
  ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3', 'Ne7', 'Qg4', 'O-O'],
  ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6', 'h4', 'h6', 'Nf3', 'Nd7'],
];

const RESULTS = ['1-0', '0-1', '1/2-1/2'];
/*
  One ECO per opening, in the same order. They were previously off by one from
  index 2 onward — a King's Indian was tagged C18 — which made any benchmark or
  fixture that filtered by ECO measure the wrong rows.

  Entries 1 and 2 deliberately share D55: they are the same position reached by
  two move orders, which is what gives the fixture real transpositions.
*/
const ECOS = ['B90', 'D55', 'D55', 'C92', 'A29', 'E97', 'C18', 'B18'];

/** Mulberry32: tiny, deterministic, and good enough for fixture shape. */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic for a given count and seed: two runs produce the same bytes. */
export function generateGames(count, seed = 20260901) {
  const next = random(seed);
  const out = [];

  for (let i = 0; i < count; i += 1) {
    const opening = OPENINGS[Math.floor(next() * OPENINGS.length)];
    const white = PLAYERS[Math.floor(next() * PLAYERS.length)];
    let black = PLAYERS[Math.floor(next() * PLAYERS.length)];
    if (black === white) black = PLAYERS[(PLAYERS.indexOf(white) + 1) % PLAYERS.length];

    const result = RESULTS[Math.floor(next() * RESULTS.length)];
    const year = 2010 + Math.floor(next() * 16);
    const month = 1 + Math.floor(next() * 12);
    const day = 1 + Math.floor(next() * 28);
    const eco = ECOS[OPENINGS.indexOf(opening)];

    /*
      The move text is one of eight openings truncated to a random length, so
      many games share a line — which is the point, because an opening
      aggregation over a collection where every game is unique measures
      nothing. The Round and Event tags vary with `i`, which is what keeps the
      *games* distinct: a fingerprint covers the headers as well as the moves.
    */
    const plies = opening.slice(0, 8 + Math.floor(next() * 6));
    let movetext = '';
    for (let m = 0; m < plies.length; m += 2) {
      movetext += `${m / 2 + 1}. ${plies[m]}${plies[m + 1] ? ` ${plies[m + 1]}` : ''} `;
    }

    out.push(
      `[Event "Synthetic Open ${1 + (i % 40)}"]\n` +
        `[Site "Bench"]\n` +
        `[Date "${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}"]\n` +
        `[Round "${1 + (i % 11)}"]\n` +
        `[White "${white}"]\n` +
        `[Black "${black}"]\n` +
        `[Result "${result}"]\n` +
        `[WhiteElo "${2500 + Math.floor(next() * 350)}"]\n` +
        `[BlackElo "${2500 + Math.floor(next() * 350)}"]\n` +
        `[ECO "${eco}"]\n` +
        `[GameId "${i}"]\n\n` +
        `${movetext}${result}`,
    );
  }

  return out.join('\n\n');
}

// Only when run directly, so importing it does not print megabytes to stdout.
// Compared through `pathToFileURL` rather than by string: this repository's
// path contains spaces and an ampersand, which `import.meta.url` percent-
// encodes and `process.argv[1]` does not.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(generateGames(Number(process.argv[2] ?? 1000)));
}
