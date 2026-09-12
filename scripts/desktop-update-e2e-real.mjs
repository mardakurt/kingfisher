#!/usr/bin/env node
/**
 * `npm run desktop:update:real` — the update a user performs, performed.
 *
 * Two real packaged Kingfishers and a local feed: the *current* one is
 * installed in a writable folder and opened with a fresh profile, a study
 * is authored in it, *Check for Updates…* is chosen from the real
 * application menu, the real dialog reports the *next* version, **Install
 * Update** is clicked, and the real chain runs — download, SHA-512, save
 * barrier, macOS's own update engine replacing the bundle on disk, and the
 * relaunch. Then the replaced bundle is opened again on the same profile
 * and the study had better be there, with the one-time "Kingfisher was
 * updated" notice.
 *
 * Nothing is mocked. The feed is `desktop-update-staging-server.mjs`
 * serving the next build's ZIP and `latest-mac.yml`; the running
 * application is pointed at it with `KINGFISHER_UPDATER_FEED_URL`, the
 * one override the shell honours for exactly this purpose. Both bundles
 * must carry the same Developer ID signature — macOS refuses an update
 * signed by someone else, and that refusal is a feature.
 *
 * One consequence to know: the relaunch after the install is performed by
 * the update engine, without the harness's `--user-data-dir`, so the
 * relaunched instance opens the *default* profile for a few seconds before
 * this script quits it. The work-preserved check is made by reopening the
 * replaced bundle on the test profile.
 *
 * Usage:
 *   node scripts/desktop-update-e2e-real.mjs \
 *     --current /path/to/old/Kingfisher.app \
 *     --next-dir /path/to/dir/with/Kingfisher-<v>-arm64.zip and latest-mac.yml
 */

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from '@playwright/test';

import { descendants, waitForReady } from './desktop-lib/launch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1];
};
const currentApp = option('--current');
const nextDir = option('--next-dir');
if (!currentApp || !nextDir) {
  console.error(
    'Usage: --current <Kingfisher.app> --next-dir <dir with the ZIP and latest-mac.yml>',
  );
  process.exit(2);
}

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const plist = (app, key) =>
  spawnSync(
    '/usr/libexec/PlistBuddy',
    ['-c', `Print :${key}`, path.join(app, 'Contents/Info.plist')],
    {
      encoding: 'utf8',
    },
  ).stdout.trim();

const STUDY = 'Update walk study';
const install = mkdtempSync(path.join(tmpdir(), 'kingfisher-update-install-'));
const profile = mkdtempSync(path.join(tmpdir(), 'kingfisher-update-profile-'));
const app = path.join(install, 'Kingfisher.app');
cpSync(currentApp, app, { recursive: true });

const nextZip = readdirSync(nextDir).find((name) => /^Kingfisher-.*-arm64\.zip$/.test(name));
const feed = path.join(nextDir, 'latest-mac.yml');
const nextVersion = /^version:\s*(\S+)/m.exec(readFileSync(feed, 'utf8'))?.[1] ?? '?';
console.log('Kingfisher real update');
console.log(
  `current  ${plist(app, 'CFBundleShortVersionString')} (build ${plist(app, 'CFBundleVersion')}) at ${app}`,
);
console.log(`next     ${nextVersion} from ${nextZip}\nprofile  ${profile}\n`);

const port = 8765 + Math.floor(Math.random() * 1000);
const server = spawn(
  process.execPath,
  [path.join(ROOT, 'scripts/desktop-update-staging-server.mjs'), nextDir, '--port', String(port)],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
const feedUrl = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 50; i += 1) {
  try {
    if ((await fetch(`${feedUrl}health`)).ok) break;
  } catch {
    /* not yet */
  }
  await wait(200);
}
check('staging feed answers', (await fetch(`${feedUrl}latest-mac.yml`)).ok, feedUrl);

const launch = (extraEnv = {}) =>
  electron.launch({
    executablePath: path.join(app, 'Contents/MacOS/Kingfisher'),
    args: [`--user-data-dir=${profile}`],
    env: { ...process.env, KINGFISHER_UPDATER_FEED_URL: feedUrl, ...extraEnv },
    timeout: 120_000,
  });

let instance = null;
try {
  // --- 1. The current build, with work in it. -------------------------------
  instance = await launch();
  const window = await instance.firstWindow({ timeout: 120_000 });
  await waitForReady(window);
  await window.goto(new URL('/studies', window.url()).href);
  await window.locator('html[data-kingfisher-ready="true"]').waitFor();
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
  check(
    'a study was authored in the current build',
    await window.evaluate((title) => document.body.innerText.includes(title), STUDY),
  );

  // --- 2. Check for Updates…, from the real menu. -----------------------------
  const updateWindow = instance.waitForEvent('window', {
    predicate: (page) => /update\.html/.test(page.url()),
    timeout: 30_000,
  });
  const clicked = await instance.evaluate(({ Menu, BrowserWindow }) => {
    const find = (items) => {
      for (const item of items) {
        if (/Check for Updates/.test(item.label ?? '')) return item;
        const inner = item.submenu ? find(item.submenu.items) : null;
        if (inner) return inner;
      }
      return null;
    };
    const item = find(Menu.getApplicationMenu().items);
    if (!item) return false;
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    item.click(undefined, win, win?.webContents);
    return true;
  });
  check('Check for Updates… exists in the application menu', clicked);
  const updates = await updateWindow;
  const headline = updates.locator('#headline');
  await updates.waitForFunction(
    () =>
      !/Check for updates|Checking/.test(document.querySelector('#headline')?.textContent ?? ''),
    null,
    { timeout: 60_000 },
  );
  const offered = (await headline.textContent()) ?? '';
  check(
    `the dialog offers ${nextVersion}`,
    new RegExp(`Kingfisher ${nextVersion.replace(/\./g, '\\.')} is available`).test(offered),
    offered,
  );

  // --- 3. Install Update: download, verify, save barrier, install, quit. ------
  const exited = new Promise((resolve) => instance.process().once('exit', resolve));
  await updates.getByRole('button', { name: 'Install Update' }).click();
  const seen = new Set();
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    let text = '';
    try {
      text = (await headline.textContent()) ?? '';
    } catch {
      break; // the dialog went with the application
    }
    if (text) seen.add(text.replace(/\d[\d.]*/g, 'N'));
    await wait(250);
  }
  const outcome = await Promise.race([
    exited.then(() => 'exited'),
    wait(120_000).then(() => 'still running'),
  ]);
  check('the application quit to install', outcome === 'exited', [...seen].join(' → '));
  instance = null;

  // --- 4. The bundle on disk is the next version. -----------------------------
  let replaced = false;
  for (let i = 0; i < 120 && !replaced; i += 1) {
    replaced = plist(app, 'CFBundleShortVersionString') === nextVersion;
    if (!replaced) await wait(1000);
  }
  check(
    `the installed bundle is now ${nextVersion}`,
    replaced,
    `${plist(app, 'CFBundleShortVersionString')} (build ${plist(app, 'CFBundleVersion')})`,
  );
  const signature = spawnSync('codesign', ['-dvv', app], { encoding: 'utf8' });
  check(
    'the replaced bundle carries a Developer ID signature',
    /Authority=Developer ID Application/.test(signature.stderr + signature.stdout),
  );

  // --- 5. The update engine relaunched it; let it settle, then quit it. -------
  let relaunched = null;
  for (let i = 0; i < 60 && !relaunched; i += 1) {
    const found = spawnSync('pgrep', ['-f', `${app}/Contents/MacOS/Kingfisher`], {
      encoding: 'utf8',
    })
      .stdout.trim()
      .split('\n')
      .filter(Boolean);
    if (found.length) relaunched = found[0];
    else await wait(1000);
  }
  check(
    'the update engine relaunched Kingfisher',
    relaunched !== null,
    relaunched ? `pid ${relaunched}` : '',
  );
  if (relaunched) {
    await wait(8000);
    spawnSync('osascript', ['-e', 'tell application "Kingfisher" to quit']);
    for (let i = 0; i < 30; i += 1) {
      if (spawnSync('kill', ['-0', relaunched]).status !== 0) break;
      await wait(500);
    }
    if (spawnSync('kill', ['-0', relaunched]).status === 0)
      spawnSync('kill', ['-TERM', relaunched]);
    await wait(2000);
  }

  // --- 6. The work is still there, and the notice shows once. -----------------
  instance = await launch();
  const again = await instance.firstWindow({ timeout: 120_000 });
  await waitForReady(again);
  check(
    `the reopened ${nextVersion} reports its version`,
    (await instance.evaluate(({ app: a }) => a.getVersion())) === nextVersion,
  );
  const notice = again.locator(`[aria-label="Kingfisher was updated to ${nextVersion}."]`);
  check('the post-update notice is shown', (await notice.count()) > 0);
  await again.goto(new URL('/studies', again.url()).href);
  await again.locator('html[data-kingfisher-ready="true"]').waitFor();
  await wait(1500);
  check(
    'the study authored before the update is still there',
    await again.evaluate((title) => document.body.innerText.includes(title), STUDY),
  );
  const before = descendants(instance.process().pid);
  await instance.close();
  await wait(1500);
  check(
    'nothing survives the quit',
    before.every((p) => spawnSync('kill', ['-0', String(p.pid)]).status !== 0),
    `${before.length} descendants`,
  );
  instance = null;
} catch (error) {
  check('the run completed', false, String(error?.message ?? error));
} finally {
  if (instance) await instance.close().catch(() => {});
  server.kill();
  rmSync(profile, { recursive: true, force: true });
  rmSync(install, { recursive: true, force: true });
}

console.log(failed ? '\nReal update: FAILED' : '\nReal update: PASS');
process.exit(failed ? 1 : 0);
