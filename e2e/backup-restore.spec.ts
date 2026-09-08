import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Export a backup, throw the profile away, restore it.
 *
 * `src/persistence/backup.test.ts` and `backup-completeness.test.ts` cover the
 * two halves that can be reasoned about: the transaction is all-or-nothing, and
 * every store holding authored work is in `PORTABLE_STORES`. Neither can cover
 * the half a user actually performs — pressing Export, receiving a file,
 * arriving on a machine with nothing on it, and pressing Restore. That path
 * goes through a Blob, a download, a file input and a dialog, and none of those
 * exist in a Vitest process.
 *
 * The list has been wrong before. AGENTS.md says so in as many words: "that
 * list has been wrong before, and a backup that silently omits a store is
 * indistinguishable from a complete one until a restore." This is the test that
 * performs the restore.
 *
 * ## What "throw the profile away" means here
 *
 * Every IndexedDB database deleted and `localStorage` cleared, then a reload —
 * which is what a new machine looks like from the application's point of view,
 * and is strictly harsher than the usual advice of using a fresh browser
 * profile, because it also proves the *emptiness* before the restore rather
 * than assuming it.
 *
 * The bundled reference pack reinstalls itself afterwards, which is correct and
 * is why the assertions below are about authored work rather than about the
 * absence of everything.
 */

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * How many repertoires with this title the page knows about.
 *
 * The repertoire list is a `<select>`, and an `<option>` is never "visible" to
 * Playwright however real it is — so `toBeVisible` on the title fails on a
 * repertoire that exists. Counting the options is the assertion that means
 * what it looks like it means.
 */
async function repertoires(page: Page, title: string) {
  return page.locator('option').filter({ hasText: title }).count();
}

async function openSettings(page: Page, section: string) {
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((element) =>
      /^settings/i.test((element.getAttribute('aria-label') || element.textContent || '').trim()),
    );
    button?.click();
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('tab', { name: section, exact: true }).click();
  return dialog;
}

test('a backup survives a profile that no longer exists', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studies');
  await ready(page);

  // --- 1. Author something worth losing. ----------------------------------
  const STUDY = 'Backup walk study';
  await page
    .getByRole('button', { name: /New study|Create study/i })
    .first()
    .click();
  const prompt = page.getByRole('dialog');
  await expect(prompt).toBeVisible({ timeout: 15_000 });
  await prompt.getByRole('textbox').first().fill(STUDY);
  await prompt
    .getByRole('button', { name: /^(Create|Save|OK)\b/i })
    .first()
    .click();
  await expect(page.getByText(STUDY).first()).toBeVisible({ timeout: 30_000 });

  const REPERTOIRE = 'Backup walk repertoire';
  await page.goto('/repertoire');
  await ready(page);
  await page
    .getByRole('button', { name: /Create repertoire|New repertoire/i })
    .first()
    .click();
  const repertoirePrompt = page.getByRole('dialog');
  await expect(repertoirePrompt).toBeVisible({ timeout: 15_000 });
  await repertoirePrompt.getByRole('textbox').first().fill(REPERTOIRE);
  await repertoirePrompt
    .getByRole('button', { name: /^(Create|Save|OK)\b/i })
    .first()
    .click();
  await expect
    .poll(async () => repertoires(page, REPERTOIRE), { timeout: 30_000 })
    .toBeGreaterThan(0);

  /*
    And a preference, because preferences travel in the same file and are the
    part a user notices immediately if they do not come back.

    `midnight` rather than the default `walnut`: a test that asserts a default
    value came back is a test that passes on a backup containing no preferences
    at all. Written into the persisted store and then reloaded, so the running
    application really holds it before the export reads it — writing it after
    hydration would leave the in-memory store on its default and export that.
  */
  await page.evaluate(() => {
    const raw = localStorage.getItem('kingfisher.preferences');
    const parsed = raw
      ? (JSON.parse(raw) as { state?: Record<string, unknown>; version?: number })
      : { state: {}, version: 4 };
    parsed.state = { ...(parsed.state ?? {}), boardTheme: 'midnight' };
    localStorage.setItem('kingfisher.preferences', JSON.stringify(parsed));
  });
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem('kingfisher.preferences');
      return raw
        ? ((JSON.parse(raw) as { state?: { boardTheme?: string } }).state?.boardTheme ?? null)
        : null;
    }),
    'the preference is really set before the export reads it',
  ).toBe('midnight');

  // --- 2. Export. ---------------------------------------------------------
  await page.goto('/analysis');
  await ready(page);
  const settings = await openSettings(page, 'Database');
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await settings.getByRole('button', { name: 'Export backup', exact: true }).click();
  const file = await download;
  const saved = await file.path();
  expect(saved, 'the export produced a file').toBeTruthy();

  const backup = JSON.parse(readFileSync(saved, 'utf8')) as {
    createdAt: number;
    stores: Record<string, unknown[]>;
  };
  /*
    Asserted on the file rather than on the notification. "Portable workspace
    backup exported" is shown whether or not the file contains anything, and a
    zero-record backup is exactly the failure this test exists for.
  */
  const names = Object.keys(backup.stores ?? {});
  expect(names.length, `the backup names its stores: ${names.join(', ')}`).toBeGreaterThan(0);
  const records = Object.values(backup.stores ?? {}).reduce(
    (total, rows) => total + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
  expect(records, 'the backup contains records').toBeGreaterThan(0);

  // --- 3. Throw the profile away. -----------------------------------------
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const databases = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      databases.map(
        (entry) =>
          new Promise<void>((resolve) => {
            if (!entry.name) return resolve();
            const request = indexedDB.deleteDatabase(entry.name);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
          }),
      ),
    );
    localStorage.clear();
  });
  await page.reload();
  await ready(page);

  // It really is gone. Without this the restore could be asserting on data
  // that was never removed.
  await page.goto('/studies');
  await ready(page);
  await expect(page.getByText(STUDY)).toHaveCount(0, { timeout: 30_000 });
  await page.goto('/repertoire');
  await ready(page);
  await expect.poll(async () => repertoires(page, REPERTOIRE), { timeout: 30_000 }).toBe(0);

  // --- 4. Restore. --------------------------------------------------------
  await page.goto('/analysis');
  await ready(page);
  const restoreSettings = await openSettings(page, 'Database');
  await restoreSettings.locator('input[type="file"]').setInputFiles(saved);
  await expect(restoreSettings.getByText(/Backup from/)).toBeVisible({ timeout: 30_000 });
  await restoreSettings.getByRole('button', { name: 'Merge', exact: true }).click();
  await expect(page.getByText(/records restored by merge/i)).toBeVisible({ timeout: 60_000 });

  // --- 5. Everything authored is back. ------------------------------------
  await page.goto('/studies');
  await ready(page);
  await expect(page.getByText(STUDY).first()).toBeVisible({ timeout: 30_000 });

  await page.goto('/repertoire');
  await ready(page);
  await expect
    .poll(async () => repertoires(page, REPERTOIRE), { timeout: 30_000 })
    .toBeGreaterThan(0);

  const theme = await page.evaluate(() => {
    const raw = localStorage.getItem('kingfisher.preferences');
    const parsed = raw ? (JSON.parse(raw) as { state?: { boardTheme?: string } }) : null;
    return parsed?.state?.boardTheme ?? null;
  });
  expect(theme, 'the board theme came back with the rest of it').toBe('midnight');
});
