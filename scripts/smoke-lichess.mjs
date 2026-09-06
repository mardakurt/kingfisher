#!/usr/bin/env node
/**
 * Does the live Lichess API still look the way Kingfisher thinks it does?
 *
 * The deterministic test suite mocks the network, which is the right thing for
 * CI and useless for this one question. A contract test cannot notice that
 * `averageRating` was renamed or that `moves` became an object; it will happily
 * keep passing while the application shows an empty explorer to everybody.
 *
 * So this makes a handful of small, real requests and validates the *shape* of
 * what comes back. It is developer diagnostics, deliberately outside CI and
 * deliberately not wired into the application: nothing here reads or writes
 * Kingfisher's stored preferences.
 *
 *   KINGFISHER_LICHESS_TOKEN=… npm run smoke:lichess
 *   KINGFISHER_LICHESS_TOKEN=… npm run smoke:lichess -- --player DrNykterstein
 *
 * The token is read from the environment only. It is never written to a file,
 * never printed, and never included in an error message — failures report the
 * status and the shape problem, not the request that carried the credential.
 */

import { argv, env, exit } from 'node:process';

const TOKEN = (env.KINGFISHER_LICHESS_TOKEN ?? '').trim();
const EXPLORER = 'https://explorer.lichess.org';
const ACCOUNT = 'https://lichess.org/api/account';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Reykjavik 1972, game 6, after 14...a6.
 *
 * Fischer–Spassky is the game Phase 17 recorded as the one thing a world-class
 * player could not look up in Kingfisher, because no pack it can redistribute
 * holds anything before 2020. The Masters explorer does hold it, and this is
 * the check that says so — against the live service, with a real position, and
 * only when somebody has supplied their own token.
 *
 * The position is reached by
 *   1.c4 e6 2.Nf3 d5 3.d4 Nf6 4.Nc3 Be7 5.Bg5 O-O 6.e3 h6 7.Bh4 b6
 *   8.cxd5 Nxd5 9.Bxe7 Qxe7 10.Nxd5 exd5 11.Rc1 Be6 12.Qa4 c5 13.Qa3 Rc8
 *   14.Bb5 a6
 * which is a real, named, heavily annotated position and not one chosen to
 * make a test pass. 13...Rc8 is unambiguous here — the a8 rook is blocked by
 * the knight on b8 — so the position is the game's and not one of two
 * readings of it.
 *
 * The FEN was replayed from those moves rather than written from memory. The
 * first attempt at it was wrong in three places.
 */
const FISCHER_SPASSKY_1972 = 'rnr3k1/4qpp1/pp2b2p/1Bpp4/3P4/Q3PN2/PP3PPP/2R1K2R w K - 0 15';

const playerIndex = argv.indexOf('--player');
const PLAYER = playerIndex >= 0 ? argv[playerIndex + 1] : null;

if (!TOKEN) {
  console.error(
    'Set KINGFISHER_LICHESS_TOKEN to a personal access token.\n' +
      'Create one at https://lichess.org/account/oauth/token/create — no scopes are needed.\n' +
      'This script is opt-in; CI never requires it.',
  );
  exit(1);
}

const results = [];
let failed = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
}

/**
 * Fetch with the token attached.
 *
 * Errors quote the status and the URL *path*, never the headers: an error
 * message is the most common way a credential ends up in a log or a paste.
 */
async function get(url, accept = 'application/json') {
  const response = await fetch(url, {
    headers: { Accept: accept, Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  });
  return response;
}

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** The fields the explorer providers actually read. */
function validateExplorer(payload) {
  const problems = [];
  for (const field of ['white', 'draws', 'black']) {
    if (!isFiniteNumber(payload?.[field])) problems.push(`\`${field}\` is not a number`);
  }
  if (!Array.isArray(payload?.moves)) {
    problems.push('`moves` is not an array');
    return problems;
  }
  const move = payload.moves[0];
  if (move === undefined) return problems;
  for (const field of ['uci', 'san']) {
    if (typeof move[field] !== 'string') problems.push(`\`moves[0].${field}\` is not a string`);
  }
  for (const field of ['white', 'draws', 'black']) {
    if (!isFiniteNumber(move[field])) problems.push(`\`moves[0].${field}\` is not a number`);
  }
  return problems;
}

async function checkAccount() {
  const response = await get(ACCOUNT);
  if (response.status === 401 || response.status === 403) {
    record('account', false, 'Lichess rejected the token. Create a new one and retry.');
    return null;
  }
  if (!response.ok) {
    record('account', false, `HTTP ${response.status}`);
    return null;
  }
  const payload = await response.json();
  if (typeof payload?.username !== 'string') {
    record('account', false, '`username` missing from the account response');
    return null;
  }
  // The username is the user's own and is what makes the check meaningful.
  record('account', true, `authenticated as ${payload.username}`);
  return payload.username;
}

async function checkExplorer(name, path) {
  const response = await get(`${EXPLORER}/${path}`);
  if (response.status === 429) {
    record(name, false, 'rate limited — wait and retry; this is not a contract change');
    return;
  }
  if (response.status === 401 || response.status === 403) {
    record(name, false, `HTTP ${response.status}: the explorer refused this token`);
    return;
  }
  if (!response.ok) {
    record(name, false, `HTTP ${response.status}`);
    return;
  }

  const text = await response.text();
  let payload;
  try {
    // The player explorer streams NDJSON; the last complete line is the state.
    payload = name === 'player explorer' ? lastNdjson(text) : JSON.parse(text);
  } catch {
    record(name, false, 'the response was not readable as JSON');
    return;
  }

  const problems = validateExplorer(payload);
  if (problems.length > 0) {
    record(name, false, `contract changed: ${problems.join('; ')}`);
    return;
  }
  const total = (payload.white ?? 0) + (payload.draws ?? 0) + (payload.black ?? 0);
  record(name, true, `${payload.moves.length} moves, ${total.toLocaleString()} games`);
}

function lastNdjson(text) {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new Error('empty stream');
  return JSON.parse(lines[lines.length - 1]);
}

/**
 * Can a historical master game actually be found, and read?
 *
 * Two separate questions and the check reports them separately, because a
 * source that names the game and cannot open it is a different product from
 * one that can. The first asks the Masters explorer what was played in a real
 * 1972 position and looks for Fischer and Spassky in the games it names; the
 * second takes the game id it gave back and fetches the movetext from the
 * public export endpoint.
 *
 * Nothing here is fixtured. If the service stops holding the game, this fails,
 * which is the entire point.
 */
async function checkHistorical() {
  const name = 'Fischer–Spassky 1972';
  const fen = encodeURIComponent(FISCHER_SPASSKY_1972);
  const response = await get(`${EXPLORER}/masters?fen=${fen}&topGames=8&since=1970&until=1975`);
  if (!response.ok) {
    record(name, false, `HTTP ${response.status} from the masters explorer`);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    record(name, false, 'the response was not readable as JSON');
    return;
  }

  const games = payload.topGames ?? [];
  const match = games.find((game) => {
    const players = `${game.white?.name ?? ''} ${game.black?.name ?? ''}`.toLowerCase();
    return players.includes('fischer') && players.includes('spassky');
  });
  if (!match) {
    const named = games
      .map((game) => `${game.year ?? '?'} ${game.white?.name ?? '?'}–${game.black?.name ?? '?'}`)
      .join(', ');
    record(name, false, `no Fischer–Spassky game among the top games (${named || 'none'})`);
    return;
  }
  if (match.year !== 1972) {
    record(name, false, `found Fischer–Spassky but dated ${match.year}, not 1972`);
    return;
  }
  if (!match.id) {
    record(name, false, 'the game was named but carries no id, so it cannot be opened');
    return;
  }

  record(name, true, `${match.year} ${match.white?.name}–${match.black?.name} (${match.id})`);

  // ...and the game itself, from the public export endpoint, which needs no
  // token. Naming a game is not the same as being able to open it.
  const pgn = await get(`https://lichess.org/game/export/${match.id}`, 'application/x-chess-pgn');
  if (!pgn.ok) {
    record('historical game export', false, `HTTP ${pgn.status} fetching ${match.id}`);
    return;
  }
  const text = await pgn.text();
  const lower = text.toLowerCase();
  const complete =
    text.includes('1972') &&
    lower.includes('fischer') &&
    lower.includes('spassky') &&
    /\n\s*1\.\s*\S/.test(text);
  record(
    'historical game export',
    complete,
    complete
      ? `${text.length.toLocaleString()} bytes of PGN, with both players and the year`
      : 'the export came back without the players, the year, or any movetext',
  );
}

async function main() {
  console.log('\nKingfisher — live Lichess contract check');
  console.log(`explorer: ${EXPLORER}\n`);

  const username = await checkAccount();
  if (username === null) {
    report();
    return;
  }

  const fen = encodeURIComponent(START);
  await checkExplorer('masters explorer', `masters?fen=${fen}&moves=5&topGames=2`);
  await checkExplorer(
    'lichess explorer',
    `lichess?fen=${fen}&moves=5&speeds=blitz,rapid&ratings=2000`,
  );

  await checkHistorical();

  if (PLAYER) {
    await checkExplorer(
      'player explorer',
      `player?fen=${fen}&player=${encodeURIComponent(PLAYER)}&color=white&moves=5&recentGames=2`,
    );
  } else {
    record('player explorer', true, 'skipped — pass --player <username> to include it');
  }

  report();
}

function report() {
  const width = Math.max(...results.map((entry) => entry.name.length));
  console.log('');
  for (const entry of results) {
    console.log(`${entry.ok ? '  ok  ' : ' FAIL '} ${entry.name.padEnd(width)}  ${entry.detail}`);
  }
  console.log('');
  if (failed > 0) {
    /*
      The distinction matters. A rejected token or a rate limit is a fact about
      this run; a shape mismatch is a fact about the API, and only the second
      one means the providers need changing. Reporting both as "contract
      changed" would send someone editing code to fix an expired credential.
    */
    const contract = results.some((entry) => !entry.ok && entry.detail.startsWith('contract'));
    console.error(
      `${failed} check(s) failed.\n` +
        (contract
          ? 'A response shape changed: src/database/providers/lichess.ts needs updating.\n'
          : 'No response shape changed. Check the token, the network and the rate limit.\n'),
    );
    exit(1);
  }
  console.log('The live API matches what Kingfisher expects.\n');
}

main().catch((error) => {
  // Deliberately only the message; a thrown fetch error can carry the request.
  console.error(`The check could not run: ${error.message}`);
  exit(1);
});
