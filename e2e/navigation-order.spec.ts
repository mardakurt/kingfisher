import { expect, test } from '@playwright/test';

/**
 * The research loop is in reach on a laptop (Phase 87).
 *
 * Library and Databases were the last group of the sidebar, below Season and
 * Endgame, and on a 1280x800 window Databases was under the fold of the
 * list: the second step of "find a game, then analyse it" needed a scroll to
 * begin. The core workflows are now the first group.
 */

const CORE = ['Analysis', 'Library', 'Databases', 'Preparation', 'Repertoire', 'Studies'];

for (const size of [
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1440, height: 860 },
]) {
  test(`every core workflow is visible in the sidebar at ${size.width}x${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto('/analysis');
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    const sections = page.getByRole('navigation', { name: 'Sections' });
    for (const label of CORE) {
      await expect(sections.getByRole('link', { name: label, exact: true })).toBeInViewport({
        ratio: 1,
      });
    }
  });
}
