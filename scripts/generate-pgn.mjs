/**
 * Deterministic synthetic PGN collections for benchmarking.
 *
 * Generated rather than committed: a 10,000-game fixture is megabytes of
 * repository nobody should clone, and the interesting property is the shape of
 * the data, not its exact contents. The seed makes runs comparable.
 *
 *   node scripts/generate-pgn.mjs 10000 > /tmp/bench.pgn
 */

const COUNT = Number(process.argv[2] ?? 1000);

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
const ECOS = ['B90', 'D37', 'C92', 'A29', 'E97', 'C18', 'B18', 'D85'];

/** Mulberry32: tiny, deterministic, and good enough for fixture shape. */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const next = random(20260901);
const out = [];

for (let i = 0; i < COUNT; i += 1) {
  const opening = OPENINGS[Math.floor(next() * OPENINGS.length)];
  const white = PLAYERS[Math.floor(next() * PLAYERS.length)];
  let black = PLAYERS[Math.floor(next() * PLAYERS.length)];
  if (black === white) black = PLAYERS[(PLAYERS.indexOf(white) + 1) % PLAYERS.length];

  const result = RESULTS[Math.floor(next() * RESULTS.length)];
  const year = 2010 + Math.floor(next() * 16);
  const month = 1 + Math.floor(next() * 12);
  const day = 1 + Math.floor(next() * 28);
  const eco = ECOS[OPENINGS.indexOf(opening)];

  // A unique tail per game, so no two games are duplicates of one another.
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

process.stdout.write(out.join('\n\n'));
