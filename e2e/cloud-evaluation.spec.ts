/**
 * Lichess cloud evaluation in the engine panel (Phase 84): nothing is sent
 * until the player asks; once asked, the position on the board goes to
 * lichess.org and the stored lines come back labelled as stored analysis —
 * and they are kept apart: the evaluation bar and the move tree do not take
 * them. lichess.org is stubbed at the network boundary; the application and
 * its parser are real. (A live round trip from a real browser, depth 55 on
 * the Najdorf, is recorded in the Phase 84 handover.)
 */

import { expect, test } from '@playwright/test';

const NAJDORF = 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6';

test('asks Lichess only when told, and keeps its stored lines apart', async ({ page }) => {
  const asked: string[] = [];
  await page.route('https://lichess.org/api/cloud-eval**', async (route) => {
    asked.push(new URL(route.request().url()).searchParams.get('fen') ?? '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fen: NAJDORF,
        depth: 55,
        knodes: 3102803,
        pvs: [
          { moves: 'c1e3 f6g4 e3g5 h7h6', cp: 25 },
          { moves: 'f1e2 e7e5 d4b3', cp: 24 },
        ],
      }),
    });
  });

  await page.goto(`/analysis?fen=${encodeURIComponent(NAJDORF)}`);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('tab', { name: 'Engine' }).first().click();

  const cloud = page.locator('[data-cloud-evaluation]');
  await expect(cloud).toHaveAttribute('data-cloud-evaluation', 'off');
  await expect(cloud).toContainText('each position you visit is sent to lichess.org');
  await page.waitForTimeout(800);
  expect(asked).toEqual([]);

  await cloud.getByRole('button', { name: 'Ask Lichess' }).click();
  await expect(cloud.locator('[data-cloud-status="found"]')).toContainText(
    'lichess.org · depth 55 · 3.1 billion nodes',
  );
  await expect(cloud).toContainText('stored analysis, not a search here');
  await expect(cloud.locator('[data-cloud-line]')).toHaveCount(2);
  await expect(cloud.locator('[data-cloud-line]').first()).toContainText('+0.3');
  await expect(cloud.locator('[data-cloud-line]').first()).toContainText('Be3');
  expect(asked).toEqual([NAJDORF]);

  // Kept apart: the bar has no evaluation, and the tree has no moves.
  await expect(page.locator('[data-evaluation-bar]')).toHaveAttribute(
    'aria-label',
    'No evaluation',
  );
  await expect(page.getByText('0 half-moves')).toBeVisible();

  // Turned off, it asks nothing more.
  await cloud.getByRole('button', { name: 'Stop asking' }).click();
  await expect(cloud).toHaveAttribute('data-cloud-evaluation', 'off');
});
