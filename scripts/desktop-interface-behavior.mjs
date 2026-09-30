import { execFileSync } from 'node:child_process';
/** Exercise the shared research UI inside one exact macOS package. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import { launchKingfisher } from './desktop-lib/launch.mjs';

let [binary, output] = process.argv.slice(2);
if (!binary || !output)
  throw new Error(
    'Usage: node scripts/desktop-interface-behavior.mjs candidate.app|--checkout output-directory',
  );
if (binary.endsWith('.app')) binary += '/Contents/MacOS/Kingfisher';
mkdirSync(output, { recursive: true });
const checks = [];
let identity = null;
const checkout = binary === '--checkout';
console.log(
  checkout ? 'Target: checkout preview, not packaged acceptance' : 'Target: packaged application',
);
const launch = await launchKingfisher(
  checkout ? { packaged: false } : { packaged: true, executablePath: binary },
);
let clipboardSaved = false;
const check = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const resize = async (width, height) => {
  await launch.app.evaluate(
    ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size),
    [width, height],
  );
  await expect
    .poll(() => launch.window.evaluate(() => [innerWidth, innerHeight]))
    .toEqual([width, height]);
};
const nativeMenu = async (menu, role) => {
  await launch.app.evaluate(
    ({ Menu, BrowserWindow }, requested) => {
      const parent = Menu.getApplicationMenu().items.find((item) => item.label === requested.menu);
      const item = parent.submenu.items.find((item) => item.role === requested.role);
      if (!item || !item.enabled)
        throw new Error(`Native menu role unavailable: ${requested.role}`);
      BrowserWindow.getAllWindows()[0].focus();
      // macOS handles Edit roles in its native responder chain. Calling the
      // JavaScript MenuItem.click callback alone deliberately does not run them.
      Menu.sendActionToFirstResponder(`${requested.role}:`);
    },
    { menu, role },
  );
};

async function tabTo(page, control) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await control.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard could not reach ${await control.getAttribute('aria-label')}`);
}

try {
  // Electron 44 uses async ClipboardItems; keep all advertised formats in the
  // main process rather than serializing private clipboard contents to a file.
  const hasUntypedItems = await launch.app.evaluate(async ({ clipboard, ClipboardItem }) => {
    const items = await clipboard.read();
    globalThis.__interfaceClipboardBefore = await Promise.all(
      items
        .filter((item) => item.types.length > 0)
        .map(
          async (item) =>
            new ClipboardItem(
              Object.fromEntries(
                await Promise.all(item.types.map(async (type) => [type, await item.getType(type)])),
              ),
            ),
        ),
    );
    return items.some((item) => item.types.length === 0);
  });
  if (hasUntypedItems) {
    // Electron can return a typeless placeholder for an empty native pasteboard.
    // Refuse an unsupported nonempty pasteboard rather than discarding its data.
    const nativeCount = execFileSync(
      'osascript',
      [
        '-l',
        'JavaScript',
        '-e',
        'ObjC.import("AppKit"); String($.NSPasteboard.generalPasteboard.pasteboardItems.count);',
      ],
      { encoding: 'utf8', timeout: 5000 },
    ).trim();
    assert.equal(nativeCount, '0', 'Cannot preserve an untyped nonempty native pasteboard');
  }
  clipboardSaved = true;
  const page = launch.window;
  identity = await page.evaluate(async () => {
    const { build, shell, platform } = await window.kingfisher.diagnostics();
    return { build, shell, platform };
  });
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await resize(1280, 720);
  await launch.app.evaluate(({ app, BrowserWindow }) => {
    app.focus({ steal: true });
    BrowserWindow.getAllWindows()[0].focus();
  });
  await page.getByRole('button', { name: /^Import( PGN or FEN)?$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  const editor = dialog.getByRole('textbox');
  await editor.fill('Kingfisher 棋譜');
  await editor.press('ControlOrMeta+a');
  await nativeMenu('Edit', 'copy');
  await expect
    .poll(() =>
      launch.app.evaluate(
        async ({ clipboard }) => (await clipboard.readText()) === 'Kingfisher 棋譜',
      ),
    )
    .toBe(true);
  await launch.app.evaluate(({ clipboard }) => clipboard.writeText('Mac text editing'));
  await nativeMenu('Edit', 'paste');
  await expect(editor).toHaveValue('Mac text editing');
  await nativeMenu('Edit', 'undo');
  await expect(editor).toHaveValue('Kingfisher 棋譜');
  check('native Edit Copy/Paste/Undo operate on the focused Unicode editor');
  await editor.fill('');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: '棋譜', selectionStart: 0, selectionEnd: 2 });
  await expect(editor).toHaveValue('棋譜');
  await editor.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
    ),
  );
  await expect(dialog).toBeVisible();
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  await cdp.detach();
  check('packaged Chromium composition leaves Escape with the input method');
  await editor.fill(
    readFileSync('public/data/annotated/capablanca-chess-fundamentals-1921.pgn', 'utf8').split(
      '\n[Event ',
    )[0],
  );
  await dialog.getByRole('button', { name: /Import game/ }).click();
  const layoutControl = page.getByRole('button', { name: /^Layout/ });
  await tabTo(page, layoutControl);
  await page.keyboard.press('Enter');
  const researchChoice = page.getByRole('menuitem', { name: 'Research workspace', exact: true });
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await researchChoice.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(researchChoice).toBeFocused();
  await page.keyboard.press('Enter');
  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  const engine = dock.getByRole('region', { name: 'Engine candidates' });
  const notation = dock.getByRole('group', { name: 'Game notation' });
  await tabTo(page, notation);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-current="true"]')).toHaveText('d4');
  const selectedBeforeResize = await page.locator('[data-current="true"]').textContent();
  const candidateControl = engine.getByRole('combobox', { name: 'Candidate lines' });
  await tabTo(page, candidateControl);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(candidateControl).toHaveValue('3');
  await tabTo(page, engine.getByRole('button', { name: 'Start analysis (E)' }));
  await page.keyboard.press('Enter');
  await expect(engine.locator('[data-engine-line="3"]')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('e');
  await expect(engine.getByRole('button', { name: 'Start analysis (E)' })).toBeVisible();
  const divider = page.getByRole('separator', { name: 'Resize workspace tools' });
  await tabTo(page, divider);
  await page.keyboard.press('ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow', '426');
  await expect(page.locator('[data-current="true"]')).toHaveText(selectedBeforeResize);
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '410');
  await expect(page.locator('[data-current="true"]')).toHaveText(selectedBeforeResize);
  check(
    'keyboard alone selects research, configures candidates, runs/stops the engine and resizes the dock',
  );
  await page
    .getByText('1 game added to your database.', { exact: true })
    .waitFor({ state: 'hidden', timeout: 12000 });
  for (const theme of ['Light', 'Dark']) {
    // This is the existing native application-menu command, not a CSS override.
    await launch.app.evaluate(({ Menu, BrowserWindow }, label) => {
      const view = Menu.getApplicationMenu().items.find((i) => i.label === 'View');
      const appearance = view.submenu.items.find((i) => i.label === 'Appearance');
      const choice = appearance.submenu.items.find((i) => i.label === label);
      choice.click(undefined, BrowserWindow.getAllWindows()[0]);
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
      [1100, 800],
    ]) {
      await resize(width, height);
      // Keyboard traversal intentionally reaches the advanced controls below
      // the candidates and scrolls this panel. Return to its candidate view
      // with the same wheel action a user would use before judging geometry.
      await engine.hover();
      await page.mouse.wheel(0, -2500);
      const referenceBody = dock.locator('[data-explorer-table]').locator('..');
      await referenceBody.hover();
      await page.mouse.wheel(0, -3000);
      for (const rank of [1, 2, 3])
        await expect(engine.locator(`[data-engine-line="${rank}"]`)).toBeInViewport({ ratio: 1 });
      for (const row of [0, 1])
        await expect(dock.locator('[data-explorer-move]').nth(row)).toBeInViewport({ ratio: 1 });
      await expect(dock.locator('[data-current="true"]')).toBeInViewport({ ratio: 1 });
      const board = await page
        .locator('[data-workspace-board-column] [data-board-frame]')
        .boundingBox();
      if (width >= 1280) assert.ok(Math.min(board.width, board.height) >= 480);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1));
      await page.screenshot({
        path: path.join(output, `research-${theme.toLowerCase()}-${width}x${height}.png`),
      });
    }
    check(`${theme} native appearance and actual window geometry at 1440, 1280 and 1100`);

    const chromeWidthBefore = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--titlebar-safe-w').trim(),
    );
    await launch.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setFullScreen(true),
    );
    await expect(page.locator('html')).toHaveAttribute('data-fullscreen', 'true', {
      timeout: 15_000,
    });
    assert.equal(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--titlebar-safe-w').trim(),
      ),
      '0px',
    );
    await expect(page.locator('[data-current="true"]')).toHaveText(selectedBeforeResize);
    await page.screenshot({
      path: path.join(output, `research-${theme.toLowerCase()}-fullscreen.png`),
    });
    await launch.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setFullScreen(false),
    );
    await expect(page.locator('html')).not.toHaveAttribute('data-fullscreen', 'true', {
      timeout: 15_000,
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--titlebar-safe-w').trim(),
        ),
      )
      .toBe(chromeWidthBefore);
    check(
      `${theme} real native full screen clears chrome reservation and restores the selected move`,
    );
  }
  const move = dock
    .getByRole('region', { name: 'Notation' })
    .getByRole('button', { name: 'Nf3', exact: true })
    .first();
  await move.click();
  const current = await page.locator('[data-current="true"]').textContent();
  await resize(900, 600);
  await expect(dock.locator('[data-research-engine]')).toHaveCount(0);
  await dock.getByRole('tab', { name: 'Notation', exact: true }).click();
  await expect(page.locator('[data-current="true"]')).toHaveText(current);
  await dock.getByRole('tab', { name: 'Engine', exact: true }).click();
  await expect(dock.getByRole('button', { name: 'Start analysis (E)' })).toBeVisible();
  await resize(1280, 720);
  await dock.getByRole('tab', { name: 'Explorer', exact: true }).click();
  await expect(engine).toBeVisible();
  await expect(page.locator('[data-current="true"]')).toHaveText(current);
  check('minimum native window folds tools and retains the selected move when widened');
  await launch.app.evaluate(({ app }) => app.setAccessibilitySupportEnabled(true));
  const ax = await page.context().newCDPSession(page);
  const tree = await ax.send('Accessibility.getFullAXTree');
  assert.ok(
    tree.nodes.some(
      (n) =>
        n.role?.value === 'grid' &&
        n.name?.value === 'Chessboard' &&
        /to move/.test(n.description?.value ?? ''),
    ),
  );
  await expect(page.locator('[data-current="true"]')).toHaveAttribute('aria-current', 'step');
  await ax.detach();
  check(
    'packaged accessibility tree exposes board context; DOM marks current notation (not a VoiceOver study)',
  );
} finally {
  let restorationError = null;
  if (clipboardSaved)
    await launch.app
      .evaluate(async ({ clipboard }) => {
        const saved = globalThis.__interfaceClipboardBefore;
        if (saved.length) await clipboard.write(saved);
        else clipboard.clear();
        delete globalThis.__interfaceClipboardBefore;
      })
      .catch((error) => {
        restorationError = String(error);
      });
  const closed = await launch.close();
  assert.equal(restorationError, null);
  assert.equal(closed.forced, false);
  assert.deepEqual(closed.survivors, []);
  writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        target: checkout ? 'checkout preview' : 'packaged',
        binary,
        identity,
        checks,
        closed,
        restorationError,
      },
      null,
      2,
    ) + '\n',
  );
}
