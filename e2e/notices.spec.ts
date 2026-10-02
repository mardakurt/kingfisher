import { expect, test } from '@playwright/test';

test('an error notice over the board permits moves and remains dismissible', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Clipboard denied');
        },
      },
    });
  });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Copy current position as FEN', exact: true }).click();
  const notice = page.getByRole('status').filter({ hasText: 'Could not copy FEN' });
  await expect(notice).toBeVisible();
  const square = page.getByRole('gridcell', { name: 'e2, White pawn', exact: true });
  const box = await square.boundingBox();
  if (!box) throw new Error('Board square has no box');
  // Force the measured overlap independently of viewport/font differences.
  // The actual component, error delivery and pointer handling remain intact.
  await notice.evaluate((element, target) => {
    Object.assign(element.parentElement!.style, {
      left: `${target.x}px`,
      top: `${target.y}px`,
      bottom: 'auto',
      transform: 'none',
      width: '220px',
    });
  }, box);
  const overlay = await notice.boundingBox();
  if (!overlay) throw new Error('Notice has no box');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(center.x).toBeGreaterThan(overlay.x);
  expect(center.x).toBeLessThan(overlay.x + overlay.width);
  expect(center.y).toBeGreaterThan(overlay.y);
  expect(center.y).toBeLessThan(overlay.y + overlay.height);
  await square.click({ timeout: 3000 });
  await page.getByRole('gridcell', { name: 'e4, empty', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'e4, White pawn', exact: true })).toBeVisible();
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(notice).toHaveCount(0);
});
