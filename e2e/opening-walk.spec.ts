import { expect, test } from '@playwright/test';

import games from './fixtures/opening-walk.json';
import { selectTool } from './tools';

/**
 * Continue the nine-opening walk begun in Phase 22, through twenty full moves.
 * Each line is the first forty plies of an actual game in the bundled Starter
 * pack, with its game id, players, date and upstream URL retained in the fixture.
 * This tests named-family inheritance and truthful sparse evidence, not a claim
 * that every continuation in these games is established theory.
 */
const families: Record<string, RegExp> = {
  Najdorf: /Sicilian/i,
  'Ruy Lopez': /Ruy Lopez|Spanish/i,
  Italian: /Italian|Giuoco/i,
  Catalan: /Catalan/i,
  'Nimzo-Indian': /Nimzo/i,
  Grünfeld: /Gr[üu]nfeld/i,
  'King’s Indian': /King.s Indian/i,
  French: /French/i,
  'Caro-Kann': /Caro/i,
};

for (const game of games) {
  test(`keeps its place through twenty moves of the ${game.name}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/analysis');
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
    const dock = page.locator('[data-workspace-dock]');
    await selectTool(page, dock, 'Explorer');
    await dock
      .getByRole('combobox', { name: 'Evidence source' })
      .selectOption('kingfisher-starter');
    const identity = dock.locator('[data-explorer-opening]').first();
    await expect(identity).toBeVisible();

    for (const [ply, uci] of game.moves.entries()) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
      await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
      await expect(
        page.getByRole('gridcell', { name: `${from}, empty`, exact: true }),
      ).toBeVisible();
      if (ply >= 13) await expect(identity).toHaveText(families[game.name]!);
    }

    // Wait for the final query, then require either rows or a named empty state.
    await expect(
      dock.getByText('Reading Kingfisher Starter Reference…', { exact: true }),
    ).toBeHidden();
    await expect
      .poll(
        async () =>
          (await dock.locator('[data-explorer-move]').count()) > 0 ||
          (await dock.getByText('No games reach this position.', { exact: true }).isVisible()),
      )
      .toBe(true);
    if ((await dock.locator('[data-explorer-move]').count()) === 0) {
      await expect(dock).toContainText('Kingfisher Starter Reference has nothing here');
    }
    await selectTool(page, dock, 'Theory Book');
    await expect(dock.locator('[data-book-crumbs]')).toContainText(families[game.name]!);
    await expect(dock).toContainText('lichess-org/chess-openings');
    await expect(dock.getByRole('button', { name: 'All openings', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    await testInfo.attach('twenty-move-position', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}
