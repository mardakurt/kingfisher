/**
 * How the landing and the Studio connect — `docs/product/studio-access.md`.
 *
 * The unit tests in `src/features/shell/studio-entry.test.ts` prove the
 * rule. These prove the page: that a first visit is the published landing
 * and nothing more, that the Studio really writes the visit marker, that
 * the landing then offers the way in, that opting in skips the landing
 * without leaving it in the history, that `?stay` is the way back, and
 * that `/studio` is an alias for the Studio and not a page of its own.
 *
 * Every test starts from empty storage: the shared storage state turns the
 * tour off, and the visit marker must come from the Studio itself.
 */

import { expect, test } from '@playwright/test';

const VISITED = 'kingfisher.studio.visited';
const AUTO_OPEN = 'kingfisher.landing.auto-open-studio';

test.use({ storageState: { cookies: [], origins: [] } });

test('a first visit is the published landing, with nothing remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Kingfisher Chess/ })).toBeVisible();
  await expect(page.locator('[data-studio-entry]')).toHaveCount(0);
  // The line's space is reserved even when it is empty, so a returning
  // visitor's page does not jump when the script arrives.
  await expect(page.locator('.hero-return')).toHaveCount(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), VISITED)).toBeNull();
  // Every way into the Studio says so, and points at the application.
  const header = page.getByRole('banner').getByRole('link', { name: 'Open Studio' });
  await expect(header).toHaveAttribute('href', /\/analysis$/);
});

test('the Studio records the visit and the landing then offers to continue', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const marker = await page.evaluate((key) => localStorage.getItem(key), VISITED);
  expect(marker).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  await page.goto('/');
  const entry = page.locator('[data-studio-entry="returning"]');
  await expect(entry).toBeVisible();
  await expect(entry.getByRole('link', { name: /Continue in Studio/ })).toHaveAttribute(
    'href',
    '/analysis',
  );
  await expect(entry.getByRole('checkbox')).not.toBeChecked();
  // Nothing was decided for them: no redirect happened.
  await expect(page).toHaveURL(/\/$/);
});

test('opting in opens the Studio at once, replaces the landing in history, and ?stay is the way back', async ({
  page,
}) => {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.goto('/');
  await page.locator('[data-studio-entry="returning"]').getByRole('checkbox').check();
  expect(await page.evaluate((key) => localStorage.getItem(key), AUTO_OPEN)).toBe('1');
  await expect(page.locator('.hero-return-note')).toContainText('/?stay');

  // A plain visit to `/` now lands in the Studio…
  await page.goto('/');
  await page.waitForURL(/\/analysis$/);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  // …and the landing is not behind it in the history: going back leaves
  // the page the visit started from, not a landing that redirects again.
  const before = page.url();
  await page.goBack().catch(() => undefined);
  expect(page.url()).not.toBe(`${new URL(before).origin}/`);

  // `?stay` shows the landing with the choice visible, and undoes it.
  await page.goto('/?stay');
  await expect(page).toHaveURL(/\/\?stay$/);
  const box = page.locator('[data-studio-entry="returning"]').getByRole('checkbox');
  await expect(box).toBeChecked();
  await box.uncheck();
  expect(await page.evaluate((key) => localStorage.getItem(key), AUTO_OPEN)).toBeNull();
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-studio-entry="returning"]')).toBeVisible();
});

test('/studio is a permanent alias for the Studio, query preserved', async ({ page }) => {
  const raw = await page.request.fetch('/studio?set=abc', { maxRedirects: 0 });
  expect(raw.status()).toBe(308);
  expect(raw.headers()['location']).toBe('/analysis?set=abc');
  await page.goto('/studio');
  await expect(page).toHaveURL(/\/analysis$/);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
});

test('the Studio never redirects to the landing, and a deep link reloads in place', async ({
  page,
}) => {
  for (const route of ['/analysis', '/training', '/openings']) {
    await page.goto(route);
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await page.reload();
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
  }
});

/*
  Phase 72: the choice is also in Settings → Workspace, from inside the
  Studio, on every device — the landing's own checkbox appears only where
  this browser has already visited the Studio, and `/?stay` was the only
  way to undo it. The toggle reads and writes the same key the landing does.
*/
test('Settings → Workspace turns the landing skip on and off', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.keyboard.press('Meta+,');
  await page.getByRole('tab', { name: 'Workspace' }).click();
  const toggle = page.getByRole('switch', {
    name: 'Skip the landing page and open the Studio straight away',
  });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate((key) => localStorage.getItem(key), AUTO_OPEN)).toBe('1');

  // The landing now skips itself for this browser…
  await page.goto('/');
  await expect(page).toHaveURL(/\/analysis$/);

  // …and the same toggle turns it off again.
  await page.keyboard.press('Meta+,');
  await page.getByRole('tab', { name: 'Workspace' }).click();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate((key) => localStorage.getItem(key), AUTO_OPEN)).toBeNull();
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
});
