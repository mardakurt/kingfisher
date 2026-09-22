import { expect, test, type Page } from '@playwright/test';
import type { AppRepositories } from '../src/persistence/types';
import type { importGames } from '../src/persistence/import-game';
import type { Fen, San, Uci } from '../src/chess/types';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
}

test('the daily session shows four slices in order and grades cards', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/analysis');
  await ready(page);

  /*
   * Seed one of each kind of slice. The repertoire slice needs a training
   * item in 'repertoire-recall' mode with a due schedule; the critical
   * slice needs a review item with a due schedule; the endgame slice needs
   * a saved position with pieceCount ≤ 7; the brief slice needs a
   * preparation session whose sheet has at least one card with an
   * intended move.
   */
  await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & {
          importGames: typeof importGames;
        };
      }
    ).__kingfisher;
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
    const key = fen.split(' ').slice(0, 4).join(' ');
    const dueSchedule = {
      streak: 1,
      intervalDays: 1,
      ease: 2.5,
      dueAt: Date.now() - 1000,
      lastReviewedAt: Date.now() - 86400000,
      reviewCount: 1,
      lapses: 0,
    };

    const created = await app.training.create({
      mode: 'repertoire-recall',
      positionKey: key,
      fen: fen as Fen,
      sideToMove: 'b',
      prompt: 'Recall your move after 1. e4 e5 2. Nf3',
      solutionUci: ['b8c6'] as Uci[],
      solutionSan: ['Nc6'] as San[],
      candidatesUci: [],
      plans: [],
      tags: [],
    });
    await app.training.update({ ...created, schedule: dueSchedule });

    const review = await app.review.upsertReviewItem({
      positionKey: key,
      fen: fen as Fen,
      sideToMove: 'b',
      source: 'manual',
      category: 'calculation',
      reason: 'Spend the next thirty seconds here.',
    });
    await app.review.scheduleReviewItem(review.id, review.revision, dueSchedule);

    await app.endgames.create({
      positionKey: '8/8/8/8/8/8/4K3/4k3 w - - 0 1',
      fen: '8/8/8/8/8/8/4K3/4k3 w - - 0 1' as Fen,
      sideToMove: 'w',
      title: 'K vs k',
      category: 'pawn',
      goal: 'win' as never,
    });

    const created2 = await app.preparation.create({
      title: 'Daily test session',
      myColor: 'w',
      event: 'Club',
      round: '1',
    });
    await app.preparation.addSheetCard(created2.id, created2.revision, {
      positionKey: key,
      fen: fen as Fen,
      line: ['e4', 'e5', 'Nf3'] as San[],
      why: 'The opening the player wants to remember.',
      intendedSan: 'Nc6' as San,
    });
  });

  await page.goto('/daily');
  await ready(page);

  /*
   * The four slices reach the workspace once the queries have read from
   * IndexedDB. The data-daily-count attribute moves from "0" to the
   * sum of the cards once the session is built.
   */
  await page.locator('[data-daily="true"]').waitFor();
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-daily-count]');
      return el && el.getAttribute('data-daily-count') !== '0';
    },
    { timeout: 15000 },
  );

  // The page title and the four slice headings are visible.
  await expect(page).toHaveTitle(/Daily session/);
  await expect(page.getByRole('heading', { name: /Repertoire/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Critical positions/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Endgame/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Brief rehearsal/i })).toBeVisible();

  // Each seeded card is visible.
  await expect(page.getByText('Recall your move after 1. e4 e5 2. Nf3')).toBeVisible();
  await expect(page.getByText('Spend the next thirty seconds here.')).toBeVisible();
  await expect(page.getByText('K vs k')).toBeVisible();
  await expect(
    page.getByText('The opening the player wants to remember.'),
  ).toBeVisible();

  // The rehearsal counter starts at zero.
  await expect(page.locator('[data-daily-rehearsed="0"]')).toBeVisible();

  // Grade the repertoire card — rehearsal count goes to 1, button disabled.
  await page
    .getByRole('button', { name: /^Again · / })
    .first()
    .click();
  await expect(page.locator('[data-daily-rehearsed="1"]')).toBeVisible();

  expect(consoleErrors).toEqual([]);
});