import { expect, test } from '@playwright/test';
import { selectTool } from './tools';

test('My games shows each move’s dated games by year, and does not draw a line from a thin year', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog
    .getByRole('textbox')
    .fill(
      `[Event "A"]\n[White "Alpha"]\n[Black "Beta"]\n[Date "2020.03.01"]\n[Result "*"]\n\n1. e4 e5 *\n\n` +
        `[Event "B"]\n[White "Gamma"]\n[Black "Delta"]\n[Date "2024.11.02"]\n[Result "*"]\n\n1. e4 c5 *\n\n` +
        `[Event "C"]\n[White "Epsilon"]\n[Black "Zeta"]\n[Date "2024.01.08"]\n[Result "*"]\n\n1. d4 d5 *\n\n` +
        `[Event "Undated"]\n[White "Eta"]\n[Black "Theta"]\n[Result "*"]\n\n1. c4 e5 *`,
    );
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('4 games added to your database.')).toBeVisible();
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');
  await dock.getByRole('combobox', { name: 'Evidence source' }).selectOption('local-collection');
  const e4 = dock.locator('[data-explorer-row="e4"] [data-explorer-years]');
  await expect(e4).toHaveText('2020–2024');
  await expect(e4.locator('span')).toHaveAttribute(
    'title',
    /2020: 1, 2024: 1\. A line is drawn when a year has at least 20 games/,
  );
  await expect(dock.locator('[data-explorer-row="d4"] [data-explorer-years]')).toHaveText(
    '2024 · 1',
  );
  await expect(dock.locator('[data-explorer-year-note]')).toContainText('1 game has no year');
});
