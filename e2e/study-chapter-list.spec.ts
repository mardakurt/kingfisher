import { expect, test } from '@playwright/test';

/**
 * A long study's chapter list, on a laptop (Phase 87).
 *
 * Each chapter was a two-line card 55px tall, so a study of forty showed
 * eight at 1280x800; a long title was cut with no way to read the rest; and a
 * chapter created at the end of the list was open on the board and out of
 * sight in the list.
 */

const READY = 'html[data-kingfisher-ready="true"]';

test('a thirty-chapter study reads as a list, with the open chapter in view', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/studies');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Start a study' }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill('Chapter list study');
  await dialog
    .getByRole('button', { name: /^(Create|Save|OK)\b/i })
    .first()
    .click();
  await expect(dialog).toBeHidden();

  const long = 'Najdorf: English Attack with 6.Be3 e5 7.Nb3 Be6 8.f3 Be7 9.Qd2 O-O 10.O-O-O';
  for (let index = 1; index <= 30; index += 1) {
    await page.getByRole('button', { name: 'New chapter' }).first().click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill(index === 2 ? long : `Chapter ${index}`);
    await dialog
      .getByRole('button', { name: /^(Create|Save|OK|Add)\b/i })
      .first()
      .click();
    await expect(dialog).toBeHidden();
  }

  const list = page.locator('[data-chapter-list]');
  await expect(list.locator('[data-chapter-row]')).toHaveCount(30);

  // The last chapter created is the open one, and it is in view in the list.
  const open = list.locator('[aria-current="true"]');
  await expect(open).toHaveCount(1);
  await expect(open).toContainText('Chapter 30');
  await expect(open).toBeInViewport({ ratio: 1 });

  // Scrolled back to the top, at least fourteen rows are readable at once.
  await list.locator('[data-chapter-row]').first().scrollIntoViewIfNeeded();
  const visible = await list.locator('[data-chapter-row]').evaluateAll(
    (rows) =>
      rows.filter((row) => {
        const box = row.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= window.innerHeight - 24;
      }).length,
  );
  expect(visible).toBeGreaterThanOrEqual(14);

  // A title too long for the rail can still be read whole.
  await expect(list.getByRole('button', { name: new RegExp(long.slice(0, 20)) })).toHaveAttribute(
    'title',
    long,
  );
});

test('opening a new chapter where the list sits under the board keeps the board in view', async ({
  page,
}) => {
  // At 1024x768 the chapter list is stacked under the board in one scroller;
  // bringing the new chapter's row into view scrolled the board off screen.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/studies');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Start a study' }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill('Stacked study');
  await dialog.getByRole('button', { name: 'Create study' }).click();
  await expect(dialog).toBeHidden();
  // The empty chapter's own button, under the header: the rail's copy sits
  // below the board here, and clicking it would scroll the page by itself.
  await page.getByRole('button', { name: 'Add a chapter' }).last().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Main line');
  await dialog.getByRole('button', { name: 'Create chapter' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.locator('[data-chapter-list] [aria-current="true"]')).toContainText(
    'Main line',
  );
  await expect(page.locator('[data-chessboard]').first()).toBeInViewport({ ratio: 0.5 });
});
