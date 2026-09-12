#!/usr/bin/env node
/**
 * The bridge, called wrongly, from inside the packaged renderer.
 *
 * The preload exposes a small typed surface and nothing else; a script that
 * reached the renderer could still call each method with the wrong shape.
 * Every method is called here with garbage — numbers, huge strings, nested
 * objects, functions, null, arrays of the wrong thing — from the real
 * renderer of the packaged application, and the main process must reject or
 * ignore each call without throwing an uncaught exception, without opening
 * a native panel, and without the renderer losing its bridge.
 *
 * Native choosers are stubbed in this launch's main process to record the
 * request instead of opening a panel, so a call that *does* legitimately
 * reach a chooser is counted rather than left open on screen.
 *
 *   npm run desktop:ipc-fuzz -- --packaged
 */

import { argv, exit } from 'node:process';

import { launchKingfisher, waitForReady } from './desktop-lib/launch.mjs';

const args = { packaged: argv.includes('--packaged') };
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

async function main() {
  const k = await launchKingfisher({ packaged: args.packaged });
  const { app, window: page } = k;
  await waitForReady(page);

  await app.evaluate(({ dialog }) => {
    globalThis.__kfFuzz = { exceptions: [], rejections: [], choosers: [] };
    process.on('uncaughtException', (e) =>
      globalThis.__kfFuzz.exceptions.push(String(e?.stack ?? e)),
    );
    process.on('unhandledRejection', (r) =>
      globalThis.__kfFuzz.rejections.push(String(r?.stack ?? r)),
    );
    dialog.showOpenDialog = async (_w, options) => {
      // What the native panel would have been asked for: a title that is a
      // string, and filters whose extensions are all strings.
      const sane =
        typeof options?.title === 'string' &&
        (options.filters ?? []).every(
          (f) => Array.isArray(f.extensions) && f.extensions.every((e) => typeof e === 'string'),
        );
      globalThis.__kfFuzz.choosers.push({ title: String(options?.title), sane });
      return { canceled: true, filePaths: [] };
    };
  });

  /*
    Every method, every argument shape. Run inside the renderer so the calls
    cross the real preload and the real IPC serialisation; a value that
    cannot be cloned (a function, a symbol) is exactly the kind of thing that
    must fail on the renderer side rather than reach the main process.
  */
  const report = await page.evaluate(async () => {
    const bridge = window.kingfisher;
    const garbage = [
      undefined,
      null,
      0,
      -1,
      1e308,
      NaN,
      '',
      'x'.repeat(200_000),
      '/etc/passwd',
      '../../../../etc/passwd',
      'file:///etc/passwd',
      { a: 1 },
      { title: 42, extensions: 'pgn' },
      { title: 'x', extensions: [{}] },
      { title: 'x', extensions: ['pgn', 7, null] },
      [],
      [1, 2, 3],
      ['/etc/passwd', '/tmp/x.pgn', 42],
      [[[]]],
      () => {},
      Symbol('s'),
      new Uint8Array(16),
      { __proto__: { evil: true } },
    ];
    const methods = [
      'openPgn',
      'openDatabase',
      'chooseDirectory',
      'chooseFile',
      'openPaths',
      'recentDocuments',
      'diagnostics',
      'openLogs',
      'restartCompanion',
      'updateStatus',
      'acknowledgeUpdate',
      'showUpdateDialog',
      'pathForFile',
    ];
    const out = { calls: 0, rejected: 0, resolved: 0, threw: 0, bridgeIntact: true };
    for (const method of methods) {
      const fn = bridge[method];
      if (typeof fn !== 'function') continue;
      for (const value of garbage) {
        out.calls += 1;
        try {
          const result = fn(value);
          if (result && typeof result.then === 'function') {
            await result.then(
              () => (out.resolved += 1),
              () => (out.rejected += 1),
            );
          } else out.resolved += 1;
        } catch {
          out.threw += 1;
        }
      }
    }
    // The dialog's own bridge is a different window; the main one must still be here.
    out.bridgeIntact =
      typeof window.kingfisher === 'object' && typeof window.kingfisher.diagnostics === 'function';
    const diag = await window.kingfisher.diagnostics();
    out.servicesUp = diag.web.running && diag.companion.running;
    return out;
  });

  // The update dialog may have been opened by showUpdateDialog; close it.
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      if (/update\.html/.test(w.webContents.getURL())) w.close();
  });
  await page.waitForTimeout(500);
  const main = await app.evaluate(() => globalThis.__kfFuzz);

  check(
    'every wrong call was rejected, ignored or thrown at the renderer — never accepted silently into a crash',
    report.calls > 200 && main.exceptions.length === 0,
    `${report.calls} calls: ${report.resolved} resolved, ${report.rejected} rejected, ${report.threw} threw at the renderer`,
  );
  check(
    'no uncaught exception in the main process',
    main.exceptions.length === 0,
    main.exceptions[0]?.slice(0, 160) ?? '',
  );
  check(
    'no unhandled rejection in the main process',
    main.rejections.length === 0,
    main.rejections[0]?.slice(0, 160) ?? '',
  );
  check(
    'the bridge is intact and both services are still up',
    report.bridgeIntact && report.servicesUp,
  );
  check(
    'every native chooser request carried a string title and string extensions, whatever was sent',
    main.choosers.length > 0 && main.choosers.every((c) => c.sane),
    `${main.choosers.length} chooser request(s), ${main.choosers.filter((c) => !c.sane).length} malformed`,
  );
  const stillThere = await page.evaluate(
    () => document.querySelectorAll('[data-chessboard]').length > 0,
  );
  check('the renderer still shows a board', stillThere);
  const closed = await k.close();
  check(
    'nothing survives the quit',
    closed.survivors.length === 0,
    `${closed.descendants} descendants`,
  );
  return results;
}

main()
  .then((rows) => {
    const failed = rows.filter((row) => !row.ok);
    console.log(`\n${rows.length - failed.length}/${rows.length} checks passed`);
    exit(failed.length === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error(`\nThe run failed to complete: ${error?.stack ?? error}`);
    exit(2);
  });
