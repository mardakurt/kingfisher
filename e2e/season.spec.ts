import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';
import { isNavigationAbortNoise } from './tools';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
}

const line = `1. e4 {[%clk 1:29:45]} e5 {[%clk 1:29:50]}
2. Nf3 {[%clk 1:29:10]} Nc6 {[%clk 1:29:30]}
3. Bb5 {[%clk 1:28:20]} a6 {[%clk 1:28:55]}
4. Ba4 {[%clk 1:28:00]} Nf6 {[%clk 1:28:20]}
5. O-O {[%clk 1:27:30]} Be7 {[%clk 1:27:50]}
6. Re1 {[%clk 1:26:45]} b5 {[%clk 1:27:10]}
7. Bb3 {[%clk 1:26:20]} d6 {[%clk 1:26:40]}
8. c3 {[%clk 1:25:50]} O-O {[%clk 1:26:05]}
9. h3 {[%clk 1:25:10]} Nb8 {[%clk 1:25:25]}
10. d4 {[%clk 1:24:20]} Nbd7 {[%clk 1:24:40]}
11. Nbd2 {[%clk 1:23:25]} Bb7 {[%clk 1:24:00]}
12. Bc2 {[%clk 1:22:30]} Re8 {[%clk 1:23:20]}
13. Nf1 {[%clk 1:21:30]} Bf8 {[%clk 1:22:30]}
14. Ng3 {[%clk 1:20:20]} g6 {[%clk 1:21:35]}
15. a4 {[%clk 1:19:00]} c5 {[%clk 1:20:30]} *`;

const pgn = (input: {
  event: string;
  site: string;
  date: string;
  opponent: string;
  result?: string;
}) => `[Event "${input.event}"]
[Site "${input.site}"]
[Date "${input.date}"]
[White "Season Player"]
[Black "${input.opponent}"]
[Result "${input.result ?? '*'}"]
[ECO "C60"]
[TimeControl "5400+30"]

${line.replace(/\*$/, input.result ?? '*')}`;

async function seed(page: Page, games: readonly string[]) {
  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(async (records) => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.profile.setAliases(['Season Player']);
    for (const record of records) await app.importGames(record, app.games);
  }, games);
}

test('the season reads one named event through all five factual sections', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  // A cancelled load at a navigation is engine noise (e2e/tools.ts), not an error.
  page.on('pageerror', (error) => {
    if (!isNavigationAbortNoise(error.message, browserName)) errors.push(error.message);
  });
  await seed(page, [
    pgn({ event: 'Club Open 2026', site: 'OTB', date: '2026.09.19', opponent: 'One' }),
    pgn({ event: 'Club Open 2026', site: 'OTB', date: '2026.09.20', opponent: 'Two' }),
    pgn({ event: 'Club Open 2026', site: 'OTB', date: '2026.09.21', opponent: 'Three' }),
  ]);

  await page.goto('/season?event=Club%20Open%202026');
  await ready(page);
  await page.locator('[data-season-sections="true"]').waitFor();

  await expect(page).toHaveTitle(/Season/);
  await expect(page.getByRole('heading', { name: /OTB · 3 games this season/ })).toBeVisible();
  for (const heading of [
    'Per phase',
    'Per move number',
    'Positions you spent longest on',
    'Time trouble per move',
    'Slowest openings',
  ]) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText('C60 · White', { exact: true })).toBeVisible();
  await expect(page.getByText('3', { exact: true }).last()).toBeVisible();
  expect(errors).toEqual([]);
});

test('All sources persists in the URL and keeps source denominators separate', async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, [
    pgn({ event: 'Mixed season', site: 'OTB', date: '2026.09.20', opponent: 'Board' }),
    pgn({
      event: 'Mixed season',
      site: 'https://lichess.org',
      date: '2026.09.21',
      opponent: 'Online',
    }),
  ]);

  await page.goto('/season?event=Mixed%20season');
  await ready(page);
  await expect(page.getByText(/spans 2 sources/)).toBeVisible();
  await page.getByRole('switch', { name: 'Allow mixed sources' }).click();
  await page.waitForURL(/mixed=1/);
  await page.locator('[data-season-sections="true"]').waitFor();

  await expect(page.getByRole('heading', { name: /OTB · 1 game this season/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Lichess · 1 game this season/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /All sources/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Allow mixed sources' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('heading', { name: /OTB · 1 game this season/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Lichess · 1 game this season/ })).toBeVisible();
});
