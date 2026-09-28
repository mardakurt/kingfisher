import { expect, test } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

/**
 * A pinned tool stays in the dock's row when the words are wider than here.
 *
 * The nightly Linux run found the Training dock — 300 px at 1280x720 —
 * drawing "Answer | Engine | More" and folding the pinned Explorer tab into
 * its own menu: Linux renders the labels in a wider face than macOS, and on
 * macOS the row had about ten pixels to spare. In a row already short of room
 * More is now an icon, which gives the tabs back about thirty pixels.
 *
 * Linux's fonts are not on this machine, so the labels are widened instead:
 * three pixels of padding a side on every tab, eighteen pixels in all —
 * more than the ten the row used to have, less than the room it has now.
 */
test('the Training dock keeps its pinned tools when the labels render wider', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  // Wider from the first paint, as Linux's fonts are; the page is not
  // reloaded after this, so every dock below is measured with it.
  await page.addStyleTag({
    content: '[data-tab-strip] [role="tab"] { padding-inline: 9px !important; }',
  });
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Create training position…' }).click();
  const create = page.getByRole('dialog', { name: 'Create training position' });
  const board = create.getByRole('grid', { name: 'Chessboard' });
  await board.getByRole('gridcell', { name: /^e2,/ }).click();
  await board.getByRole('gridcell', { name: /^e4,/ }).click();
  await create.getByRole('button', { name: 'Create item' }).click();
  await expect(create).toBeHidden();

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Training' })
    .click();
  const training = page.locator('[data-workspace-frame="training"]');
  await expect(training.getByText('Play the prepared move.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Show answer' }).click();

  const dock = training.getByRole('complementary', { name: 'Workspace tools' });
  await expect(dock.getByRole('tab', { name: 'Engine' })).toBeVisible();
  await expect(dock.getByRole('tab', { name: 'Explorer' })).toBeVisible();
  // Nothing clipped: the row still ends inside the dock.
  const overflow = await dock
    .locator('[data-tab-strip]')
    .evaluate((row) => row.scrollWidth - row.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // And More is still More to a screen reader.
  await expect(dock.getByRole('button', { name: /More/ })).toBeVisible();
});
