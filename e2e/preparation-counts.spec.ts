import { expect, test } from '@playwright/test';

/**
 * One player, one number, wherever Kingfisher states it.
 *
 * Before Phase 87 the same person had three answers on one visit: the
 * Players page listed Carlsen with 705 games, the preparation box offered
 * him with "no reference games" for the first second of a fresh profile (the
 * catalog was collected before the bundled pack had installed), and the report
 * said "the newest of 300 found" — 300 being the pack's per-player cap, not
 * anything that was found. Unknown is not zero, and a cap is not a count.
 */

const READY = 'html[data-kingfisher-ready="true"]';

test('the preparation box never calls a player gameless while the packs are still loading', async ({
  page,
}) => {
  await page.goto('/preparation');
  await page.locator(READY).waitFor();
  // Typed at once, on a fresh profile: the bundled pack is still installing.
  await page.getByRole('combobox', { name: 'Player name' }).fill('Carlsen');
  const suggestions = page.locator('#opponent-suggestions');
  const seen = new Set<string>();
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    if (await suggestions.isVisible()) seen.add(await suggestions.innerText());
    if ([...seen].some((text) => /\d[\d,]* reference games/.test(text))) break;
    await page.waitForTimeout(100);
  }
  expect([...seen].join('\n')).not.toContain('no reference games');
  await expect(suggestions.getByRole('option').first()).toContainText(/\d[\d,]* reference games/);
});

test('the report says what the pack records and what it keeps, and agrees with the suggestion', async ({
  page,
}) => {
  await page.goto('/preparation');
  await page.locator(READY).waitFor();
  const box = page.getByRole('combobox', { name: 'Player name' });
  await box.fill('Carlsen');
  const option = page.locator('#opponent-suggestions').getByRole('option').first();
  await expect(option).toContainText(/\d[\d,]* reference games/, { timeout: 15_000 });
  const offered = Number(
    /(\d[\d,]*) reference games/.exec(await option.innerText())![1]!.replaceAll(',', ''),
  );
  await option.dispatchEvent('pointerdown');

  const cap = page.locator('[data-report-source-cap]').first();
  await expect(cap).toBeVisible({ timeout: 30_000 });
  const text = await cap.innerText();
  const match =
    /records ([\d,]+) games for this player and keeps the moves of the newest ([\d,]+)/.exec(text);
  expect(match, text).not.toBeNull();
  const [recorded, kept] = [match![1]!, match![2]!].map((n) => Number(n.replaceAll(',', '')));
  expect(recorded).toBe(offered);
  expect(kept).toBeLessThan(offered);
  await expect(page.locator('[data-report-source]').first()).not.toContainText(
    /newest of [\d,]+ found/,
  );
});

test('Enter pressed before the player library is read waits for it, and finds the player', async ({
  page,
}) => {
  await page.goto('/preparation');
  await page.locator(READY).waitFor();
  // At once, on a fresh profile: the bundled pack has not installed yet.
  const box = page.getByRole('combobox', { name: 'Player name' });
  await box.fill('Carlsen');
  await box.press('Enter');
  await expect(page.getByRole('heading', { name: 'Carlsen, Magnus', level: 2 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('No games found.')).toHaveCount(0);
});

test("the dossier gives each opening family the opponent's score and results", async ({ page }) => {
  await page.goto('/preparation');
  await page.locator(READY).waitFor();
  const box = page.getByRole('combobox', { name: 'Player name' });
  await box.fill('Carlsen');
  await box.press('Enter');
  await expect(page.getByRole('heading', { name: 'Carlsen, Magnus', level: 2 })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('tab', { name: 'Dossier' }).click();
  const families = page.locator('[data-dossier-choices="Opening families"]');
  await expect(families.getByRole('columnheader', { name: 'Their score' })).toBeVisible();
  const first = families.locator('tbody tr').first();
  await expect(first).toContainText(/\d+(\.\d)?%/);
  const [wins, draws, losses, games] = await first.evaluate((row) => {
    const text = row.textContent ?? '';
    const results = /\+(\d+) =(\d+) −(\d+)/.exec(text);
    const count = /%\s*\((\d+)\)/.exec(text);
    return [results?.[1], results?.[2], results?.[3], count?.[1]].map(Number);
  });
  // The results are of the games counted beside them, never more.
  expect(wins! + draws! + losses!).toBeLessThanOrEqual(games!);
  expect(wins! + draws! + losses!).toBeGreaterThan(0);
});
