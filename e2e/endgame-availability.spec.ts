/**
 * The Endgame page says what can answer for the position on its board
 * (Phase 86): no tablebase at thirty-two pieces; lichess.org's online
 * tablebase — which sends the position — at three; and that it is offline
 * when the network goes.
 */

import { expect, test } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

test('the endgame page states which tablebase answers, and when none can', async ({
  page,
  context,
}) => {
  await page.goto('/endgame');
  await page.locator(READY).waitFor();
  const tablebase = page.locator('[data-endgame-tablebase]');
  await expect(tablebase).toContainText('none covers 32 pieces');

  // A rook ending, through the address, as a link or the position page would bring it.
  await page.goto(`/analysis?fen=${encodeURIComponent('8/8/8/4k3/8/8/4K3/4R3 w - - 0 1')}`);
  await page.locator(READY).waitFor();
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Endgame', exact: true })
    .click();
  await expect(page.locator('[data-workspace-frame="endgame"]')).toBeVisible();
  await expect(tablebase).toContainText('lichess.org’s online tablebase');
  await expect(tablebase).toContainText('the position is sent to lichess.org');

  await context.setOffline(true);
  await expect(tablebase).toContainText('Tablebase: offline.');
  await context.setOffline(false);
  await expect(tablebase).toContainText('the position is sent to lichess.org');
});
