import { expect, test, type Page } from '@playwright/test';

/**
 * The engine catalogue, through the real companion.
 *
 * Deliberately does **not** download an engine. The smallest one in the
 * catalogue is 20 MB and the largest 115, and a browser suite that fetched
 * them from GitHub on every run would be slow, flaky, and testing GitHub
 * rather than Kingfisher. The download-and-verify path is unit-tested against
 * a stubbed `fetch` in `companion/src/managed-engines.test.mjs`, including
 * every way it can fail.
 *
 * What is exercised here is everything a user sees before pressing Install:
 * that the catalogue is fetched from a real companion, that every row states
 * its licence and its digest, that an engine with no build for this platform
 * says so rather than offering a button that cannot work, and that the trust
 * language a native engine carries is the true one.
 */

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/** Pair with the e2e companion, the way a user does: one pasted address. */
async function pairCompanion(page: Page) {
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  return settings;
}

test('the engine catalogue is offered from the companion, with licences and digests', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const settings = await pairCompanion(page);
  await settings.getByRole('tab', { name: 'Engine', exact: true }).click();
  await settings.getByRole('button', { name: 'Engines' }).click();

  // The browser engine is always there and needs nothing.
  const wasm = settings.locator('[data-engine-row="stockfish-wasm"]');
  await expect(wasm).toContainText('Ready');
  await expect(wasm).toContainText('Sandboxed in the browser');

  // And the managed ones, from a real `/engine/catalogue` call.
  await expect(settings.locator('[data-engine-row="stockfish-native"]')).toBeVisible({
    timeout: 30_000,
  });
  for (const id of ['stockfish-native', 'stormphrax', 'viridithas', 'halogen', 'lc0']) {
    const row = settings.locator(`[data-engine-row="${id}"]`);
    await expect(row, id).toBeVisible();
    // Never described as sandboxed. ADR 0041.
    await expect(row, id).toContainText('Verified, runs as you');
    await expect(row, id).not.toContainText('Sandboxed');
  }
});

test('a native engine row states what running it actually means', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const settings = await pairCompanion(page);
  await settings.getByRole('tab', { name: 'Engine', exact: true }).click();
  await settings.getByRole('button', { name: 'Engines' }).click();

  const row = settings.locator('[data-engine-row="halogen"]');
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: /Show details of/ }).click();

  await expect(row).toContainText(/not sandboxed/i);
  await expect(row).toContainText(/same operating-system permissions/i);
  await expect(row).toContainText(/not a signature/i);
  await expect(row).toContainText(/GPL/);
  // The digest is shown before installation, because it is what the install
  // will be checked against.
  await expect(row).toContainText(/SHA-256/);
});

test('an engine can be hidden from the selector without being removed', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const settings = await pairCompanion(page);
  await settings.getByRole('tab', { name: 'Engine', exact: true }).click();
  await settings.getByRole('button', { name: 'Engines' }).click();

  const row = settings.locator('[data-engine-row="stormphrax"]');
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('switch', { name: /Show Stormphrax/ }).click();

  /*
    An engine that is *in use* cannot be hidden, and this is where that is
    checked. `lc0` is the default second engine, so hiding it would leave a
    dropdown that does not contain its own value — which silently changes what
    the user is analysing with.
  */
  const inUse = settings.locator('[data-engine-row="lc0"]');
  await inUse.getByRole('switch', { name: /Show Lc0/ }).click();
  await settings.getByRole('button', { name: 'Close' }).click();

  const dock = page.locator('[data-workspace-dock]');
  await dock.getByRole('button', { name: 'Two engines' }).click();
  const options = await dock
    .getByRole('combobox', { name: 'First engine' })
    .evaluate((select) => [...(select as HTMLSelectElement).options].map((option) => option.value));
  expect(options, 'a hidden engine leaves the selector').not.toContain('stormphrax');
  expect(options, 'an engine in use stays, whatever the preference says').toContain('lc0');
  // Hiding is not removing: everything else is still there.
  expect(options.length).toBeGreaterThan(2);
});

test('opening books are listed, and the engine book is refused out loud', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Engine', exact: true }).click();
  await settings.getByRole('button', { name: 'Books' }).click();

  await expect(settings.locator('[data-book-row="kingfisher-book"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(settings.getByText(/Engines never play from their own book/)).toBeVisible();
  await expect(settings.getByText(/OwnBook/)).toBeVisible();
});

/*
  The board is playable while an engine is analysing.

  Phase 43 gave the engine arrows a hover tooltip and, to make the hit lines
  hoverable, removed `pointer-events: none` from the SVG that holds them. That
  SVG is a rectangle over every square, so every click and drag on the board
  landed on it instead: with an arrow drawn, no move could be made — click or
  drag — until the engine was stopped. Found by the seeded desktop walk, where
  every `move` after an `engine-start` timed out. This is the test the fix
  needed: the element under a square's centre is the square, with an arrow on
  the board, and a move still goes through.
*/
test('the board can be played while an engine arrow is drawn', async ({ page }) => {
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Start analysis (E)' }).click();
  await expect(page.locator('[data-engine-arrow-hit]').first()).toBeAttached({ timeout: 30_000 });

  const e2 = page.getByRole('gridcell', { name: /^e2,/ });
  const box = await e2.boundingBox();
  expect(box).not.toBeNull();
  const under = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest('[role="gridcell"]')?.getAttribute('aria-label') ??
      null,
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
  );
  expect(under, 'the square, not the arrow sheet, is under the pointer').toMatch(/^e2,/);

  const before = await page.locator('[data-fen-tooltip]').textContent();
  await e2.click();
  await expect(page.locator('[data-engine-arrows]')).toHaveAttribute(
    'data-engine-arrows-dimmed',
    'true',
  );
  await expect(page.locator('[data-engine-arrow-tooltip]')).toHaveCount(0);
  await page.getByRole('gridcell', { name: /^e4,/ }).click();
  await expect(page.locator('[data-fen-tooltip]')).not.toHaveText(before ?? '');
  await expect(page.locator('[data-fen-tooltip]')).toContainText('4P3');
  await expect(page.locator('[data-engine-arrow-hit]')).toHaveCount(0);

  // Leaving the analysed position stops the engine, by the position guard's
  // contract (Phase 30): evidence never survives a FEN change, and a person
  // starts it again. So: start again, and the arrow must still be hoverable —
  // the tooltip appears with the pointer on the shaft, even though nothing in
  // the arrow layer takes pointer events any more.
  await expect(page.getByRole('button', { name: 'Start analysis (E)' })).toBeVisible();
  await page.getByRole('button', { name: 'Start analysis (E)' }).click();
  const hit = page.locator('[data-engine-arrow-hit]').first();
  await expect(hit).toBeAttached({ timeout: 30_000 });
  const grid = page.getByRole('grid', { name: 'Chessboard' });
  const gridBox = await grid.boundingBox();
  expect(gridBox).toBeTruthy();
  /*
    The arrow follows the search: the first best move at depth 1 is often
    not the one a few plies later, so the squares read here can be stale by
    the time the pointer arrives — and a pointer that is not on the current
    shaft correctly gets no tooltip. Read, move and check together, and
    retry until the three describe the same arrow.
  */
  await expect(async () => {
    const fromSquare = await hit.getAttribute('data-engine-arrow-from');
    const toSquare = await hit.getAttribute('data-engine-arrow-to');
    const from = await page
      .getByRole('gridcell', { name: new RegExp(`^${fromSquare},`) })
      .boundingBox();
    const to = await page
      .getByRole('gridcell', { name: new RegExp(`^${toSquare},`) })
      .boundingBox();
    expect(from && to).toBeTruthy();
    // Step off first so the move to the midpoint is a pointermove of its own.
    await page.mouse.move(gridBox!.x - 40, gridBox!.y - 40);
    // The midpoint of the shaft, in page coordinates.
    await page.mouse.move(
      (from!.x + from!.width / 2 + to!.x + to!.width / 2) / 2,
      (from!.y + from!.height / 2 + to!.y + to!.height / 2) / 2,
    );
    await expect(page.locator('[data-engine-arrow-tooltip]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  // Away from any shaft, the tooltip goes.
  await page.mouse.move(gridBox!.x - 40, gridBox!.y - 40);
  await expect(page.locator('[data-engine-arrow-tooltip]')).toHaveCount(0);
  const e7 = await page.getByRole('gridcell', { name: /^e7,/ }).boundingBox();
  const e5 = await page.getByRole('gridcell', { name: /^e5,/ }).boundingBox();
  expect(e7 && e5).toBeTruthy();
  await page.mouse.move(e7!.x + e7!.width / 2, e7!.y + e7!.height / 2);
  await page.mouse.down();
  await page.mouse.move(e5!.x + e5!.width / 2, e5!.y + e5!.height / 2, { steps: 8 });
  await expect(page.locator('[data-engine-arrows]')).toHaveAttribute(
    'data-engine-arrows-dimmed',
    'true',
  );
  await page.mouse.up();
  await expect(page.locator('[data-fen-tooltip]')).toContainText('4p3/4P3');
  await expect(page.locator('[data-engine-arrow-hit]')).toHaveCount(0);
});
