import { expect, test } from '@playwright/test';

/**
 * One way to start (Phase 87).
 *
 * A new user's Repertoire page offered "Create repertoire" in the list,
 * "New repertoire" in the centre and "New repertoire" in the header — three
 * controls for one action, two of them the same accent — and Studies did the
 * same with "Start a study" twice beside the header's New. The tools panel
 * beside them said "No route context available", which is a developer's
 * sentence.
 */

const READY = 'html[data-kingfisher-ready="true"]';

test('an empty Repertoire page offers one create action beside the header', async ({ page }) => {
  await page.goto('/repertoire');
  await page.locator(READY).waitFor();
  const frame = page.locator('[data-workspace-frame]').first();
  await expect(frame.getByText('No repertoire yet.')).toBeVisible();
  await expect(frame.getByRole('button', { name: /^(Create|New) repertoire$/ })).toHaveCount(2);
});

test('an empty Studies page offers one Start a study, and no developer sentence', async ({
  page,
}) => {
  await page.goto('/studies');
  await page.locator(READY).waitFor();
  const frame = page.locator('[data-workspace-frame]').first();
  await expect(frame.getByText('No studies yet.').first()).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Start a study' })).toHaveCount(1);
  await expect(page.getByText(/route context/i)).toHaveCount(0);
});

test('an empty Review offers nothing to reveal or mark until a game is open', async ({ page }) => {
  await page.goto('/review');
  await page.locator(READY).waitFor();
  await expect(page.getByText('Nothing open to review.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reveal', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark for review' })).toHaveCount(0);

  // With a game open both come back; phase8.spec.ts drives that path.
});

test('an empty Training says where training cards come from', async ({ page }) => {
  await page.goto('/training');
  await page.locator(READY).waitFor();
  await expect(page.getByText('Nothing to train yet.')).toBeVisible();
  await expect(page.getByText(/Preparation → Costly moves → Train these positions/)).toBeVisible();
  await expect(page.getByText('The review queue is empty.')).toHaveCount(0);
});
