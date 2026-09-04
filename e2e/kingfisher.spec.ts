import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

const SAMPLE_PGN = `[Event "Kingfisher E2E"]
[Site "Local"]
[Date "2026.09.02"]
[Round "1"]
[White "Alpha"]
[Black "Beta"]
[Result "1-0"]
[WhiteElo "2400"]
[BlackElo "2350"]
[ECO "C50"]
[Opening "Italian Game"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`;

function watchConsole(page: Page): string[] {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      failures.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

async function waitForApp(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBe(dimensions.client);
}

/**
 * The board is present, square, and big enough to use.
 *
 * Measured inside a single poll rather than polled and then re-read. Routes
 * whose board depends on an asynchronous query — Repertoire selects a stored
 * position, Studies a chapter — mount it, resolve, and re-render, so a
 * `boundingBox()` taken in the gap between a passing poll and the next line
 * returns null for an element that is fine a millisecond later. That gap was
 * a real intermittent failure on Repertoire, and it was the measurement that
 * was unreliable rather than the board.
 */
async function expectSquareBoard(page: Page) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await expect(board).toBeVisible();
  await expect(board.getByRole('gridcell')).toHaveCount(64);

  await expect
    .poll(
      async () => {
        const box = await board.boundingBox();
        if (!box) return null;
        if (box.width <= 280) return null;
        if (Math.abs(box.width - box.height) >= 1) return null;
        return Math.round(box.width);
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
}

async function play(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

async function importFen(page: Page, fen: string) {
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(fen);
  await dialog.getByRole('button', { name: 'Load position' }).click();
  await expect(dialog).toBeHidden();
}

test('all major routes are reachable and mobile navigation stays usable', async ({ page }) => {
  const consoleFailures = watchConsole(page);
  await page.goto('/analysis');
  await waitForApp(page);

  const routes = [
    ['Openings', '/openings'],
    ['Games', '/games'],
    ['Preparation', '/preparation'],
    ['Databases', '/databases'],
    ['Repertoire', '/repertoire'],
    ['Studies', '/studies'],
    ['Training', '/training'],
    ['Analysis', '/analysis'],
  ] as const;

  for (const [label, path] of routes) {
    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: label })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expectNoHorizontalOverflow(page);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/analysis');
  await waitForApp(page);
  await expect(page.getByRole('navigation', { name: 'Primary mobile navigation' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Primary mobile navigation' })
    .getByRole('link', { name: 'Games' })
    .click();
  await expect(page).toHaveURL(/\/games$/);
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('link', { name: 'Training' })
    .click();
  await expect(page).toHaveURL(/\/training$/);
  await expectNoHorizontalOverflow(page);
  expect(consoleFailures).toEqual([]);
});

test('analysis, games, repertoire and explorer share a working position', async ({ page }) => {
  const consoleFailures = watchConsole(page);
  await page.goto('/analysis');
  await waitForApp(page);
  await expectSquareBoard(page);
  await play(page, 'e2', 'e4');

  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
  await page.getByLabel('Title').fill('E2E Repertoire');
  await page.getByRole('button', { name: /Save 1 position/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add to repertoire' })).toBeHidden();

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Repertoire' })
    .click();
  await expectSquareBoard(page);
  await expect(page.getByRole('complementary', { name: 'Workspace tools' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Explorer' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Engine' })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Games' })
    .click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Import a game or position' })
    .getByRole('textbox')
    .fill(SAMPLE_PGN);
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByRole('dialog', { name: 'Import a game or position' })).toBeHidden();
  await page.getByRole('textbox', { name: 'Search games' }).fill('Alpha');
  await expect(page.getByRole('button', { name: 'Alpha' })).toBeVisible();
  await page.getByRole('button', { name: 'Alpha' }).click();
  await expect(page).toHaveURL(/\/analysis$/);
  await expectSquareBoard(page);

  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Explorer');
  await page.getByLabel('Evidence source').selectOption('local-collection');
  await expect(page.getByText(/My games.*game[s]? here/)).toBeVisible();
  expect(consoleFailures).toEqual([]);
});

test('a study chapter supports moves, variations, analysis tools and durable annotations', async ({
  page,
}) => {
  const consoleFailures = watchConsole(page);
  await page.goto('/studies');
  await waitForApp(page);
  await page.getByRole('button', { name: 'New study' }).click();
  await page.getByRole('dialog', { name: 'New study' }).getByLabel('Title').fill('E2E Study');
  await page.getByRole('button', { name: 'Create study' }).click();
  await page.getByRole('button', { name: 'New chapter' }).click();
  await page.getByRole('dialog', { name: 'New chapter' }).getByLabel('Title').fill('Main line');
  await page.getByRole('button', { name: 'Create chapter' }).click();

  await expectSquareBoard(page);
  await play(page, 'e2', 'e4');
  await play(page, 'd7', 'd5');
  await page.getByRole('button', { name: 'e4' }).click();
  await play(page, 'e7', 'e5');
  await page.getByRole('button', { name: 'd5' }).click();

  const board = page.getByRole('grid', { name: 'Chessboard' });
  const box = await board.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.56);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.43);
    await page.mouse.up({ button: 'right' });
  }
  await expect(page.locator('[data-board-shapes]')).toHaveAttribute('data-shape-count', '1');

  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Engine');
  await page.getByRole('button', { name: 'Start analysis (E)' }).click();
  await expect(page.getByRole('button', { name: 'Stop analysis (E)' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop analysis (E)' }).click();

  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Explorer');
  await page.getByLabel('Evidence source').selectOption('local-collection');
  await expect(page.getByText('No games reach this position.')).toBeVisible();
  // Database is not pinned by default, so it is reached through More.
  await page
    .getByRole('complementary', { name: 'Workspace tools' })
    .getByRole('button', { name: /More/ })
    .click();
  await page.getByRole('menuitem', { name: 'Database' }).click();
  await expect(page.getByText('Database at this position')).toBeVisible();

  await page.waitForTimeout(800);
  await page.reload();
  await waitForApp(page);
  await page.getByRole('button', { name: 'e4' }).click();
  await page.getByRole('button', { name: 'd5' }).click();
  await expect(page.locator('[data-board-shapes]')).toHaveAttribute('data-shape-count', '1');
  expect(consoleFailures).toEqual([]);
});

test('canonical board handles special positions, orientation and every external piece set', async ({
  page,
}) => {
  const consoleFailures = watchConsole(page);
  await page.goto('/analysis');
  await waitForApp(page);

  await importFen(page, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  await play(page, 'e1', 'g1');
  await expect(page.getByRole('gridcell', { name: 'g1, White king' })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'f1, White rook' })).toBeVisible();

  await importFen(page, '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  await play(page, 'e5', 'd6');
  await expect(page.getByRole('gridcell', { name: 'd6, White pawn' })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'd5, empty' })).toBeVisible();

  await importFen(page, 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1');
  await play(page, 'e7', 'e8');
  await page.getByRole('button', { name: 'Promote to queen' }).click();
  await expect(page.getByRole('gridcell', { name: 'e8, White queen' })).toBeVisible();

  await importFen(page, '4k3/8/8/8/8/8/4R3/4K3 b - - 0 1');
  await expect(
    page.getByRole('gridcell', { name: 'e8, Black king' }).locator('[style*="--square-check"]'),
  ).toBeVisible();
  await importFen(page, '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
  await expect(
    page.getByRole('gridcell', { name: 'h8, Black king' }).locator('[style*="--square-check"]'),
  ).toBeVisible();

  const firstSquare = page.getByRole('grid', { name: 'Chessboard' }).getByRole('gridcell').first();
  const beforeFlip = await firstSquare.getAttribute('aria-label');
  expect(beforeFlip).toMatch(/^(a8|h1),/);
  await page.getByRole('button', { name: 'Flip board (F)' }).click();
  await expect(firstSquare).toHaveAccessibleName(beforeFlip?.startsWith('a8') ? /^h1,/ : /^a8,/);

  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Pieces' }).click();
  for (const set of ['Cburnett', 'Merida', 'Chessnut', 'Fantasy', 'Spatial']) {
    await settings.getByRole('button', { name: new RegExp(`^${set}`) }).click();
    await expect(
      page.locator(`[data-chessboard] img[src*="/piece/${set.toLowerCase()}/"]`).first(),
    ).toBeVisible();
  }
  await settings.getByRole('button', { name: 'Close' }).click();
  await expectSquareBoard(page);
  expect(consoleFailures).toEqual([]);
});

test('training conceals analysis evidence until the answer is revealed', async ({ page }) => {
  const consoleFailures = watchConsole(page);
  await page.goto('/analysis');
  await waitForApp(page);
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Create training position…' }).click();
  const create = page.getByRole('dialog', { name: 'Create training position' });
  const answerBoard = create.getByRole('grid', { name: 'Chessboard' });
  await answerBoard.getByRole('gridcell', { name: /^e2,/ }).click();
  await answerBoard.getByRole('gridcell', { name: /^e4,/ }).click();
  await create.getByRole('button', { name: 'Create item' }).click();
  await expect(create).toBeHidden();

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Training' })
    .click();
  await expect(page.getByText('Play the prepared move.').first()).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Workspace tools' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show answer' }).click();
  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  await expect(dock).toBeVisible();
  await expect(dock.getByRole('tab', { name: 'Engine' })).toBeVisible();
  await expect(dock.getByRole('tab', { name: 'Explorer' })).toBeVisible();
  /*
    Phase 10 stopped rendering every tool as an equally weighted tab: the
    pinned ones are in the strip and the rest are one click away under More.
    What matters is still that the evidence is *reachable* once the answer has
    been shown, which is what this asserts.
  */
  await dock.getByRole('button', { name: /More/ }).click();
  await page.getByRole('menuitem', { name: 'Database' }).click();
  await expect(dock.getByRole('tab', { name: 'Database' })).toBeVisible();
  expect(consoleFailures).toEqual([]);
});

test('analysis remains square and overflow-free across the required viewport matrix', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleFailures = watchConsole(page);
  const viewports = [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1280, 720],
    [1280, 800],
    [1366, 768],
    [1440, 900],
    [1728, 1117],
    [1920, 1080],
    [2560, 1440],
  ] as const;

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto('/analysis');
    await waitForApp(page);
    await expectNoHorizontalOverflow(page);
    const box = await page.getByRole('grid', { name: 'Chessboard' }).boundingBox();
    expect(box, `${width}x${height} board`).not.toBeNull();
    expect(
      Math.abs((box?.width ?? 0) - (box?.height ?? 0)),
      `${width}x${height} square`,
    ).toBeLessThan(1);
    expect(box?.width ?? 0, `${width}x${height} visible`).toBeGreaterThan(200);
  }
  expect(consoleFailures).toEqual([]);
});

test('authenticated Lichess explorer contract and appearance preferences work without real secrets', async ({
  page,
}) => {
  const consoleFailures = watchConsole(page);
  const authHeaders: string[] = [];
  await page.route('https://lichess.org/api/account', async (route) => {
    authHeaders.push(route.request().headers().authorization ?? '');
    await route.fulfill({ json: { id: 'e2e-user', username: 'E2EUser' } });
  });
  await page.route('https://explorer.lichess.org/**', async (route) => {
    authHeaders.push(route.request().headers().authorization ?? '');
    await route.fulfill({
      json: {
        white: 12,
        draws: 5,
        black: 3,
        moves: [
          {
            uci: 'e2e4',
            san: 'e4',
            white: 8,
            draws: 3,
            black: 1,
            averageRating: 2520,
            opening: { eco: 'B00', name: "King's Pawn" },
          },
        ],
        topGames: [],
      },
    });
  });

  await page.goto('/analysis');
  await waitForApp(page);
  await expect(page.getByRole('button', { name: 'Dark theme' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings ⌘,' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  let settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Accounts' }).click();
  // The personal token is the advanced path now; the front door is the PKCE
  // button, which needs a real consent screen and so is not driven here.
  await settings.getByRole('button', { name: /personal access token/ }).click();
  await settings.getByLabel('Lichess personal access token').fill('e2e-token');
  await settings.getByRole('button', { name: 'Test connection' }).click();
  await expect(settings.getByText('Connected as E2EUser')).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Openings' })
    .click();
  // Openings opens on the library now; the board and its dock are the other mode.
  await page.getByRole('button', { name: 'Explorer', exact: true }).first().click();
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Explorer');
  await page.getByLabel('Evidence source').selectOption('lichess-masters');
  await expect(page.getByRole('button', { name: 'e4', exact: true })).toBeVisible();
  expect(authHeaders).not.toHaveLength(0);
  expect(authHeaders.every((header) => header === 'Bearer e2e-token')).toBe(true);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Board', exact: true }).click();
  await settings.getByRole('button', { name: 'Tournament Blue' }).click();
  await settings.getByRole('tab', { name: 'Pieces' }).click();
  await settings.getByRole('button', { name: /Merida/ }).click();
  await settings.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await waitForApp(page);
  await expect(page.locator('[data-chessboard]')).toHaveAttribute(
    'style',
    /--square-dark: #7a95b3/,
  );
  await expect(page.locator('img[src*="/piece/merida/"]').first()).toBeVisible();
  expect(consoleFailures).toEqual([]);
});

test('a failing explorer source offers the local one instead of loading forever', async ({
  page,
  context,
}) => {
  const consoleFailures = watchConsole(page);
  await page.goto('/openings');
  await waitForApp(page);
  // Openings opens on the library; the explorer is the other mode.
  await page.getByRole('button', { name: 'Explorer', exact: true }).first().click();

  // The browser reporting itself offline is the condition that used to strand
  // the panel: with TanStack's default network mode a failed query parks in
  // `fetchStatus: 'paused'` while `status` stays `pending`, which renders as
  // "Reading …" that never resolves. `offlineFirst` does not fix it either —
  // it exempts only the first attempt and still pauses the retry. Kingfisher
  // is local-first and must report the real failure regardless.
  await context.setOffline(true);

  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  await selectTool(page, dock, 'Explorer');
  await page.getByLabel('Evidence source').selectOption('lichess-masters');

  /*
    The panel no longer merely explains the failure: there is always a source
    on this machine that can answer, so it names the one that failed and offers
    the local one. Offering rather than switching is the point — evidence must
    not change population without the user saying so.
  */
  const fallback = page.locator('[data-source-fallback]');
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText(/could not answer/);
  await expect(page.getByText(/Reading Masters/)).toHaveCount(0);
  await expect(page.getByLabel('Evidence source')).toHaveValue('lichess-masters');

  await fallback.getByRole('button', { name: /^Show / }).click();
  await expect(page.getByLabel('Evidence source')).not.toHaveValue('lichess-masters');

  // IndexedDB has no opinion about the network, so a local source still answers.
  await page.getByLabel('Evidence source').selectOption('local-collection');
  await expect(page.getByText('No games reach this position.')).toBeVisible();

  await context.setOffline(false);
  expect(consoleFailures).toEqual([]);
});
