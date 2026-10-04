#!/usr/bin/env node
/**
 * A working day, compressed: the same professional workload, cycle after
 * cycle, for hours, against the real application — measured the same way at
 * the end of every cycle so the first hour and the last can be compared.
 *
 * `desktop:walk` is random and hostile; `desktop:soak:leaks` counts
 * resources across navigation. This is neither: it is the steady, repeated
 * work of a strong player, so growth across comparable cycles means something.
 *
 * One cycle (deterministic):
 *   a long annotated game with nested variations, opened as a study chapter;
 *   engine started, MultiPV 1 → 3 → 5, fifty rapid moves through the game
 *   with the engine running, engine switched, threads and hash changed,
 *   stopped; the engine panel's position held to the board's; a comment, a
 *   glyph and an arrow added; Explorer, Theory Book and Notes opened and the
 *   tool divider resized from the keyboard; the explorer and the Library
 *   queried; Studies, Repertoire, Preparation and Training visited, a training
 *   answer revealed; the page reloaded and the workspace checked.
 * Every few cycles: the network cut and restored; the application quit and
 * reopened on the same profile with the work checked; once an hour every
 * process stopped for 20 s and resumed (a sleep, as far as software can tell).
 *
 * After every cycle, settled and garbage-collected: memory by process (main,
 * renderers, GPU, utility, companion, engines), JS heap, DOM nodes, event
 * listeners, live workers / channels / intervals / observers, engine
 * processes, requests, console errors, key → board latency.
 *
 *   KINGFISHER_DESKTOP_APP=<Kingfisher.app> node scripts/desktop-session.mjs \
 *     --duration=4h --out=<evidence dir> [--profile=<dir>] [--warmup=2]
 *
 * Exit 0 only when the verdict at the end holds; the JSON in --out says why.
 */

import { Chess } from 'chess.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';

import {
  alive,
  descendants,
  engineProcesses,
  launchKingfisher,
  ROOT,
  waitForReady,
} from './desktop-lib/launch.mjs';

const value = (name, fallback = null) => {
  const found = argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const durationMs = (text) => {
  const match = /^(\d+(?:\.\d+)?)(s|m|h)$/.exec(text);
  if (!match) throw new Error(`--duration like 4h or 30m, not ${text}`);
  return Number(match[1]) * { s: 1_000, m: 60_000, h: 3_600_000 }[match[2]];
};
const OUT = value('out', path.join(ROOT, 'test-results', `session-${Date.now()}`));
const DURATION = durationMs(value('duration', '30m'));
const WARMUP = Number(value('warmup', '2'));
const RESTART_EVERY = Number(value('restart-every', '6'));
const OFFLINE_EVERY = Number(value('offline-every', '4'));
const SUSPEND_EVERY_MS = durationMs(value('suspend-every', '60m'));
mkdirSync(OUT, { recursive: true });
const PROFILE = value('profile', path.join(OUT, 'profile'));
mkdirSync(PROFILE, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (line) => console.log(`[session ${new Date().toISOString().slice(11, 19)}] ${line}`);

// --- the game: long, annotated, nested --------------------------------------------
const corpus = readFileSync(
  path.join(ROOT, 'public/data/annotated/capablanca-chess-fundamentals-1921.pgn'),
  'utf8',
)
  .split(/\n(?=\[Event )/)
  .filter((game) => game.trim());
// The longest game in the book: a real score with the author's own notes.
const BASE = corpus.reduce((a, b) => (b.length > a.length ? b : a));
const GAME_TITLE = 'Session game';

// --- live-resource instrumentation (same counts as e2e/soak.spec.ts) --------------
const INSTRUMENT = `(() => {
  if (window.__kfLive) return;
  const live = { workers: 0, channels: 0, eventSources: 0, intervals: 0, windowListeners: 0, resizeObservers: 0 };
  window.__kfLive = () => ({ ...live });
  const W = window.Worker;
  window.Worker = class extends W { constructor(u, o) { super(u, o); live.workers++; this.__c = false; }
    terminate() { if (!this.__c) live.workers--; this.__c = true; super.terminate(); } };
  if (window.BroadcastChannel) { const B = window.BroadcastChannel;
    window.BroadcastChannel = class extends B { constructor(n) { super(n); live.channels++; this.__c = false; }
      close() { if (!this.__c) live.channels--; this.__c = true; super.close(); } }; }
  if (window.EventSource) { const E = window.EventSource;
    window.EventSource = class extends E { constructor(u, o) { super(u, o); live.eventSources++; this.__c = false; }
      close() { if (!this.__c) live.eventSources--; this.__c = true; super.close(); } }; }
  if (window.ResizeObserver) { const R = window.ResizeObserver;
    window.ResizeObserver = class extends R { constructor(cb) { super(cb); live.resizeObservers++; this.__c = false; }
      disconnect() { if (!this.__c) live.resizeObservers--; this.__c = true; super.disconnect(); } }; }
  const intervals = new Set(); const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = (...a) => { const id = si(...a); intervals.add(id); live.intervals = intervals.size; return id; };
  window.clearInterval = (id) => { intervals.delete(id); live.intervals = intervals.size; return ci(id); };
  const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
  const keys = new Set();
  const key = (t, l, o) => t + '|' + (l && (l.__kfId ??= Math.random())) + '|' + Boolean(typeof o === 'boolean' ? o : o && o.capture);
  window.addEventListener = (t, l, o) => { keys.add(key(t, l, o)); live.windowListeners = keys.size; return add(t, l, o); };
  window.removeEventListener = (t, l, o) => { keys.delete(key(t, l, o)); live.windowListeners = keys.size; return remove(t, l, o); };
})();`;

// --- one application instance --------------------------------------------------------
let session = null;
/** The last comment written, which every restart must bring back. */
let lastComment = null;
const findings = [];
const finding = (cycle, kind, detail) => {
  findings.push({ cycle, kind, detail, at: new Date().toISOString() });
  log(`FINDING ${kind}: ${detail}`);
};

async function open() {
  const launched = await launchKingfisher({ packaged: true, profile: PROFILE });
  const { app, window: page } = launched;
  await page.addInitScript(INSTRUMENT);
  await waitForReady(page);
  // The first document was created before the script existed; count from a fresh load.
  await page.reload();
  await waitForReady(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const counters = { requests: 0, failedRequests: 0, console: [] };
  page.on('request', () => counters.requests++);
  page.on('requestfailed', () => counters.failedRequests++);
  page.on('console', (message) => {
    if (message.type() === 'error') counters.console.push(message.text().slice(0, 300));
  });
  page.on('pageerror', (error) => counters.console.push(`pageerror: ${error.message}`));
  app.on('window', (other) => {
    if (other !== page) counters.console.push(`unexpected window: ${other.url()}`);
  });
  session = { launched, app, page, cdp, counters };
  return session;
}

const page = () => session.page;
const fen = async () =>
  ((await page().locator('[data-fen-tooltip]').first().textContent()) ?? '').trim();
const dock = () => page().locator('[data-workspace-dock]');
async function route(name) {
  await page()
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name, exact: true })
    .click();
  await page()
    .locator(`[data-workspace-frame]`)
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
  await wait(400);
}
async function tool(name) {
  // The tools region, as e2e/tools.ts selects it: the dock element also holds
  // the notation, whose comments are buttons — "…gives Black more chances…"
  // matched /More/ and opened the author's comment for editing.
  const tools = page().getByRole('complementary', { name: 'Workspace tools' });
  const tab = tools.getByRole('tab', { name, exact: true });
  if (await tab.isVisible().catch(() => false)) return tab.click();
  await tools
    .getByRole('button', { name: /^More( tools)?$/ })
    .first()
    .click();
  await page().getByRole('menuitem', { name, exact: true }).click();
}
async function saved() {
  for (let i = 0; i < 80; i++) {
    const unsaved = await page()
      .getByText(/· (unsaved|saving…)$/)
      .first()
      .isVisible()
      .catch(() => false);
    if (!unsaved) return true;
    await wait(250);
  }
  return false;
}

// --- setup, once per profile -------------------------------------------------------
/** Native engines, installed once per profile through the route Settings → Engines uses. */
const NATIVE = ['stockfish-native', 'stormphrax'];
async function installEngines() {
  for (const id of NATIVE) {
    const outcome = await page().evaluate(async (id) => {
      const { url, token } = window.kingfisher.companion;
      const call = async (route, body) => {
        const response = await fetch(`${url}${route}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      };
      const started = await call('/engine/install', { engine: id });
      if (started.status !== 200 && started.status !== 202) return `install ${started.status}`;
      for (let i = 0; i < 600; i++) {
        const progress = await call(`/engine/install-progress?engine=${encodeURIComponent(id)}`);
        if (progress.body?.error) return progress.body.error;
        if (!progress.body?.progress) return 'installed';
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return 'timed out';
    }, id);
    log(`engine ${id}: ${outcome}`);
  }
}

async function setUp() {
  const p = page();
  await installEngines();
  await route('Studies');
  if (await p.getByRole('button', { name: new RegExp(`^\\d+\\. ${GAME_TITLE}`) }).count()) return;
  // The game, imported on the analysis board and filed as a study chapter.
  await route('Analysis');
  await p.getByRole('button', { name: 'New analysis' }).first().click();
  await p.getByRole('button', { name: 'Import PGN or FEN' }).first().click();
  const dialog = p.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(BASE);
  await dialog.getByRole('button', { name: 'Import games', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await p.getByRole('button', { name: 'Save this analysis to a study' }).click();
  const filing = p.getByRole('dialog', { name: 'Save to study' });
  await filing.getByRole('combobox').selectOption({ label: 'New study…' });
  await filing.getByLabel('New study title').fill('Session study');
  await filing.getByLabel('Chapter title').fill(GAME_TITLE);
  await filing.getByRole('button', { name: 'Save chapter' }).click();
  await p.getByText('· saved', { exact: true }).waitFor({ timeout: 30_000 });
  // One move of the harness's own after the game's last, so the comments it
  // writes every cycle never touch the author's annotations.
  await p.evaluate(() => document.activeElement?.blur?.());
  await p.keyboard.press('End');
  const end = new Chess(await fen());
  const reply = end.moves({ verbose: true }).find((m) => !m.promotion);
  await p.getByRole('gridcell', { name: new RegExp(`^${reply.from},`) }).click();
  await p.getByRole('gridcell', { name: new RegExp(`^${reply.to},`) }).click();
  await saved();
  log(`set up: "${GAME_TITLE}" — ${BASE.length} characters of annotated PGN`);
}

// --- one cycle ---------------------------------------------------------------------------
/** A dialog nobody asked for, after a step: which step opened it, and close it. */
async function checkpoint(n, label) {
  const dialog = page().getByRole('dialog').first();
  if (!(await dialog.isVisible().catch(() => false))) return;
  const title = (await dialog.innerText().catch(() => '')).split('\n')[0];
  finding(n, 'unexpected-dialog', `after ${label}: "${title}"`);
  await page().screenshot({
    path: path.join(OUT, `cycle-${n}-dialog-${label.replace(/\W+/g, '-')}.png`),
  });
  await page().keyboard.press('Escape');
  await wait(300);
}

async function cycle(n) {
  const p = page();
  const latencies = [];
  const t0 = Date.now();

  // Studies: the game chapter.
  await route('Studies');
  await p
    .getByRole('button', { name: new RegExp(`^\\d+\\. ${GAME_TITLE}`) })
    .first()
    .click();
  await p.locator('footer').filter({ hasText: GAME_TITLE }).first().waitFor({ timeout: 20_000 });

  // Engine, with MultiPV changes while it runs.
  await tool('Engine');
  const panel = p.locator('[data-engine-panel-fen]');
  const start = panel.getByRole('button', { name: 'Start analysis (E)', exact: true });
  if (await start.isVisible().catch(() => false)) await start.click();
  await panel.locator('[data-engine-line]').first().waitFor({ timeout: 45_000 });
  for (const lines of ['1', '3', '5']) {
    await panel
      .getByRole('button', { name: lines, exact: true })
      .click()
      .catch(() => undefined);
    await wait(700);
  }

  // Fifty rapid moves through the game while the engine follows.
  // Keys go to the page; a click on the notation's edge lands on the tool divider.
  await p.evaluate(() => document.activeElement?.blur?.());
  await p.keyboard.press('Home');
  const keys = [
    ...Array(30).fill('ArrowRight'),
    'End',
    'Home',
    ...Array(10).fill('ArrowRight'),
    ...Array(8).fill('ArrowLeft'),
  ];
  for (const key of keys) {
    const before = await fen();
    const pressed = performance.now();
    await p.keyboard.press(key);
    for (let i = 0; i < 200; i++) {
      if ((await fen()) !== before) break;
      await wait(5);
    }
    latencies.push(performance.now() - pressed);
  }
  await checkpoint(n, 'navigation');

  // Settled, the engine's evidence must belong to the board's position.
  await wait(3_000);
  const board = await fen();
  const analysed = await panel.getAttribute('data-engine-panel-fen');
  if (analysed && analysed !== board)
    finding(n, 'stale-analysis', `engine panel ${analysed} vs board ${board}`);

  // Engine switch, then threads/hash via the preset, then stop.
  // Native Stockfish ↔ Stormphrax, while the search runs; back to Stockfish.
  const select = panel.locator('select').first();
  const options = await select
    .locator('option')
    .evaluateAll((all) => all.filter((o) => !o.disabled).map((o) => o.value))
    .catch(() => []);
  const switching = NATIVE.filter((id) => options.includes(id));
  for (const id of [...switching.slice(1), ...switching.slice(0, 1)]) {
    await select.selectOption(id);
    await wait(3_000);
  }
  if (switching.length < 2 && n === 0)
    finding(n, 'harness', `native engines offered: ${switching.join(', ') || 'none'}`);
  const stop = panel.getByRole('button', { name: 'Stop analysis (E)', exact: true });
  if (await stop.isVisible().catch(() => false)) await stop.click();
  await checkpoint(n, 'engine');

  // A comment, a glyph and an arrow on the harness's own last move.
  await p.evaluate(() => document.activeElement?.blur?.());
  await p.keyboard.press('End');
  const current = p.locator('[data-move-tree] [data-current="true"]').first();
  await current.scrollIntoViewIfNeeded();
  await wait(300);
  await current.click({ button: 'right' });
  await p.getByRole('menuitem', { name: /Add comment|Edit comment/ }).click();
  const commentDialog = p.getByRole('dialog', { name: /^Comment on/ });
  const box = commentDialog.getByRole('textbox');
  const existing = (await box.inputValue()).trim();
  if (existing && !existing.startsWith('Session note')) {
    // Never overwrite the author's annotation; that would be this harness destroying work.
    await commentDialog.getByRole('button', { name: 'Cancel' }).click();
    finding(
      n,
      'harness',
      `the current move already carries an annotation: "${existing.slice(0, 60)}"`,
    );
  } else {
    await box.fill(`Session note, cycle ${n}.`);
    await commentDialog.getByRole('button', { name: 'Save comment' }).click();
    lastComment = `Session note, cycle ${n}.`;
  }
  await commentDialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
  await checkpoint(n, 'comment');
  await p
    .getByRole('button', { name: '!', exact: true })
    .first()
    .click()
    .catch(() => undefined);
  await checkpoint(n, 'glyph');
  const from = p.getByRole('gridcell', { name: /^e2,/ });
  const to = p.getByRole('gridcell', { name: /^e4,/ });
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (a && b) {
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await p.mouse.down({ button: 'right' });
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
    await p.mouse.up({ button: 'right' });
  }
  await checkpoint(n, 'arrow');
  await saved();

  // Tool panels, and the divider from the keyboard.
  for (const name of ['Explorer', 'Theory Book', 'Notes', 'Engine']) {
    await tool(name).catch(() => undefined);
    await checkpoint(n, `tool ${name}`);
  }
  const divider = p.getByRole('separator').first();
  if (await divider.isVisible().catch(() => false)) {
    await divider.focus();
    for (const key of [
      'ArrowLeft',
      'ArrowLeft',
      'ArrowLeft',
      'ArrowRight',
      'ArrowRight',
      'ArrowRight',
    ])
      await p.keyboard.press(key);
  }
  await checkpoint(n, 'divider');

  // The explorer on the built-in reference, timed, at a position inside its depth.
  await p.evaluate(() => document.activeElement?.blur?.());
  await p.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowRight');
  await tool('Explorer');
  const askedAt = performance.now();
  const rows = await dock()
    .locator('[data-explorer-row]')
    .first()
    .waitFor({ timeout: 20_000 })
    .then(
      () => true,
      () => false,
    );
  const explorerMs = performance.now() - askedAt;
  if (!rows) finding(n, 'explorer', 'no rows from the explorer within 20 s');

  // Library query on My games.
  await route('Library');
  const search = p
    .getByRole('searchbox', { name: 'Search games' })
    .or(p.getByRole('textbox', { name: 'Search games' }))
    .first();
  const libraryAt = performance.now();
  await search.fill(n % 2 ? 'Capablanca' : 'Marshall').catch(() => undefined);
  await p
    .locator('[data-library-list] tbody tr')
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  const libraryMs = performance.now() - libraryAt;
  await search.fill('').catch(() => undefined);

  // The preparation side of the day.
  for (const name of ['Repertoire', 'Preparation', 'Openings']) await route(name);
  await route('Training');
  const reveal = p.getByRole('button', { name: /Show( the)? answer|Reveal/i }).first();
  if (await reveal.isVisible().catch(() => false)) await reveal.click();

  // Back to the game, and a reload: the workspace must come back as it was.
  await route('Studies');
  await p
    .getByRole('button', { name: new RegExp(`^\\d+\\. ${GAME_TITLE}`) })
    .first()
    .click();
  await p.locator('footer').filter({ hasText: GAME_TITLE }).first().waitFor({ timeout: 20_000 });
  await p.keyboard.press('End');
  await saved();
  const beforeReload = await fen();
  await p.reload();
  await waitForReady(p);
  await wait(1_500);
  const afterReload = await fen();
  const document = await p
    .locator('footer')
    .filter({ hasText: 'half-moves' })
    .first()
    .innerText()
    .catch(() => '');
  if (afterReload !== beforeReload || !document.includes(GAME_TITLE))
    finding(
      n,
      'reload',
      `before ${beforeReload} after ${afterReload} (${document.replace(/\s+/g, ' ')})`,
    );

  return {
    cycleMs: Date.now() - t0,
    keyLatency: summary(latencies),
    explorerMs: Math.round(explorerMs),
    libraryMs: Math.round(libraryMs),
  };
}

function summary(values) {
  const sorted = [...values].sort((x, y) => x - y);
  const at = (q) =>
    Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0);
  return { n: values.length, p50: at(0.5), p95: at(0.95), max: at(1) };
}

// --- measurement, settled -------------------------------------------------------------
async function measure() {
  const { app, page: p, cdp, counters, launched } = session;
  await wait(5_000);
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
  await wait(1_000);
  const metrics = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
  );
  const live = await p.evaluate(() => window.__kfLive?.() ?? null);
  const processes = await app.evaluate(({ app }) =>
    app.getAppMetrics().map((m) => ({
      pid: m.pid,
      type: m.type,
      name: m.name ?? null,
      kb: m.memory.workingSetSize,
    })),
  );
  const electronPids = new Set(processes.map((m) => m.pid));
  const others = descendants(launched.pid).filter((d) => !electronPids.has(d.pid));
  const rss = (pid) => {
    try {
      return Number(
        execFileSync('ps', ['-o', 'rss=', '-p', String(pid)])
          .toString()
          .trim(),
      );
    } catch {
      return 0;
    }
  };
  const byType = {};
  for (const m of processes) byType[m.type] = (byType[m.type] ?? 0) + Math.round(m.kb / 1024);
  // The local web server and the companion: below the shell, not Electron's own.
  const engines = engineProcesses();
  const enginePids = new Set(engines.map((e) => e.pid));
  byType.services = others
    .filter((d) => !enginePids.has(d.pid))
    .reduce((sum, d) => sum + Math.round(rss(d.pid) / 1024), 0);
  byType.engines = engines.reduce((sum, e) => sum + Math.round(rss(e.pid) / 1024), 0);
  const snapshot = {
    memoryMb: byType,
    jsHeapMb: Math.round((metrics.JSHeapUsedSize ?? 0) / 1048576),
    domNodes: metrics.Nodes,
    listeners: metrics.JSEventListeners,
    documents: metrics.Documents,
    live,
    engineProcesses: engines.length,
    requests: counters.requests,
    failedRequests: counters.failedRequests,
    consoleErrors: counters.console.splice(0),
  };
  counters.requests = 0;
  counters.failedRequests = 0;
  return snapshot;
}

// --- the extras: offline, restart, suspend -----------------------------------------
async function offlineRound(n) {
  const { app, page: p } = session;
  await app.evaluate(({ session: s }) => {
    s.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const local = /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(details.url);
      const internal = /^(devtools|chrome|chrome-extension|blob|data|file):/.test(details.url);
      callback(local || internal ? {} : { cancel: true });
    });
  });
  await route('Analysis');
  // Inside the built-in reference's depth, so silence would mean it failed offline.
  await p.evaluate(() => document.activeElement?.blur?.());
  await p.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowRight');
  await tool('Explorer');
  const offlineRows = await dock()
    .locator('[data-explorer-row]')
    .first()
    .waitFor({ timeout: 20_000 })
    .then(
      () => true,
      () => false,
    );
  if (!offlineRows) finding(n, 'offline', 'the built-in reference did not answer offline');
  await app.evaluate(({ session: s }) => s.defaultSession.webRequest.onBeforeRequest(null));
  await p.reload();
  await waitForReady(p);
  return { offlineRows };
}

async function restart(n) {
  const before = await fen();
  const closed = await session.launched.close({ keepProfile: true });
  if (closed.survivors.length)
    finding(
      n,
      'survivors',
      `${closed.survivors.length} processes outlived quit: ${closed.survivors.map((s) => s.comm.slice(-60)).join('; ')}`,
    );
  if (closed.forced) finding(n, 'quit', 'the application had to be killed');
  const orphans = engineProcesses();
  if (orphans.length) finding(n, 'orphan-engines', `${orphans.length} engine processes after quit`);
  await open();
  await wait(2_000);
  await route('Studies');
  await page()
    .getByRole('button', { name: new RegExp(`^\\d+\\. ${GAME_TITLE}`) })
    .first()
    .click();
  await page()
    .locator('footer')
    .filter({ hasText: GAME_TITLE })
    .first()
    .waitFor({ timeout: 20_000 });
  await page().keyboard.press('End');
  const after = await fen();
  if (after !== before) finding(n, 'restart', `game end ${before} → ${after}`);
  if (
    lastComment &&
    !(await page()
      .getByText(lastComment)
      .first()
      .isVisible()
      .catch(() => false))
  )
    finding(n, 'restart', `the comment "${lastComment}" is not shown after reopening`);
  return { closeMs: closed.closeMs, survivors: closed.survivors.length };
}

function suspendAll() {
  const pids = [session.launched.pid, ...descendants(session.launched.pid).map((d) => d.pid)];
  for (const pid of pids)
    try {
      process.kill(pid, 'SIGSTOP');
    } catch {
      /* gone */
    }
  return pids;
}
function resumeAll(pids) {
  for (const pid of [...pids].reverse())
    try {
      process.kill(pid, 'SIGCONT');
    } catch {
      /* gone */
    }
}

// --- the run -----------------------------------------------------------------------------
async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    durationMs: DURATION,
    warmup: WARMUP,
    cycles: [],
    findings,
  };
  const save = () => writeFileSync(path.join(OUT, 'session.json'), JSON.stringify(report, null, 2));
  await open();
  report.application = await session.app.evaluate(({ app }) => ({
    name: app.getName(),
    version: app.getVersion(),
  }));
  await setUp();
  await page().screenshot({ path: path.join(OUT, 'inspect-start.png') });
  const startedAt = Date.now();
  let lastSuspend = startedAt;
  let lastShot = startedAt;
  for (let n = 0; Date.now() - startedAt < DURATION; n++) {
    const entry = { n, startedAt: new Date().toISOString() };
    try {
      entry.work = await cycle(n);
    } catch (error) {
      finding(
        n,
        'cycle-threw',
        String(error?.message ?? error)
          .replace(/\s+/g, ' ')
          .slice(0, 2000),
      );
      await page()
        .screenshot({ path: path.join(OUT, `cycle-${n}-error.png`) })
        .catch(() => undefined);
      await page()
        .reload()
        .catch(() => undefined);
      await waitForReady(page()).catch(() => undefined);
    }
    if (n > 0 && n % OFFLINE_EVERY === 0)
      entry.offline = await offlineRound(n).catch((e) => ({ error: String(e) }));
    if (Date.now() - lastSuspend >= SUSPEND_EVERY_MS) {
      const pids = suspendAll();
      await wait(20_000);
      resumeAll(pids);
      lastSuspend = Date.now();
      await wait(3_000);
      const responsive = await page()
        .evaluate(() => 1)
        .then(
          () => true,
          () => false,
        );
      entry.suspend = { processes: pids.length, responsive };
      if (!responsive) finding(n, 'suspend', 'the page did not answer after resume');
    }
    if (n > 0 && n % RESTART_EVERY === 0)
      entry.restart = await restart(n).catch((e) => ({ error: String(e) }));
    entry.measure = await measure().catch((e) => ({ error: String(e) }));
    if (entry.measure.consoleErrors?.length)
      finding(n, 'console', entry.measure.consoleErrors.join(' | ').slice(0, 400));
    report.cycles.push(entry);
    save();
    const m = entry.measure;
    log(
      `cycle ${n}: ${Math.round((entry.work?.cycleMs ?? 0) / 1000)} s, heap ${m.jsHeapMb} MB, listeners ${m.listeners}, nodes ${m.domNodes}, engines ${m.engineProcesses}, keys p95 ${entry.work?.keyLatency?.p95} ms, renderer ${m.memoryMb?.Tab ?? '?'} MB`,
    );
    if (Date.now() - lastShot >= 60 * 60_000) {
      await page().screenshot({
        path: path.join(OUT, `inspect-${Math.round((Date.now() - startedAt) / 3_600_000)}h.png`),
      });
      lastShot = Date.now();
    }
  }
  await page().screenshot({ path: path.join(OUT, 'inspect-end.png') });

  // Shutdown: every owned process must go.
  const owned = descendants(session.launched.pid).map((d) => d.pid);
  const closed = await session.launched.close({ keepProfile: true });
  await wait(2_000);
  report.shutdown = {
    closeMs: closed.closeMs,
    forced: closed.forced,
    owned: owned.length,
    survivors: owned.filter(alive).length,
    orphanEngines: engineProcesses().length,
  };
  report.verdict = verdict(report);
  report.finishedAt = new Date().toISOString();
  save();
  log(`verdict: ${JSON.stringify(report.verdict)}`);
  exit(report.verdict.pass ? 0 : 1);
}

/** Steady state against steady state: the cycles after warm-up, first third against last third. */
function verdict(report) {
  const steady = report.cycles.filter((c) => c.n >= report.warmup && c.measure && !c.measure.error);
  const third = Math.max(1, Math.floor(steady.length / 3));
  const head = steady.slice(0, third);
  const tail = steady.slice(-third);
  const mean = (list, pick) =>
    list.reduce((s, c) => s + (pick(c) ?? 0), 0) / Math.max(1, list.length);
  const compare = (pick) => ({
    first: Math.round(mean(head, pick)),
    last: Math.round(mean(tail, pick)),
  });
  const growth = {
    jsHeapMb: compare((c) => c.measure.jsHeapMb),
    rendererMb: compare((c) => c.measure.memoryMb?.Tab),
    mainMb: compare((c) => c.measure.memoryMb?.Browser),
    servicesMb: compare((c) => c.measure.memoryMb?.services),
    listeners: compare((c) => c.measure.listeners),
    domNodes: compare((c) => c.measure.domNodes),
    workers: compare((c) => c.measure.live?.workers),
    channels: compare((c) => c.measure.live?.channels),
    intervals: compare((c) => c.measure.live?.intervals),
    resizeObservers: compare((c) => c.measure.live?.resizeObservers),
    windowListeners: compare((c) => c.measure.live?.windowListeners),
    keyP95: compare((c) => c.work?.keyLatency?.p95),
    explorerMs: compare((c) => c.work?.explorerMs),
    libraryMs: compare((c) => c.work?.libraryMs),
    cycleSeconds: compare((c) => (c.work?.cycleMs ?? 0) / 1000),
  };
  const failures = [];
  const grew = (name, allowance) => {
    const g = growth[name];
    if (g.last > g.first * (1 + allowance) + 2) failures.push(`${name} ${g.first} → ${g.last}`);
  };
  grew('jsHeapMb', 0.25);
  grew('listeners', 0.15);
  grew('domNodes', 0.15);
  grew('workers', 0);
  grew('channels', 0);
  grew('intervals', 0.1);
  grew('resizeObservers', 0.1);
  grew('windowListeners', 0.1);
  grew('keyP95', 0.5);
  grew('cycleSeconds', 0.3);
  const hard = report.findings.filter(
    (f) => !['console'].includes(f.kind) || /pageerror|unhandled/i.test(f.detail),
  );
  if (hard.length)
    failures.push(`${hard.length} findings: ${[...new Set(hard.map((f) => f.kind))].join(', ')}`);
  if (report.shutdown?.survivors || report.shutdown?.orphanEngines)
    failures.push('processes survived shutdown');
  return {
    pass: failures.length === 0 && steady.length >= 3,
    steadyCycles: steady.length,
    failures,
    growth,
  };
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
