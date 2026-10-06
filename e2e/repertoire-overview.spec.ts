import { expect, test, type Page } from '@playwright/test';

async function routeAction(page: Page, name: string) {
  await page.locator('[data-header-actions][data-header-measured]').waitFor();
  const button = page.locator('[data-header-actions]').getByRole('button', { name, exact: true });
  if (await button.isVisible()) return button.click();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

test('on a phone the folded header actions open inside the window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/repertoire');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'New repertoire', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New repertoire' });
  await dialog.getByLabel('Title').fill('Phone plan');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.locator('[data-header-actions][data-header-measured]').waitFor();
  await page.getByRole('button', { name: 'More actions' }).click();
  for (const name of ['Review repertoire', 'Your openings', 'Scan games against this repertoire']) {
    const box = await page.getByRole('menuitem', { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.x, name).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(390);
  }
  await page.getByRole('menuitem', { name: 'Review repertoire', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review repertoire' })).toBeVisible();
});

// Authored test repertoires; not a claimed reference population.
test('Your openings shows both colours and opens the chosen repertoire position', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/repertoire');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  for (const [name, color] of [
    ['White plan', 'White'],
    ['Black plan', 'Black'],
  ]) {
    const emptyCreate = page.getByRole('button', { name: 'New repertoire', exact: true }).first();
    if (await emptyCreate.isVisible()) await emptyCreate.click();
    else await routeAction(page, 'New repertoire');
    const dialog = page.getByRole('dialog', { name: 'New repertoire' });
    await dialog.getByLabel('Title').fill(name!);
    await dialog.getByLabel('Side').selectOption(color === 'White' ? 'w' : 'b');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('combobox', { name: 'Active repertoire' })).toContainText(name!);
  }
  await routeAction(page, 'Your openings');
  const overview = page.getByRole('dialog', { name: 'Your openings' });
  await expect(overview.getByRole('region', { name: 'White repertoires' })).toContainText(
    'White plan',
  );
  await expect(overview.getByRole('region', { name: 'Black repertoires' })).toContainText(
    'Black plan',
  );
  await expect(overview).toContainText('No main or alternative moves for your side yet.');
  await overview.getByRole('button', { name: 'White plan', exact: true }).click();
  await expect(overview).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Active repertoire' })).toHaveValue(
    (await page
      .getByRole('combobox', { name: 'Active repertoire' })
      .locator('option', { hasText: 'White plan' })
      .getAttribute('value')) as string,
  );
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: /^e2,/ }).click();
  await board.getByRole('gridcell', { name: /^e4,/ }).click();
  await page.getByRole('button', { name: 'Add to repertoire', exact: true }).first().click();
  const add = page.getByRole('dialog', { name: 'Add to repertoire' });
  await add.getByRole('combobox').first().selectOption({ label: 'White plan (White)' });
  await add.getByRole('button', { name: /Save \d+ position/ }).click();
  await expect(add).toBeHidden();
  await routeAction(page, 'Your openings');
  await expect(overview.getByRole('region', { name: 'White repertoires' })).toContainText(
    '1 position with intended moves',
  );
  await expect(overview.getByRole('region', { name: 'Black repertoires' })).toContainText(
    '0 positions with intended moves',
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(overview).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await overview.getByRole('button', { name: 'Close', exact: true }).click();
  await board.getByRole('gridcell', { name: /^d2,/ }).click();
  await board.getByRole('gridcell', { name: /^d4,/ }).click();
  await routeAction(page, 'Your openings');
  await overview.getByRole('button', { name: /^Unclassified positions/ }).click();
  await expect(overview).toBeHidden();
  await expect(board.getByRole('gridcell', { name: /^d2, White pawn/ })).toBeVisible();
});
