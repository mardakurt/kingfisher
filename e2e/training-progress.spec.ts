/**
 * Training progress reads the review log back: reviews this week and how
 * many were right, eight weeks of bars, and what falls due next.
 */

import { expect, test } from '@playwright/test';

import type { AppRepositories } from '../src/persistence/types';

const READY = 'html[data-kingfisher-ready="true"]';
const DAY = 86_400_000;

test('the queue shows the review log as progress', async ({ page }) => {
  await page.goto('/training');
  await page.locator(READY).waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );

  // An empty log says so instead of drawing bars of nothing.
  await page.evaluate(async () => {
    const app = (globalThis as unknown as { __kingfisher: AppRepositories }).__kingfisher;
    await app.training.create({
      mode: 'best-move',
      positionKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      sideToMove: 'w',
      prompt: 'Progress fixture',
      solutionUci: ['e2e4'],
      solutionSan: ['e4'],
      candidatesUci: [],
      plans: [],
      tags: [],
    } as never);
  });
  await page.reload();
  await page.locator(READY).waitFor();
  const progress = page.getByRole('region', { name: 'Training progress' });
  await expect(progress).toContainText('No reviews yet.');

  // Three reviews through the real repository: two right today, one wrong
  // ten days ago. The last grade schedules the item for tomorrow or later.
  await page.evaluate(async (day) => {
    const app = (globalThis as unknown as { __kingfisher: AppRepositories }).__kingfisher;
    const [item] = await app.training.list();
    const now = Date.now();
    await app.training.review(item!.id, 'again', false, now - 10 * day);
    await app.training.review(item!.id, 'good', true, now - 2 * day);
    await app.training.review(item!.id, 'good', true, now - 60_000);
  }, DAY);
  await page.reload();
  await page.locator(READY).waitFor();

  await expect(progress.locator('[data-training-progress-week]')).toHaveText(
    'Past 7 days: 2 reviews, 2 of 2 right (100%).',
  );
  await expect(progress).toContainText('3 reviews in all, 2 of 3 right (67%).');
  const bars = progress.getByRole('list', { name: /past eight weeks/ }).getByRole('listitem');
  await expect(bars).toHaveCount(8);
  await expect(bars.last()).toHaveAttribute('aria-label', 'Past 7 days: 2 reviews, 2 right');
  await expect(bars.nth(6)).toHaveAttribute('aria-label', 'The week before: 1 review, 0 right');
});
