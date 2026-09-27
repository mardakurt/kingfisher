import { expect, test } from '@playwright/test';

/**
 * Settings shows the explorer source that is saved, even before it answers
 * (Phase 87).
 *
 * On a fresh profile the built-in pack is still installing when Settings is
 * first opened. The saved source (the built-in pack) was then no option of the
 * select, and a select whose value matches no option shows its first — so
 * Settings said "Lichess Masters", beside a warning that Lichess needs a
 * token, while the explorer was answering from nothing of the kind.
 */

const READY = 'html[data-kingfisher-ready="true"]';

test('the explorer source in Settings is the saved one while the built-in pack installs', async ({
  page,
}) => {
  // Hold the built-in pack's manifest, so it stays installing for the test.
  await page.route('**/reference/kingfisher-starter/manifest.json', () => {
    /* never answered */
  });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page
    .getByRole('button', { name: /^Settings/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Database', exact: true }).click();
  const select = dialog.getByRole('combobox', { name: 'Explorer source' });
  const shown = await select.evaluate(
    (element) => (element as HTMLSelectElement).selectedOptions[0]?.textContent ?? '',
  );
  expect(shown).toContain('Kingfisher Starter Reference');
  expect(shown).toContain('not ready yet');
});
