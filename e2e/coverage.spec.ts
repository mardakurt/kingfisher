import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * The reference says what it covers, and — past the depth its build kept —
 * says that an empty explorer is a fact about the build rather than about
 * how often the position has been played.
 */
test('a source states what it holds, and what an empty answer means at this depth', async ({
  page,
}) => {
  await page.goto('/analysis');
  await ready(page);
  const dock = page.locator('[data-workspace-dock]').first();
  await selectTool(page, dock, 'Coverage');

  // Move 1: inside the bundled pack's depth.
  await expect(dock).toContainText('Coverage · move 1');
  const starter = dock.getByTestId('coverage-kingfisher-starter');
  await expect(starter).toContainText('Kingfisher Starter Reference');
  await expect(starter).toContainText('This position is inside its depth');
  await expect(starter).toContainText('positions up to move 21 (40 plies)');
  await expect(starter).toContainText('Lichess broadcast archive');
  await expect(starter).toContainText('games aggregated');

  // Past move 21, the same source cannot be read as evidence of absence.
  // A navigation Playwright waits for: a reload started inside evaluate() let
  // ready() answer from the old document, still marked ready, and WebKit read
  // the move-1 panel before the new page existed.
  await page.goto(
    `/analysis?fen=${encodeURIComponent('4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 30')}`,
  );
  await ready(page);
  const deep = page.locator('[data-workspace-dock]').first();
  await selectTool(page, deep, 'Coverage');
  await expect(deep).toContainText('Coverage · move 30');
  await expect(deep.getByTestId('coverage-depth-kingfisher-starter')).toContainText(
    'aggregated positions only to move 21',
  );
  await expect(deep.getByTestId('coverage-depth-kingfisher-starter')).toContainText(
    'says nothing about how often it has been played',
  );

  // And the explorer says the same thing where it used to claim the opposite.
  await selectTool(page, deep, 'Explorer');
  await expect(deep).toContainText('Past this source’s depth.');
  await expect(deep).not.toContainText('No games reach this position.');
});
