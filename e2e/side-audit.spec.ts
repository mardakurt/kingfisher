import { expect, test } from '@playwright/test';

const routes = [
  'analysis',
  'openings',
  'players',
  'databases',
  'studies',
  'repertoire',
  'preparation',
  'games',
  'review',
  'training',
  'endgame',
  'opening-files',
  'settings',
];
const ready = 'html[data-kingfisher-ready="true"]';

test('every Studio route survives direct navigation, reload and browser history', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/Kingfisher/);
  for (const route of routes) {
    await page.goto('/' + route);
    await page.locator(ready).waitFor();
    await expect(page).toHaveURL(new RegExp('/' + route + '$'));
    await expect(page.locator('main').first()).toBeVisible();
    await page.reload();
    await page.locator(ready).waitFor();
    await expect(page).toHaveURL(new RegExp('/' + route + '$'));
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/opening-files$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/settings$/);
  expect(errors).toEqual([]);
});

test('malicious study title stays text across a reload', async ({ page }) => {
  await page.goto('/studies');
  await page.locator(ready).waitFor();
  const title = '<img src=x onerror="window.__auditXss=1">';
  await page.getByRole('button', { name: 'New study', exact: true }).click();
  await page.getByRole('dialog', { name: 'New study' }).getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Create study', exact: true }).click();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await page.reload();
  await page.locator(ready).waitFor();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__auditXss'))).toBeUndefined();
  await expect(page.locator('img[onerror]')).toHaveCount(0);
});

test('analysis fits all requested viewport sizes in light and dark themes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/analysis');
  await page.locator(ready).waitFor();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== colorScheme)
      await page
        .getByRole('button', {
          name: current === 'dark' ? 'Dark theme' : 'Light theme',
          exact: true,
        })
        .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    for (const [width, height] of [
      [390, 844],
      [768, 1024],
      [1280, 720],
      [1366, 768],
      [1440, 900],
      [1920, 1080],
    ] as ReadonlyArray<readonly [number, number]>) {
      await page.setViewportSize({ width, height });
      await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      const board = await page.getByRole('grid', { name: 'Chessboard' }).boundingBox();
      expect(board!.width).toBeGreaterThan(250);
      expect(board!.x).toBeGreaterThanOrEqual(0);
      expect(board!.x + board!.width).toBeLessThanOrEqual(width + 1);
    }
  }
});

test('a compact short window keeps the whole board visible', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 542 });
  await page.goto('/analysis');
  await page.locator(ready).waitFor();
  await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeInViewport({ ratio: 1 });
});

test('tablet toolbar controls do not cover each other and saving remains reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/analysis');
  await page.locator(ready).waitFor();
  const collisions = await page.locator('header').evaluate((header) => {
    const buttons = [...header.querySelectorAll('button')].filter(
      (b) => b.getBoundingClientRect().width > 0,
    );
    return buttons.flatMap((a, i) =>
      buttons
        .slice(i + 1)
        .filter((b) => {
          const x = a.getBoundingClientRect(),
            y = b.getBoundingClientRect();
          return (
            Math.min(x.right, y.right) > Math.max(x.left, y.left) + 1 &&
            Math.min(x.bottom, y.bottom) > Math.max(x.top, y.top) + 1
          );
        })
        .map((b) => [a.getAttribute('aria-label'), b.getAttribute('aria-label')]),
    );
  });
  expect(collisions).toEqual([]);
  await page.getByRole('button', { name: 'Document actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save to study…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Save to study' })).toBeVisible();
});
