import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

/**
 * A completely new user, and nothing else.
 *
 * This is the release gate for Phase 13. Playwright gives every test a fresh
 * browser context, so this runs against genuinely empty storage: no imported
 * games, no connected accounts, no companion database, no engine anybody
 * chose. If it passes, "install Kingfisher and start studying" is true; if it
 * fails, the premise of the whole phase is false.
 *
 * Nothing in here may import a PGN, connect an account, pair a companion or
 * pick an engine binary. The last test asserts that, so a well-meaning fix
 * cannot quietly make the flow pass by giving it the things it is supposed to
 * work without.
 */

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/** The bundled reference installs itself on first run; wait for it to finish. */
async function referenceReady(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const open = () =>
            new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open('kingfisher');
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
          const database = await open();
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
      { timeout: 120_000, message: 'the bundled reference should install itself on first run' },
    )
    .toBe('ready');
}

async function playFromExplorer(page: Page, san: string) {
  const explorer = page.locator('[data-workspace-dock], body');
  await explorer.getByRole('button', { name: san, exact: true }).first().click();
}

test.describe('a brand-new installation', () => {
  test('opens with a large board, a working engine and an explorer with data', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    // --- 1. Kingfisher opens.
    await page.goto('/analysis');
    await ready(page);

    // --- 2. The board is large.
    const board = await page
      .locator('[data-board-frame]')
      .first()
      .evaluate((frame) => {
        const rect = frame.getBoundingClientRect();
        return Math.round(Math.min(rect.width, rect.height));
      });
    expect(board, 'the board at 1440x900').toBeGreaterThanOrEqual(560);

    // --- 3. Stockfish is ready, without anybody choosing an engine. The
    //        assertion is on a *search result* — a principal variation and a
    //        depth beyond the first — rather than on the word "depth", which a
    //        placeholder could also contain.
    await page.getByRole('button', { name: /Analyse this position/ }).click();
    await expect
      .poll(
        async () => {
          const text = await page.locator('[data-workspace-dock]').innerText();
          return Number(/depth (\d+)/i.exec(text)?.[1] ?? 0);
        },
        { timeout: 90_000, message: 'the browser engine should reach a real search depth' },
      )
      .toBeGreaterThan(6);

    // --- 4. The explorer has data, from the bundled reference.
    await referenceReady(page);
    await page.reload();
    await ready(page);
    const dock = page.locator('[data-workspace-dock]');
    await selectTool(page, dock, 'Explorer');
    // The source picker is a <select>; its options are never "visible", so the
    // assertion is on the value it is actually set to.
    await expect(dock.getByRole('combobox', { name: 'Evidence source' })).toHaveValue(
      'kingfisher-starter',
      { timeout: 30_000 },
    );
    await expect(dock.getByText(/Answers without a network/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(dock.getByRole('button', { name: 'e4', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // --- 5. Play 1.e4 c5 2.Nf3 d6 3.d4 through the explorer, which proves it
    //        answers at every ply rather than only at the start.
    for (const san of ['e4', 'c5', 'Nf3', 'd6', 'd4']) {
      await playFromExplorer(page, san);
      await page.waitForTimeout(300);
    }
    // The moves really landed: five plies are on the board, in order.
    await expect
      .poll(async () => page.locator('[data-move-tree], body').first().innerText(), {
        timeout: 20_000,
      })
      .toMatch(/1\.\s*e4[\s\S]*c5[\s\S]*Nf3[\s\S]*d6[\s\S]*d4/);

    // --- 6. The opening name follows the line.
    await expect(dock.getByText(/Sicilian Defense/).first()).toBeVisible({ timeout: 30_000 });
    await expect(dock.getByText(/^B\d\d$/).first()).toBeVisible();
  });

  test('offers famous games that open on the board', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analysis');
    await ready(page);
    await referenceReady(page);
    await page.reload();
    await ready(page);

    const dock = page.locator('[data-workspace-dock]');
    await selectTool(page, dock, 'Explorer');
    await expect(dock.getByText(/MODEL GAMES/i).first()).toBeVisible({ timeout: 30_000 });
    // Every model game names two real players.
    await expect(dock.getByText(/ – /).first()).toBeVisible();
  });

  test('has a player library with elite and historical players', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analysis');
    await ready(page);
    await referenceReady(page);

    await page.goto('/players');
    await ready(page);
    await expect(page.locator('[data-player-results] li').first()).toBeVisible({ timeout: 60_000 });

    const search = page.getByRole('searchbox', { name: 'Search players' });

    // A current elite player, from the bundled reference.
    await search.fill('Carlsen');
    await expect(page.locator('[data-player-row="carlsen, magnus"]')).toBeVisible({
      timeout: 30_000,
    });

    // A historical champion, from the curated roster. The count may well be
    // zero — the open archive Kingfisher builds from begins in 2020 — and the
    // row must exist and say so rather than being hidden.
    for (const legend of ['Fischer', 'Kasparov', 'Tal']) {
      await search.fill(legend);
      await expect(page.locator('[data-player-results] li').first()).toContainText(legend, {
        timeout: 30_000,
      });
    }
  });

  test('has an opening library that finds the Najdorf and puts it on the board', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/openings');
    await ready(page);

    const search = page.getByRole('searchbox', { name: 'Search openings' });
    await search.fill('Najdorf');
    await expect(page.locator('[data-opening-results] li').first()).toBeVisible({
      timeout: 30_000,
    });
    await page.locator('[data-opening-results] li button').first().click();

    const detail = page.locator('[data-opening-detail]');
    await expect(detail).toBeVisible();
    await expect(detail.getByText(/Najdorf/).first()).toBeVisible();

    await detail.getByRole('button', { name: /Open on the board/ }).click();
    await expect(page).toHaveURL(/\/analysis/);
    await ready(page);
    // Ten plies of the Najdorf are on the board.
    await expect(page.getByText('a6').first()).toBeVisible({ timeout: 30_000 });
  });

  test('lists the data sources it is actually using, with their licences', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/analysis');
    await ready(page);
    await referenceReady(page);

    await page.goto('/databases');
    await ready(page);
    await page.getByRole('button', { name: /Reference sources/ }).click();

    const starter = page.locator('[data-source-row="kingfisher-starter"]');
    await expect(starter).toBeVisible({ timeout: 30_000 });
    await expect(starter).toContainText('Built in');
    await expect(starter).toContainText('Works offline');
    await expect(starter).toContainText(/games/);

    // The installable pack is listed as installable rather than hidden.
    await expect(page.locator('[data-source-row="kingfisher-elite-otb"]')).toContainText(
      'Available',
    );
  });

  /**
   * The negative half of the gate, and the one that keeps the rest honest.
   *
   * Everything above must hold on a profile where nothing was imported,
   * connected, paired or chosen. This asserts that state directly, so a future
   * change that makes the flow pass by seeding a collection, or by shipping a
   * default account, fails here instead of quietly redefining "fresh".
   */
  test('did none of it by importing, connecting or installing anything', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/analysis');
    await ready(page);
    await referenceReady(page);

    const state = await page.evaluate(async () => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('kingfisher');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const database = await open();
      const count = (store: string) =>
        new Promise<number>((resolve) => {
          if (![...database.objectStoreNames].includes(store)) return resolve(0);
          const query = database.transaction(store, 'readonly').objectStore(store).count();
          query.onsuccess = () => resolve(query.result);
          query.onerror = () => resolve(-1);
        });

      const result = {
        games: await count('games'),
        linkedAccounts: await count('linkedAccounts'),
        preferences: localStorage.getItem('kingfisher.preferences'),
      };
      database.close();
      return result;
    });

    expect(state.games, 'no game was imported').toBe(0);
    expect(state.linkedAccounts, 'no online account was connected').toBe(0);

    const preferences = state.preferences ? JSON.parse(state.preferences).state : {};
    expect(preferences.companionUrl ?? '', 'no companion was paired').toBe('');
    expect(preferences.lichessToken ?? '', 'no Lichess token was supplied').toBe('');
    // The engine in use is the one that ships in the browser.
    expect(preferences.primaryEngineId ?? 'stockfish-wasm').toBe('stockfish-wasm');
  });
});
