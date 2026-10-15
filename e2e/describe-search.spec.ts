import { expect, test } from '@playwright/test';

/**
 * The Library's Describe bar: a sentence becomes the ordinary filters.
 *
 * The parser itself is proved in `src/database/query/natural.test.ts`; this
 * proves the screen — that the interpretation is shown before anything runs,
 * that unknown words are reported, and that every condition lands in the
 * filter form where the person can see and change it. The opening condition
 * is asserted on purpose: re-applying any saved query used to drop it.
 */

const READY = 'html[data-kingfisher-ready="true"]';

test('a described search previews its conditions and fills the filters', async ({ page }) => {
  await page.goto('/games');
  await page.locator(READY).waitFor();
  await page.locator('[data-describe-trigger]').click();
  const input = page.getByLabel('Describe the games to find');
  await input.fill('Carlsen as Black in the Najdorf since 2018, rated over 2700, blitz, brilliant');

  const bar = page.locator('[data-describe-search]');
  await expect(bar.locator('[data-describe-part="Player"]')).toHaveText(/Carlsen \(Black\)/);
  await expect(bar.locator('[data-describe-part="Opening"]')).toHaveText(/Najdorf/);
  await expect(bar.locator('[data-describe-unparsed]')).toHaveText(/brilliant/);

  await input.press('Enter');
  await expect(bar).toBeHidden();
  const chips = page.locator('[data-filter-chips]');
  await expect(chips).toContainText('Carlsen');
  await expect(chips).toContainText('Black');
  await expect(chips).toContainText('Najdorf');
  await expect(chips).toContainText('2700');
  await expect(chips).toContainText(/blitz/i);
});

test('a phrase it cannot express exactly does not run', async ({ page }) => {
  await page.goto('/games');
  await page.locator(READY).waitFor();
  await page.locator('[data-describe-trigger]').click();
  await page.getByLabel('Describe the games to find').fill('Carlsen wins');
  await expect(page.locator('[data-describe-search]').getByRole('alert')).toContainText(
    'say which colour',
  );
  await expect(
    page.locator('[data-describe-search]').getByRole('button', { name: 'Search' }),
  ).toBeDisabled();
});
