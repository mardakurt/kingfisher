import { expect, test } from '@playwright/test';

/**
 * Choosing a backup to restore shows what was chosen, where the person is
 * looking (Phase 87).
 *
 * The preview — "Backup from …", Merge, Replace — renders at the foot of the
 * Database section. On a 900px window it appeared 131px below the visible
 * part of the settings panel after the file dialog closed, so choosing a file
 * seemed to do nothing.
 */

const READY = 'html[data-kingfisher-ready="true"]';

test('the chosen backup is in view, with Merge reachable, as soon as it is read', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page
    .getByRole('button', { name: /^Settings/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Database', exact: true }).click();

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export backup…', exact: true }).click();
  const saved = await (await download).path();

  // Scroll the panel back to its top, as a person arriving at the section would be.
  await dialog.getByRole('combobox', { name: 'Explorer source' }).scrollIntoViewIfNeeded();
  await dialog.locator('input[type="file"]').setInputFiles(saved);

  const preview = dialog.getByRole('region', { name: 'Backup to restore' });
  await expect(preview).toContainText('Backup from');
  await expect(preview).toBeInViewport({ ratio: 1 });
  await expect(preview.getByRole('button', { name: 'Merge', exact: true })).toBeInViewport();
  await expect(preview).toBeFocused();
});
