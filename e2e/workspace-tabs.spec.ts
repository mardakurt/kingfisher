/**
 * Phase 83: working tabs, the Library and the preparation report, driven as a
 * person drives them. See docs/design/workspace-tabs.md.
 */

import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
}

const strip = (page: Page) => page.getByRole('tablist', { name: 'Workspace tabs' });
const tabs = (page: Page) => strip(page).getByRole('tab');

/**
 * Enters a tab and waits for the switch to finish, not merely to show.
 *
 * Entering a tab restores its fields at once, then pushes its address and
 * writes the page's draft, and only then removes the entered tab's own copy.
 * A reload in between is what `enter` warns about: the page's draft still
 * describes the other tab. And Firefox, as the HTML standard says, aborts a
 * pending reload when the router's pushState lands (`NS_BINDING_ABORTED`).
 * Done means the page's draft was written after the click and only the tab
 * that was left still has a copy of its own.
 */
async function enterTab(page: Page, index: number) {
  const since = await page.evaluate(() => Date.now());
  await tabs(page).nth(index).click();
  await expect(tabs(page).nth(index)).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(() =>
      page.evaluate(async (after) => {
        const app = (globalThis as typeof globalThis & { __kingfisher: AppRepositories })
          .__kingfisher;
        const [active, copies] = await Promise.all([app.drafts.get(), app.drafts.listTabs()]);
        return (active?.updatedAt ?? 0) >= after && copies.length === 1;
      }, since),
    )
    .toBe(true);
}

async function play(page: Page, from: string, to: string) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

const GAMES = [
  `[Event "Norway Chess"]
[Date "2025.05.30"]
[White "Opponent, O"]
[Black "Second, S"]
[Result "1-0"]
[WhiteElo "2700"]
[BlackElo "2650"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`,
  `[Event "Titled Tuesday"]
[Date "2025.04.01"]
[White "Third, T"]
[Black "Opponent, O"]
[Result "1/2-1/2"]

1. d4 Nf6 2. c4 e6 1/2-1/2`,
  `[Event "Club Open"]
[Date "2024.02.01"]
[White "Opponent, O"]
[Black "Fourth, F"]
[Result "0-1"]

1. e4 c5 2. Nf3 d6 0-1`,
];

async function seed(page: Page) {
  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(async (games) => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.games.clear();
    for (const pgn of games) await app.importGames(pgn, app.games);
  }, GAMES);
}

test.describe('workspace tabs', () => {
  test('a half-typed search is where it was left when its tab is entered again', async ({
    page,
  }) => {
    await page.goto('/players');
    await ready(page);
    const search = page
      .getByRole('searchbox', { name: 'Search players' })
      .or(page.getByRole('textbox', { name: 'Search players' }));
    await search.fill('Capabl');

    await page.getByRole('button', { name: 'New tab' }).click();
    await expect(tabs(page)).toHaveCount(2);
    // A new tab opens on a board; go on from there, as a person would.
    await expect(page).toHaveURL(/\/analysis/);
    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Players', exact: true })
      .click();
    await expect(page).toHaveURL(/\/players/);
    // The other tab's text is the other tab's: this one starts empty.
    await expect(search).toHaveValue('');

    // Both tabs are on Players: entering the other one is already at its
    // address, so it must not navigate. A navigation there fetched the page
    // from the server for nothing, and Firefox aborted a reload that raced
    // its late history write (NS_BINDING_ABORTED, the matrix's last failure).
    const navigations: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('_rsc=')) navigations.push(request.url());
    });
    await enterTab(page, 0);
    await expect(page).toHaveURL(/\/players/);
    await expect(search).toHaveValue('Capabl');
    await page.waitForTimeout(1_000);
    expect(navigations).toEqual([]);

    // And a reload of the window keeps it, as it keeps the tabs.
    await page.reload();
    await ready(page);
    await expect(search).toHaveValue('Capabl');
  });

  test('each tab keeps its own board and place, across a switch and a reload', async ({ page }) => {
    await page.goto('/analysis');
    await ready(page);
    await expect(tabs(page)).toHaveCount(1);

    await play(page, 'd2', 'd4');
    await expect(page.locator('[data-move-tree]').first()).toContainText('d4');

    await page.getByRole('button', { name: 'New tab' }).click();
    await expect(tabs(page)).toHaveCount(2);
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    // A new tab is a fresh board, not a view of the first tab's work.
    await expect(page.locator('[data-move-tree]').first()).not.toContainText('d4');

    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Library', exact: true })
      .click();
    await expect(page).toHaveURL(/\/games/);
    await expect(tabs(page).nth(1)).toContainText('Library');

    await enterTab(page, 0);
    await expect(page).toHaveURL(/\/analysis/);
    await expect(page.locator('[data-move-tree]').first()).toContainText('d4');

    await page.reload();
    await ready(page);
    await expect(tabs(page)).toHaveCount(2);
    await tabs(page).nth(1).click();
    await expect(page).toHaveURL(/\/games/);
    await tabs(page).nth(0).click();
    await expect(page.locator('[data-move-tree]').first()).toContainText('d4');
  });

  test('closing a tab that holds unsaved analysis asks first', async ({ page }) => {
    await page.goto('/analysis');
    await ready(page);
    await page.getByRole('button', { name: 'New tab' }).click();
    await expect(tabs(page)).toHaveCount(2);
    await play(page, 'e2', 'e4');

    await strip(page)
      .getByRole('button', { name: /^Close / })
      .last()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Close this tab?' });
    await expect(dialog).toContainText('not been saved to a study');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(tabs(page)).toHaveCount(2);

    await strip(page)
      .getByRole('button', { name: /^Close / })
      .last()
      .click();
    await page
      .getByRole('dialog', { name: 'Close this tab?' })
      .getByRole('button', { name: 'Close tab' })
      .click();
    await expect(tabs(page)).toHaveCount(1);
  });
});

test.describe('the Library', () => {
  test('a row previews its game, and filters are chips that remove themselves', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(page);
    await page.goto('/games');
    await ready(page);

    const rows = page.locator('[data-library-row]');
    await expect(rows).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Select a game' })).toBeVisible();

    // A click anywhere but the names previews; the names open the game.
    await rows.filter({ hasText: 'Fourth, F' }).locator('td').last().click();
    const preview = page.locator('[data-library-preview]');
    await expect(preview).toContainText('Club Open');
    await expect(preview.getByRole('button', { name: 'd6' })).toBeVisible();

    await page.getByRole('button', { name: /^Filters/ }).click();
    await page
      .getByRole('radiogroup', { name: 'Result' })
      .getByRole('radio', { name: '½-½' })
      .click();
    await expect(rows).toHaveCount(1);
    await expect(page.locator('[data-filter-chip]')).toContainText('½-½');

    await page.getByRole('button', { name: 'Remove Result filter' }).click();
    await expect(rows).toHaveCount(3);

    // The search survives in the address, so a tab that is left keeps it.
    await page.getByRole('searchbox', { name: 'Search games' }).fill('Titled');
    await expect(rows).toHaveCount(1);
    await expect(page).toHaveURL(/q=Titled/);

    await rows.first().dblclick();
    await expect(page).toHaveURL(/\/analysis/);
  });
});

test.describe('the preparation report', () => {
  test('reads a player as a record, openings, games and measured style', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(page);
    await page.goto('/preparation');
    await ready(page);
    await page.getByLabel('Player name').fill('Opponent, O');
    await page.locator('[data-opponent-search]').getByRole('button', { name: 'Prepare' }).click();

    const card = page.locator('[data-player-card]');
    await expect(card).toContainText('Opponent, O');
    // One win, one draw, one loss: the ring and its legend say the same thing.
    await expect(card.locator('[data-score-ring]')).toContainText('50%');
    await expect(tabs(page).first()).toContainText('Preparation against Opponent, O');

    const report = page.getByRole('tablist', { name: 'Report' });
    await report.getByRole('tab', { name: 'Games' }).click();
    await expect(page.locator('[data-preparation-games] tbody tr')).toHaveCount(3);

    await report.getByRole('tab', { name: 'Style' }).click();
    const style = page.locator('[data-style-report]');
    await expect(style).toContainText('Scores 50% as White (2 games) and 50% as Black (1)');
    await expect(style).not.toContainText(/aggressive|positional/i);
  });
});
