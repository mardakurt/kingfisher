#!/usr/bin/env node
/**
 * Quit Kingfisher, open it again, and see whether the work is still there.
 *
 * ## Why this did not exist, and what that cost
 *
 * It is the most obvious question anybody can ask of a desktop application, and
 * for twenty-one phases nothing asked it. Every browser test asserts that a
 * study survives a reload, and every one of them passes — because a browser's
 * origin never changes. The desktop smoke launches the application, drives it,
 * and quits; it had never launched it a *second* time against the same profile
 * and then looked for the data.
 *
 * So Kingfisher shipped two release candidates in which **every quit and
 * relaunch destroyed every study, repertoire, note, review and preference the
 * user had.** The shell took a fresh free port each launch, a browser
 * partitions storage by origin, and an origin includes the port. Measured:
 *
 *     run 1  http://127.0.0.1:56531   1 study in IndexedDB
 *     run 2  http://127.0.0.1:56566   0 studies in IndexedDB
 *
 * `desktop/src/origin.mjs` is the fix. This is the check that would have found
 * it, and the one that stops it coming back.
 *
 * ## What it asserts
 *
 * Not "a study is visible" — a title on screen can be a dialog that has not
 * closed, or a toast. The study is read back out of IndexedDB by count, and the
 * origin is compared across the two runs, because the origin is the mechanism
 * and the count is the consequence. A future regression that changed the
 * mechanism without losing the data would still be worth failing on.
 *
 * Run against a temporary profile, so it never touches the one you use.
 *
 *   npm run desktop:restart               # the shell, from the checkout
 *   npm run desktop:restart -- --packaged # a built Kingfisher.app
 */

import { _electron as electron } from 'playwright-core';

import * as shared from './desktop-lib/launch.mjs';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = { packaged: argv.includes('--packaged'), keep: argv.includes('--keep-profile') };

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

function shellBinary() {
  return shared.shellBinary();
}

function packagedBinary() {
  return shared.packagedBinary();
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** How many studies this origin's database holds. */
const studyCount = (window) =>
  window.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open('kingfisher');
        request.onsuccess = () => {
          const database = request.result;
          if (![...database.objectStoreNames].includes('studies')) {
            database.close();
            return resolve(0);
          }
          const query = database.transaction('studies', 'readonly').objectStore('studies').getAll();
          query.onsuccess = () => {
            const rows = query.result ?? [];
            database.close();
            resolve(rows.length);
          };
          query.onerror = () => {
            database.close();
            resolve(-1);
          };
        };
        request.onerror = () => resolve(-1);
      }),
  );

async function main() {
  const launch = args.packaged
    ? { executablePath: packagedBinary(), args: [] }
    : { executablePath: shellBinary(), args: [path.join(ROOT, 'desktop')] };
  if (args.packaged && !existsSync(launch.executablePath)) {
    console.error(`No packaged application at ${launch.executablePath}. Run npm run desktop:dist.`);
    exit(1);
  }

  const profile = mkdtempSync(path.join(tmpdir(), 'kingfisher-restart-'));
  console.log('Kingfisher quit and reopen');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(args.packaged ? 'target: the packaged application' : 'target: the checkout');
  console.log(`profile ${profile}\n`);

  const open = async () => {
    const app = await electron.launch({
      ...launch,
      args: [...launch.args, `--user-data-dir=${profile}`],
      timeout: 180_000,
    });
    const window = await app.firstWindow({ timeout: 180_000 });
    await window.waitForLoadState('domcontentloaded');
    await window.waitForFunction(
      () => document.documentElement.dataset.kingfisherReady === 'true',
      null,
      { timeout: 120_000 },
    );
    return { app, window };
  };

  const STUDY = 'Restart check study';

  try {
    // --- Run one: author a study. -------------------------------------------
    let { app, window } = await open();
    const firstOrigin = await window.evaluate(() => location.origin);

    await window.getByRole('link', { name: 'Studies', exact: true }).click();
    await wait(2000);
    await window
      .getByRole('button', { name: /New study|Create study/i })
      .first()
      .click();
    const dialog = window.getByRole('dialog');
    await dialog.waitFor({ timeout: 30_000 });
    await dialog.getByRole('textbox').first().fill(STUDY);
    await dialog
      .getByRole('button', { name: /^(Create|Save|OK)\b/i })
      .first()
      .click();
    await wait(3500);

    const wrote = await studyCount(window);
    check(
      'a study is written on the first run',
      wrote === 1,
      `${wrote} in IndexedDB at ${firstOrigin}`,
    );

    await app.close();
    await wait(2000);

    // --- Run two: the whole point. ------------------------------------------
    ({ app, window } = await open());
    const secondOrigin = await window.evaluate(() => location.origin);

    check(
      'the application comes back at the same origin',
      firstOrigin === secondOrigin,
      `${firstOrigin} → ${secondOrigin}`,
    );

    const kept = await studyCount(window);
    check('the study is still there', kept === 1, `${kept} in IndexedDB at ${secondOrigin}`);

    /*
      Driven rather than dispatched. `element.click()` inside `page.evaluate`
      does not reliably take a Next `<Link>` through the router, and polling for
      the title beats a fixed wait — the studies list is read from IndexedDB
      after the route mounts, so "not there yet" and "not there" look identical
      for the first second.
    */
    await window.getByRole('link', { name: 'Studies', exact: true }).click();
    let visible = false;
    for (let attempt = 0; attempt < 40 && !visible; attempt += 1) {
      await wait(250);
      visible = await window.evaluate((title) => document.body.innerText.includes(title), STUDY);
    }
    check('and the application shows it', visible, visible ? STUDY : 'not on the studies screen');

    /*
      The mechanism, on disk. One origin directory means one workspace; a second
      one means the application has quietly started somewhere else and the user's
      work is in the first.
    */
    const partitions = existsSync(path.join(profile, 'IndexedDB'))
      ? readdirSync(path.join(profile, 'IndexedDB')).filter((entry) =>
          /^http_127\.0\.0\.1_\d+\.indexeddb\.leveldb$/.test(entry),
        )
      : [];
    check(
      'the profile holds exactly one workspace',
      partitions.length === 1,
      partitions.join(', ') || 'none',
    );

    await app.close();
    await wait(1000);
  } finally {
    if (!args.keep) rmSync(profile, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
