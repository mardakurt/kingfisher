import { expect, test } from '@playwright/test';

test('the landing page scrolls and serves actual manifest images', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chess research, in one place.' })).toBeVisible();
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.headers()['content-type']).toContain('image/png');
    expect((await response.body()).subarray(1, 4).toString()).toBe('PNG');
  }
});

test('fresh studio hydration is clean and stale engine lines cannot be inserted', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(page.getByTestId('storage-persistence-status')).not.toHaveAttribute(
    'data-storage-persistence',
    'pending',
  );
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Start analysis (E)', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Insert this variation into the game' }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole('gridcell', { name: 'e2, White pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e4, empty', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Insert this variation into the game' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop analysis (E)', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Analyse this position', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Insert this variation into the game' }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Stop analysis (E)', exact: true }).click();
  expect(errors).toEqual([]);
});
