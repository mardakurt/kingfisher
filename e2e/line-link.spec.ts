/**
 * A line as a link: `?moves=` opens the line on the board at its last move,
 * a broken line opens as far as it is legal and says so, and "Copy link to
 * this line" writes an address that opens the same position.
 */

import { expect, test } from '@playwright/test';

import { readableClipboard } from './tools';

test('a link with a line opens it at its last move', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis?moves=e2e4,c7c5,g1f3');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.getByRole('gridcell', { name: 'f3, White knight' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nf3', exact: true })).toBeVisible();
  // The parameters are consumed, so a reload does not re-apply them.
  await expect(page).toHaveURL(/\/analysis$/);
  // The whole line is there to walk back through.
  await page.keyboard.press('Home');
  await expect(page.getByRole('gridcell', { name: 'e2, White pawn' })).toBeVisible();
});

test('a broken line opens as far as it is legal, and says so', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis?moves=e2e4,e7e5,e1e3');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.getByRole('gridcell', { name: 'e5, Black pawn' })).toBeVisible();
  await expect(
    page.getByText(
      "The link's line stops after 2 of its 3 moves: the next one is not legal there.",
    ),
  ).toBeVisible();
});

test('Copy link to this line writes an address that opens the same position', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const clipboard = await readableClipboard(page);
  await page.goto('/analysis?fen=4k3/8/8/8/8/8/4P3/4K3%20w%20-%20-%200%201&moves=e2e4,e8d7');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.getByRole('gridcell', { name: 'd7, Black king' })).toBeVisible();

  await page.getByRole('button', { name: 'Search commands', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('searchbox').fill('Copy link to this line');
  await palette.getByRole('button', { name: 'Copy link to this line', exact: true }).click();
  await expect(page.getByText('Link copied.', { exact: false })).toBeVisible();
  const link = new URL(await clipboard());
  expect(link.pathname).toBe('/analysis');
  expect(link.searchParams.get('fen')).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  expect(link.searchParams.get('moves')).toBe('e2e4,e8d7');

  // Opened here, the address is the same position.
  await page.goto(`/analysis${link.search}`);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.getByRole('gridcell', { name: 'd7, Black king' })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'e4, White pawn' })).toBeVisible();
});
