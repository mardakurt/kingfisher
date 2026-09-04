import { expect, test, type Page } from '@playwright/test';

/**
 * The engine catalogue, through the real companion.
 *
 * Deliberately does **not** download an engine. The smallest one in the
 * catalogue is 20 MB and the largest 115, and a browser suite that fetched
 * them from GitHub on every run would be slow, flaky, and testing GitHub
 * rather than Kingfisher. The download-and-verify path is unit-tested against
 * a stubbed `fetch` in `companion/src/managed-engines.test.mjs`, including
 * every way it can fail.
 *
 * What is exercised here is everything a user sees before pressing Install:
 * that the catalogue is fetched from a real companion, that every row states
 * its licence and its digest, that an engine with no build for this platform
 * says so rather than offering a button that cannot work, and that the trust
 * language a native engine carries is the true one.
 */

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/** Pair with the e2e companion, the way a user does: one pasted address. */
async function pairCompanion(page: Page) {
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  return settings;
}

test('the engine catalogue is offered from the companion, with licences and digests', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const settings = await pairCompanion(page);
  await settings.getByRole('tab', { name: 'Engine', exact: true }).click();
  await settings.getByRole('button', { name: 'Engines' }).click();

  // The browser engine is always there and needs nothing.
  const wasm = settings.locator('[data-engine-row="stockfish-wasm"]');
  await expect(wasm).toContainText('Ready');
  await expect(wasm).toContainText('Sandboxed in the browser');

  // And the managed ones, from a real `/engine/catalogue` call.
  await expect(settings.locator('[data-engine-row="stockfish-native"]')).toBeVisible({
    timeout: 30_000,
  });
  for (const id of ['stockfish-native', 'stormphrax', 'viridithas', 'halogen', 'lc0']) {
    const row = settings.locator(`[data-engine-row="${id}"]`);
    await expect(row, id).toBeVisible();
    // Never described as sandboxed. ADR 0041.
    await expect(row, id).toContainText('Verified, runs as you');
    await expect(row, id).not.toContainText('Sandboxed');
  }
});

test('a native engine row states what running it actually means', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const settings = await pairCompanion(page);
  await settings.getByRole('tab', { name: 'Engine', exact: true }).click();
  await settings.getByRole('button', { name: 'Engines' }).click();

  const row = settings.locator('[data-engine-row="halogen"]');
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: /Show details of/ }).click();

  await expect(row).toContainText(/not sandboxed/i);
  await expect(row).toContainText(/same operating-system permissions/i);
  await expect(row).toContainText(/not a signature/i);
  await expect(row).toContainText(/GPL/);
  // The digest is shown before installation, because it is what the install
  // will be checked against.
  await expect(row).toContainText(/SHA-256/);
});

test('an engine can be hidden from the selector without being removed', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const settings = await pairCompanion(page);
  await settings.getByRole('tab', { name: 'Engine', exact: true }).click();
  await settings.getByRole('button', { name: 'Engines' }).click();

  const row = settings.locator('[data-engine-row="stormphrax"]');
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('switch', { name: /Show Stormphrax/ }).click();

  /*
    An engine that is *in use* cannot be hidden, and this is where that is
    checked. `lc0` is the default second engine, so hiding it would leave a
    dropdown that does not contain its own value — which silently changes what
    the user is analysing with.
  */
  const inUse = settings.locator('[data-engine-row="lc0"]');
  await inUse.getByRole('switch', { name: /Show Lc0/ }).click();
  await settings.getByRole('button', { name: 'Close' }).click();

  const dock = page.locator('[data-workspace-dock]');
  await dock.getByRole('button', { name: 'Two engines' }).click();
  const options = await dock
    .getByRole('combobox', { name: 'First engine' })
    .evaluate((select) => [...(select as HTMLSelectElement).options].map((option) => option.value));
  expect(options, 'a hidden engine leaves the selector').not.toContain('stormphrax');
  expect(options, 'an engine in use stays, whatever the preference says').toContain('lc0');
  // Hiding is not removing: everything else is still there.
  expect(options.length).toBeGreaterThan(2);
});

test('opening books are listed, and the engine book is refused out loud', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Engine', exact: true }).click();
  await settings.getByRole('button', { name: 'Books' }).click();

  await expect(settings.locator('[data-book-row="kingfisher-book"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(settings.getByText(/Engines never play from their own book/)).toBeVisible();
  await expect(settings.getByText(/OwnBook/)).toBeVisible();
});
