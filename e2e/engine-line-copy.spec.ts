/**
 * An engine line copies as text a person can paste: the score, the numbered
 * moves from the position on the board, and the depth.
 */

import { expect, test } from '@playwright/test';

import { readableClipboard } from './tools';

test('an engine line is copied with its score, numbered moves and depth', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const clipboard = await readableClipboard(page);
  // Black to move, so the line starts with a numbered ellipsis.
  await page.goto('/analysis?moves=e2e4');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Analyse this position' }).first().click();
  const line = page.locator('[data-engine-line="1"]').first();
  await expect(line.locator('[data-engine-candidate]')).toBeVisible({ timeout: 30_000 });
  await line.hover();
  await line.getByRole('button', { name: 'Copy this line as text' }).click();
  await expect(page.getByText('Engine line copied.')).toBeVisible();
  expect(await clipboard()).toMatch(/^[+−-]?\d+\.\d+ 1\.\.\. \S+ 2\. \S+.* \(depth \d+\)$/);
});
