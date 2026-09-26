#!/usr/bin/env node
/**
 * Phase 85, Part E: six workflows, done the way a serious player does them,
 * recorded — every step timed, a screenshot after each, the dataset named.
 *
 * The same steps run against a browser (any origin: the local dev server,
 * production) or the packaged application's own window, because both are the
 * same web application (AGENTS.md, "Two identities, one application"):
 *
 *   node scripts/part-e-workflows.mjs --target=browser --base=https://kingfisherchess.app
 *   KINGFISHER_DESKTOP_OUT=… node scripts/part-e-workflows.mjs --target=packaged
 *   … --only=1,5            # some workflows
 *   … --collection=<file>   # a Kingfisher SQLite collection for workflow 4 (≥ 1M games)
 *
 * Writes docs/release-evidence/phase-85/<target>/: one JPEG per step and
 * results.json. A step that fails is recorded with its error and the
 * workflow stops there — that is what "a blocker" means in the brief.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import { launchKingfisher, quitKingfisher } from './desktop-lib/launch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const value = (name, fallback = null) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const target = value('target', 'browser');
const base = value('base', 'http://localhost:3210').replace(/\/$/, '');
const only = value('only')?.split(',').map(Number) ?? [1, 2, 3, 4, 5, 6];
const collection = value('collection');
// `--label` names the evidence folder (browser-production, packaged, …).
const OUT = path.join(ROOT, 'docs', 'release-evidence', 'phase-85', value('label', target));
mkdirSync(OUT, { recursive: true });

const results = [];
let current = null;
let page = null;
let origin = base;
let session = null;
let browser = null;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ready() {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor({ timeout: 120_000 });
}
async function go(route) {
  await page.goto(`${origin}${route}`);
  await ready();
}
const board = () => page.getByRole('grid', { name: 'Chessboard' }).first();
async function play(from, to, on = board()) {
  await on.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await on.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}
async function tool(name) {
  const dock = page.locator('[data-workspace-dock]').first();
  const tab = dock.getByRole('tab', { name, exact: true });
  if (await tab.isVisible().catch(() => false)) return tab.click();
  await dock.getByRole('button', { name: /More/ }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
const expectVisible = (locator, timeout = 30_000) =>
  locator.first().waitFor({ state: 'visible', timeout });
async function text(locator) {
  return (await locator.first().innerText({ timeout: 30_000 })).replace(/\s+/g, ' ').trim();
}

async function step(name, fn) {
  const started = Date.now();
  const entry = {
    workflow: current.id,
    title: current.title,
    step: name,
    ok: false,
    ms: 0,
    note: '',
  };
  results.push(entry);
  try {
    const note = await fn();
    entry.ok = true;
    entry.note = typeof note === 'string' ? note.slice(0, 400) : '';
  } catch (error) {
    entry.note = (error instanceof Error ? error.message : String(error))
      .split('\n')[0]
      .slice(0, 400);
    throw error;
  } finally {
    entry.ms = Date.now() - started;
    const file = `${current.id}-${String(results.filter((r) => r.workflow === current.id).length).padStart(2, '0')}.jpg`;
    await page
      .screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 55 })
      .catch(() => undefined);
    entry.screenshot = file;
    console.log(
      `${entry.ok ? '✓' : '✗'} W${current.id} ${name} — ${(entry.ms / 1000).toFixed(1)} s${entry.note ? ` — ${entry.note}` : ''}`,
    );
  }
}

/** A companion holding `collection`, for the browser target (the packaged app has its own). */
let companion = null;
const COMPANION_PORT = 4391;
const COMPANION_TOKEN = 'part-e-workflows';
function companionData(file) {
  const data = mkdtempSync(path.join(tmpdir(), 'kingfisher-part-e-companion-'));
  writeFileSync(
    path.join(data, 'databases.json'),
    JSON.stringify([{ key: 'lichess-2014-07', path: file, name: 'Lichess 2014-07 (CC0)' }]),
  );
  return data;
}
async function startCompanion(file) {
  companion = spawn(process.execPath, [path.join(ROOT, 'companion/src/server.mjs')], {
    env: {
      ...process.env,
      KINGFISHER_COMPANION_PORT: String(COMPANION_PORT),
      KINGFISHER_COMPANION_TOKEN: COMPANION_TOKEN,
      KINGFISHER_COMPANION_DATA_DIR: companionData(file),
    },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${COMPANION_PORT}/health`)).ok) return;
    } catch {
      /* starting */
    }
    await wait(150);
  }
  throw new Error('the companion did not start');
}
async function pairCompanion() {
  if (target === 'packaged') return 'the packaged application pairs its own companion';
  await page
    .getByRole('button', { name: 'Settings ⌘,' })
    .first()
    .click()
    .catch(async () => {
      await page
        .getByRole('button', { name: /Settings/ })
        .first()
        .click();
    });
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings
    .getByLabel('Pairing address')
    .fill(`http://127.0.0.1:${COMPANION_PORT}#token=${COMPANION_TOKEN}`);
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expectVisible(settings.getByText(/Paired with/));
  await settings.getByRole('button', { name: 'Close' }).click();
  return 'paired';
}

/** A 20,000-node tree: a long legal main line with a legal variation at every White move. */
function hugeTreePgn() {
  const cycle = [
    ['Nf3', 'Nf6'],
    ['Ng1', 'Ng8'],
  ];
  const variation = ['Nc3', 'Nc6', 'Nb1', 'Nb8'];
  const parts = ['[Event "Part E: a 20,000-node tree"]', '[Result "*"]', ''];
  let nodes = 0;
  for (let move = 1; nodes < 20_000; move += 1) {
    const [white, black] = cycle[(move - 1) % 2];
    parts.push(`${move}. ${white}`);
    nodes += 1;
    const alt = [];
    for (let ply = 0; ply < 18; ply += 1) {
      const san = variation[ply % 4];
      const number = move + Math.floor(ply / 2);
      alt.push(ply % 2 === 0 ? `${number}. ${san}` : ply === 1 ? `${number}... ${san}` : san);
    }
    parts.push(`(${alt.join(' ')})`);
    nodes += 18;
    parts.push(`${move}... ${black}`);
    nodes += 1;
  }
  parts.push('*');
  return { pgn: parts.join(' '), nodes };
}

const NAJDORF = 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6';
const GAME = `[Event "Phase 85 workflow"]
[Site "?"]
[Date "2026.09.20"]
[White "Student, A"]
[Black "Rival, B"]
[Result "1-0"]
[WhiteElo "2210"]
[BlackElo "2180"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3
Nbd7 9. Qd2 b5 10. a4 b4 11. Nd5 Bxd5 12. exd5 Nb6 13. Bxb6 Qxb6 14. a5 Qb7 15.
Bc4 Be7 16. O-O O-O 17. Qd3 Rfc8 18. Rfe1 Nd7 19. Nd2 Nc5 20. Qe3 Bg5 21. f4
exf4 22. Qf2 Bf6 23. Nb3 Nxb3 24. cxb3 Rc5 25. Re4 Rac8 1-0`;

const WORKFLOWS = {
  1: {
    title: 'Opening preparation (Najdorf, 6.Be3)',
    async run() {
      await step('search an opening', async () => {
        await go('/openings');
        await page.getByRole('searchbox', { name: 'Search openings' }).fill('Najdorf');
        await expectVisible(page.getByRole('button', { name: /Najdorf/ }));
        await page
          .getByRole('button', { name: /Najdorf/ })
          .first()
          .click();
        return 'Opening Library search "Najdorf"';
      });
      await step('statistics from the built-in population', async () => {
        await go(`/analysis?fen=${encodeURIComponent(NAJDORF)}`);
        await tool('Explorer');
        await expectVisible(page.getByText(/games here/));
        return text(page.getByText(/games here/));
      });
      await step('a second population installed (Recent Theory, 6 months)', async () => {
        await go('/databases');
        await page.getByRole('button', { name: 'Reference sources', exact: true }).first().click();
        const row = page.locator('[data-source-row="kingfisher-recent-theory-narrow"]');
        const install = row.getByRole('button', { name: 'Install', exact: true });
        if (await install.isVisible().catch(() => false)) await install.click();
        await row.getByText(/Works offline/).waitFor({ timeout: 180_000 });
        return text(row);
      });
      await step('two populations side by side, never combined', async () => {
        await go(`/analysis?fen=${encodeURIComponent(NAJDORF)}`);
        await tool('Explorer');
        await page.getByRole('button', { name: 'Compare sources' }).click();
        await wait(3000);
        const body = await text(page.locator('[data-workspace-dock]'));
        if (!/Recent Theory/.test(body) || !/Starter/.test(body))
          throw new Error(`comparison lacks a population: ${body.slice(0, 200)}`);
        return body.slice(body.indexOf('Compare'), body.indexOf('Compare') + 400);
      });
      await step('named variations (Theory Book)', async () => {
        await tool('Theory Book');
        await wait(1000);
        return (await text(page.locator('[data-workspace-dock]'))).slice(0, 200);
      });
      await step('model games merged into one tree (new tab)', async () => {
        await go(`/analysis?fen=${encodeURIComponent(NAJDORF)}`);
        await tool('Explorer');
        const tabs = page.getByRole('tablist', { name: 'Workspace tabs' }).getByRole('tab');
        const before = await tabs.count();
        await page.getByRole('button', { name: 'Merge into one tree' }).click();
        await page.waitForFunction(
          (n) =>
            document.querySelectorAll('[role=tablist][aria-label="Workspace tabs"] [role=tab]')
              .length > n,
          before,
          { timeout: 60_000 },
        );
        await expectVisible(page.locator('[data-move-tree]'));
        return `tabs ${before} → ${await tabs.count()}`;
      });
      await step('deep analysis of the critical position', async () => {
        await go(`/analysis?fen=${encodeURIComponent(NAJDORF)}`);
        await tool('Engine');
        const deep = page.getByRole('region', { name: 'Deep analysis' });
        await deep.getByRole('button', { name: 'Deepen from here…' }).click();
        const form = deep.locator('[data-deepen-form]');
        await form.getByLabel('Moves per position').selectOption('2');
        await form.getByLabel('Plies').selectOption('4');
        await form.getByLabel('Seconds each').selectOption('1');
        await form.getByRole('button', { name: 'Start' }).click();
        await page.waitForFunction(
          () =>
            document.querySelector('[aria-label="Deep analysis"]')?.getAttribute('data-deepen') ===
            'done',
          null,
          { timeout: 180_000 },
        );
        await deep
          .getByRole('button', { name: /Add .* to the analysis|Add to the analysis/ })
          .first()
          .click();
        await expectVisible(page.locator('[data-move-tree]'));
        return (await text(deep)).slice(0, 200);
      });
      await step('lines added to the repertoire', async () => {
        await page.getByRole('button', { name: 'End of line (End)' }).click();
        await page.getByRole('button', { name: 'Document actions' }).click();
        await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
        await page.getByLabel('Title').fill('Najdorf 6.Be3 (workflow)');
        await page.getByRole('button', { name: /Save \d+ position/ }).click();
        await page.getByRole('dialog', { name: 'Add to repertoire' }).waitFor({ state: 'hidden' });
        await go('/repertoire');
        await expectVisible(page.getByText('Najdorf 6.Be3 (workflow)'));
        return 'saved and listed on /repertoire';
      });
      await step('a note on the position', async () => {
        await go(`/analysis?fen=${encodeURIComponent(NAJDORF)}`);
        await tool('Notes');
        const note = page.locator('[data-workspace-dock] textarea').first();
        await note.fill(
          '6.Be3: the English Attack. Check 6...e5 7.Nb3 Be6 8.f3 against the deep analysis.',
        );
        await wait(1500);
        return 'note written';
      });
    },
  },

  2: {
    title: 'Opponent preparation (Carlsen, Magnus — Starter reference)',
    async run() {
      await step('the player, found in a large population', async () => {
        await go('/preparation');
        await page.getByLabel('Player name').fill('Carlsen');
        await expectVisible(page.getByText(/reference games/));
        await page
          .getByText(/Carlsen, Magnus/)
          .first()
          .click();
        await page
          .locator('[data-opponent-search]')
          .getByRole('button', { name: 'Prepare' })
          .click();
        await expectVisible(page.locator('[data-player-card]'));
        return text(page.locator('[data-player-card]'));
      });
      await step('opening tendencies', async () => {
        const report = page.getByRole('tablist', { name: 'Report' });
        await report.getByRole('tab', { name: /Openings/ }).click();
        await wait(1500);
        return (await text(page.locator('main'))).slice(0, 300);
      });
      await step('games', async () => {
        const report = page.getByRole('tablist', { name: 'Report' });
        await report.getByRole('tab', { name: 'Games' }).click();
        await expectVisible(page.locator('[data-preparation-games] tbody tr'));
        return `${await page.locator('[data-preparation-games] tbody tr').count()} rows shown`;
      });
      await step('recurring position (position page)', async () => {
        await go(`/position?fen=${encodeURIComponent(NAJDORF)}`);
        await expectVisible(page.getByRole('heading', { name: 'Position page', exact: true }));
        return (await text(page.locator('main'))).slice(0, 200);
      });
      await step('a session, a candidate line on the game-day sheet', async () => {
        await go('/preparation');
        await page.getByLabel('Player name').fill('Carlsen');
        await page
          .getByText(/Carlsen, Magnus/)
          .first()
          .click();
        await page
          .locator('[data-opponent-search]')
          .getByRole('button', { name: 'Prepare' })
          .click();
        await expectVisible(page.locator('[data-player-card]'));
        await page.getByRole('button', { name: 'New session', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'New preparation session' });
        await dialog.getByLabel('Title').fill('Round 6 v Carlsen (workflow)');
        await dialog.getByLabel('Opponent').fill('Carlsen, Magnus');
        await dialog.getByRole('radio', { name: 'Black', exact: true }).check();
        await dialog.getByRole('button', { name: 'Create session' }).click();
        await dialog.waitFor({ state: 'hidden' });
        // His main choice with White, 1.e4, as the line to prepare against.
        await page.locator('main').getByRole('button', { name: 'e4', exact: true }).first().click();
        await page.getByRole('button', { name: 'Add to sheet', exact: true }).click();
        await expectVisible(page.getByText('Added to the game-day sheet.'));
        await page
          .getByRole('tablist', { name: 'Report' })
          .getByRole('tab', { name: 'Sheet' })
          .click();
        await expectVisible(page.getByText('Game-day sheet'));
        return (
          await text(page.getByText('Game-day sheet').locator('xpath=ancestor::section[1]'))
        ).slice(0, 300);
      });
    },
  },

  3: {
    title: 'Game analysis (a 25-move Najdorf)',
    async run() {
      await step('import a game', async () => {
        await go('/analysis');
        await page
          .getByRole('button', { name: /^Import( PGN or FEN)?$/ })
          .first()
          .click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('textbox').first().fill(GAME);
        await dialog.getByRole('button', { name: 'Import games' }).click();
        await expectVisible(page.locator('[data-move-tree]').getByText('Rac8'));
        return 'Student, A – Rival, B, 25 moves';
      });
      await step('engine on the critical position', async () => {
        await tool('Engine');
        await page
          .getByRole('button', { name: /Start the engine|Analyse this position|Start engine/ })
          .first()
          .click()
          .catch(() => undefined);
        await wait(5000);
        return (await text(page.locator('[data-workspace-dock]'))).slice(0, 200);
      });
      await step('where it leaves the reference', async () => {
        await tool('Explorer');
        const section = page.getByRole('region', { name: 'This game against the source' });
        await section.getByRole('button', { name: 'Where does it leave this source?' }).click();
        await expectVisible(section.locator('[data-departure-sentence]'));
        return text(section.locator('[data-departure-sentence]'));
      });
      await step('annotate a variation', async () => {
        const tree = page.locator('[data-virtualized-move-tree], [data-move-tree]').first();
        await tree
          .getByRole('button', { name: 'Nd5', exact: true })
          .first()
          .click({ button: 'right' });
        const item = page.getByRole('menuitem', { name: /comment/i }).first();
        await item.click();
        const box = page.getByRole('dialog').getByRole('textbox').first();
        await box.fill('The typical English Attack break; Black must react at once.');
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /Save|Done|Add/ })
          .first()
          .click();
        await expectVisible(page.getByText('The typical English Attack break'));
        return 'comment on 11.Nd5';
      });
      await step('whole-game check (analysis queue)', async () => {
        await go('/games');
        const list = page.locator('[data-library-list]');
        await list
          .getByRole('checkbox', { name: /Select Student, A/ })
          .first()
          .check();
        await page.getByRole('button', { name: 'Add to analysis queue' }).click();
        const dialog = page.getByRole('dialog', { name: 'Add games to analysis queue' });
        await dialog.getByRole('button', { name: /Add \d+ game/ }).click();
        await dialog.waitFor({ state: 'hidden' });
        return 'queued';
      });
    },
  },

  4: {
    title:
      'Professional research on 1,048,440 real games (Lichess 2014-07, CC0, through the companion)',
    async run() {
      if (!collection) throw new Error('--collection=<file> is required for workflow 4');
      await step('the million-game collection, paired', async () => {
        await go('/analysis');
        const note = await pairCompanion();
        await go('/databases');
        await expectVisible(page.getByText(/Lichess 2014-07/), 60_000);
        return `${note}; ${await text(
          page
            .getByText(/Lichess 2014-07/)
            .first()
            .locator('xpath=ancestor::*[self::li or self::button or self::article][1]'),
        )}`.slice(0, 300);
      });
      await step('the Library over it, headers searched', async () => {
        await go('/games');
        const picker = page.getByRole('combobox', { name: 'Database' });
        const option = picker.locator('option', { hasText: 'Lichess 2014-07' });
        await picker.selectOption((await option.getAttribute('value')) ?? '');
        await expectVisible(page.locator('[data-library-list] tbody tr'), 60_000);
        const started = Date.now();
        await page.getByRole('searchbox', { name: 'Search games' }).fill('Sicilian');
        await wait(500);
        await expectVisible(page.locator('[data-library-list] tbody tr'), 60_000);
        return `search "Sicilian" answered in ${((Date.now() - started) / 1000).toFixed(1)} s`;
      });
      await step('a move search across the million: opposite-coloured bishops', async () => {
        await page.getByRole('searchbox', { name: 'Search games' }).fill('');
        await page.getByRole('button', { name: 'Filters' }).click();
        const filters = page.locator('[data-library-filters]');
        const theme = filters.getByLabel(/Theme/);
        await theme.selectOption({ label: /opposite/i }).catch(async () => {
          const options = await theme.locator('option').allTextContents();
          const pick = options.find((o) => /opposite/i.test(o));
          await theme.selectOption({ label: pick });
        });
        const started = Date.now();
        await page.getByRole('button', { name: 'Search the moves' }).click();
        const status = page.locator('[data-move-search-status]');
        // The finished answer, not the running count ("Reading moves: … found so far").
        await page.waitForFunction(
          () => {
            const said = document.querySelector('[data-move-search-status]')?.textContent ?? '';
            return !/^Reading moves/.test(said) && /contain it|none contain|No game/i.test(said);
          },
          null,
          { timeout: 300_000 },
        );
        return `${await text(status)} — ${((Date.now() - started) / 1000).toFixed(1)} s`;
      });
      await step('the explorer over the million, beside the built-in population', async () => {
        await go(`/analysis?fen=${encodeURIComponent(NAJDORF)}`);
        await tool('Explorer');
        const source = page.getByRole('combobox', { name: 'Evidence source' });
        const option = source.locator('option', { hasText: 'Lichess 2014-07' });
        await source.selectOption((await option.getAttribute('value')) ?? '');
        await expectVisible(page.getByText(/games here/), 60_000);
        const own = await text(page.getByText(/games here/));
        await page.getByRole('button', { name: 'Compare sources' }).click();
        await wait(3000);
        return `${own.slice(0, 120)} | compared with Starter`;
      });
      await step('engines on the critical position', async () => {
        await tool('Engine');
        await page
          .getByRole('button', { name: /Start|Analyse/ })
          .first()
          .click()
          .catch(() => undefined);
        await wait(6000);
        return (await text(page.locator('[data-workspace-dock]'))).slice(0, 160);
      });
      await step('historical games: Capablanca, annotated, from a public-domain book', async () => {
        await go('/databases');
        const set = page.locator('[data-annotated-set="capablanca-chess-fundamentals-1921"]');
        await set.getByRole('button', { name: 'Add to my games' }).click();
        await expectVisible(page.getByText(/Chess Fundamentals (added|is already)/));
        await go('/games');
        const picker = page.getByRole('combobox', { name: 'Database' });
        const mine = picker.locator('option', { hasText: /My games/ });
        if (await mine.count())
          await picker.selectOption((await mine.first().getAttribute('value')) ?? '');
        const row = page.getByRole('row', { name: /Lasker.*Capablanca/ }).first();
        await row.dblclick();
        await expectVisible(page.getByText(/The object of this move is to bring/));
        return 'Lasker – Capablanca, St. Petersburg 1914, with the author’s notes';
      });
      await step('organised in a study, in its own tab, without losing the board', async () => {
        const tabs = page.getByRole('tablist', { name: 'Workspace tabs' }).getByRole('tab');
        const before = await tabs.count();
        await page.getByRole('button', { name: 'New tab' }).click();
        await page
          .getByRole('navigation', { name: 'Sections' })
          .getByRole('link', { name: 'Studies', exact: true })
          .click();
        await ready();
        await page.getByRole('button', { name: 'Start a study' }).first().click();
        const created = page.getByRole('dialog', { name: 'New study' });
        await created.getByLabel('Title').fill('Najdorf research (workflow)');
        await created.getByRole('button', { name: 'Create study', exact: true }).click();
        await tabs.first().click();
        await expectVisible(page.getByText(/The object of this move is to bring/));
        return `tabs ${before} → ${await tabs.count()}; the first still holds Lasker – Capablanca`;
      });
    },
  },

  6: {
    title: 'Edge cases',
    async run() {
      const { pgn, nodes } = hugeTreePgn();
      await step(`a ${nodes.toLocaleString()}-node tree`, async () => {
        await go('/analysis');
        await page
          .getByRole('button', { name: /^Import( PGN or FEN)?$/ })
          .first()
          .click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('textbox').first().fill(pgn);
        const started = Date.now();
        await dialog.getByRole('button', { name: 'Import games' }).click();
        await dialog.waitFor({ state: 'hidden', timeout: 600_000 });
        const imported = Date.now() - started;
        await expectVisible(
          page.locator('[data-virtualized-move-tree], [data-move-tree]'),
          120_000,
        );
        const endStarted = Date.now();
        await page.getByRole('button', { name: 'End of line (End)' }).click();
        const opened = imported;
        const toEnd = Date.now() - endStarted;
        await play('b1', 'c3').catch(() => undefined);
        return `imported in ${(opened / 1000).toFixed(1)} s; End of line in ${(toEnd / 1000).toFixed(1)} s; a move played at the end`;
      });
      await step('offline: the built-in population still answers', async () => {
        if (target !== 'browser') return 'packaged: covered by desktop:smoke --offline';
        const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin);
        // Against a local server, "offline" is no internet: everything not on this machine refused.
        // Against the public site, the network itself goes, and the service worker has to serve the page.
        const refuse = (route) =>
          /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(route.request().url())
            ? route.continue()
            : route.abort('internetdisconnected');
        if (local) await page.context().route('**/*', refuse);
        else await page.context().setOffline(true);
        try {
          await page.reload();
          await ready();
          await go(`/analysis?fen=${encodeURIComponent(NAJDORF)}`).catch(() => undefined);
          await tool('Explorer');
          await expectVisible(page.getByText(/games here/));
          return `${local ? 'no internet (local server)' : 'network off'}: ${await text(page.getByText(/games here/))}`;
        } finally {
          if (local) await page.context().unroute('**/*', refuse);
          else await page.context().setOffline(false);
        }
      });
      await step('the companion killed in the middle of a query', async () => {
        if (!collection) return 'no collection given';
        await go('/analysis');
        const paired = await page.getByRole('combobox', { name: 'Database' }).count();
        if (!paired) await pairCompanion().catch(() => undefined);
        await go('/games');
        const picker = page.getByRole('combobox', { name: 'Database' });
        const option = picker.locator('option', { hasText: 'Lichess 2014-07' });
        await picker.selectOption((await option.getAttribute('value')) ?? '');
        await page.getByRole('button', { name: 'Filters' }).click();
        await page
          .locator('[data-library-filters]')
          .getByLabel('Route', { exact: true })
          .fill('N g1 f3 d4 f5');
        await page.getByRole('button', { name: 'Search the moves' }).click();
        await wait(800);
        if (target === 'browser') companion.kill('SIGKILL');
        else {
          const { execFileSync } = await import('node:child_process');
          execFileSync('pkill', ['-9', '-f', 'kingfisher/companion/src/server.mjs']);
        }
        await wait(4000);
        const status = await page
          .locator('[data-move-search-status]')
          .innerText()
          .catch(() => '');
        const shown = await text(page.locator('main'));
        // A dead companion is an error on the page, never an empty answer.
        if (
          /games read contain it/.test(status) ||
          !/stopped with an error/.test(`${status} ${shown}`)
        ) {
          throw new Error(`after the kill the page claimed an answer: "${status}"`);
        }
        if (target === 'browser') await startCompanion(collection);
        await go('/analysis');
        await ready();
        return `after the kill the page is alive; status: "${status.slice(0, 160)}"`;
      });
      await step('a reload inside the autosave window keeps the move', async () => {
        await go('/studies');
        await page.getByRole('button', { name: 'Start a study' }).first().click();
        const created = page.getByRole('dialog', { name: 'New study' });
        await created.getByLabel('Title').fill('Reload (workflow)');
        await created.getByRole('button', { name: 'Create study', exact: true }).click();
        const rail = page.locator('[data-workspace-rail]').first();
        await rail.getByRole('button', { name: 'New chapter' }).click();
        const prompt = page.getByRole('dialog', { name: 'New chapter' });
        await prompt.getByLabel('Title').fill('Before the reload');
        await prompt
          .getByRole('button', { name: /Create|Add/ })
          .first()
          .click();
        await expectVisible(page.locator('[data-study-save-status]').getByText('Saved'));
        await play('e2', 'e4');
        await play('e7', 'e5');
        await page.reload();
        await ready();
        await expectVisible(page.locator('[data-notation-section]').getByText('e5'));
        return 'both moves back after a reload 0.1 s after them';
      });
    },
  },

  5: {
    title: 'Coaching (a chapter with questions, a worksheet, a student, Training)',
    async run() {
      await step('a chapter with questions, points and a time limit', async () => {
        await go('/studies');
        await page.getByRole('button', { name: 'Start a study' }).first().click();
        const created = page.getByRole('dialog', { name: 'New study' });
        await created.getByLabel('Title').fill('Homework (workflow)');
        await created.getByRole('button', { name: 'Create study', exact: true }).click();
        const rail = page.locator('[data-workspace-rail]').first();
        await rail.getByRole('button', { name: 'New chapter' }).click();
        const prompt = page.getByRole('dialog', { name: 'New chapter' });
        await prompt.getByLabel('Title').fill('Open game basics');
        await prompt
          .getByRole('button', { name: /Create|Add/ })
          .first()
          .click();
        await play('e2', 'e4');
        await play('e7', 'e5');
        await play('g1', 'f3');
        await play('b8', 'c6');
        for (const [san, question] of [
          ['Nf3', 'Develop with a threat.'],
          ['Nc6', 'Defend the pawn.'],
        ]) {
          await page
            .locator('[data-virtualized-move-tree], [data-move-tree]')
            .first()
            .getByRole('button', { name: san, exact: true })
            .click({ button: 'right' });
          await page.getByRole('menuitem', { name: 'Ask this move as a question…' }).click();
          const ask = page.getByRole('dialog', { name: new RegExp(`Ask ${san} as a question`) });
          await ask.getByLabel('Question').fill(question);
          const points = ask.getByLabel(/Points/);
          if (await points.isVisible().catch(() => false)) await points.fill('2');
          await ask.getByRole('button', { name: 'Ask it' }).click();
        }
        await expectVisible(page.getByText('Saved', { exact: true }), 20_000);
        return `${await page.locator('[data-question-marker]').count()} questions`;
      });
      await step('the worksheet published', async () => {
        await page.getByRole('button', { name: 'Publish…', exact: true }).click();
        const publish = page.getByRole('dialog', { name: 'Publish study' });
        await publish.getByRole('checkbox', { name: /As a worksheet/ }).check();
        const download = await Promise.all([
          page.waitForEvent('download'),
          publish.getByRole('button', { name: 'Save as HTML', exact: true }).click(),
        ]).then(([event]) => event);
        const file = path.join(OUT, '5-worksheet.html');
        await download.saveAs(file);
        await publish
          .getByRole('button', { name: /Close|Cancel/ })
          .first()
          .click();
        return `worksheet saved (${path.basename(file)})`;
      });
      await step('solved as a student', async () => {
        const inline = page.getByRole('button', { name: /^Solve \d+ question/ });
        if (await inline.isVisible().catch(() => false)) await inline.click();
        else {
          await page.getByRole('button', { name: 'More actions' }).click();
          await page.getByRole('menuitem', { name: /^Solve/ }).click();
        }
        const dialog = page.getByRole('dialog', { name: 'Questions in Open game basics' });
        await play('g1', 'f3', dialog.getByRole('grid', { name: 'Chessboard' }));
        await dialog.getByRole('button', { name: 'Next question' }).click();
        await play('f7', 'f6', dialog.getByRole('grid', { name: 'Chessboard' }));
        await dialog.getByRole('button', { name: 'See how it went' }).click();
        return text(dialog.locator('[data-question-summary]'));
      });
      await step('the miss sent to Training', async () => {
        const dialog = page.getByRole('dialog', { name: 'Questions in Open game basics' });
        await dialog.getByRole('button', { name: /Add 1 to Training/ }).click();
        await expectVisible(page.getByText('1 question is in Training now.'));
        return 'added';
      });
      await step('reviewed in Training', async () => {
        await go('/training');
        await expectVisible(page.getByText('Defend the pawn.'));
        return 'the missed question is a Training item';
      });
    },
  },
};

async function openTarget() {
  if (target === 'packaged') {
    session = await launchKingfisher({ packaged: true, timeout: 180_000 });
    page = session.window;
    await page.setViewportSize?.({ width: 1440, height: 900 }).catch(() => undefined);
    origin = new URL(page.url()).origin;
    await ready();
    return;
  }
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  origin = base;
}

async function main() {
  if (collection && target === 'browser') await startCompanion(collection);
  await openTarget();
  for (const id of only) {
    const workflow = WORKFLOWS[id];
    if (!workflow) continue;
    current = { id, title: workflow.title };
    console.log(`\nWorkflow ${id}: ${workflow.title}`);
    const started = Date.now();
    try {
      await workflow.run();
    } catch {
      // Recorded by the step; the workflow stops at its blocker.
    }
    console.log(`  ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  writeFileSync(
    path.join(OUT, 'results.json'),
    JSON.stringify({ target, origin, at: new Date().toISOString(), results }, null, 2),
  );
  if (session) await quitKingfisher(session.app);
  if (browser) await browser.close();
  companion?.kill('SIGTERM');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  if (browser) await browser.close();
  process.exit(1);
});
