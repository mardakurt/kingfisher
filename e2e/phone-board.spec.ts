/**
 * The board on a phone: the status line whole, and no empty band under it.
 *
 * At 390 px the controls under the board took 311 of the strip's 351 px and
 * left the status line 11 — it showed "W" of "White to play". And the stacked
 * board column kept a tablet's 620 px floor, so a 340 px board sat above 200
 * px of nothing before its controls.
 */

import { expect, test } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

for (const route of ['/endgame', '/analysis']) {
  test(`${route} on a phone keeps the side to move whole and the controls under the board`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    await page.locator(READY).waitFor();
    const status = page.getByText(/^(White|Black) to play$/).first();
    await expect(status).toBeVisible();

    const measured = await status.evaluate((element) => {
      const row = element.parentElement!.getBoundingClientRect();
      const text = element.getBoundingClientRect();
      const board = document.querySelector('[data-chessboard]')!.getBoundingClientRect();
      const controls = document
        .querySelector('[aria-label="Start of game (Home)"]')!
        .getBoundingClientRect();
      return {
        clipped: text.right - row.right,
        gap: controls.top - board.bottom,
      };
    });
    expect(measured.clipped, 'the status line is cut off').toBeLessThanOrEqual(1);
    expect(measured.gap, 'empty space between the board and its controls').toBeLessThan(48);
  });
}
