import { expect, test } from '@playwright/test';

/**
 * The sidebar has nineteen sections in four groups — 710px of list.
 *
 * That fits the 900px window it was laid out for. It does not fit a 720px
 * window, and macOS overlay scrollbars are invisible until you scroll, so the
 * overflow gave no signal: at 1280x720 the whole Data group — Library,
 * Scoresheet, Similar games, Databases — sat below a hard edge, and the cut ran
 * through the middle of Endgame's row so it read as a rendering fault rather
 * than as more content. Measured on the fixed tree: a 531px client box against
 * 710px of content, the last row's bottom 62px past the nav's own.
 *
 * Two claims, both of which were false before:
 *
 * 1. Every section is reachable at a supported window size, by scrolling.
 * 2. The window says there is something to scroll to.
 */

const SECTIONS = [
  'analysis',
  'openings',
  'studies',
  'repertoire',
  'preparation',
  'players',
  'opening-files',
  'team',
  'review',
  'training',
  'puzzles',
  'daily',
  'season',
  'endgame',
  'games',
  'scoresheet',
  'similar',
  'databases',
  'search',
  'recent',
] as const;

test.describe('sidebar overflow', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('reaches every section at a laptop window, and says it can scroll', async ({ page }) => {
    await page.goto('/analysis');

    const list = page.locator('nav[aria-label="Sections"] ul').first();
    await expect(list).toBeVisible();

    // The claim: the affordance is on exactly when there is something below.
    const overflows = await list.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(
      overflows,
      'at 1280x720 the list should not fit; if this ever changes the rest of ' +
        'this file is asserting the wrong thing',
    ).toBe(true);
    await expect(list).toHaveAttribute('data-nav-overflows', 'true');
    await expect(list).toHaveCSS('mask-image', /linear-gradient/);

    // Scrolling the list brings the last section fully inside the nav.
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const last = page.locator('[data-nav-section="databases"]');
    await expect(last).toBeVisible();
    const inside = await last.evaluate((el) => {
      const navRect = el.closest('nav[aria-label="Sections"]')!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return rect.top >= navRect.top - 1 && rect.bottom <= navRect.bottom + 1;
    });
    expect(inside, 'the last section must be fully inside the sidebar once scrolled').toBe(true);
  });

  test('every declared section is rendered, at every supported height', async ({ page }) => {
    for (const height of [900, 860, 800, 720, 640]) {
      await page.setViewportSize({ width: 1280, height });
      await page.goto('/analysis');
      const ids = await page
        .locator('[data-nav-section]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-nav-section')));
      expect(ids.sort(), `sections missing at ${height}px tall`).toEqual([...SECTIONS].sort());
    }
  });

  test('does not claim overflow when the list fits', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/analysis');
    const list = page.locator('nav[aria-label="Sections"] ul').first();
    await expect(list).not.toHaveAttribute('data-nav-overflows', 'true');
    // No mask at all when nothing is hidden: a fade over a list that ends
    // where it is meant to end is decoration, not information.
    await expect(list).not.toHaveCSS('mask-image', /linear-gradient/);
  });

  test('the nav never becomes a dead end: every section is clickable after scrolling', async ({
    page,
  }) => {
    await page.goto('/analysis');
    const list = page.locator('nav[aria-label="Sections"] ul').first();
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    for (const id of ['endgame', 'games', 'scoresheet', 'similar', 'databases'] as const) {
      const row = page.locator(`[data-nav-section="${id}"]`);
      await expect(row, `${id} must be reachable`).toBeVisible();
      // A row scrolled to must be a row a pointer can hit: inside the nav's
      // own box, not merely present in the DOM below the fold.
      const hittable = await row.evaluate((el) => {
        const navRect = el.closest('nav[aria-label="Sections"]')!.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        const mid = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return rect.bottom <= navRect.bottom + 1 && !!mid && el.contains(mid);
      });
      expect(hittable, `${id} must be inside the sidebar and hit-testable`).toBe(true);
    }
  });
});
