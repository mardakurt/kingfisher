/**
 * The search mask (`docs/design/search-mask.md`), driven through the Games
 * route with real imported games: header filters narrow as typed, the time
 * class prints its rule, a move search reads the games and names its
 * denominator, a result opens at the move it was found at, a malformed query
 * says what it could not read, and a changed filter retires stale results.
 */

import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
}

const GAMES = [
  `[Event "Club Championship"]
[Site "Riverside"]
[Date "2025.03.10"]
[White "Breyer, Student"]
[Black "Solid, Defender"]
[Result "1/2-1/2"]
[WhiteElo "2210"]
[BlackElo "2150"]
[TimeControl "5400+30"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 {The Spanish} a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 14. Ng3 1/2-1/2`,
  `[Event "Online Blitz"]
[Site "https://lichess.org/abcdefgh"]
[Date "2026.01.05"]
[White "Endgame, Grinder"]
[Black "Bishop, Holder"]
[Result "1-0"]
[WhiteElo "1900"]
[BlackElo "1950"]
[TimeControl "180+2"]
[SetUp "1"]
[FEN "3r2k1/8/8/8/2b5/8/8/3R2K1 w - - 0 1"]

1. Rxd8+ Kf7 2. Kf2 Ke6 1-0`,
  `[Event "Online Bullet"]
[Site "https://lichess.org/ijklmnop"]
[Date "2026.02.01"]
[White "Fast, Hands"]
[Black "Faster, Hands"]
[Result "0-1"]
[TimeControl "60+0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 g6 4. Qf3 Nf6 0-1`,
  `[Event "Club Championship"]
[Site "Riverside"]
[Date "1999.??.??"]
[White "Old, Master"]
[Black "Young, Talent"]
[Result "1-0"]

1. d4 d5 2. c4 e6 1-0`,
];

async function seed(page: Page) {
  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(async (games) => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.games.clear();
    for (const pgn of games) await app.importGames(pgn, app.games);
  }, GAMES);
  await page.goto('/games');
  await ready(page);
  await page.getByRole('button', { name: 'Filters' }).click();
}

const rowsNamed = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('header filters narrow by event, date and time class, and print the rule', async ({
  page,
}) => {
  await seed(page);
  await expect(rowsNamed(page, 'Breyer, Student')).toBeVisible();

  await page.getByLabel('Event').fill('championship');
  await expect(rowsNamed(page, 'Breyer, Student')).toBeVisible();
  await expect(rowsNamed(page, 'Old, Master')).toBeVisible();
  await expect(rowsNamed(page, 'Endgame, Grinder')).toHaveCount(0);

  // "1999.??.??" knows only its year; a 2025 range leaves it out.
  await page.getByLabel('From date').fill('2025-01-01');
  await expect(rowsNamed(page, 'Old, Master')).toHaveCount(0);
  await expect(rowsNamed(page, 'Breyer, Student')).toBeVisible();

  await page.getByLabel('Event').fill('');
  await page.getByLabel('From date').fill('');
  await page.getByLabel('Time control').selectOption('blitz');
  await expect(page.getByText(/Estimated duration = base \+ 40 × increment/)).toBeVisible();
  await expect(rowsNamed(page, 'Endgame, Grinder')).toBeVisible();
  await expect(rowsNamed(page, 'Fast, Hands')).toHaveCount(0);
  await page.getByLabel('Time control').selectOption('bullet');
  await expect(rowsNamed(page, 'Fast, Hands')).toBeVisible();
  await expect(rowsNamed(page, 'Endgame, Grinder')).toHaveCount(0);
});

test('a move search names what it read and opens the game at the moment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page);

  // A malformed query says what it could not read and cannot be run.
  await page.getByLabel('Route', { exact: true }).fill('N b1 z9');
  await expect(page.getByRole('alert').filter({ hasText: '"z9" is not a square.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search the moves' })).toBeDisabled();

  await page.getByLabel('Route', { exact: true }).fill('N b1 d2 f1 g3');
  await page.getByRole('button', { name: 'Search the moves' }).click();
  const status = page.locator('[data-move-search-status]');
  await expect(status).toHaveText('1 of 4 games read contain it');
  await expect(page.locator('[data-found-at]')).toHaveText(['after White’s move 14']);

  // A changed filter is a different question; the old answer goes.
  await page.getByLabel('Route', { exact: true }).fill('');
  await expect(status).toHaveCount(0);

  await page.getByLabel('Material').fill('R v B');
  await page.getByRole('button', { name: 'Search the moves' }).click();
  await expect(status).toHaveText('1 of 4 games read contain it');
  await expect(page.locator('[data-found-at]')).toHaveText(['after White’s move 1']);
  await page.locator('[data-found-at]').first().getByRole('button').click();
  await page.waitForURL(/\/analysis$/);
  await expect(page.locator('[data-current="true"]')).toContainText('Rxd8+');

  expect(errors).toEqual([]);
});

test('a theme shows its definition, and a comment is found inside the game', async ({ page }) => {
  await seed(page);
  await page.getByLabel('Theme').selectOption('rook-versus-minor');
  await expect(page.locator('[data-theme-definition]')).toContainText(
    'One side has exactly one rook and no minor piece',
  );
  await page.getByRole('button', { name: 'Search the moves' }).click();
  await expect(page.locator('[data-move-search-status]')).toHaveText(
    '1 of 4 games read contain it',
  );
  await expect(rowsNamed(page, 'Endgame, Grinder')).toBeVisible();

  await page.getByLabel('Theme').selectOption('');
  await page.getByLabel('Comment').fill('spanish');
  await page.getByRole('button', { name: 'Search the moves' }).click();
  await expect(page.locator('[data-found-at]')).toHaveText(['after White’s move 3']);
});
