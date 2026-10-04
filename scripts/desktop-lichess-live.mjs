#!/usr/bin/env node
/**
 * Live, signed-in Lichess — and Chess.com by username — through the real
 * application.
 *
 * Every other provider test routes the network. This one does not: it opens a
 * profile in which a person has already approved Kingfisher on lichess.org
 * (the sign-in itself needs a person and a password, and Cloudflare refuses an
 * automated browser), then drives the shipped panels and compares what they
 * show with what Lichess answers to the same question asked directly.
 *
 *   KINGFISHER_DESKTOP_APP=/path/Kingfisher.app \
 *     node scripts/desktop-lichess-live.mjs --profile=<signed-in profile> [--revoke]
 *
 * The token never leaves the page. Comparisons run inside the page with the
 * stored credential, and this script reads back only statuses, counts and
 * moves. `--revoke` ends with Disconnect and proves Lichess then refuses the
 * old token — which uses up the sign-in, so it is for the final run.
 *
 * Writes a JSON report (`--report=`, default in the temporary directory).
 */

import { Chess } from 'chess.js';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, exit } from 'node:process';

import { launchKingfisher, waitForReady } from './desktop-lib/launch.mjs';

const value = (name, fallback = null) => {
  const found = argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const args = {
  profile: value('profile'),
  revoke: argv.includes('--revoke'),
  report: value('report', path.join(tmpdir(), `kingfisher-lichess-live-${Date.now()}.json`)),
  chessCom: value('chess-com', 'sampleuser'),
};
if (!args.profile) {
  console.error('--profile=<a profile signed in to Lichess> is required');
  exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Lichess's own answer for a position, asked from inside the page with the stored token. */
async function direct(page, database, fen, extra = '') {
  return page.evaluate(
    async ({ database, fen, extra }) => {
      const prefs = JSON.parse(localStorage.getItem('kingfisher.preferences') ?? '{}');
      const token = prefs?.state?.lichessToken ?? '';
      const url = `https://explorer.lichess.org/${database}?fen=${encodeURIComponent(fen)}${extra}`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) return { status: response.status };
      const text = await response.text();
      const json = JSON.parse(database === 'player' ? text.trim().split('\n').at(-1) : text);
      return {
        status: response.status,
        total: json.white + json.draws + json.black,
        moves: json.moves.map((move) => move.san),
      };
    },
    { database, fen, extra },
  );
}

async function panelMoves(page) {
  return page
    .locator('[data-workspace-dock] [data-explorer-row]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-explorer-row')));
}

/** The position the board shows, from the status bar's FEN — not this script's bookkeeping. */
async function boardFen(page) {
  return ((await page.locator('[data-fen-tooltip]').first().textContent()) ?? '').trim();
}

async function newAnalysis(page) {
  await page.getByRole('button', { name: 'New analysis' }).first().click();
  const start = new Chess().fen();
  for (let i = 0; i < 50 && (await boardFen(page)) !== start; i++) await wait(200);
  return (await boardFen(page)) === start;
}

async function play(page, from, to) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

async function openAccounts(page) {
  await page.getByRole('button', { name: 'Settings' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('tab', { name: 'Accounts' }).click();
  return dialog;
}

async function main() {
  console.log('desktop:lichess-live\n');
  const launched = await launchKingfisher({ packaged: true, profile: args.profile });
  const { app, window: page } = launched;
  const requests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/lichess\.org|chess\.com/.test(url))
      requests.push(new URL(url).host + new URL(url).pathname);
  });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  try {
    await waitForReady(page);
    const identity = await app.evaluate(({ app }) => ({
      name: app.getName(),
      version: app.getVersion(),
    }));
    check('application under test', true, `${identity.name} ${identity.version}`);

    // --- the connection -----------------------------------------------------------
    let dialog = await openAccounts(page);
    const connected = dialog.getByText(/^Connected as /).first();
    check('profile is signed in', await connected.isVisible().catch(() => false));
    await dialog.getByRole('button', { name: 'Test connection' }).click();
    await dialog
      .getByText(/^Connected as /)
      .last()
      .waitFor({ timeout: 15_000 });
    const label = (
      await dialog
        .getByText(/^Connected as /)
        .last()
        .innerText()
    ).trim();
    const username = label.replace(/^Connected as /, '');
    check(
      'live /api/account identifies the account',
      username.length > 0,
      `username of ${username.length} chars`,
    );
    await page.keyboard.press('Escape');

    // --- Masters at the start, compared with Lichess directly ---------------------
    await page.goto(page.url().replace(/\/[^/]*(\?.*)?$/, '/analysis'));
    await waitForReady(page);
    check('New analysis puts the start position on the board', await newAnalysis(page));
    const dock = page.locator('[data-workspace-dock]');
    await dock
      .getByRole('tab', { name: 'Explorer' })
      .first()
      .click()
      .catch(async () => {
        await page.getByRole('button', { name: 'Explorer', exact: true }).first().click();
      });
    const source = dock.getByRole('combobox', { name: 'Evidence source' });
    await source.selectOption('lichess-masters');
    await dock.locator('[data-explorer-row]').first().waitFor({ timeout: 20_000 });
    const chess = new Chess();
    let fen = await boardFen(page);
    const shownStart = await panelMoves(page);
    const askedStart = await direct(page, 'masters', fen);
    check(
      'Masters at the start matches Lichess',
      askedStart.status === 200 &&
        shownStart.slice(0, 4).join() === askedStart.moves.slice(0, 4).join(),
      `panel ${shownStart.slice(0, 4).join(' ')} | api ${askedStart.moves?.slice(0, 4).join(' ')} of ${askedStart.total} games`,
    );

    // --- rapid moves while answers are in flight ------------------------------
    const line = [
      ['e2', 'e4'],
      ['c7', 'c5'],
      ['g1', 'f3'],
      ['d7', 'd6'],
      ['d2', 'd4'],
      ['c5', 'd4'],
      ['f3', 'd4'],
      ['g8', 'f6'],
    ];
    for (const [from, to] of line) {
      await play(page, from, to);
      chess.move({ from, to });
    }
    fen = await boardFen(page);
    check('the board ends on the line played', fen === chess.fen(), fen);
    await wait(4_000);
    const shownNajdorf = await panelMoves(page);
    const askedNajdorf = await direct(page, 'masters', fen);
    check(
      'after 8 rapid moves the panel shows the final position only',
      askedNajdorf.status === 200 &&
        shownNajdorf.slice(0, 4).join() === askedNajdorf.moves.slice(0, 4).join(),
      `panel ${shownNajdorf.slice(0, 4).join(' ')} | api ${askedNajdorf.moves?.slice(0, 4).join(' ')}`,
    );
    const legal = new Set(chess.moves());
    check(
      'every listed move is legal on the board',
      shownNajdorf.every((san) => legal.has(san)),
      shownNajdorf.join(' '),
    );

    // --- master-game PGN retrieval through Top games ---------------------------
    const heading = dock.getByRole('heading', { name: 'Top games' });
    const hasTop = await heading.isVisible({ timeout: 10_000 }).catch(() => false);
    if (check('Masters lists top games here', hasTop)) {
      const first = heading
        .locator('xpath=ancestor::section[1]')
        .getByRole('button', { name: /^Open / })
        .first();
      const played = (
        await first
          .locator('[data-top-game-move]')
          .innerText()
          .catch(() => '')
      ).trim();
      const before = await page.locator('[data-move-tree] [data-current]').count();
      await first.click();
      const current = page.locator('[data-move-tree] [data-current="true"]');
      let opened = false;
      for (let i = 0; i < 100 && !opened; i++) {
        await wait(200);
        opened = played !== '' && (await current.innerText().catch(() => '')).includes(played);
      }
      const total = await page.locator('[data-move-tree] [data-current]').count();
      check(
        'a master game opens from its PGN at this position',
        opened && total > before,
        `current ${(await current.innerText().catch(() => '?')).trim()} (played ${played}); ${before} → ${total} moves in the notation`,
      );
    }

    // --- Lichess Rated Games and the player explorer --------------------------
    check('New analysis again resets the board', await newAnalysis(page));
    await dock.getByRole('combobox', { name: 'Evidence source' }).selectOption('lichess-games');
    await dock.locator('[data-explorer-row]').first().waitFor({ timeout: 20_000 });
    await wait(2_000);
    const shownRated = await panelMoves(page);
    const askedRated = await direct(page, 'lichess', await boardFen(page), '&variant=standard');
    check(
      'Lichess Rated Games at the start matches Lichess',
      askedRated.status === 200 &&
        new Set(shownRated.slice(0, 3)).size === 3 &&
        shownRated.slice(0, 3).every((san) => askedRated.moves.slice(0, 5).includes(san)),
      `panel ${shownRated.slice(0, 3).join(' ')} | api ${askedRated.moves?.slice(0, 5).join(' ')}`,
    );
    await dock.getByRole('combobox', { name: 'Evidence source' }).selectOption('lichess-player');
    await dock.getByLabel('Lichess player').fill(username);
    await dock.getByLabel('Player colour').selectOption('w');
    const playerOutcome = await Promise.race([
      dock
        .locator('[data-explorer-row]')
        .first()
        .waitFor({ timeout: 45_000 })
        .then(() => 'rows'),
      dock
        .getByText('No games reach this position.')
        .waitFor({ timeout: 45_000 })
        .then(() => 'empty'),
      dock
        .getByText(/No evidence from this source|could not|rejected|rate limiting/)
        .first()
        .waitFor({ timeout: 45_000 })
        .then(() => 'error'),
    ]).catch(() => 'timeout');
    const playerText =
      playerOutcome === 'error'
        ? (
            await dock
              .locator('p')
              .filter({ hasText: /No evidence|could not|rejected|rate limiting|player/i })
              .allInnerTexts()
          )
            .join(' | ')
            .slice(0, 400)
        : '';
    check(
      'player explorer answers for the signed-in account',
      playerOutcome === 'rows' || playerOutcome === 'empty',
      `${playerOutcome} ${playerText}`,
    );

    // --- offline, then recovery -------------------------------------------------
    await dock.getByRole('combobox', { name: 'Evidence source' }).selectOption('lichess-masters');
    await app.evaluate(({ session }) => {
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const local = /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(details.url);
        const internal = /^(devtools|chrome|chrome-extension|blob|data|file):/.test(details.url);
        callback(local || internal ? {} : { cancel: true });
      });
    });
    // h3: never among the two most-played moves, so never answered from the prefetch cache.
    check('back at the start before cutting the network', await newAnalysis(page));
    await play(page, 'h2', 'h3');
    const offline = await dock
      .getByText(/could not be reached|did not respond|no network|This source is not being queried/)
      .first()
      .waitFor({ timeout: 30_000 })
      .then(
        () => true,
        () => false,
      );
    check('cut off, the panel says the source could not be reached', offline);
    check(
      'and still names Lichess Masters as the source',
      (await source.inputValue()) === 'lichess-masters',
    );
    await app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest(null));
    await play(page, 'a7', 'a6');
    const recovered = await dock
      .locator('[data-explorer-row]')
      .first()
      .waitFor({ timeout: 25_000 })
      .then(
        () => true,
        () => false,
      );
    check('with the network back, the next position answers', recovered);

    // --- account sync: Lichess with the token, Chess.com by username ----------------
    dialog = await openAccounts(page);
    for (const [provider, name] of [
      ['lichess', username],
      ['chess.com', args.chessCom],
    ]) {
      await dialog.getByRole('combobox', { name: 'Account provider' }).selectOption(provider);
      await dialog.getByRole('textbox', { name: 'Account username' }).fill(name);
      await dialog.getByRole('button', { name: 'Link', exact: true }).click();
      const row = dialog.locator('li').filter({ hasText: name }).last();
      const outcome = row
        .getByText(/new games?|Up to date|No games|rate limit|not found|could not/i)
        .last();
      await outcome.waitFor({ timeout: 300_000 });
      const first = (await outcome.innerText()).trim();
      check(`${provider} sync completes`, /new game|Up to date|No games/i.test(first), first);
      await row.getByRole('button', { name: 'Sync now' }).click();
      await wait(1_500);
      await row
        .getByText(/Up to date|new games?/)
        .last()
        .waitFor({ timeout: 300_000 });
      const second = (
        await row
          .getByText(/Up to date|new games?/)
          .last()
          .innerText()
      ).trim();
      check(
        `${provider} second sync imports nothing`,
        /Up to date|0 new games/.test(second),
        second,
      );
    }
    await page.keyboard.press('Escape');

    // --- revocation, last ------------------------------------------------------------
    if (args.revoke) {
      await page.evaluate(() => {
        const prefs = JSON.parse(localStorage.getItem('kingfisher.preferences') ?? '{}');
        window.__kfRevokeCheck = prefs?.state?.lichessToken ?? '';
      });
      dialog = await openAccounts(page);
      await dialog.getByRole('button', { name: 'Disconnect' }).click();
      await dialog.getByRole('button', { name: 'Connect Lichess' }).waitFor({ timeout: 15_000 });
      await wait(3_000);
      const status = await page.evaluate(async () => {
        const token = window.__kfRevokeCheck;
        delete window.__kfRevokeCheck;
        const response = await fetch('https://lichess.org/api/account', {
          headers: { Authorization: `Bearer ${token}` },
        });
        return response.status;
      });
      check(
        'Disconnect revoked the token with Lichess',
        status === 401,
        `old token now answers HTTP ${status}`,
      );
      const stored = await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('kingfisher.preferences') ?? '{}')?.state?.lichessToken ??
          '',
      );
      check('and nothing of it remains in the profile', stored === '');
      await page.keyboard.press('Escape');
      await newAnalysis(page);
      await play(page, 'b2', 'b3');
      const unauthorized = await dock
        .getByText(/requires an API token|Sign in with Lichess|Connect Lichess/)
        .first()
        .waitFor({ timeout: 15_000 })
        .then(
          () => true,
          () => false,
        );
      check('afterwards Masters says it needs a connection, not "no games"', unauthorized);
    }
  } catch (error) {
    // Recorded, not swallowed: an exception part-way must fail the run.
    check(
      'the run completed without an exception',
      false,
      String(error?.stack ?? error).slice(0, 600),
    );
    const shot = args.report.replace(/\.json$/, '-failure.png');
    await page.screenshot({ path: shot }).then(
      () => console.log(`  screenshot: ${shot}`),
      () => undefined,
    );
  } finally {
    const closed = await launched.close({ keepProfile: true });
    check(
      'quit leaves no surviving process',
      closed.survivors.length === 0,
      `${closed.descendants} descendants`,
    );
    const report = {
      revoke: args.revoke,
      results,
      requests: requests.length,
      requestHosts: [...new Set(requests.map((entry) => entry.split('/')[0]))],
      consoleErrors,
    };
    writeFileSync(args.report, JSON.stringify(report, null, 2));
    console.log(
      `\n${results.filter((r) => r.ok).length}/${results.length} passed; ${requests.length} remote requests; ${consoleErrors.length} console errors`,
    );
    console.log(`report: ${args.report}`);
    exit(results.every((r) => r.ok) ? 0 : 1);
  }
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
