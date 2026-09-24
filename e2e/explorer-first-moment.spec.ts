import { expect, test } from '@playwright/test';

import { selectTool } from './tools';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The explorer answers from the source the player chose, from the first frame.
 *
 * Sources register as they become known, and the installed reference packs
 * arrive only after their manifests are read from IndexedDB. The explorer
 * used to take "the chosen source, else the first registered one", so a
 * reload opened on Lichess Masters for a moment before the built-in pack
 * registered — a population nobody chose, answering first.
 *
 * Every frame of a reload is recorded (the source picker's value, and the
 * loading line), and the only values allowed are the chosen pack and the
 * honest "Loading sources…".
 */
test('a reload never shows a source the player did not choose, even for a frame', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');
  const picker = dock.getByRole('combobox', { name: 'Evidence source' });
  // The bundled pack installs itself on first run; the default choice is it.
  await expect(picker).toHaveValue('kingfisher-starter', { timeout: 120_000 });

  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __explorerSourcesSeen: string[] }).__explorerSourcesSeen = seen;
    const record = () => {
      const select = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Evidence source"]',
      );
      if (select) {
        const value = select.value;
        if (seen[seen.length - 1] !== value) seen.push(value);
      }
      if (document.querySelector('[data-testid="explorer-loading-sources"]')) {
        if (seen[seen.length - 1] !== '(loading sources)') seen.push('(loading sources)');
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });

  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(dock.getByRole('combobox', { name: 'Evidence source' })).toHaveValue(
    'kingfisher-starter',
  );
  await expect(dock.locator('[data-explorer-move]').first()).toBeVisible({ timeout: 60_000 });

  const seen = await page.evaluate(
    () => (window as unknown as { __explorerSourcesSeen: string[] }).__explorerSourcesSeen,
  );
  expect(seen).toContain('kingfisher-starter');
  // An empty picker (no source registered at all) is allowed; any other source is not.
  expect(
    seen.filter((value) => !['kingfisher-starter', '(loading sources)', ''].includes(value)),
  ).toEqual([]);
});
