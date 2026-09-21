import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

/**
 * After the round — the evening-of-the-game page, driven as a club player
 * would: their name in the profile, a small repertoire, the game imported
 * with its clock times, then the dock tool read top to bottom and one
 * learning point filed. Every statement the page makes is checked against
 * the game it was built from, and the entry is read back in Review → Rounds.
 */

const READY = 'html[data-kingfisher-ready="true"]';

async function ready(page: Page) {
  await page.locator(READY).waitFor();
  await page.waitForFunction(
    () => Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    undefined,
    { timeout: 30_000 },
  );
}

async function play(page: Page, from: string, to: string) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

/** 1.e4 e5 2.Nf3 as White, through the product's own Add-to-repertoire flow. */
async function buildRepertoire(page: Page) {
  await page.goto('/analysis');
  await ready(page);
  await play(page, 'e2', 'e4');
  await play(page, 'e7', 'e5');
  await play(page, 'g1', 'f3');
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
  await page.getByLabel('Title').fill('Open games');
  await page.getByRole('button', { name: /Save \d+ position/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add to repertoire' })).toBeHidden();
}

/*
 * A club game with clocks: 90 minutes for 40 moves. White (the person) leaves
 * the repertoire at move 2 with Bc4 instead of Nf3, spends 4:12 on it, and
 * plays 3.Qh5, which 3…Nxh5 answers — the evaluation swing the review
 * suggester fires on.
 */
const GAME_PGN = `[Event "Club Open"]
[Site "?"]
[Date "2026.09.20"]
[Round "3"]
[White "Kurt, Metin"]
[Black "Rival, R"]
[Result "0-1"]
[TimeControl "40/5400:1800"]

1. e4 {[%clk 1:29:50]} e5 {[%clk 1:29:55]} 2. Bc4 {[%clk 1:25:38]} Nf6 {[%clk 1:29:40]}
3. Qh5 {[%clk 1:24:58]} Nxh5 {[%clk 1:29:30]} 0-1
`;

async function importGame(page: Page) {
  await page.goto('/games');
  await ready(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(GAME_PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();
}

const dock = (page: Page) => page.locator('[data-workspace-dock]');
const panel = (page: Page) => page.locator('[data-after-round]');

test('After the round reads the game and files one learning point', async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: { profile: { setAliases(aliases: string[]): Promise<unknown> } };
      }
    ).__kingfisher;
    await app.profile.setAliases(['kurt, metin']);
  });

  await buildRepertoire(page);
  await importGame(page);

  // Open the game on the board from the list.
  await page.getByRole('button', { name: 'Rival, R' }).first().click();
  await page.waitForURL(/\/analysis/);
  await selectTool(page, dock(page), 'After the round');

  const after = panel(page);
  await expect(after).toContainText('Kurt, Metin – Rival, R');
  await expect(after).toContainText('Club Open · Round 3 · 2026.09.20 · 0-1');
  // Identity: from the alias, matched the way the games index matches it.
  await expect(after.locator('[data-after-round-color="w"]')).toContainText(
    'White (from your profile)',
  );

  // Repertoire: the person left it, and the page says with what and for what.
  const repertoire = after.locator('[data-after-round-repertoire]');
  await expect(repertoire).toContainText('In repertoire for 1 move (Open games)');
  await expect(repertoire).toContainText('You left it: 2.Bc4; the repertoire has Nf3.');
  await expect(repertoire).not.toContainText('Your opponent left it');

  // Clock: the longest think is the deviation, timed from the 90-minute control.
  const clock = after.locator('[data-after-round-clock]');
  await expect(clock).toContainText('3 timed moves, 5:02 thinking');
  await expect(clock).toContainText('1:24:58 left at the end');
  await expect(clock).toContainText('(1:30:00 for 40)');
  await expect(clock).toContainText('4:12 on 2.Bc4');
  await expect(clock).toContainText('0:40 on 3.Qh5');
  await expect(clock).toContainText('0:10 on 1.e4');
  await expect(clock).not.toContainText('Under a third');
  // Clicking a think moves the board to that move.
  await clock.getByRole('button', { name: /4:12 on 2\.Bc4/ }).click();
  await expect(page.getByRole('grid', { name: 'Chessboard' }).first()).toBeVisible();

  // Engine: nothing yet, and the queue is one click away with this game chosen.
  const engine = after.locator('[data-after-round-engine]');
  await expect(engine).toContainText('No engine evidence for this game yet.');
  await engine.getByRole('button', { name: 'Queue this game' }).click();
  const queue = page.getByRole('dialog', { name: 'Add games to analysis queue' });
  await expect(queue).toBeVisible();
  await queue.getByLabel('Positions').selectOption('every-move');
  await queue.getByRole('button', { name: /Add 1 game/ }).click();
  // The dialog becomes the queue's own: start it, and leave it running.
  const running = page.getByRole('dialog', { name: 'Background analysis queue' });
  await expect(running).toBeVisible();
  await running.getByRole('button', { name: 'Start queue' }).click();
  await running.getByRole('button', { name: 'Close' }).first().click();
  await expect(running).toBeHidden();

  // The learning point, filed, then read back.
  const note = after.getByRole('textbox', { name: 'Learning point' });
  await expect(after.getByRole('button', { name: 'File in the journal' })).toBeDisabled();
  await note.fill('Four minutes on move two is the whole game.');
  await after.getByRole('button', { name: 'File in the journal' }).click();
  await expect(after.getByRole('button', { name: 'Update entry' })).toBeVisible();
  await expect(after.getByRole('button', { name: 'Update entry' })).toBeDisabled();

  // The background pass finishes and the page offers the review hand-off.
  await expect(engine).toContainText(/position(s)? evaluated/, { timeout: 120_000 });
  await engine.getByRole('button', { name: 'Send positions to review' }).click();
  await expect(page.getByText(/position(s)? sent to the review queue\./)).toBeVisible();
  await expect(engine).toContainText('in the review queue');

  await page.goto('/review');
  await ready(page);
  await page.getByRole('tab', { name: 'Rounds' }).click();
  const journal = page.locator('[data-rounds-journal]');
  await expect(journal).toContainText('Club Open');
  await expect(journal).toContainText('Kurt, Metin – Rival, R · R3 · 2026.09.20 · 0-1');
  await expect(journal).toContainText('Four minutes on move two is the whole game.');
  // The suggested position is in the queue with the game's name on it.
  await page.getByRole('tab', { name: 'Queue' }).click();
  await expect(
    page.getByRole('button', { name: /Kurt, Metin – Rival, R · move 2 Suggested because/ }),
  ).toBeVisible();

  // The entry opens its game.
  await page.getByRole('tab', { name: 'Rounds' }).click();
  await journal.getByRole('button', { name: 'Open game' }).click();
  await page.waitForURL(/\/analysis/);
  await selectTool(page, dock(page), 'After the round');
  await expect(panel(page).getByRole('textbox', { name: 'Learning point' })).toHaveValue(
    'Four minutes on move two is the whole game.',
  );
});

test('After the round asks which side you played when the profile cannot say', async ({ page }) => {
  await importGame(page);
  await page.getByRole('button', { name: 'Rival, R' }).first().click();
  await page.waitForURL(/\/analysis/);
  await selectTool(page, dock(page), 'After the round');
  const after = panel(page);
  await expect(after).toContainText(
    'Add your name exactly as this game spells it — “Kurt, Metin” or “Rival, R” — under Settings → Profile',
  );
  await expect(after).toContainText('Say which side you played first.');
  await after.getByRole('combobox', { name: 'Which side you played' }).selectOption('b');
  await expect(after).toContainText('No Black repertoire yet.');
  await expect(after.locator('[data-after-round-clock]')).toContainText('0:15 on 2…Nf6');
  await expect(after.locator('[data-after-round-clock]')).toContainText('1:29:30 left at the end');
});
