import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

/**
 * The explorer explains the variation, not only its name.
 *
 * The release gate for Phase 16's opening-explanation work. It runs on a fresh
 * profile with nothing imported, walks a real Najdorf by hand, and checks the
 * three things a brief has to get right: the variation it describes, the fact
 * that it says so when the position has outrun the last named one, and the
 * provenance line that tells a reader which sentences Kingfisher wrote and
 * which came out of the dataset.
 *
 * The moves are typed out rather than taken from the top of the explorer,
 * because the point of this test is a *specific* variation. A most-played walk
 * would assert whatever the pack happened to contain.
 */

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * Play one move by clicking its from- and to-square.
 *
 * Squares are grid cells named "e2, White pawn" or "e4, empty", so the name is
 * anchored on the square and left open after the comma — the piece standing
 * there is exactly what the move is about to change.
 */
async function playMove(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

const NAJDORF: readonly (readonly [string, string])[] = [
  ['e2', 'e4'],
  ['c7', 'c5'],
  ['g1', 'f3'],
  ['d7', 'd6'],
  ['d2', 'd4'],
  ['c5', 'd4'],
  ['f3', 'd4'],
  ['g8', 'f6'],
  ['b1', 'c3'],
  ['a7', 'a6'],
];

test.describe('variation briefs', () => {
  test('explains the variation the player is actually in', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analysis');
    await ready(page);

    const dock = page.locator('[data-workspace-dock]');
    await selectTool(page, dock, 'Explorer');

    const brief = dock.locator('[data-testid="variation-brief"]');

    for (const [from, to] of NAJDORF) {
      await playMove(page, from, to);
      await page.waitForTimeout(120);
    }

    // --- 1. The right variation, read off the element rather than the prose.
    await expect
      .poll(async () => brief.getAttribute('data-brief-matched'), {
        timeout: 30_000,
        message: 'the brief should resolve to the Najdorf',
      })
      .toBe('Sicilian Defense > Najdorf Variation');

    // --- 2. The defining line is the dataset's, and it is the Najdorf's.
    await expect(brief.locator('[data-testid="variation-brief-line"]')).toContainText('5. Nc3 a6');

    // --- 3. The explanation is there, and it is about ...a6 rather than a mood.
    await expect(brief).toContainText('a6');
    await expect(brief).toContainText('White');
    await expect(brief).toContainText('Black');

    // --- 4. Provenance is stated, every time.
    await expect(brief.locator('[data-testid="variation-brief-provenance"]')).toContainText(
      'Kingfisher summary',
    );

    // --- 5. Past the last named position, the brief is inherited and says so.
    //        6.Be3 e5 7.Nb3 Be6 8.f3 is the English Attack; the moves after it
    //        leave every named position behind.
    for (const [from, to] of [
      ['c1', 'e3'],
      ['e7', 'e5'],
      ['d4', 'b3'],
      ['c8', 'e6'],
      ['f2', 'f3'],
      ['f8', 'e7'],
      ['d1', 'd2'],
      ['e8', 'g8'],
    ] as const) {
      await playMove(page, from, to);
      await page.waitForTimeout(120);
    }

    await expect
      .poll(async () => brief.getAttribute('data-brief-matched'), {
        timeout: 30_000,
        message: 'a position past the last named one should inherit the English Attack',
      })
      .toBe('Sicilian Defense > Najdorf Variation > English Attack');
    await expect(brief.locator('[data-testid="variation-brief-provenance"]')).toContainText(
      'the last named variation on this line',
    );

    // --- 6. A player who already knows all this can turn it off. Checked on
    //        the stored preference as well as the DOM, because "it stays off"
    //        is the part that matters and re-rendering hidden is not the same
    //        as remembering. The board is deliberately not reloaded here: a
    //        reload returns to the starting position, which has no variation
    //        to explain, so it would prove nothing about the preference.
    await brief.getByRole('button', { name: 'Hide' }).click();
    await expect(brief.locator('[data-testid="variation-brief-provenance"]')).toBeHidden();
    await expect(brief.getByRole('button', { name: 'Show' })).toBeVisible();
    expect(
      await page.evaluate(() => {
        const raw = localStorage.getItem('kingfisher.preferences');
        return raw === null
          ? null
          : (JSON.parse(raw) as { state?: { showVariationBrief?: boolean } }).state
              ?.showVariationBrief;
      }),
      'the preference should be persisted, not only applied',
    ).toBe(false);

    await brief.getByRole('button', { name: 'Show' }).click();
    await expect(brief.locator('[data-testid="variation-brief-provenance"]')).toBeVisible();
  });
});
