import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function positionAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Position actions' }).click();
  await page.getByRole('menuitem', { name }).click();
}

test('position setup validates and applies an arbitrary legal position', async ({ page }) => {
  await ready(page);
  await positionAction(page, 'Set up position…');
  const dialog = page.getByRole('dialog', { name: 'Set up position' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Clear board' }).click();
  await expect(dialog.getByText(/expected exactly 1/)).toBeVisible();

  await dialog.getByLabel('Position FEN').fill('8/8/3k4/8/3P4/8/4K3/8 b - - 7 42');
  await dialog.getByRole('button', { name: 'Load FEN' }).click();
  await expect(dialog.getByText('Legal position. Ready to apply.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Apply position' }).click();

  const board = page.locator('[data-chessboard]').first();
  await expect(board.getByRole('gridcell', { name: 'e2, white king' })).toBeVisible();
  await expect(board.getByRole('gridcell', { name: 'd6, black king' })).toBeVisible();
});

test('engine PV preview advances without moving the main board', async ({ page }) => {
  test.setTimeout(90_000);
  await ready(page);
  const main = page.locator('[data-chessboard]').first();
  await expect(main.getByRole('gridcell', { name: 'e2, white pawn' })).toBeVisible();

  await page.getByRole('button', { name: 'Start analysis (E)' }).click();
  const previewAction = page.getByRole('button', { name: 'Preview this variation' }).first();
  await expect(previewAction).toBeVisible({ timeout: 60_000 });
  await previewAction.click();
  await expect(page.getByRole('region', { name: 'PV preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('[data-mini-board="pv-preview"]')).toBeVisible();
  await expect(main.getByRole('gridcell', { name: 'e2, white pawn' })).toBeVisible();
});

test('play from here is isolated until Analyze after', async ({ page }) => {
  await ready(page);
  await positionAction(page, 'Play from this position');
  await page.getByRole('button', { name: 'Start practice' }).click();

  const boards = page.locator('[data-chessboard]');
  const practice = boards.nth(1);
  await practice.getByRole('gridcell', { name: 'e2, white pawn' }).click();
  await practice.getByRole('gridcell', { name: 'e4, empty' }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText(/1 ply · e2e4/)).toBeVisible();

  const main = boards.first();
  await expect(main.getByRole('gridcell', { name: 'e2, white pawn' })).toBeVisible();
  await page.getByRole('button', { name: 'Analyze after' }).click();
  await expect(main.getByRole('gridcell', { name: 'e4, white pawn' })).toBeVisible();
});

test('Features names deterministic attack and defence relations', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: /More/ }).first().click();
  await page.getByRole('menuitem', { name: 'Features' }).click();
  const relations = page.getByRole('region', { name: 'Attack relations' });
  await expect(relations).toBeVisible();
  await relations.getByLabel('Relation square').selectOption('e2');
  await expect(relations.getByText('Attacked by')).toBeVisible();
  await expect(relations.getByText('Defended by')).toBeVisible();
  await expect(relations.getByText('Pieces attacked')).toBeVisible();
  await expect(relations.getByText('Pieces defended')).toBeVisible();
});

test('development icon gallery renders the complete family at every production size', async ({
  page,
}) => {
  await page.goto('/dev/icons');
  await expect(page.getByRole('heading', { name: 'Kingfisher icon family' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dark theme' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Light theme' })).toBeVisible();
  for (const size of [16, 20, 24, 32]) {
    expect(await page.locator(`svg[width="${size}"][height="${size}"]`).count()).toBeGreaterThan(
      20,
    );
  }
});
