/**
 * The repertoire maintenance inbox (Phase 86, P0.5), as a player meets it:
 * a line filed in a repertoire, one of their own games that left it, the
 * item that says so with the game to open, a dismissal that needs a reason,
 * and the item back open when a second game brings new evidence.
 */

import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

const READY = 'html[data-kingfisher-ready="true"]';

async function play(page: Page, from: string, to: string) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

async function routeAction(page: Page, name: string) {
  await page.locator('[data-header-actions][data-header-measured]').waitFor();
  const inRow = page.locator('[data-header-actions]').getByRole('button', { name, exact: true });
  if (await inRow.isVisible()) {
    await inRow.click();
    return;
  }
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

const myGame = (event: string, fifth: string) => `[Event "${event}"]
[Date "2025.03.01"]
[White "Me, Myself"]
[Black "Opponent, An"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. ${fifth} Be7 1-0`;

async function importMine(page: Page, pgn: string) {
  await page.evaluate(async (text) => {
    const app = (
      globalThis as unknown as {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.profile.setAliases(['Me, Myself']);
    await app.importGames(text, app.games);
  }, pgn);
}

test('the inbox lists where your games left your line, and reopens on new evidence', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  for (const [from, to] of [
    ['e2', 'e4'],
    ['e7', 'e5'],
    ['g1', 'f3'],
    ['b8', 'c6'],
    ['f1', 'b5'],
    ['a7', 'a6'],
    ['b5', 'a4'],
    ['g8', 'f6'],
    ['e1', 'g1'],
  ] as const) {
    await play(page, from, to);
  }
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
  await page.getByLabel('Title').fill('Inbox E2E');
  await page.getByRole('button', { name: /Save \d+ positions?/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add to repertoire' })).toBeHidden();

  await importMine(page, myGame('Club 1', 'Nc3'));

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Repertoire' })
    .click();
  await expect(page.locator('[data-workspace-frame="repertoire"]')).toBeVisible();
  await routeAction(page, 'Inbox');
  const inbox = page.locator('[data-repertoire-inbox]');
  const item = inbox.locator('[data-inbox-item="own-departure"]');
  await expect(item).toContainText('5. Nc3 instead of O-O', { timeout: 15_000 });
  await expect(item).toContainText('In 1 of your games');

  // A dismissal needs a reason.
  const dismiss = item.getByRole('button', { name: 'Dismiss' });
  await expect(dismiss).toBeDisabled();
  await item.getByPlaceholder('Why it does not matter').fill('A one-off in a rapid game.');
  await dismiss.click();
  await expect(inbox.locator('[data-inbox-empty]')).toBeVisible();
  await expect(inbox.locator('[data-inbox-decided="dismissed"]')).toContainText(
    'A one-off in a rapid game.',
  );

  // A second game with the same departure is new evidence: the item is open again.
  await page.getByRole('button', { name: 'Close' }).click();
  await importMine(page, myGame('Club 2', 'Nc3'));
  await page.reload();
  await page.locator(READY).waitFor();
  await routeAction(page, 'Inbox');
  const again = page.locator('[data-repertoire-inbox] [data-inbox-item="own-departure"]');
  await expect(again).toContainText('open again: the evidence changed', { timeout: 15_000 });
  await expect(again).toContainText('In 2 of your games');
  await expect(again).toContainText('Earlier: dismissed — “A one-off in a rapid game.”');

  // The game opens at the move that left the line.
  await again.getByRole('button', { name: /Club/ }).first().click();
  await expect(page).toHaveURL(/\/analysis/);
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await expect(board.getByRole('gridcell', { name: /^c3, .*knight/i })).toBeVisible();
});
