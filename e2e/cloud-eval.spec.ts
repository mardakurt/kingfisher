/**
 * Phase 84: the Lichess cloud evaluation in the engine panel — off until
 * asked for, labelled as a stored result, and never mixed into the engine.
 * Lichess is stubbed at the network boundary; the recorded body is the one
 * Lichess returned for 1.e4 on 2026-09-24.
 */

import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const RECORDED = {
  fen: AFTER_E4,
  knodes: 119133,
  depth: 60,
  pvs: [
    { moves: 'e7e5 g1f3 b8c6 f1b5 g8f6 e1h1 f6e4 f1e1 e4d6 f3e5', cp: 22 },
    { moves: 'c7c6 d2d4 d7d5 e4e5 c6c5 g1f3 c5d4 f3d4 b8c6 d4c6', cp: 27 },
  ],
};

async function stubLichess(page: Page) {
  const asked: string[] = [];
  await page.route('https://lichess.org/api/cloud-eval**', async (route) => {
    const url = new URL(route.request().url());
    const fen = url.searchParams.get('fen') ?? '';
    asked.push(fen);
    if (fen === AFTER_E4) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RECORDED),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: '{"error":"Not found"}',
      });
    }
  });
  return asked;
}

const section = (page: Page) => page.getByRole('region', { name: 'Lichess cloud evaluation' });

test('off by default: nothing is sent to Lichess until the switch is turned on', async ({
  page,
}) => {
  const asked = await stubLichess(page);
  await page.goto(`/analysis?fen=${encodeURIComponent(AFTER_E4)}`);
  await ready(page);
  await expect(section(page)).toHaveAttribute('data-cloud-eval', 'off');
  await expect(section(page)).toContainText('on sends this position to Lichess');
  await page.waitForTimeout(1_000);
  expect(asked).toEqual([]);

  await section(page).getByRole('checkbox').check();
  await expect(section(page)).toHaveAttribute('data-cloud-eval', 'found');
  expect(asked).toEqual([AFTER_E4]);
  await expect(section(page).locator('[data-cloud-eval-provenance]')).toHaveText(
    'Stored by Lichess · depth 60 · 119M nodes · not a search on this machine',
  );
  const first = section(page).locator('[data-cloud-eval-line="1"]');
  await expect(first).toContainText('+0.2');
  await expect(first).toContainText('e5 Nf3 Nc6 Bb5');

  // Kept apart: the engine on this machine has not been started and shows no line.
  await expect(page.locator('[data-engine-line]')).toHaveCount(0);

  // A line can be written into the game, as moves only.
  await first.getByRole('button', { name: 'Insert this cloud line into the game' }).click();
  await expect(page.locator('[data-move-tree]').first()).toContainText('Nc6');

  // The choice is remembered, and a position Lichess has not stored says so.
  await page.goto(`/analysis?fen=${encodeURIComponent('8/8/8/4k3/8/8/4K3/7R w - - 0 1')}`);
  await ready(page);
  await expect(section(page)).toHaveAttribute('data-cloud-eval', 'none');
  await expect(section(page)).toContainText('Lichess has no stored evaluation of this position.');
});
