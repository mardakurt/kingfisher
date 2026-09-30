import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { selectTool } from './tools';

const READY = 'html[data-kingfisher-ready="true"]';
// A redistributed public-domain game with Capablanca's own annotations.
const GAME = readFileSync(
  'public/data/annotated/capablanca-chess-fundamentals-1921.pgn',
  'utf8',
).split('\n[Event ')[0]!;

for (const theme of ['light', 'dark']) {
  test(`research layout in ${theme} preserves the board with notation, a named source and three real engine lines`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript((theme) => {
      localStorage.setItem(
        'kingfisher.preferences',
        JSON.stringify({ version: 7, state: { theme } }),
      );
    }, theme);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/analysis');
    await page.locator(READY).waitFor();
    await page.getByRole('button', { name: /^Import( PGN or FEN)?$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
    await dialog.getByRole('textbox').fill(GAME);
    await dialog.getByRole('button', { name: /Import game/ }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: /^Layout/ }).click();
    await page.getByRole('menuitem', { name: 'Research workspace', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const dock = page.getByRole('complementary', { name: 'Workspace tools' });
    const engine = dock.getByRole('region', { name: 'Engine candidates' });
    await dock
      .getByRole('region', { name: 'Notation' })
      .getByRole('button', { name: 'd4', exact: true })
      .first()
      .click();
    await engine.getByRole('combobox', { name: 'Candidate lines' }).selectOption('3');
    await engine.getByRole('button', { name: 'Start analysis (E)' }).click();
    await expect(engine.locator('[data-engine-line="3"]')).toBeVisible({ timeout: 30_000 });
    await expect(
      engine.locator('[data-engine-line="3"] button[title="Add this line up to here"]'),
    ).toHaveCount(6, { timeout: 30_000 });
    await engine.getByRole('button', { name: 'Stop analysis (E)' }).click();
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 1100, height: 800 },
    ]) {
      await page.setViewportSize(size);
      await expect(dock.getByRole('region', { name: 'Notation' })).toBeInViewport();
      await expect(dock.locator('[data-explorer-move]').first()).toBeInViewport({
        ratio: 1,
        timeout: 20_000,
      });
      for (const rank of [1, 2, 3]) {
        await expect(engine.locator(`[data-engine-line="${rank}"]`)).toBeInViewport({ ratio: 1 });
      }
      const board = await page
        .locator('[data-workspace-board-column] [data-board-frame]')
        .boundingBox();
      expect(Math.min(board!.width, board!.height)).toBeGreaterThanOrEqual(
        size.width === 1100 ? 400 : 480,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 900, height: 600 });
    await expect(dock.locator('[data-research-engine]')).toHaveCount(0);
    await selectTool(page, dock, 'Notation');
    await expect(dock.getByText('Nf3', { exact: true }).first()).toBeVisible();
    await selectTool(page, dock, 'Engine');
    await expect(dock.getByRole('button', { name: 'Start analysis (E)' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1280, height: 720 });
    await selectTool(page, dock, 'Explorer');
    await expect(engine).toBeVisible();
  });
}

test('the lower panel has an announced keyboard-operable divider', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: /^Layout/ }).click();
  await page.getByRole('menuitem', { name: 'Engine under the board', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e2, White pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e4, empty', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e7, Black pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e5, empty', exact: true }).click();
  const current = page.locator('[data-current="true"]');
  await expect(current).toHaveText('e5');
  const divider = page.getByRole('separator', { name: 'Resize the lower panel' });
  await divider.focus();
  const before = Number(await divider.getAttribute('aria-valuenow'));
  await divider.press('ArrowUp');
  await expect(divider).toHaveAttribute('aria-valuenow', String(before + 16));
  await divider.press('End');
  await expect(divider).toHaveAttribute('aria-valuenow', '96');
  await divider.press('Home');
  await expect(divider).toHaveAttribute('aria-valuenow', '520');
  await expect(current).toHaveText('e5');
  const sideDivider = page.getByRole('separator', { name: 'Resize workspace tools' });
  await sideDivider.focus();
  await sideDivider.press('ArrowLeft');
  await expect(current).toHaveText('e5');
});

test('IME Escape stays in the editor until composition has finished', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: /^Import( PGN or FEN)?$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  const editor = dialog.getByRole('textbox');
  await editor.focus();
  await editor.evaluate((element) => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
    );
  });
  await expect(dialog).toBeVisible();
  await editor.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the board exposes position context and notation marks the current step', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  const board = page.getByRole('grid', { name: 'Chessboard', exact: true });
  await expect(board).toHaveAccessibleDescription(/White to move.*move 1.*White at the bottom/);
  await page.getByRole('gridcell', { name: 'e2, White pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e4, empty', exact: true }).click();
  await expect(board).toHaveAccessibleDescription(/Black to move.*move 1/);
  await expect(page.locator('[data-current="true"]')).toHaveAttribute('aria-current', 'step');
});

test('notation has one tab stop and keeps keyboard selection focused without trapping Tab', async ({
  page,
}) => {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: /^Import( PGN or FEN)?$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(GAME);
  await dialog.getByRole('button', { name: /Import game/ }).click();
  await expect(dialog).toBeHidden();
  const notation = page.getByRole('group', { name: 'Game notation' });
  await notation.focus();
  await expect(notation).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const current = notation.locator('[data-current="true"]');
  await expect(current).toHaveText('d4');
  await expect(current).toBeFocused();
  await expect(notation.locator('button[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(current).toHaveText('d5');
  await expect(current).toBeFocused();
  await page.keyboard.press('Home');
  await expect(notation).toBeFocused();
  await page.keyboard.press('End');
  await expect(current).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(notation).not.toBeFocused();
  await expect(current).not.toBeFocused();
});
