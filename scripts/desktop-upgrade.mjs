#!/usr/bin/env node
/**
 * Install a newer Kingfisher over an older one, and see whether the work is
 * still there.
 *
 * First users will get updates, and there is no auto-update: an upgrade means
 * downloading a build and dragging it over the old one. Everything a person
 * authored lives outside the bundle, in the application-support directory the
 * two versions share, so the question this answers is the only one that matters
 * about an upgrade — **does the new binary read what the old one wrote**.
 *
 * ## How it stays out of your way
 *
 * Both runs are given `--user-data-dir`, so neither touches the profile you
 * actually use. That is not a weaker test: the upgrade path is "two versions,
 * one directory", and which directory it is makes no difference to whether the
 * migration runs or the studies come back. What it avoids is a harness writing
 * "Upgrade check 3" into somebody's real study list.
 *
 * ## What it does not cover
 *
 * The Finder half — mounting a `.dmg`, dragging over Applications, Gatekeeper
 * re-evaluating a replaced bundle — needs a window server and a human, and is
 * not simulated here. This is the data half, which is the half that can lose
 * something.
 *
 *   KINGFISHER_DESKTOP_PREV=/path/to/older/out npm run desktop:upgrade
 */

import { _electron as electron } from 'playwright-core';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = { keep: argv.includes('--keep-profile') };

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

function appIn(out) {
  for (const directory of ['mac-arm64', 'mac', 'mac-x64', 'mac-universal']) {
    const app = path.join(out, directory, 'Kingfisher.app');
    if (existsSync(app)) return path.join(app, 'Contents', 'MacOS', 'Kingfisher');
  }
  return null;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function open(binary, profile) {
  const app = await electron.launch({
    executablePath: binary,
    args: [`--user-data-dir=${profile}`],
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
}

/** The version the running bundle reports, from the shell rather than the file. */
const versionOf = (app) => app.evaluate(({ app: electronApp }) => electronApp.getVersion());

async function main() {
  if (process.platform !== 'darwin') {
    console.log('The upgrade this checks is the macOS one. Nothing to do here.');
    exit(0);
  }

  const currentOut = process.env.KINGFISHER_DESKTOP_OUT ?? path.join(ROOT, 'desktop', 'dist');
  const previousOut = process.env.KINGFISHER_DESKTOP_PREV;
  const current = appIn(currentOut);
  const previous = previousOut ? appIn(previousOut) : null;

  if (!current) {
    console.error(`No packaged application under ${currentOut}. Run npm run desktop:dist.`);
    exit(1);
  }
  if (!previous) {
    console.error(
      'Set KINGFISHER_DESKTOP_PREV to an output directory holding the *previous* release’s\n' +
        'Kingfisher.app. Without one there is no upgrade to perform, and a run that quietly\n' +
        'opened the same build twice would report a green upgrade it had never done.',
    );
    exit(1);
  }

  /*
    Resolved, because macOS symlinks /var to /private/var and Electron reports
    the resolved path. An unresolved comparison fails on a directory that is
    demonstrably the same one, which is a harness saying the application moved
    its data when it had not.
  */
  const profile = realpathSync(mkdtempSync(path.join(tmpdir(), 'kingfisher-upgrade-')));
  console.log('Kingfisher upgrade');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(`profile ${profile}\n`);

  const STUDY = 'Upgrade walk study';
  const THEME = 'midnight';

  try {
    // --- 1. The old build, with work in it. --------------------------------
    let { app, window } = await open(previous, profile);
    const before = await versionOf(app);
    console.log(`  … opened ${before}\n`);

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
    await wait(2500);

    const authored = await window.evaluate(
      (title) => document.body.innerText.includes(title),
      STUDY,
    );
    check(`${before} authored a study`, authored, authored ? STUDY : 'the study never appeared');

    /*
      A preference too, because preferences live in localStorage rather than in
      IndexedDB and are migrated by a different mechanism. An upgrade that kept
      the studies and reset the board would still be a bad upgrade.
    */
    await window.evaluate((theme) => {
      const raw = localStorage.getItem('kingfisher.preferences');
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 4 };
      parsed.state = { ...(parsed.state ?? {}), boardTheme: theme };
      localStorage.setItem('kingfisher.preferences', JSON.stringify(parsed));
    }, THEME);
    await window.reload();
    await window.waitForFunction(
      () => document.documentElement.dataset.kingfisherReady === 'true',
      null,
      { timeout: 120_000 },
    );
    await wait(1000);

    await app.close();
    await wait(1500);

    // --- 2. The new build, on the same directory. --------------------------
    ({ app, window } = await open(current, profile));
    const after = await versionOf(app);
    console.log(`  … reopened as ${after}\n`);

    check('the two builds really are different versions', before !== after, `${before} → ${after}`);

    /*
      A driven click and a poll. `element.click()` from inside `evaluate` does
      not reliably take a Next `<Link>` through the router, and the studies list
      is read from IndexedDB after the route mounts — so a fixed wait cannot
      tell "not yet" from "not there".
    */
    await window.getByRole('link', { name: 'Studies', exact: true }).click();
    let survived = false;
    for (let attempt = 0; attempt < 40 && !survived; attempt += 1) {
      await wait(250);
      survived = await window.evaluate((title) => document.body.innerText.includes(title), STUDY);
    }
    check('authored work survives the upgrade', survived, survived ? STUDY : 'the study is gone');

    const theme = await window.evaluate(() => {
      const raw = localStorage.getItem('kingfisher.preferences');
      return raw ? (JSON.parse(raw).state?.boardTheme ?? null) : null;
    });
    check('preferences survive the upgrade', theme === THEME, `boardTheme ${theme}`);

    /*
      Reference-pack *metadata*, which is the part a restore or an upgrade has to
      keep: the contents are hundreds of megabytes and reproducible, and knowing
      which sources the workspace was reading from is not.
    */
    const sources = await window.evaluate(
      async () =>
        new Promise((resolve) => {
          const request = indexedDB.open('kingfisher');
          request.onsuccess = () => {
            const database = request.result;
            if (![...database.objectStoreNames].includes('referencePacks')) {
              database.close();
              return resolve([]);
            }
            const query = database
              .transaction('referencePacks', 'readonly')
              .objectStore('referencePacks')
              .getAll();
            query.onsuccess = () => {
              const rows = (query.result ?? []).map((pack) => `${pack.id}:${pack.state}`);
              database.close();
              resolve(rows);
            };
            query.onerror = () => {
              database.close();
              resolve([]);
            };
          };
          request.onerror = () => resolve([]);
        }),
    );
    check(
      'reference-pack metadata survives the upgrade',
      Array.isArray(sources) && sources.some((row) => row.endsWith(':ready')),
      Array.isArray(sources) ? sources.join(', ') : 'none',
    );

    // No second home. An upgrade that changed `productName` or `appId` would
    // silently start writing somewhere else and look like total data loss.
    const paths = await app.evaluate(({ app: electronApp }) => ({
      userData: electronApp.getPath('userData'),
      name: electronApp.getName(),
    }));
    check(
      'the new build uses the same application data directory',
      paths.userData === profile || paths.userData.startsWith(profile),
      paths.userData,
    );

    // And the application is usable rather than merely holding the data. Back
    // to a board route first: the walk above ended on Studies, which has none.
    await window.getByRole('link', { name: 'Analysis', exact: true }).click();
    await wait(2500);
    const usable = await window.evaluate(() => {
      const frame = document.querySelector('[data-board-frame]')?.getBoundingClientRect();
      return frame ? Math.round(Math.min(frame.width, frame.height)) : 0;
    });
    check('and still opens a board', usable > 300, `${usable}px`);

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
