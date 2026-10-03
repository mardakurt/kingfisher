import { expect, test, type Page } from '@playwright/test';

/**
 * Threats and safety in the Features panel: pieces en prise and loose,
 * counted from the diagram, and the engine's answer to "what does the other
 * side threaten?" with its identity and budget.
 */

const READY = 'html[data-kingfisher-ready="true"]';

async function features(page: Page, fen: string) {
  await page.goto(`/analysis?fen=${encodeURIComponent(fen)}`);
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: /More/ }).first().click();
  await page.getByRole('menuitem', { name: 'Features' }).click();
  const section = page.locator('[data-safety]');
  await expect(section).toBeVisible();
  return section;
}

test('a piece the other side wins is listed with its exchange, and hovering marks it', async ({
  page,
}) => {
  // Black to move; White's knight on d5 is attacked by the e6 pawn and defended by nothing.
  const section = await features(page, '4k3/8/4p3/3N4/8/8/8/4K3 b - - 0 1');
  const row = section.locator('[data-safety-side="w"] [data-safety-row="en-prise"]');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('data-square', 'd5');
  await expect(row).toContainText('knight d5');
  await expect(row).toContainText('loses 3');
  await expect(section.locator('[data-safety-side="b"]')).toContainText(
    'Nothing en prise, nothing loose.',
  );
});

test('the engine names the threat with its engine, depth and budget', async ({ page }) => {
  test.setTimeout(90_000);
  // White to move. With the turn passed, Black has Qxh2+ and mate.
  const section = await features(page, '6k1/5ppp/3b4/8/7q/8/5PPP/R5K1 w - - 0 1');
  await section.locator('[data-threat-ask]').click();
  const answer = section.locator('[data-threat-answer]');
  await expect(answer).toBeVisible({ timeout: 60_000 });
  await expect(answer.locator('[data-threat-move]')).toContainText('Qxh2');
  await expect(answer).toContainText('with the turn passed to Black');
  await expect(answer).toContainText(/depth \d+/);
});

test('in check there is no position with the turn passed, and it says so', async ({ page }) => {
  const section = await features(page, '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
  await section.locator('[data-threat-ask]').click();
  await expect(section.locator('[data-threat-message]')).toContainText('in check');
});
