#!/usr/bin/env node
/**
 * The overnight deep analysis, in the packaged application (Phase 85, D3).
 *
 * The brief's acceptance: an eight-hour run on the packaged app, with a
 * suspend in the middle, a quit and relaunch, and a report at the end. This
 * does exactly that and writes down what happened, as it happens, to a log a
 * reader can check line by line:
 *
 *   1. launches Kingfisher.app on a fresh profile it keeps, opens a position
 *      and starts a deep analysis of 3 moves × 12 plies × 30 s — the form's
 *      overnight setting, 1,000 positions, about 8.3 hours;
 *   2. every ten minutes, records the saved job (positions searched, status,
 *      how often resumed) and the engine processes alive;
 *   3. at --suspend-at (default 2 h) stops the application and every process
 *      below it for --suspend-seconds (default 60) with SIGSTOP, then SIGCONT —
 *      what a sleep does to a process (see desktop-suspend.mjs for what that
 *      does and does not reproduce);
 *   4. at --relaunch-at (default 4 h) quits the application and opens it again
 *      on the same profile, and requires the job to be picked up;
 *   5. waits for the job to finish, then records the report the page shows and
 *      a screenshot of it.
 *
 *   node scripts/desktop-deep-night.mjs --packaged [--out <dir>]
 *   node scripts/desktop-deep-night.mjs --packaged --quick   # 3 × 4 × 3 s, suspend at 30 s, relaunch at 60 s
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, exit } from 'node:process';

import { descendants, launchKingfisher } from './desktop-lib/launch.mjs';

const value = (name, fallback) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const quick = argv.includes('--quick');
const packaged = argv.includes('--packaged');
const HOUR = 3_600_000;
const settings = quick
  ? { breadth: '3', plies: '4', seconds: '3', suspendAt: 30_000, relaunchAt: 60_000 }
  : {
      breadth: '3',
      plies: '12',
      seconds: '30',
      suspendAt: Number(value('suspend-at', 2)) * HOUR,
      relaunchAt: Number(value('relaunch-at', 4)) * HOUR,
    };
const suspendSeconds = Number(value('suspend-seconds', 60));
const out = value('out', mkdtempSync(path.join(tmpdir(), 'kingfisher-deep-night-')));
mkdirSync(out, { recursive: true });
const logFile = path.join(out, 'deep-night.log');
const profile = mkdtempSync(path.join(tmpdir(), 'kingfisher-deep-night-profile-'));
const FEN = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';

const log = (event, detail = {}) => {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...detail });
  appendFileSync(logFile, `${line}\n`);
  console.log(line);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const job = (window) =>
  window.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open('kingfisher');
        request.onsuccess = () => {
          const database = request.result;
          if (![...database.objectStoreNames].includes('deepAnalysisJobs')) {
            database.close();
            resolve(null);
            return;
          }
          const query = database
            .transaction('deepAnalysisJobs')
            .objectStore('deepAnalysisJobs')
            .getAll();
          query.onsuccess = () => {
            database.close();
            const rows = (query.result ?? []).sort((a, b) => b.startedAt - a.startedAt);
            const row = rows[0];
            resolve(
              row
                ? {
                    status: row.status,
                    searched: row.searched,
                    resumed: row.resumed,
                    engine: row.engineName,
                    startedAt: row.startedAt,
                    finishedAt: row.finishedAt ?? null,
                    error: row.error ?? null,
                  }
                : null,
            );
          };
          query.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      }),
  );

async function ready(window) {
  await window.waitForFunction(
    () => document.documentElement.dataset.kingfisherReady === 'true',
    null,
    {
      timeout: 180_000,
    },
  );
}

async function open() {
  const launched = await launchKingfisher({ packaged, profile, timeout: 180_000 });
  await ready(launched.window);
  return launched;
}

async function main() {
  log('start', { out, profile, packaged, settings, suspendSeconds });
  let session = await open();
  let window = session.window;
  await window.goto(`${new URL(window.url()).origin}/analysis?fen=${encodeURIComponent(FEN)}`);
  await ready(window);
  await window.getByRole('tab', { name: 'Engine', exact: true }).click();
  const section = window.getByRole('region', { name: 'Deep analysis' });
  await section.getByRole('button', { name: 'Deepen from here…' }).click();
  const form = section.locator('[data-deepen-form]');
  await form.getByLabel('Moves per position').selectOption(settings.breadth);
  await form.getByLabel('Plies').selectOption(settings.plies);
  await form.getByLabel('Seconds each').selectOption(settings.seconds);
  log('estimate', { text: await section.locator('[data-deepen-estimate]').innerText() });
  await form.getByRole('button', { name: 'Start' }).click();
  const started = Date.now();
  await section.locator('[data-deepen-progress]').waitFor({ timeout: 120_000 });
  log('running', { job: await job(window) });

  let suspended = false;
  let relaunched = false;
  let lastSample = 0;
  let resumedSeen = false;
  for (;;) {
    const elapsed = Date.now() - started;
    if (!suspended && elapsed >= settings.suspendAt) {
      const pids = [String(session.pid), ...descendants(session.pid).map((p) => String(p.pid))];
      const before = await job(window);
      execFileSync('kill', ['-STOP', ...pids]);
      log('suspended', { processes: pids.length, seconds: suspendSeconds, job: before });
      await wait(suspendSeconds * 1000);
      execFileSync('kill', ['-CONT', ...pids]);
      await wait(30_000);
      log('resumed-from-suspend', { job: await job(window) });
      suspended = true;
    }
    if (!relaunched && elapsed >= settings.relaunchAt) {
      const before = await job(window);
      log('quitting', { job: before });
      const closed = await session.close({ keepProfile: true });
      log('quit', { closeMs: closed.closeMs, survivors: closed.survivors.length });
      await wait(5_000);
      session = await open();
      window = session.window;
      await window.goto(`${new URL(window.url()).origin}/analysis`);
      await ready(window);
      await wait(20_000);
      const after = await job(window);
      resumedSeen = (after?.resumed ?? 0) >= 1;
      log('relaunched', { job: after, resumed: resumedSeen });
      relaunched = true;
    }
    const row = await job(window);
    if (Date.now() - lastSample >= (quick ? 10_000 : 600_000)) {
      lastSample = Date.now();
      log('sample', { elapsedMin: Math.round(elapsed / 60_000), job: row });
    }
    if (row && row.status !== 'running') {
      log('finished', { job: row, hours: ((Date.now() - started) / HOUR).toFixed(2) });
      break;
    }
    await wait(quick ? 2_000 : 30_000);
  }

  await window.goto(`${new URL(window.url()).origin}/analysis?fen=${encodeURIComponent(FEN)}`);
  await ready(window);
  await window.getByRole('tab', { name: 'Engine', exact: true }).click();
  const section2 = window.getByRole('region', { name: 'Deep analysis' });
  /*
    The finished run's report is restored after the page loads (resumeDeepen,
    asynchronously). Read before it arrived, the 2026-09-26 run recorded the
    empty row — "Deepen from here…" — as its report. Wait for the report
    itself, and do not pass without one.
  */
  const reportShown = await section2
    .locator('[data-deepen-report]')
    .waitFor({ timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  const report = await section2.innerText().catch(() => '');
  await section2
    .screenshot({ path: path.join(out, 'deep-night-report.png') })
    .catch(() => undefined);
  await window.screenshot({ path: path.join(out, 'deep-night-window.png') });
  const final = await job(window);
  const passed =
    reportShown &&
    final?.status === 'done' &&
    suspended &&
    relaunched &&
    resumedSeen &&
    (final?.resumed ?? 0) >= 1;
  log('report', { report, reportShown, job: final, suspended, relaunched, resumedSeen, passed });
  writeFileSync(
    path.join(out, 'result.json'),
    JSON.stringify({ final, suspended, relaunched, passed }, null, 2),
  );
  await session.close({ keepProfile: true });
  exit(passed ? 0 : 1);
}

main().catch((error) => {
  log('error', { message: error instanceof Error ? error.stack : String(error) });
  exit(1);
});
