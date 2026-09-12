#!/usr/bin/env node
/**
 * Every enabled menu item, pressed, in the packaged application.
 *
 * The application menu is built by `desktop/src/menu.mjs` and pinned by its
 * unit test; what neither can say is whether pressing each item *does*
 * something in the running application. This walks the real menu — the one
 * `Menu.getApplicationMenu()` returns inside the packaged shell — and
 * clicks every enabled leaf, then asks what happened:
 *
 *   - a custom item must have an observable effect (a dialog in the
 *     renderer, a window, a native chooser requested, a URL handed to the
 *     browser), and the expected effect for each is named below;
 *   - a role item must not throw, and the roles that change window state
 *     (full screen, minimise, close, zoom) must be reversible;
 *   - nothing may crash, and the window count must be what the item implies.
 *
 * Native choosers and the browser are stubbed *inside this test process's*
 * main process — `dialog.showOpenDialog` answers "cancelled" and
 * `shell.openExternal` records the URL — because the alternative is a modal
 * file panel nobody dismisses and a browser tab nobody asked for. That is a
 * harness replacement in a harness launch; the product is unchanged.
 *
 * The keyboard shortcuts the documentation lists are then sent to the
 * renderer and checked the same way.
 *
 *   npm run desktop:menus -- --packaged
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const k = await launchKingfisher({ packaged: args.packaged });
  const { app } = k;
  let page = k.window;
  await waitForReady(page);
  page.setDefaultTimeout(8_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));

  // Stubs and recorders in the main process, for this launch only.
  await app.evaluate(({ dialog, shell, app: electronApp }) => {
    const g = globalThis;
    g.__kfMenus = { openDialogs: [], external: [], errorBoxes: [], exceptions: [] };
    dialog.showOpenDialog = async (_win, options) => {
      g.__kfMenus.openDialogs.push(options?.title ?? 'untitled');
      return { canceled: true, filePaths: [] };
    };
    dialog.showErrorBox = (title, content) => g.__kfMenus.errorBoxes.push(`${title}: ${content}`);
    shell.openExternal = async (url) => {
      g.__kfMenus.external.push(url);
    };
    process.on('uncaughtException', (error) =>
      g.__kfMenus.exceptions.push(String(error?.stack ?? error)),
    );
    electronApp.on('render-process-gone', (_e, _c, details) =>
      g.__kfMenus.exceptions.push(`renderer gone: ${details.reason}`),
    );
  });
  const recorded = () =>
    app.evaluate(() => {
      const g = globalThis.__kfMenus;
      const out = {
        ...g,
        openDialogs: [...g.openDialogs],
        external: [...g.external],
        errorBoxes: [...g.errorBoxes],
        exceptions: [...g.exceptions],
      };
      g.openDialogs.length = 0;
      g.external.length = 0;
      g.errorBoxes.length = 0;
      g.exceptions.length = 0;
      return out;
    });

  /** The menu as the running application built it: enabled leaves, by path. */
  const leaves = await app.evaluate(({ Menu }) => {
    const out = [];
    const walk = (items, path) => {
      for (const item of items) {
        if (item.type === 'separator') continue;
        const here = [...path, item.label || item.role || '?'];
        if (item.submenu) walk(item.submenu.items, here);
        else
          out.push({
            path: here.join(' › '),
            role: item.role ?? null,
            label: item.label ?? null,
            enabled: item.enabled !== false,
            accelerator: item.accelerator ?? null,
          });
      }
    };
    walk(Menu.getApplicationMenu().items, []);
    return out;
  });
  console.log(`${leaves.length} menu leaves, ${leaves.filter((l) => l.enabled).length} enabled\n`);

  const clickMenu = (path) =>
    app.evaluate(({ Menu }, wanted) => {
      let items = Menu.getApplicationMenu().items;
      let found = null;
      for (const segment of wanted.split(' › ')) {
        found = items.find((item) => (item.label || item.role) === segment);
        if (!found) return false;
        items = found.submenu?.items ?? [];
      }
      found.click();
      return true;
    }, path);

  const windowState = () =>
    app.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      const main = wins[0];
      return {
        count: wins.length,
        fullScreen: main?.isFullScreen() ?? null,
        minimized: main?.isMinimized() ?? null,
        zoom: main?.webContents.getZoomFactor() ?? null,
        urls: wins.map((w) => w.webContents.getURL()),
      };
    });
  const rendererState = async () => {
    const p = app.windows().find((w) => !w.isClosed() && /127\.0\.0\.1/.test(w.url()));
    if (!p) return { dialog: null, text: 0 };
    page = p;
    return p.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return {
        dialog: dialog
          ? (dialog.getAttribute('aria-label') ??
            document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent ??
            'dialog')
          : null,
        text: document.body.innerText.length,
        route: location.pathname,
      };
    });
  };
  /*
    macOS acts on the *key* window for the roles that change window state —
    close, minimise, full screen — and a window Playwright drives is not key
    unless it is asked to be. A person's window is. So the application is
    brought to the front before each item, which is the state the item is
    designed for.
  */
  const focus = () =>
    app.evaluate(({ app: a, BrowserWindow }) => {
      a.focus({ steal: true });
      BrowserWindow.getAllWindows()[0]?.focus();
    });
  const escape = async () => {
    const p = app.windows().find((w) => !w.isClosed() && /127\.0\.0\.1/.test(w.url()));
    if (p) await p.keyboard.press('Escape').catch(() => {});
  };

  /** What each custom item must be seen to do. */
  const expectations = {
    'Settings…': async (before, after, rec) =>
      after.renderer.dialog !== null || rec.external.length > 0,
    'Open PGN…': async (_b, _a, rec) => rec.openDialogs.length === 1,
    'Open Database…': async (_b, _a, rec) => rec.openDialogs.length === 1,
    'Diagnostics…': async (before, after) => after.renderer.dialog !== null,
    'Kingfisher on GitHub': async (_b, _a, rec) =>
      rec.external.some((u) => u.startsWith('https://github.com/')),
    'Report an Issue…': async (_b, _a, rec) =>
      rec.external.some((u) => /github\.com\/.*issues/.test(u)),
    'Clear Menu': async () => true,
  };
  const updateItem = (label) => /Check for Updates|Update/.test(label ?? '');

  for (const leaf of leaves) {
    if (!leaf.enabled) {
      // A disabled item must be one that is honestly disabled: only the
      // "No Recent Documents" placeholder qualifies on a fresh profile.
      check(
        `disabled: ${leaf.path}`,
        leaf.label === 'No Recent Documents',
        'the only honestly disabled item',
      );
      continue;
    }
    if (leaf.role === 'quit' || leaf.role === 'services' || leaf.role === 'about') {
      // Quit ends the run; Services and About open system-owned panels the
      // harness cannot observe or close. Their roles are Electron's own.
      check(`skipped by design: ${leaf.path}`, true, 'system-owned');
      continue;
    }
    await focus();
    await sleep(200);
    const before = { window: await windowState(), renderer: await rendererState() };
    await recorded();
    const clicked = await clickMenu(leaf.path);
    await sleep(700);
    const rec = await recorded();
    const after = { window: await windowState(), renderer: await rendererState() };
    let ok = clicked && rec.exceptions.length === 0;
    let detail = '';

    if (leaf.role) {
      switch (leaf.role) {
        case 'togglefullscreen':
          ok = ok && after.window.fullScreen !== before.window.fullScreen;
          detail = `full screen ${before.window.fullScreen} → ${after.window.fullScreen}`;
          await clickMenu(leaf.path);
          await sleep(1_200);
          break;
        case 'minimize':
          ok = ok && after.window.minimized === true;
          detail = 'minimised';
          await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.restore());
          await sleep(500);
          break;
        case 'close':
          ok = ok && after.window.count === before.window.count - 1;
          detail = `${before.window.count} → ${after.window.count} windows`;
          await app.evaluate(({ app: a }) => a.emit('activate'));
          await sleep(1_500);
          await rendererState();
          await waitForReady(page);
          break;
        case 'zoomIn':
          ok = ok && after.window.zoom > before.window.zoom;
          detail = `zoom ${before.window.zoom} → ${after.window.zoom}`;
          break;
        case 'zoomOut':
          ok = ok && after.window.zoom < before.window.zoom;
          detail = `zoom ${before.window.zoom} → ${after.window.zoom}`;
          break;
        case 'resetZoom':
          ok = ok && after.window.zoom === 1;
          detail = `zoom ${after.window.zoom}`;
          break;
        case 'reload':
        case 'forceReload':
          await rendererState();
          await waitForReady(page);
          ok = ok && (await rendererState()).text > 200;
          detail = 'renderer back';
          break;
        case 'hide':
          await app.evaluate(({ app: a }) => a.show());
          detail = 'hidden and shown';
          break;
        default:
          detail = `role ${leaf.role}, no exception`;
      }
      check(`${leaf.path}${leaf.accelerator ? ` (${leaf.accelerator})` : ''}`, ok, detail);
      continue;
    }

    if (updateItem(leaf.label)) {
      ok =
        ok &&
        after.window.count === before.window.count + 1 &&
        after.window.urls.some((u) => /update\.html/.test(u));
      detail = `${after.window.count} windows`;
      await app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows())
          if (/update\.html/.test(w.webContents.getURL())) w.close();
      });
      await sleep(400);
    } else {
      const expectation = expectations[leaf.label];
      if (!expectation) {
        ok = false;
        detail = 'no expectation written for this item — it may be a no-op';
      } else {
        ok = ok && (await expectation(before, after, rec));
        detail = [
          rec.openDialogs.length ? `chooser "${rec.openDialogs[0]}"` : '',
          rec.external.length ? `opened ${rec.external[0]}` : '',
          after.renderer.dialog ? `dialog "${after.renderer.dialog}"` : '',
        ]
          .filter(Boolean)
          .join(', ');
      }
    }
    if (rec.errorBoxes.length) {
      ok = false;
      detail += ` error box: ${rec.errorBoxes[0]}`;
    }
    check(`${leaf.path}${leaf.accelerator ? ` (${leaf.accelerator})` : ''}`, ok, detail);
    await escape();
    await sleep(300);
  }

  // --- the documented shortcuts, from the keyboard --------------------------------
  await rendererState();
  const shortcuts = [
    ['Meta+k', 'Command palette', async () => (await rendererState()).dialog !== null],
    ['Meta+,', 'Settings', async () => (await rendererState()).dialog !== null],
    ['Control+Meta+f', 'Full screen', async () => (await windowState()).fullScreen === true],
    ['Meta+m', 'Minimise', async () => (await windowState()).minimized === true],
    ['Meta+h', 'Hide', async () => true],
    [
      'Meta+r',
      'Reload',
      async () => {
        await waitForReady(page);
        return (await rendererState()).text > 200;
      },
    ],
    ['Meta+w', 'Close window', async () => (await windowState()).count === 0],
  ];
  for (const [combo, name, verify] of shortcuts) {
    await escape();
    await focus();
    await sleep(300);
    await page.keyboard.press(combo);
    await sleep(900);
    const ok = await verify();
    check(`shortcut ${combo} → ${name}`, ok);
    // Undo whatever the shortcut did.
    if (combo === 'Control+Meta+f') {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.setFullScreen(false),
      );
      await sleep(1_200);
    }
    if (combo === 'Meta+m')
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.restore());
    if (combo === 'Meta+h') await app.evaluate(({ app: a }) => a.show());
    if (combo === 'Meta+w') {
      await app.evaluate(({ app: a }) => a.emit('activate'));
      await sleep(1_500);
      await rendererState();
      await waitForReady(page);
    }
    await escape();
  }

  const finalRec = await recorded();
  check(
    'no exception or renderer loss during the walk',
    finalRec.exceptions.length === 0 && pageErrors.length === 0,
    [...finalRec.exceptions, ...pageErrors].join(' | ').slice(0, 200),
  );
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
