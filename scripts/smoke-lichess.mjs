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
