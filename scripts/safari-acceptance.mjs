#!/usr/bin/env node
/**
 * Kingfisher in actual Safari, not WebKit automation.
 *
 * Playwright's WebKit is the engine Safari uses, built and patched for
 * automation; it is good evidence and it is not Safari. This drives the
 * installed Safari through `safaridriver` (W3C WebDriver, spoken directly so
 * no dependency is added) against a running Kingfisher, through the routes and
 * the workflows a player starts a day with.
 *
 *   safaridriver --enable            # once, by the owner (needs an admin password)
 *   node scripts/safari-acceptance.mjs --base=http://localhost:3210
 *
 * Limits, stated: Safari's WebDriver exposes no console log, so errors are
 * collected by a listener installed on each loaded page — anything thrown
 * before that listener exists is not seen here (the WebKit Playwright runs
 * see it). Network faults cannot be injected in Safari; those cases are the
 * WebKit runs of e2e/provider-states.spec.ts.
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, exit } from 'node:process';

const value = (name, fallback) => {
  const found = argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const BASE = value('base', 'http://localhost:3210');
const PORT = Number(value('driver-port', '4445'));
const REPORT = value('report', path.join(tmpdir(), `kingfisher-safari-${Date.now()}.json`));
const DRIVER = `http://127.0.0.1:${PORT}`;
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

const ROUTES = [
  '/analysis',
  '/daily',
  '/database',
  '/databases',
  '/endgame',
  '/games',
  '/model-game',
  '/opening-files',
  '/openings',
  '/players',
  '/position',
  '/preparation',
  '/puzzles',
  '/recent',
  '/repertoire',
  '/review',
  '/scoresheet',
  '/search',
  '/season',
  '/settings',
  '/similar',
  '/studies',
  '/team',
  '/training',
];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let session = null;
async function wd(method, route, body) {
  const response = await fetch(`${DRIVER}${route.replace(':s', session ?? '')}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(`${method} ${route}: ${JSON.stringify(json.value ?? json).slice(0, 300)}`);
  return json.value;
}
const run = (script, ...args) => wd('POST', '/session/:s/execute/sync', { script, args });
const runAsync = (script, ...args) => wd('POST', '/session/:s/execute/async', { script, args });
const go = (url) => wd('POST', '/session/:s/url', { url });
const find = async (xpath) => {
  const found = await wd('POST', '/session/:s/elements', { using: 'xpath', value: xpath });
  return found.map((entry) => entry[ELEMENT]);
};
const click = (id) => wd('POST', `/session/:s/element/${id}/click`, {});
const keys = async (...sequence) => {
  const actions = [];
  for (const key of sequence)
    actions.push({ type: 'keyDown', value: key }, { type: 'keyUp', value: key });
  await wd('POST', '/session/:s/actions', { actions: [{ type: 'key', id: 'keyboard', actions }] });
  await wd('DELETE', '/session/:s/actions');
};
const KEY = { Home: '', End: '', Left: '', Right: '', Escape: '' };

async function ready(timeout = 30_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const state = await run(
      `return document.documentElement.getAttribute('data-kingfisher-ready') === 'true'`,
    ).catch(() => false);
    if (state) {
      // Errors from here on; Safari's driver has no console log to read.
      await run(`
        if (!window.__kfErrors) {
          window.__kfErrors = [];
          addEventListener('error', (e) => window.__kfErrors.push(String(e.message)));
          addEventListener('unhandledrejection', (e) => window.__kfErrors.push('unhandled: ' + String(e.reason && e.reason.message || e.reason)));
          const original = console.error;
          console.error = (...args) => { window.__kfErrors.push(args.map(String).join(' ').slice(0, 300)); original.apply(console, args); };
        }`);
      return true;
    }
    await wait(250);
  }
  return false;
}
const errors = () => run('return window.__kfErrors || []');
const fen = () =>
  run(`return (document.querySelector('[data-fen-tooltip]')?.textContent || '').trim()`);
const overflow = () =>
  run('return document.documentElement.scrollWidth - document.documentElement.clientWidth');
const square = async (name) =>
  (await find(`//*[@role='gridcell' and starts-with(@aria-label,'${name},')]`))[0];
async function play(from, to) {
  await click(await square(from));
  await click(await square(to));
  await wait(150);
}
async function button(name) {
  const ids = await find(`//button[@aria-label='${name}' or normalize-space(.)='${name}']`);
  return ids[0];
}
const text = () => run('return document.body.innerText');

/** What the page holds: board, session markers, drafts, notices. For a failure's report. */
function pageState(done) {
  const base = {
    fen: (document.querySelector('[data-fen-tooltip]') || {}).textContent,
    session: sessionStorage.getItem('kingfisher.session'),
    held: sessionStorage.getItem('kingfisher.session.held'),
    footer: ((document.querySelector('footer') || {}).innerText || '')
      .replace(/\s+/g, ' ')
      .slice(0, 160),
    notices: Array.from(document.querySelectorAll('[role=alert],[role=status]'))
      .map((e) => e.innerText)
      .join(' | ')
      .slice(0, 300),
    url: location.href,
  };
  // An IndexedDB that does not answer is itself the finding; never wait for ever.
  const timer = setTimeout(
    () => done({ ...base, drafts: 'IndexedDB did not answer in 3 s' }),
    3000,
  );
  const finish = done;
  done = (value) => {
    clearTimeout(timer);
    finish(value);
  };
  const request = indexedDB.open('kingfisher');
  request.onsuccess = () => {
    const db = request.result;
    if (!Array.from(db.objectStoreNames).includes('drafts')) return done(base);
    const q = db.transaction('drafts').objectStore('drafts').getAll();
    q.onsuccess = () =>
      done({
        ...base,
        drafts: q.result.map(
          (d) => `${d.id}:${Object.keys(d.tree.nodes).length}:${d.document.kind}`,
        ),
      });
  };
  request.onerror = () => done(base);
}
const state = () =>
  wd('POST', '/session/:s/execute/async', {
    script: `(${pageState.toString()})(arguments[0])`,
    args: [],
  });

async function main() {
  const driver = spawn('safaridriver', ['-p', String(PORT)], { stdio: 'ignore' });
  await wait(1500);
  try {
    const created = await wd('POST', '/session', {
      capabilities: { alwaysMatch: { browserName: 'safari' } },
    });
    session = created.sessionId;
    check('Safari session', true, `Safari ${created.capabilities.browserVersion}`);
    await wd('POST', '/session/:s/window/rect', { width: 1440, height: 900, x: 0, y: 0 });

    // --- every application route, loaded directly and refreshed -------------------
    const routeErrors = [];
    for (const route of ROUTES) {
      await go(`${BASE}${route}`);
      const loaded = await ready();
      const body = loaded ? await text() : '';
      const broken = /Something went wrong|Application error|This page could not be found/i.test(
        body,
      );
      await wd('POST', '/session/:s/refresh', {});
      const again = await ready();
      const errs = loaded && again ? await errors() : ['not ready'];
      const spill = await overflow();
      if (!loaded || !again || broken || errs.length || spill > 1)
        routeErrors.push(
          `${route}: ready=${loaded}/${again} broken=${broken} overflow=${spill} ${errs.join(' | ').slice(0, 200)}`,
        );
    }
    check(
      `all ${ROUTES.length} routes load directly and after refresh, without errors or sideways overflow`,
      routeErrors.length === 0,
      routeErrors.join('\n      '),
    );

    // --- analysis: board, keyboard, import, persistence ---------------------------
    await go(`${BASE}/analysis`);
    await ready();
    const fresh = await button('New analysis');
    if (fresh) await click(fresh);
    await wait(500);
    const start = await fen();
    check(
      'analysis opens on the start position',
      start.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'),
      start,
    );
    await play('e2', 'e4');
    await play('e7', 'e5');
    await play('g1', 'f3');
    const afterMoves = await fen();
    check(
      'clicking squares plays moves',
      afterMoves.startsWith('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b'),
      afterMoves,
    );
    const board = await square('d4');
    await click(board).catch(() => undefined);
    await keys(KEY.Home);
    await wait(300);
    const atHome = await fen();
    await keys(KEY.End);
    await wait(300);
    const atEnd = await fen();
    await keys(KEY.Left);
    await wait(300);
    const back = await fen();
    check(
      'keyboard Home / End / ← move through the game',
      atHome.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP') &&
        atEnd === afterMoves &&
        back.startsWith('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w'),
      `${atHome.split(' ')[0]} → ${atEnd.split(' ')[0]} → ${back.split(' ')[0]}`,
    );
    await keys(KEY.End);
    await wait(2500); // autosave
    const beforeReload = await state();
    await wd('POST', '/session/:s/refresh', {});
    await ready();
    await wait(1000);
    const afterReload = await state();
    check(
      'the game survives a reload',
      (await fen()) === afterMoves,
      `${await fen()}\n      before: ${JSON.stringify(beforeReload)}\n      after:  ${JSON.stringify(afterReload)}`,
    );

    /*
      Leaving by a full navigation with an unsaved edit, and coming back. Safari
      keeps the page it left in its back-forward cache; before the fix, a write
      that page had open held the drafts store locked, the edit was not
      restored, the status bar said "saved" and later edits never saved.
    */
    const savedWithin = async (ms) => {
      for (let waited = 0; waited < ms; waited += 250) {
        const footer = await run(`return (document.querySelector('footer') || {}).innerText || ''`);
        if (/· saved/.test(footer) && !/· (unsaved|saving…|not saved)/.test(footer)) return true;
        await wait(250);
      }
      return false;
    };
    const fresh2 = await button('New analysis');
    if (fresh2) await click(fresh2);
    await wait(400);
    await play('e2', 'e4');
    const leftWith = await fen();
    await go(`${BASE}/terms`);
    await wait(1500);
    await go(`${BASE}/analysis`);
    await ready();
    await wait(1500);
    const cameBack = await fen();
    check(
      'an unsaved edit survives leaving by a full navigation and coming back',
      cameBack === leftWith && (await savedWithin(6000)),
      `${cameBack}\n      ${JSON.stringify(await state())}`,
    );
    await play('e7', 'e5');
    check('and the next edit saves', await savedWithin(6000), JSON.stringify(await state()));
    await play('g1', 'f3');
    const beforeBack = await fen();
    await go(`${BASE}/terms`);
    await wait(1500);
    await wd('POST', '/session/:s/back', {});
    await wait(2000);
    check(
      'leaving and returning with Back resumes the page and saves its work',
      (await fen()) === beforeBack && (await savedWithin(6000)),
      JSON.stringify(await state()),
    );
    await go(`${BASE}/analysis`);
    await ready();
    await wait(1500);
    check(
      '…and a fresh load afterwards shows that work',
      (await fen()) === beforeBack,
      await fen(),
    );

    const importButton = await button('Import PGN or FEN');
    await click(importButton);
    await wait(400);
    const area = (await find(`//*[@role='dialog']//textarea`))[0];
    await wd('POST', `/session/:s/element/${area}/value`, {
      text: '[White "Safari"]\n[Black "Check"]\n\n1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 (3... d5 4. cxd5 exd5) 4. Qc2 O-O {A comment.} *',
    });
    await click(await button('Import games'));
    await wait(1200);
    const imported = await fen();
    const notation = await text();
    check(
      'PGN import with a variation and a comment',
      /Qc2/.test(notation) && /A comment\./.test(notation) && /cxd5/.test(notation),
      imported,
    );

    // --- engine: works, or says honestly that it cannot -------------------------
    const analyse = await button('Analyse this position');
    if (analyse) await click(analyse);
    let engine = 'none';
    for (let i = 0; i < 60 && engine === 'none'; i++) {
      await wait(500);
      engine = await run(`
        const panel = document.querySelector('[data-engine-panel-fen]');
        const t = document.body.innerText;
        if (/depth\\s*\\d+/i.test(panel?.innerText || '')) return 'searching';
        if (/not available|could not start|unavailable/i.test(panel?.innerText || '')) return 'unavailable';
        return 'none';`);
    }
    const isolated = await run('return window.crossOriginIsolated === true');
    check(
      'browser Stockfish searches, or says why it cannot',
      engine !== 'none',
      `${engine}; crossOriginIsolated=${isolated}`,
    );
    const stop = await button('Stop analysis (E)');
    if (stop) await click(stop);

    // --- explorer on the bundled source -----------------------------------------
    await go(`${BASE}/analysis`);
    await ready();
    const newBoard = await button('New analysis');
    if (newBoard) await click(newBoard);
    const explorerTab = (
      await wd('POST', '/session/:s/elements', {
        using: 'css selector',
        value: '[data-tab-id="explorer"]',
      })
    ).map((entry) => entry[ELEMENT])[0];
    if (explorerTab) await click(explorerTab);
    let rows = 0;
    for (let i = 0; i < 60 && rows === 0; i++) {
      await wait(1000);
      rows = await run(`return document.querySelectorAll('[data-explorer-row]').length`);
    }
    check('the explorer answers from the built-in reference', rows > 0, `${rows} rows`);

    // --- narrower window -------------------------------------------------------------
    await wd('POST', '/session/:s/window/rect', { width: 1024, height: 700 });
    const narrow = [];
    for (const route of [
      '/analysis',
      '/studies',
      '/repertoire',
      '/preparation',
      '/games',
      '/openings',
    ]) {
      await go(`${BASE}${route}`);
      await ready();
      const spill = await overflow();
      if (spill > 1) narrow.push(`${route} overflows by ${spill}px`);
    }
    check('core panels fit at 1024×700', narrow.length === 0, narrow.join(', '));
    const finalErrors = await errors();
    check(
      'no uncaught errors after load in the final page',
      finalErrors.length === 0,
      finalErrors.join(' | '),
    );
  } catch (error) {
    check(
      'the run completed without an exception',
      false,
      String(error?.message ?? error).slice(0, 500),
    );
  } finally {
    if (session) await wd('DELETE', '/session/:s').catch(() => undefined);
    driver.kill();
    writeFileSync(REPORT, JSON.stringify({ base: BASE, results }, null, 2));
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed — ${REPORT}`);
    exit(results.every((r) => r.ok) ? 0 : 1);
  }
}

main();
