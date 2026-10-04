import { expect, test } from '@playwright/test';

test('MultiPV changes apply to a running engine and leave a stopped engine stopped', async ({
  page,
}) => {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('tab', { name: 'Engine', exact: true }).click();
  const panel = page.locator('[data-engine-panel-fen]');
  await panel.getByRole('button', { name: 'Start analysis (E)', exact: true }).click();
  await expect(panel.locator('[data-engine-line]')).toHaveCount(3, { timeout: 30_000 });
  await panel.getByRole('button', { name: '1', exact: true }).click();
  await expect(panel.locator('[data-engine-line]')).toHaveCount(1, { timeout: 15_000 });
  await panel.getByRole('button', { name: '5', exact: true }).click();
  await expect(panel.locator('[data-engine-line]')).toHaveCount(5, { timeout: 15_000 });
  await panel.getByRole('button', { name: 'Stop analysis (E)', exact: true }).click();
  await panel.getByRole('button', { name: '2', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Start analysis (E)', exact: true }),
  ).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Stop analysis (E)', exact: true })).toHaveCount(
    0,
  );
});
