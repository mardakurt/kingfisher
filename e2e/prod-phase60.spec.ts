import { expect, test } from '@playwright/test';

/*
 * Production smoke test against kingfisherchess.app. Verifies the
 * Phase 60 browser-verification fixes are live.
 *
 * Run with:
 *   npx playwright test e2e/prod-phase60.spec.ts --reporter=line
 */

test.use({ baseURL: 'https://kingfisherchess.app' });

test('live install page agrees with the notarised first-launch guide', async ({ page }) => {
  await page.goto('/install');
  await page.locator('h1').first().waitFor();
  const html = await page.content();
  expect(html).toContain('Kingfisher-1.1.9-arm64.dmg');
  // The follow-up removed the right-click workaround for the notarised release.
  expect(html).not.toMatch(/right-click → Open is/);
  expect(html).not.toMatch(/Right-click/);
  expect(html).not.toMatch(/Open Anyway/);
  // The follow-up added the SHA-256 + report-the-failure phrasing.
  expect(html).toContain('SHA-256');
  expect(html).toContain('report the exact macOS message');
});

test('live /analysis loads and the dock tools are reachable', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor({ timeout: 30_000 });
  // The first-run tour is open on a clean session. Escape dismisses it.
  const tour = page.getByRole('dialog', { name: /^Tour/ });
  if (await tour.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(tour).toBeHidden();
  }
  // Tools the user opens on first run, post-Phase-60 follow-up.
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('live tour dismissal survives a reload (hydration fix)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor({ timeout: 30_000 });
  const tour = page.getByRole('dialog', { name: /^Tour/ });
  if (!(await tour.isVisible().catch(() => false))) {
    test.skip(true, 'tour was already dismissed by a previous test');
  }
  await page.keyboard.press('Escape');
  await expect(tour).toBeHidden();
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor({ timeout: 30_000 });
  await expect(tour).toBeHidden();
});
