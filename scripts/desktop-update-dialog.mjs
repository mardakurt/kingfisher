/** Isolated native update-dialog acceptance. Verdicts are fixtures; no feed or install runs. */
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'kingfisher-update-dialog-'));
const out = path.resolve(
  process.env.KINGFISHER_DIALOG_EVIDENCE || path.join(root, 'output/update-dialog'),
);
await mkdir(out, { recursive: true });
// A package directory, as the shell itself is launched: Playwright's Electron
// bootstrap resolves the entry through package.json and the module type from it.
const entry = temp;
await writeFile(
  path.join(temp, 'package.json'),
  JSON.stringify({ name: 'kingfisher-update-dialog-harness', type: 'module', main: 'main.mjs' }),
);
await writeFile(
  path.join(temp, 'main.mjs'),
  `
import electron from 'electron';
import * as updates from ${JSON.stringify(pathToFileURL(path.join(root, 'desktop/src/update-window.mjs')).href)};
const { app, BrowserWindow } = electron;
app.setPath('userData', ${JSON.stringify(path.join(temp, 'profile'))});
// Electron emits 'ready' only after the ESM entry finishes evaluating, so a
// top-level await on whenReady() would never resolve.
app.whenReady().then(async () => {
  // Playwright's launch resolves on the first window's page; a parent that
  // never loads one would hold it for the whole timeout.
  const parent = new BrowserWindow({show: false});
  await parent.loadURL('about:blank');
  globalThis.dialogActions = [];
  globalThis.updates = updates;
  updates.sendVerdict({status: 'idle', currentVersion: '1.0.0'});
  await updates.open({parent, onAction: action => globalThis.dialogActions.push(action)});
});
`,
);
let instance;
try {
  instance = await electron.launch({
    executablePath: path.join(
      root,
      'desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
    ),
    args: [entry],
  });
  let page = (await instance.windows()).find((p) => p.url().endsWith('/update.html'));
  if (!page)
    page = await instance.waitForEvent('window', {
      predicate: (p) => p.url().endsWith('/update.html'),
    });
  await page.waitForSelector('#primary:not([disabled])');
  const states = [
    'idle',
    'checking',
    'up-to-date',
    'available',
    'downloading',
    'downloaded',
    'verifying',
    'ready',
    'waiting-for-save',
    'installing',
    'restarting',
    'canceled',
    'failed',
    'preview',
    'unable-to-check',
  ];
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const status of states) {
      await instance.evaluate(
        (_electron, status) =>
          globalThis.updates.sendVerdict({
            status,
            currentVersion: '1.0.0',
            latestVersion: '1.1.0',
            build: 147,
            receivedBytes: 50,
            totalBytes: 100,
            reason:
              'Error /Users/<name>/secret latest-mac.yml Authorization: secret\n at updater (file.js:12)',
          }),
        status,
      );
      await page.waitForFunction((status) => {
        const text = document.querySelector('#headline').textContent;
        return (
          {
            idle: 'Check for updates',
            checking: 'Checking for updates…',
            'up-to-date': 'You’re up to date',
            available: 'Kingfisher 1.1.0 is available',
            downloading: 'Downloading Kingfisher 1.1.0…',
            downloaded: 'Verifying the update…',
            verifying: 'Verifying the update…',
            ready: 'Kingfisher 1.1.0 is ready to install',
            'waiting-for-save': 'Finishing saving your work…',
            installing: 'Installing the update…',
            restarting: 'Restarting Kingfisher…',
            canceled: 'Download cancelled',
            failed: 'The update could not be installed',
            preview: 'You’re using a preview build',
            'unable-to-check': 'Unable to check for updates',
          }[status] === text
        );
      }, status);
      const layout = await page.evaluate(() => ({
        overflow:
          document.documentElement.scrollHeight > innerHeight ||
          document.documentElement.scrollWidth > innerWidth,
        copyOverflow:
          document.querySelector('.copy').scrollHeight >
          document.querySelector('.copy').clientHeight,
        primaryCount: document.querySelectorAll('button.primary:not([hidden])').length,
        buttons: [...document.querySelectorAll('button:not([hidden])')].map((b) => b.textContent),
        icon: document.querySelector('.icon').naturalWidth,
        text: document.body.textContent,
      }));
      assert.equal(layout.overflow, false, `${scheme}/${status}: window overflow`);
      assert.equal(layout.copyOverflow, false, `${scheme}/${status}: content clipped`);
      // At most one default button; Cancel while downloading is deliberately plain.
      assert.ok(layout.primaryCount <= 1, `${status}: ${layout.primaryCount} primary buttons`);
      assert.equal(
        layout.primaryCount === 0,
        layout.buttons.every((b) => /Cancel/.test(b)),
      );
      assert.ok(layout.icon > 0);
      assert.doesNotMatch(layout.text, /<name>|latest-mac.yml|Authorization|file.js/);
      await page.screenshot({ path: path.join(out, `${scheme}-${status}.png`) });
    }
  }
  await instance.evaluate(() =>
    globalThis.updates.sendVerdict({ status: 'failed', reason: 'The save barrier timed out.' }),
  );
  await page.getByRole('heading', { name: 'Your work could not be confirmed saved' }).waitFor();
  await page.screenshot({ path: path.join(out, 'save-failed.png') });
  await page.getByRole('button', { name: 'Try Again' }).focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await instance.evaluate(() => globalThis.dialogActions), ['check']);
  await instance.evaluate(() =>
    globalThis.updates.sendVerdict({ status: 'available', latestVersion: '1.1.0' }),
  );
  await page.getByRole('button', { name: 'Install Update' }).waitFor();
  assert.equal(await page.locator('#version-line').textContent(), 'Kingfisher 1.0.0');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'secondary');
  // Escape closes the window while the key is still being dispatched; the
  // press itself may report a closed target, which is the expected outcome.
  const closed = page.waitForEvent('close');
  await page.keyboard.press('Escape').catch(() => {});
  await closed;
  assert.equal(await instance.evaluate(() => globalThis.updates.hasWindow()), false);
  console.log(
    `PASS: ${states.length} states × 2 appearances; saved-work failure; sanitized errors; artwork; unclipped layout; keyboard check, Tab, Escape. Fixture verdicts only. Screenshots: ${out}`,
  );
} finally {
  if (instance) await instance.close();
  await rm(temp, { recursive: true, force: true });
}
