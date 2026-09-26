#!/usr/bin/env node
/**
 * `npm run desktop:update:real` — a real update between two packaged builds.
 *
 * The one gate that exercises the update as a person performs it: a signed
 * `Kingfisher.app` is copied to a temporary location and opened on a fresh
 * profile; a study is authored in it; *Check for Updates…* is chosen from
 * the real application menu; Sparkle's own window offers the next version
 * and *Install Update* is clicked in it, then *Install and Relaunch*; the
 * application quits, the bundle on disk is replaced and relaunched by
 * Sparkle; the relaunched instance is checked and quit; the replaced bundle
 * is reopened on the same profile, and the study is still there.
 *
 * Sparkle's windows are native, so they are driven the way a person drives
 * them — through the Accessibility API (`desktop-lib/sparkle-ui.mjs`),
 * which needs Accessibility permission for the terminal running this. A
 * `--current` bundle that predates Sparkle (1.1.0–1.1.7, electron-updater)
 * is driven through its own dialog instead, so the transition every
 * installed Kingfisher makes is covered by the same harness.
 *
 * The next build is served from a local staging feed
 * (`desktop-update-staging-server.mjs`) that redirects the way GitHub does,
 * or — with `--public-feed` — from the feed the bundle itself names. Both
 * bundles must carry the same Developer ID signature: Sparkle refuses an
 * update signed by someone else, and that refusal is a feature.
 *
 * The relaunch after the install arrives with no arguments. Until Phase 53
 * the relaunched instance opened the *default* profile — the owner's own
 * work — for eight seconds; the shell now hands its profile to the relaunch
 * (`desktop/src/relaunch-profile.mjs`) and this harness asserts that the
 * relaunched instance logged its launch in the *test* profile and that the
 * owner's default profile was not opened.
 *
 * Usage:
 *   node scripts/desktop-update-e2e-real.mjs \
 *     --current <Kingfisher.app> --next-dir <dir with the ZIP> [--ed-key-file <file>]
 *   node scripts/desktop-update-e2e-real.mjs \
 *     --current <Kingfisher.app> --next-dir <dir with the ZIP and the published appcast.xml> --public-feed
 */

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from '@playwright/test';

import { descendants, waitForReady } from './desktop-lib/launch.mjs';
import {
  activate,
  assertAccessibility,
  waitAndClick,
  waitForWindow,
  windowsOf,
} from './desktop-lib/sparkle-ui.mjs';
import {
  SPARKLE_KEYCHAIN_ACCOUNT,
  summarizeAppcast,
  writeAppcast,
} from './desktop-mac-appcast.mjs';
import { writeRelaunchProfile } from '../desktop/src/relaunch-profile.mjs';

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
    'Usage: --current <Kingfisher.app> --next-dir <dir with the update ZIP> [--public-feed]',
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
// ditto, not fs.cp: a bundle's framework symlinks and modes must arrive intact.
const copied = spawnSync('ditto', [currentApp, app], { encoding: 'utf8' });
if (copied.status !== 0) {
  console.error(copied.stderr);
  process.exit(2);
}

/* Which engine the current build has: Sparkle, or the one before it. */
const currentHasSparkle = existsSync(path.join(app, 'Contents', 'Frameworks', 'Sparkle.framework'));
const nextZip = readdirSync(nextDir).find((name) => /^Kingfisher-.*-arm64\.zip$/.test(name));
if (!nextZip) {
  console.error('--next-dir must hold the update ZIP (Kingfisher-<version>-arm64.zip).');
  process.exit(2);
}
const publicFeed = args.includes('--public-feed');
const port = 8765 + Math.floor(Math.random() * 1000);
const origin = `http://127.0.0.1:${port}`;

/*
  The staging feed is written here, for this run's port: an appcast names
  the archive by absolute URL, so one generated in advance would name the
  wrong port. The signing key is the same one the release uses (the
  keychain account, or `--ed-key-file`), which is what makes the running
  build accept the feed — its Info.plist carries the matching public key.
  With `--public-feed` the feed is GitHub's, and --next-dir only says which
  version to expect: its appcast.xml must be the published one.
*/
const staging = publicFeed ? null : mkdtempSync(path.join(tmpdir(), 'kingfisher-update-feed-'));
let appcastXml;
if (publicFeed) {
  const appcastPath = path.join(nextDir, 'appcast.xml');
  if (!existsSync(appcastPath)) {
    console.error('--public-feed needs the published appcast.xml in --next-dir.');
    process.exit(2);
  }
  appcastXml = readFileSync(appcastPath, 'utf8');
} else {
  copyFileSync(path.join(nextDir, nextZip), path.join(staging, nextZip));
  const edKeyFile = option('--ed-key-file');
  writeAppcast({
    zip: path.join(staging, nextZip),
    out: staging,
    downloadUrlPrefix: `${origin}/releases/download/staging/`,
    edKeyFile,
    account: option('--account') ?? SPARKLE_KEYCHAIN_ACCOUNT,
    latestMac: true,
    log: () => {},
  });
  appcastXml = readFileSync(path.join(staging, 'appcast.xml'), 'utf8');
}
const appcast = summarizeAppcast(appcastXml);
const nextVersion = appcast.shortVersion ?? '?';
// What the feed actually offers, not whichever archive sits first in --next-dir.
const nextArchive = publicFeed ? path.basename(new URL(appcast.url).pathname) : nextZip;
console.log('Kingfisher real update');
console.log(
  `current  ${plist(app, 'CFBundleShortVersionString')} (build ${plist(app, 'CFBundleVersion')}, ${currentHasSparkle ? 'Sparkle' : 'electron-updater'}) at ${app}`,
);
console.log(
  `next     ${nextVersion} (build ${appcast.version}) from ${nextArchive}\nprofile  ${profile}\n`,
);

/*
  `--public-feed`: no staging server and no feed override. The running
  application asks the feed its own Info.plist names — the GitHub release
  host — so this is the update a user performs, against the release the
  public is offered.
*/
const server = publicFeed
  ? null
  : spawn(
      process.execPath,
      [
        path.join(ROOT, 'scripts/desktop-update-staging-server.mjs'),
        staging,
        '--port',
        String(port),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
// Sparkle asks for the appcast by URL; the previous engine asks for
// `latest-mac.yml` under a base URL.
const feedUrl = publicFeed
  ? null
  : currentHasSparkle
    ? `${origin}/releases/latest/download/appcast.xml`
    : `${origin}/`;
if (!publicFeed) {
  for (let i = 0; i < 50; i += 1) {
    try {
      if ((await fetch(`${origin}/health`)).ok) break;
    } catch {
      /* not yet */
    }
    await wait(200);
  }
  const feed = await fetch(`${origin}/releases/latest/download/appcast.xml`);
  check(
    'staging feed answers, through the redirect',
    feed.ok && (await feed.text()).includes('<enclosure'),
    feedUrl,
  );
} else {
  const feed = await fetch(
    'https://github.com/mardakurt/kingfisher/releases/latest/download/appcast.xml',
  );
  const text = feed.ok ? await feed.text() : '';
  check(
    'the public feed answers with the next version',
    feed.ok &&
      text.includes(`<sparkle:shortVersionString>${nextVersion}</sparkle:shortVersionString>`),
    'https://github.com/mardakurt/kingfisher/releases/latest/download/appcast.xml',
  );
}

const launch = (extraEnv = {}) =>
  electron.launch({
    executablePath: path.join(app, 'Contents/MacOS/Kingfisher'),
    args: [`--user-data-dir=${profile}`],
    env: {
      ...process.env,
      ...(feedUrl ? { KINGFISHER_UPDATER_FEED_URL: feedUrl } : {}),
      ...extraEnv,
    },
    timeout: 120_000,
  });

const chooseCheckForUpdates = (instance) =>
  instance.evaluate(({ Menu, BrowserWindow }) => {
    const find = (items) => {
      for (const item of items) {
        if (/Check for Updates|Update Is Available/.test(item.label ?? '')) return item;
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

let instance = null;
try {
  if (currentHasSparkle) assertAccessibility();

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

  const exited = new Promise((resolve) => instance.process().once('exit', resolve));
  const seen = [];

  /*
    Let the quiet look at launch finish before asking. Five seconds after the
    window, the shell makes one information-only request; a menu check made
    in the same second would overlap it. Whether the two interfere was not
    established (on 2026-09-26 the offer window was unreadable either way —
    see the Accessibility fallback below); a person opening the application
    and choosing Check for Updates… a little later does not overlap them,
    and this harness plays that person.
  */
  const shellLogFile = path.join(profile, 'logs', 'kingfisher.log');
  const quietDone = () => {
    try {
      const text = readFileSync(shellLogFile, 'utf8');
      const at = text.lastIndexOf('quiet check');
      if (at < 0) return false;
      const after = text.slice(at);
      return (
        /quiet check skipped|quiet check at launch failed/.test(after) ||
        /update cycle finished|update found|up to date|no update/i.test(
          after.split('\n').slice(1).join('\n'),
        )
      );
    } catch {
      return false;
    }
  };

  if (currentHasSparkle) {
    // --- 2. Check for Updates…, from the real menu; Sparkle's window. ---------
    for (let waited = 0; waited < 30_000 && !quietDone(); waited += 250) await wait(250);
    await wait(1000);
    const clicked = await chooseCheckForUpdates(instance);
    check('Check for Updates… exists in the application menu', clicked);
    // The process under test, by pid: an installed Kingfisher may be running
    // beside it, and "process Kingfisher" would be whichever came first.
    const target = { pid: instance.process().pid };
    activate(target);
    const found = await waitForWindow(
      target,
      { button: /^Install Update$/ },
      { timeoutMs: 90_000 },
    );
    if (found) {
      check(
        `Sparkle offers ${nextVersion}`,
        found.texts.some((t) => t.includes(nextVersion)),
        found.texts.join(' | '),
      );
      // Sparkle's own words: "Kingfisher 1.1.8 is now available—you have
      // 1.1.7", with Install Update and Skip This Version (a user-initiated
      // check has no Remind Me Later); the release notes are in a web view the
      // Accessibility tree does not list as static text.
      check(
        'the offer names both versions, and can be declined',
        found.texts.some((t) =>
          t.includes(`you have ${plist(app, 'CFBundleShortVersionString')}`),
        ) && found.buttons.includes('Skip This Version'),
        found.buttons.join(', '),
      );

      // --- 3. Install Update: download, extract, then Install and Relaunch. --
      const installed = await waitAndClick(target, /^Install Update$/, { timeoutMs: 10_000 });
      check('Install Update was clicked', Boolean(installed));
      seen.push('Install Update');
      const ready = await waitAndClick(target, /^Install and Relaunch$/, {
        timeoutMs: 180_000,
      });
      check(
        'Sparkle downloaded and verified the update, and offered Install and Relaunch',
        Boolean(ready),
      );
      seen.push('Install and Relaunch');
    } else {
      /*
        The Accessibility tree did not show Sparkle's offer. On the morning
        of 2026-09-26 System Events read at most the window's title, for
        every 1.2.6 → 1.3.0 run; the same session read the whole window that
        afternoon (1.2.6 → 1.3.1 and 1.3.0 → 1.3.1, both passing through it),
        so it is not a missing permission. The cause was not established
        (the eight-hour deep analysis running at the time, or the 1.3.0
        feed's long embedded notes, are candidates). When it happens, the update is driven the way a person
        at the keyboard drives it: Return is the default button of each of
        Sparkle's windows (Install Update, then Install and Relaunch), and
        every step is confirmed by the application's own verdict
        (`window.kingfisher.updateStatus()`), not by the window. What only
        the window can show — the offer's wording, Skip This Version — is
        reported as not verified.
      */
      const page = instance.windows()[0];
      const verdict = () => page.evaluate(() => window.kingfisher.updateStatus()).catch(() => null);
      const until = async (predicate, ms) => {
        for (let waited = 0; waited < ms; waited += 500) {
          const v = await verdict();
          if (v && predicate(v)) return v;
          await wait(500);
        }
        return verdict();
      };
      const pressReturn = () =>
        spawnSync('osascript', [
          '-e',
          `tell application "System Events" to set frontmost of (first process whose unix id is ${target.pid}) to true`,
          '-e',
          'delay 0.5',
          '-e',
          'tell application "System Events" to key code 36',
        ]);
      const offer = await until((v) => v.status === 'available', 30_000);
      check(
        `Sparkle offers ${nextVersion} (the application's verdict; the window was not readable)`,
        offer?.status === 'available' && JSON.stringify(offer).includes(nextVersion),
        JSON.stringify(offer),
      );
      console.log(
        "  · not verified: the offer's wording and Skip This Version (Accessibility could not read the window)",
      );
      pressReturn();
      seen.push('Install Update (Return)');
      const moving = await until(
        (v) =>
          /downloading|downloaded|verifying|ready|waiting-for-save|installing|restarting/.test(
            v.status,
          ),
        30_000,
      );
      check(
        'Install Update was chosen (Return on the offer)',
        /downloading|downloaded|verifying|ready|waiting-for-save|installing|restarting/.test(
          moving?.status ?? '',
        ),
        moving?.status,
      );
      const ready = await until(
        (v) => /ready|waiting-for-save|installing|restarting/.test(v.status),
        180_000,
      );
      check(
        'Sparkle downloaded and verified the update, and offered Install and Relaunch',
        /ready|waiting-for-save|installing|restarting/.test(ready?.status ?? ''),
        ready?.status,
      );
      // The ready-to-install prompt may be behind the main window by now;
      // asking again brings Sparkle's open window forward instead of starting
      // a second session (update-service.mjs, showUpdateDialog).
      await page.evaluate(() => window.kingfisher.showUpdateDialog()).catch(() => {});
      await wait(1500);
      pressReturn();
      seen.push('Install and Relaunch (Return)');
    }
  } else {
    // --- 2/3. The previous engine's dialog, driven through Playwright. --------
    const updateWindow = instance.waitForEvent('window', {
      predicate: (page) => /update\.html/.test(page.url()),
      timeout: 30_000,
    });
    const clicked = await chooseCheckForUpdates(instance);
    check('Check for Updates… exists in the application menu', clicked);
    const updates = await updateWindow;
    const headline = updates.locator('#headline');
    await updates.getByRole('button', { name: 'Check for Updates' }).click();
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
    /*
      The profile handoff, written here because the shell being updated
      predates it: the same file the Sparkle shell writes, in the updater's
      own cache directory, and the *next* shell is the one that reads it.
    */
    writeRelaunchProfile(
      path.join(os.homedir(), 'Library', 'Caches', 'kingfisher-desktop-updater'),
      profile,
    );
    await updates.getByRole('button', { name: 'Install Update' }).click();
    const started = Date.now();
    while (Date.now() - started < 180_000) {
      let text = '';
      try {
        text = (await headline.textContent()) ?? '';
      } catch {
        break; // the dialog went with the application
      }
      if (text) seen.push(text.replace(/\d[\d.]*/g, 'N'));
      await wait(250);
    }
  }

  const outcome = await Promise.race([
    exited.then(() => 'exited'),
    wait(120_000).then(() => 'still running'),
  ]);
  check('the application quit to install', outcome === 'exited', [...new Set(seen)].join(' → '));
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
  const verified = spawnSync('codesign', ['--verify', '--deep', '--strict', app], {
    encoding: 'utf8',
  });
  check(
    'the replaced bundle verifies (--deep --strict)',
    verified.status === 0,
    verified.stderr.trim(),
  );
  check(
    'the replaced bundle carries Sparkle',
    existsSync(
      path.join(app, 'Contents', 'Frameworks', 'Sparkle.framework', 'Versions', 'B', 'Sparkle'),
    ),
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
  // The default profile's log, as it stood before the relaunch: the relaunch
  // must not add to it.
  const defaultProfileLog = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'kingfisher-desktop',
    'logs',
    'kingfisher.log',
  );
  const readLog = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
  const defaultLogBefore = readLog(defaultProfileLog);
  if (relaunched) {
    await wait(8000);
    const testLog = readLog(path.join(profile, 'logs', 'kingfisher.log'));
    check(
      `the relaunched ${nextVersion} opened the test profile, not the default one`,
      testLog.includes(`[launch] Kingfisher ${nextVersion}`) &&
        testLog.includes('profile adopted from the update') &&
        readLog(defaultProfileLog) === defaultLogBefore,
      readLog(defaultProfileLog) === defaultLogBefore
        ? 'default profile log unchanged'
        : "the default profile log grew — the relaunch opened the owner's profile",
    );
    check(
      'the relaunched build started Sparkle',
      /Sparkle \d+\.\d+\.\d+ started/.test(
        testLog.split(`[launch] Kingfisher ${nextVersion}`).pop() ?? '',
      ),
    );
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
  server?.kill();
  if (failed) {
    // The shell's own account of the update, which is the thing to read.
    const log = path.join(profile, 'logs', 'kingfisher.log');
    try {
      const lines = readFileSync(log, 'utf8').split('\n');
      console.log('\n--- shell log, update lines ---');
      for (const line of lines.filter((l) => /\[update\]|\[launch\]/.test(l)).slice(-30))
        console.log(line);
    } catch {
      console.log(`\n(no shell log at ${log})`);
    }
  }
  rmSync(profile, { recursive: true, force: true });
  rmSync(install, { recursive: true, force: true });
  if (staging) rmSync(staging, { recursive: true, force: true });
}

console.log(failed ? '\nReal update: FAILED' : '\nReal update: PASS');
process.exit(failed ? 1 : 0);
