import { expect, test, type Page, type Response } from '@playwright/test';
import { settingsButton } from './support/settings-control';

const READY = 'html[data-kingfisher-ready="true"]';

async function databases(page: Page) {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  const names = [`Stability A ${Date.now()}`, `Stability B ${Date.now()}`];
  for (const [index, name] of names.entries()) {
    await settings.getByPlaceholder('New collection name').fill(name);
    await settings.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(settings.getByText(name).first()).toBeVisible();
    await settings
      .getByPlaceholder('Paste a PGN collection…')
      .fill(
        `[Event "Source ${index}"]\n[White "Source ${index}, White"]\n[Black "Source ${index}, Black"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *`,
      );
    await settings.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(settings.getByPlaceholder('Paste a PGN collection…')).toHaveValue('');
  }
  await settings.getByRole('button', { name: 'Close' }).click();
  await page.goto('/games');
  await page.locator(READY).waitFor();
  const picker = page.getByRole('combobox', { name: 'Database' });
  const ids: string[] = [];
  for (const name of names) {
    const option = picker.locator('option', { hasText: name });
    await expect(option).toHaveCount(1);
    ids.push((await option.getAttribute('value'))!);
  }
  await picker.selectOption(ids[0]!);
  await expect(page.locator('[data-library-list]')).toContainText('Source 0, White');
  return { picker, ids };
}

test('switching databases never presents the previous database rows as current during a slow search', async ({
  page,
}) => {
  const { picker, ids } = await databases(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const requested = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route('**/db/search', async (route) => {
    if (route.request().postDataJSON()?.key === ids[1]!.slice('sqlite:'.length)) {
      received();
      await held;
    }
    await route.continue();
  });
  try {
    await picker.selectOption(ids[1]!);
    await requested;
    await expect(page.locator('[data-library-list]')).not.toContainText('Source 0, White');
    await expect(page.locator('[data-library-list]')).toContainText('Reading Stability B');
  } finally {
    release();
  }
  await expect(page.locator('[data-library-list]')).toContainText('Source 1, White');
});

test('a completed move search belongs to its database and is cleared when the source changes', async ({
  page,
}) => {
  const { picker, ids } = await databases(page);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.locator('[data-library-filters]').getByLabel('Route', { exact: true }).fill('N g1 f3');
  await page.getByRole('button', { name: 'Search the moves', exact: true }).click();
  await expect(page.locator('[data-move-search-status]')).toHaveText(
    '1 of 1 games read contain it',
  );
  await picker.selectOption(ids[1]!);
  await expect(page.locator('[data-library-list]')).toContainText('Source 1, White');
  await expect(page.locator('[data-library-list]')).not.toContainText('Source 0, White');
  await expect(page.locator('[data-move-search-status]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Search the moves', exact: true }).click();
  await expect(page.locator('[data-move-search-status]')).toHaveText(
    '1 of 1 games read contain it',
  );
  await expect(page.locator('[data-library-list]')).toContainText('Source 1, White');
});

test('rapid companion filters cancel obsolete requests and do not also scan My games', async ({
  page,
}) => {
  await databases(page);
  await page.evaluate(() => {
    const globals = globalThis as unknown as {
      __kingfisher: { games: { search: (...args: unknown[]) => Promise<unknown> } };
      __localSearches: number;
    };
    const games = globals.__kingfisher.games;
    const original = games.search.bind(games);
    globals.__localSearches = 0;
    games.search = (...args) => {
      globals.__localSearches += 1;
      return original(...args);
    };
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const requested = new Promise<void>((resolve) => {
    received = resolve;
  });
  let cancelled = false;
  page.on('requestfailed', (request) => {
    if (request.url().endsWith('/db/search') && request.postDataJSON()?.query?.text === 'obsolete')
      cancelled = true;
  });
  await page.route('**/db/search', async (route) => {
    if (route.request().postDataJSON()?.query?.text === 'obsolete') {
      received();
      await held;
    }
    await route.continue().catch(() => undefined);
  });
  try {
    const search = page.getByRole('searchbox', { name: 'Search games' });
    await search.fill('obsolete');
    await requested;
    await search.fill('Source 0');
    await expect(page.locator('[data-library-list]')).toContainText('Source 0, White');
    await expect.poll(() => cancelled).toBe(true);
    expect(
      await page.evaluate(
        () => (globalThis as unknown as { __localSearches: number }).__localSearches,
      ),
    ).toBe(0);
  } finally {
    release();
  }
});

test('a slow game open cannot pull the user back after they leave the Library', async ({
  page,
}) => {
  await databases(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const requested = new Promise<void>((resolve) => {
    received = resolve;
  });
  let finished!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    finished = resolve;
  });
  page.on('response', (r) => {
    if (r.url().endsWith('/db/content')) finished(r);
  });
  await page.route('**/db/content', async (route) => {
    received();
    await held;
    await route.continue();
  });
  try {
    await page
      .locator('[data-library-list]')
      .getByRole('button', { name: 'Source 0, White', exact: true })
      .click();
    await requested;
    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Openings', exact: true })
      .click();
    await expect(page).toHaveURL(/\/openings$/);
    const fen = await page.locator('[data-fen-tooltip]').textContent();
    release();
    await (await response).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    // Let the application's promise continuation finish; assert its visible
    // result, not merely that the slow response arrived on the wire.
    await expect(page.getByRole('heading', { name: 'Openings', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/openings$/);
    await expect(page.locator('[data-fen-tooltip]')).toHaveText(fen!);
  } finally {
    release();
  }
});
