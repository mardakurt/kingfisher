/**
 * Phase 84: where the game on the board leaves the explorer's source —
 * ChessBase's Find Novelty, reported as a fact about a named population.
 * Runs against the built-in reference, which answers without a network.
 */

import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
}

const tree = (page: Page) => page.locator('[data-move-tree]').first();
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Workspace tabs' }).getByRole('tab');

// A Najdorf until move six, then a king walk no elite game has played.
const GAME = `[Event "Club"]
[White "Player, P"]
[Black "Opponent, O"]
[Result "*"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Kd2 e5 *`;

test('the explorer says where the game leaves its source, and writes it in as a fact', async ({
  page,
}) => {
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill(GAME);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(tree(page)).toContainText('Kd2');

  const dock = page.locator('main');
  await selectTool(page, dock, 'Explorer');
  const section = page.getByRole('region', { name: 'This game against the source' });
  await expect(section).toContainText('Kingfisher Starter Reference');
  await section.getByRole('button', { name: 'Where does it leave this source?' }).click();

  await expect(section).toHaveAttribute('data-departure', 'left', { timeout: 30_000 });
  const sentence = section.locator('[data-departure-sentence]');
  await expect(sentence).toContainText('Leaves Kingfisher Starter Reference at 6.Kd2.');
  await expect(sentence).toContainText(/reached the position after 5\.\.\.a6; they played Be3 \d/);
  // Never the word the module refuses to use.
  await expect(section).not.toContainText(/novelty/i);

  await section.getByRole('button', { name: 'Write it into the game' }).click();
  await expect(tree(page)).toContainText('Not in Kingfisher Starter Reference:');
  await expect(tree(page)).toContainText(/Most played in Kingfisher Starter Reference: [\d,]+ of/);

  // One edit, one undo.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(tree(page)).not.toContainText('Not in Kingfisher Starter Reference:');
  await expect(tree(page)).toContainText('Kd2');

  // A predecessor opens beside the game, not over it.
  await section
    .getByRole('button', { name: /^Open .+ in a new tab$/ })
    .first()
    .click();
  await expect(tabs(page)).toHaveCount(2);
  await tabs(page).nth(0).click();
  await expect(tree(page)).toContainText('Kd2');
});

test('a game still inside the source is reported as followed, not as a departure', async ({
  page,
}) => {
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill('1. e4 c5 2. Nf3 d6 *');
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(tree(page)).toContainText('d6');

  await selectTool(page, page.locator('main'), 'Explorer');
  const section = page.getByRole('region', { name: 'This game against the source' });
  // The built-in pack registers a moment after the page; ask it, not the placeholder.
  await expect(section).toContainText('Kingfisher Starter Reference');
  await section.getByRole('button', { name: 'Where does it leave this source?' }).click();
  await expect(section).toHaveAttribute('data-departure', 'followed', { timeout: 30_000 });
  await expect(section.locator('[data-departure-sentence]')).toContainText(
    /Every move of the game is in Kingfisher Starter Reference: [\d,]+ games reach its last position\./,
  );
});
