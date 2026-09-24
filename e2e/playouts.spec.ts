/**
 * Monte Carlo playouts (Phase 85) with the browser Stockfish: the engine plays
 * a position out against itself and the panel reports how those games ended,
 * as a count naming the engine and the time per move — never an evaluation.
 */

import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

// Queen and king against king, mate on the move: every playout must end in a White win.
const WON = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
// Two knights cannot force mate: the games end by the fifty-move rule or repetition.
const DRAWN = '8/8/4k3/8/8/8/3NN3/4K3 w - - 0 1';

test('playouts report how the games ended, with the engine and the time named', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto(`/analysis?fen=${encodeURIComponent(WON)}`);
  await ready(page);
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();

  const section = page.getByRole('region', { name: 'Playouts' });
  await section.getByRole('button', { name: 'Play it out…' }).click();
  const form = section.locator('[data-playouts-form]');
  await form.getByLabel('Games').selectOption('10');
  await form.getByLabel('Per move').selectOption('50');
  await form.getByRole('button', { name: 'Start 10 playouts' }).click();

  await expect(section).toHaveAttribute('data-playouts', 'done', { timeout: 120_000 });
  const report = section.locator('[data-playouts-report]');
  await expect(report).toContainText(
    /^10 playouts at 50 ms a move by Stockfish[^:]*: White won 10, drawn 0, Black won 0\./,
  );
  // A count, not a verdict.
  await expect(report).not.toContainText(/%|probability|evaluation|winning/i);

  // Two knights against a bare king: the games end by the rules as draws.
  await section.getByRole('button', { name: 'Discard' }).click();
  await page.goto(`/analysis?fen=${encodeURIComponent(DRAWN)}`);
  await ready(page);
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();
  const again = page.getByRole('region', { name: 'Playouts' });
  await again.getByRole('button', { name: 'Play it out…' }).click();
  await again.locator('[data-playouts-form]').getByLabel('Games').selectOption('10');
  await again.locator('[data-playouts-form]').getByLabel('Per move').selectOption('50');
  await again.getByRole('button', { name: 'Start 10 playouts' }).click();
  await expect(again).toHaveAttribute('data-playouts', 'done', { timeout: 150_000 });
  await expect(again.locator('[data-playouts-report]')).toContainText(
    /: White won 0, drawn 10, Black won 0\./,
  );
});
