import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * The complaint the research records is "difficult to organise, and almost
 * impossible to search". Tags file the work; the search page finds it, and
 * says which way it read the box.
 */
test('studies and chapters are filed by tag, and the filter narrows as tags are added', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studies');
  await ready(page);

  const rail = page.locator('[data-workspace-rail]').first();
  const make = async (title: string) => {
    await page.getByRole('button', { name: 'New study', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New study' });
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByRole('button', { name: 'Create study', exact: true }).click();
  };

  const tag = async (value: string) => {
    const field = page.getByLabel('Tags for this study');
    await field.click();
    await field.fill(value);
    await field.press('Enter');
  };

  await make('Najdorf against Petrov');
  await tag('Najdorf, Opponent');
  await expect(rail.getByRole('button', { name: /^najdorf/ })).toBeVisible({ timeout: 15_000 });

  await make('Rook endings');
  await tag('endgame');
  await expect(rail.getByRole('button', { name: /^endgame/ })).toBeVisible({ timeout: 15_000 });

  // One tag: only its studies. Two tags: only what carries both.
  const picker = rail.getByRole('combobox', { name: 'Study' });
  const options = () => picker.locator('option');
  await expect(options()).toHaveCount(2);
  await rail.getByRole('button', { name: /^najdorf/ }).click();
  await expect(options()).toHaveText(['Najdorf against Petrov']);
  await expect(options()).toHaveCount(1);
  await rail.getByRole('button', { name: /^endgame/ }).click();
  // No study carries both, and the picker says which kind of empty that is.
  await expect(options()).toHaveText(['No study has all of those tags']);
  await rail.getByRole('button', { name: 'Clear', exact: true }).first().click();
  await expect(options()).toHaveCount(2);

  expect(errors).toEqual([]);
});

test('the search page reads a position, a line and a name, and says which', async ({ page }) => {
  await page.goto('/search');
  await ready(page);
  const box = page.getByLabel('Search your work');
  const reading = page.getByTestId('search-reading');
  await expect(reading).toContainText('Type a position, a line, or a name.');

  await box.fill('1.e4 c5 2.Nf3');
  await expect(reading).toContainText('Read as a position (from the moves you typed)');

  await box.fill('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  await expect(reading).toContainText('Read as a position');
  await expect(reading).not.toContainText('from the moves');

  await box.fill('Najdorf');
  await expect(reading).toContainText('Read as words');
  // The query is the URL, so the search can be linked and reloaded.
  await expect(page).toHaveURL(/\/search\?q=Najdorf/);
  await page.reload();
  await ready(page);
  await expect(page.getByLabel('Search your work')).toHaveValue('Najdorf');
});
