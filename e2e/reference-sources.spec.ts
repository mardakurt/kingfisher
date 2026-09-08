import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

/**
 * The data catalog, exercised rather than described.
 *
 * Three properties, and the third is the one that took the most care to make
 * true: a source can be switched off and stops being used; an installation
 * that fails leaves nothing behind; and the explorer never goes blank, because
 * something local can always answer.
 *
 * The offline test is the reason the bundled reference is *installed* into
 * IndexedDB rather than read from `/reference/` as static files. Blocking the
 * network here would break a static read exactly as it would on a train.
 */

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function referenceReady(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('kingfisher');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          if (![...database.objectStoreNames].includes('referencePacks')) {
            database.close();
            return 'no-store';
          }
          const state = await new Promise<string>((resolve) => {
            const query = database
              .transaction('referencePacks', 'readonly')
              .objectStore('referencePacks')
              .get('kingfisher-starter');
            query.onsuccess = () =>
              resolve((query.result as { state?: string })?.state ?? 'absent');
            query.onerror = () => resolve('error');
          });
          database.close();
          return state;
        }),
      { timeout: 120_000 },
    )
    .toBe('ready');
}

const openCatalog = async (page: Page) => {
  await page.goto('/databases');
  await ready(page);
  await page.getByRole('button', { name: /Reference sources/ }).click();
  await expect(page.locator('[data-source-row="kingfisher-starter"]')).toBeVisible({
    timeout: 30_000,
  });
};

test('a source can be switched off, and stops being offered', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/analysis');
  await ready(page);
  await referenceReady(page);

  await openCatalog(page);
  const starter = page.locator('[data-source-row="kingfisher-starter"]');
  await starter.getByRole('switch', { name: /Use Kingfisher Starter Reference/ }).click();
  await expect(starter.getByRole('switch')).toHaveAttribute('aria-checked', 'false');

  await page.goto('/analysis');
  await ready(page);
  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');

  // The explorer's own picker only lists sources the user left enabled.
  const options = await dock
    .getByRole('combobox', { name: 'Evidence source' })
    .evaluate((select) => [...(select as HTMLSelectElement).options].map((option) => option.value));
  expect(options).not.toContain('kingfisher-starter');

  // Switched back on, it returns — the setting is a preference, not a deletion.
  await openCatalog(page);
  await starter.getByRole('switch', { name: /Use Kingfisher Starter Reference/ }).click();
  await page.goto('/analysis');
  await ready(page);
  await selectTool(page, dock, 'Explorer');
  await expect
    .poll(async () =>
      dock
        .getByRole('combobox', { name: 'Evidence source' })
        .evaluate((select) => [...(select as HTMLSelectElement).options].map((o) => o.value)),
    )
    .toContain('kingfisher-starter');
});

test('an install that cannot reach its files leaves nothing installed', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/analysis');
  await ready(page);
  await referenceReady(page);

  // The Elite pack's manifest lives on a release asset. Refusing the request
  // is exactly what an offline machine, a private repository or a deleted
  // release all look like from here.
  await page.route('https://mardakurt.github.io/kingfisher-data/**', (route) =>
    route.fulfill({ status: 404 }),
  );

  await openCatalog(page);
  const elite = page.locator('[data-source-row="kingfisher-elite-otb"]');
  await elite.getByRole('button', { name: 'Install' }).click();

  await expect(elite).toContainText(/not published at the address this version of Kingfisher looks for/, {
    timeout: 60_000,
  });
  // Still offered, still not installed, and nothing half-written behind it.
  await expect(elite).toContainText('Available');
  const stored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kingfisher');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const ids = await new Promise<string[]>((resolve) => {
      const query = database
        .transaction('referencePacks', 'readonly')
        .objectStore('referencePacks')
        .getAllKeys();
      query.onsuccess = () => resolve(query.result.map(String));
      query.onerror = () => resolve([]);
    });
    database.close();
    return ids;
  });
  expect(stored).toEqual(['kingfisher-starter']);
});

test('the explorer still answers with the network switched off', async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.goto('/analysis');
  await ready(page);
  await referenceReady(page);

  // Everything that is not this origin is unreachable from here on: lichess,
  // chess.com, the release assets. The application's own files are already
  // loaded, which is the situation a user on a train is actually in.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());

  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');
  await expect(dock.getByRole('combobox', { name: 'Evidence source' })).toHaveValue(
    'kingfisher-starter',
  );
  await expect(dock.getByRole('button', { name: 'e4', exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // And the engine, which is in the browser and needs nothing either.
  await selectTool(page, dock, 'Engine');
  await page.getByRole('button', { name: /Analyse this position/ }).click();
  await expect
    .poll(
      async () => {
        const text = await dock.innerText();
        return Number(/depth (\d+)/i.exec(text)?.[1] ?? 0);
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(6);
});

test('a remote source that fails offers the local one rather than going blank', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await page.goto('/analysis');
  await ready(page);
  await referenceReady(page);

  await context.route(/lichess/, (route) => route.abort());

  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');
  await dock.getByRole('combobox', { name: 'Evidence source' }).selectOption('lichess-masters');

  const fallback = dock.locator('[data-source-fallback]');
  await expect(fallback).toBeVisible({ timeout: 60_000 });
  await expect(fallback).toContainText(/could not answer/);

  // Offered, not applied: the source only changes because the user said so.
  await expect(dock.getByRole('combobox', { name: 'Evidence source' })).toHaveValue(
    'lichess-masters',
  );
  await fallback.getByRole('button', { name: /Show Kingfisher Starter Reference instead/ }).click();
  await expect(dock.getByRole('combobox', { name: 'Evidence source' })).toHaveValue(
    'kingfisher-starter',
  );
  await expect(dock.getByRole('button', { name: 'e4', exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
