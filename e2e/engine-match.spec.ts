/**
 * An engine match with the browser Stockfish against a second session of
 * itself: from a won position the side with White wins every game, so with
 * colours alternating each engine wins once — and the report says the
 * evidence is two games, not a rating.
 */

import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

// Queen and king against king, mate on the move: White wins every game.
const WON = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';

test('a two-game match alternates colours, scores 1–0–1, and saves its games', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/analysis?fen=${encodeURIComponent(WON)}`);
  await ready(page);
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();

  const section = page.getByRole('region', { name: 'Engine match' });
  await section.getByRole('button', { name: 'Match…' }).click();
  const form = section.locator('[data-match-form]');
  await form.getByLabel('Match games').selectOption('2');
  await form.getByLabel('Match time per move').selectOption('50');
  await form.locator('[data-match-start]').click();

  await expect(section).toHaveAttribute('data-match', 'done', { timeout: 120_000 });
  const report = section.locator('[data-match-report]');
  await expect(report).toContainText(/Stockfish[^:]* v Stockfish[^:]*\(second session\): 1–0–1/);
  await expect(section.locator('[data-match-stats]')).toContainText('A scored 50.0% over 2 games');
  await expect(section.locator('[data-match-stats]')).toContainText('LOS 50%');
  await expect(report).toContainText('2 games cannot separate engines');

  await section.locator('[data-match-save]').click();
  await page.waitForURL('**/studies?study=*');
  await expect(page.getByText(/Game 1: Stockfish/).first()).toBeVisible();
  await expect(page.getByText(/Game 2: Stockfish/).first()).toBeVisible();
});
