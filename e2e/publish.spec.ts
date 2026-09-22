import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(
    () => Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * What a coach sends: one file, with the boards inside it, that opens on a
 * machine that has never run Kingfisher. The PDF is the operating system's
 * own, produced from these same bytes by the print dialog, so what is checked
 * here is the document both destinations are handed.
 */
test('a study is published as one self-contained file', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studies');
  await ready(page);

  // A study, built through the product: a chapter with a comment, a variation
  // and one position marked critical.
  await page.getByRole('button', { name: 'Start a study' }).first().click();
  const created = page.getByRole('dialog', { name: 'New study' });
  await created.getByLabel('Title').fill('Open games');
  await created.getByLabel(/Description/).fill('What I play after 1.e4 e5.');
  await created.getByRole('button', { name: 'Create study', exact: true }).click();

  const rail = page.locator('[data-workspace-rail]').first();
  await rail.getByRole('button', { name: 'New chapter' }).click();
  const chapterPrompt = page.getByRole('dialog', { name: 'New chapter' });
  await chapterPrompt.getByLabel('Title').fill('Ruy Lopez, the main road');
  await chapterPrompt
    .getByRole('button', { name: /Create|Add/ })
    .first()
    .click();

  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  const play = async (from: string, to: string) => {
    await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
    await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
  };
  await play('e2', 'e4');
  await play('e7', 'e5');
  await play('g1', 'f3');

  // Open the dialog while the moves are still being written: it says so
  // rather than quietly publishing a chapter without its last line.
  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish study' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('publish-unsaved')).toBeHidden({ timeout: 30_000 });
  await expect(dialog.getByTestId('publish')).toContainText('Ruy Lopez, the main road');
  await expect(dialog.getByTestId('publish')).toContainText('kB');

  // The file itself, checked as the reader receives it.
  const download = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Save as HTML', exact: true }).click(),
  ]).then(([event]) => event);
  expect(download.suggestedFilename()).toBe('open-games.html');
  const stream = await download.createReadStream();
  const html = await new Promise<string>((resolve, reject) => {
    let text = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => (text += chunk));
    stream.on('end', () => resolve(text));
    stream.on('error', reject);
  });

  expect(html).toContain('<h1>Open games</h1>');
  expect(html).toContain('What I play after 1.e4 e5.');
  expect(html).toContain('Ruy Lopez, the main road');
  expect(html).toContain('1.e4');
  expect(html).toContain('2.Nf3');
  expect(html).toContain('Published from Kingfisher');
  // Self-contained: nothing to fetch, nothing to run. An SVG's `xmlns` is a
  // namespace name spelled as a URL and never resolved, so the check is on
  // the attributes that would actually reach the network.
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/<link/i);
  expect(html).not.toMatch(/<img/i);
  expect(html).not.toMatch(/(?:src|href)\s*=\s*"[^"]*:\/\//i);
});
