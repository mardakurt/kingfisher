import { expect, test } from '@playwright/test';

/*
  Durable storage is asked for by the application itself, the first time
  the person saves something — not only when they notice and click the
  "Storage is not protected" indicator. `navigator.storage.persist` is
  stubbed at the boundary (a browser's own answer depends on engagement
  heuristics no test can control); the real autosave and the real
  indicator run.
*/
test('the first saved move asks the browser for durable storage, and the indicator follows', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let durable = false;
    const calls: number[] = [];
    (window as unknown as { __persistCalls: number[] }).__persistCalls = calls;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => durable,
        persist: async () => {
          calls.push(Date.now());
          durable = true;
          return true;
        },
        estimate: async () => ({ usage: 0, quota: 1 }),
      },
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const indicator = page.getByTestId('storage-persistence-status');
  await expect(indicator).toHaveAttribute('data-storage-persistence', 'not-persistent');
  expect(
    await page.evaluate(
      () => (window as unknown as { __persistCalls: number[] }).__persistCalls.length,
    ),
  ).toBe(0);

  await page.getByRole('gridcell', { name: /^e2,/ }).click();
  await page.getByRole('gridcell', { name: /^e4,/ }).click();

  await expect(indicator).toHaveAttribute('data-storage-persistence', 'persistent', {
    timeout: 15_000,
  });
  expect(
    await page.evaluate(
      () => (window as unknown as { __persistCalls: number[] }).__persistCalls.length,
    ),
  ).toBe(1);
});
