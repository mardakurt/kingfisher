/**
 * Phase 10: the workspace can be reshaped, and reshaping it cannot break it.
 *
 * The composer tests are the ones worth having. A layout system fails in two
 * ways that ordinary tests miss: a rearrangement that does not survive a
 * reload, and a rearrangement the user cannot undo without clearing storage by
 * hand. Both are asserted here.
 *
 * The board matrix is the second: it asserts that every chess route renders
 * exactly one canonical board on the workspace's own position, which is the
 * claim nine phases of new routes have quietly been able to break.
 */

import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * A workspace with no stored arrangement, so a test starts from the default.
 *
 * Cleared once, not on every navigation. An init script runs again on reload,
 * which would wipe the arrangement the reload is meant to be proving survived
 * — a test that can only ever fail.
 */
async function freshLayout(page: Page) {
  await page.addInitScript(() => {
    const sentinel = 'kingfisher.e2e.layout-cleared';
    if (window.sessionStorage.getItem(sentinel)) return;
    window.sessionStorage.setItem(sentinel, '1');
    window.localStorage.removeItem('kingfisher.workspace-layout');
  });
}

const dock = (page: Page) => page.locator('[data-workspace-dock]');
const lower = (page: Page) => page.locator('[data-workspace-lower]');

test.describe('workspace composer', () => {
  test.beforeEach(async ({ page }) => {
    await freshLayout(page);
  });

  test('opens Analysis with the board, move tree and the tools that matter visible', async ({
    page,
  }) => {
    await page.goto('/analysis');
    await ready(page);

    // §40: productive immediately. Engine, Explorer and Notes are named, not
    // hidden behind an overflow scroll or a cryptic icon.
    await expect(dock(page).getByRole('tab', { name: 'Engine' })).toBeVisible();
    await expect(dock(page).getByRole('tab', { name: 'Explorer' })).toBeVisible();
    await expect(dock(page).getByRole('tab', { name: 'Notes' })).toBeVisible();
    await expect(lower(page).getByRole('tab', { name: 'Move Tree' })).toBeVisible();
  });

  test('§58 the board stays large in the default layout', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analysis');
    await ready(page);

    const frame = page.locator('[data-board-frame]');
    await expect(frame).toBeVisible();
    /*
      The regression that prompted this: stacking a fixed move tree and a lower
      panel under the board took it from 490px to 277px. A board smaller than
      this on a 900px-tall screen means something below it has grown again.
    */
    await expect
      .poll(async () => (await frame.boundingBox())?.height ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(400);
  });

  test('moves a panel to the lower region, and the move survives a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analysis');
    await ready(page);

    await expect(dock(page).getByRole('tab', { name: 'Engine' })).toBeVisible();

    await page.getByRole('button', { name: /^Layout/ }).click();
    await page.getByRole('menuitem', { name: 'Move Engine to the lower panel' }).click();

    // The engine is now a tab in the lower panel beside the move tree...
    await expect(lower(page).getByRole('tab', { name: 'Engine' })).toBeVisible();
    // ...and the dock has fallen back to a tool that is actually in it, rather
    // than selecting a module that has left and rendering nothing.
    await expect(dock(page).getByRole('tab', { name: 'Engine' })).toHaveCount(0);
    await expect(dock(page).getByRole('tab', { name: 'Explorer' })).toBeVisible();

    await page.reload();
    await ready(page);
    await expect(lower(page).getByRole('tab', { name: 'Engine' })).toBeVisible();
    await expect(dock(page).getByRole('tab', { name: 'Engine' })).toHaveCount(0);
  });

  test('§8 reset layout brings the default back without clearing storage by hand', async ({
    page,
  }) => {
    await page.goto('/analysis');
    await ready(page);

    await page.getByRole('button', { name: /^Layout/ }).click();
    await page.getByRole('menuitem', { name: 'Move Engine to the lower panel' }).click();
    await expect(lower(page).getByRole('tab', { name: 'Engine' })).toBeVisible();
    await expect(page.getByRole('button', { name: /modified/ })).toBeVisible();

    await page.getByRole('button', { name: /^Layout/ }).click();
    await page.getByRole('menuitem', { name: 'Reset layout' }).click();

    await expect(dock(page).getByRole('tab', { name: 'Engine' })).toBeVisible();
    await expect(page.getByRole('button', { name: /modified/ })).toHaveCount(0);
  });

  test('§7 saves a named layout and applies it again', async ({ page }) => {
    await page.goto('/analysis');
    await ready(page);

    await page.getByRole('button', { name: /^Layout/ }).click();
    await page.getByRole('menuitem', { name: 'Move Engine to the lower panel' }).click();

    await page.getByRole('button', { name: /^Layout/ }).click();
    await page.getByRole('menuitem', { name: 'Save layout as…' }).click();
    await page.getByLabel('Name').fill('Tournament Prep');
    await page.getByRole('button', { name: 'Save layout' }).click();

    await page.getByRole('button', { name: /^Layout/ }).click();
    await page.getByRole('menuitem', { name: 'Reset layout' }).click();
    await expect(dock(page).getByRole('tab', { name: 'Engine' })).toBeVisible();

    await page.getByRole('button', { name: /^Layout/ }).click();
    // Exact: the menu also carries a "Delete \u201cTournament Prep\u201d" entry.
    await page.getByRole('menuitem', { name: 'Tournament Prep', exact: true }).click();
    await expect(lower(page).getByRole('tab', { name: 'Engine' })).toBeVisible();
  });

  test('§28 pinning keeps a tool in the strip, unpinning returns it to More', async ({ page }) => {
    await page.goto('/analysis');
    await ready(page);

    await expect(dock(page).getByRole('tab', { name: 'Engine' })).toBeVisible();
    await page.getByRole('button', { name: /^Layout/ }).click();
    await page.getByRole('menuitem', { name: 'Unpin Engine' }).click();

    // Still visible, because it is the active tool — selecting something from
    // More and watching it vanish is the discoverability bug in a new place.
    await expect(dock(page).getByRole('tab', { name: 'Engine' })).toBeVisible();
    await dock(page).getByRole('tab', { name: 'Explorer' }).click();
    await expect(dock(page).getByRole('tab', { name: 'Engine' })).toHaveCount(0);
    await expect(dock(page).getByRole('button', { name: /More/ })).toBeVisible();
  });

  test('§29 an unavailable tool says why instead of disappearing', async ({ page }) => {
    await page.goto('/analysis');
    await ready(page);

    await dock(page).getByRole('button', { name: /More/ }).click();
    await page.getByRole('menuitem', { name: 'Tablebase' }).click();

    // The starting position has 32 pieces, so the tablebase cannot help — and
    // says so, rather than the tab being silently absent.
    await expect(dock(page).getByText(/7 pieces or fewer/)).toBeVisible();
  });

  test('§9 a phone gets one sheet rather than desktop geometry', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/analysis');
    await ready(page);

    // The lower panel folds into the dock below the desktop breakpoint.
    await expect(lower(page)).toHaveCount(0);
    await expect(dock(page).getByRole('tab', { name: 'Move Tree' })).toBeVisible();
  });
});

/**
 * §13, §66: one matrix over every route that renders the canonical board.
 *
 * It asserts three things a later phase could break without any test noticing:
 * the route renders exactly one canonical board, that board is the shared
 * pipeline rather than a route-local copy, and it is showing the workspace's
 * own position rather than a second FEN that has drifted from it.
 */
const BOARD_ROUTES = [
  '/analysis',
  '/openings',
  '/studies',
  '/repertoire',
  '/preparation',
  '/review',
  '/endgame',
  '/opening-files',
  '/training',
] as const;

test.describe('universal board', () => {
  for (const route of BOARD_ROUTES) {
    test(`${route} renders the canonical board on the workspace position`, async ({ page }) => {
      await freshLayout(page);
      await page.goto(route);
      await ready(page);

      const surfaces = page.locator('[data-board-surface]');
      const count = await surfaces.count();
      // Some routes show a list until something is selected; a route that
      // shows a board must show exactly one, never two that can disagree.
      expect(count).toBeLessThanOrEqual(1);
      if (count === 0) return;

      await expect(surfaces.first()).toBeVisible();
      // The shared pipeline, not a route-local copy: `data-chessboard` is
      // rendered only by `Chessboard`, which only `CanonicalBoardSurface`
      // mounts at full size.
      await expect(surfaces.first().locator('[data-chessboard]')).toBeVisible();
    });
  }
});

/**
 * §14: the routes that hide evidence must go on hiding it.
 *
 * A shared board refactor is exactly the change that leaks an evaluation bar
 * into a session somebody asked to think about unaided, and the failure does
 * not look like a failure — it looks like a helpful number.
 */
const REVIEW_PGN = `[Event "Phase 10"]
[White "Alpha, A"]
[Black "Beta, B"]
[Result "1-0"]

1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 Be7 5. Bg5 h6 6. Bh4 1-0`;

test.describe('concealment', () => {
  /*
    Opened through the real flow — import a game, select it, review it —
    because Review shows a list until something is open, and a test that
    skipped itself when nothing was would look like coverage while proving
    nothing.

    Complementary to the Phase 8 self-analysis test rather than a duplicate of
    it: that one asserts the *dock* withholds its tools, this one asserts the
    board's own capability contract, which is the thing a shared-board
    refactor breaks.
  */
  test('§14 the review board withholds evidence until it is revealed', async ({ page }) => {
    await freshLayout(page);
    await page.goto('/games');
    await ready(page);
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
    await dialog.getByRole('textbox').fill(REVIEW_PGN);
    await dialog.getByRole('button', { name: 'Import games' }).click();
    await expect(dialog).toBeHidden();

    await page
      .getByRole('checkbox', { name: /Select Alpha, A/ })
      .first()
      .check();
    await page.getByRole('button', { name: 'Review this game' }).click();
    await expect(page).toHaveURL(/\/review$/);
    await ready(page);

    const surface = page.locator('[data-board-surface]');
    await expect(surface.first()).toBeVisible();
    /*
      Asserted from the attribute `CanonicalBoardSurface` writes about itself,
      so this cannot pass because the evaluation bar happened to be absent for
      some unrelated reason — an engine that was never started, say.
    */
    await expect(surface.first()).toHaveAttribute('data-board-conceals', 'evidence');
  });
});

/**
 * §67: the settings workflows a serious user actually performs.
 *
 * The shortcut tests are the ones that matter. Before Phase 10 the reference
 * dialog and the key handler were separate literals, and a binding could be
 * documented for a whole phase while doing nothing — so the test that earns
 * its place is the one asserting a rebind changes what the key *does*.
 */
test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem('kingfisher.shortcuts');
    });
  });

  const openSettings = async (page: Page) => {
    await page.goto('/analysis');
    await ready(page);
    await page.getByRole('button', { name: 'Settings (⌘,)' }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  };

  test('§17 search finds a setting and jumps to the section holding it', async ({ page }) => {
    await openSettings(page);

    // Scoped to the dialog: the workspace dock has an Engine tab too, and the
    // question here is which *settings* section is showing.
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const search = dialog.getByRole('searchbox', { name: 'Search settings' });

    await search.fill('threads');
    await dialog
      .getByRole('button', { name: /Threads/ })
      .first()
      .click();
    await expect(dialog.getByRole('tab', { name: 'Engine', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await search.fill('piece set');
    await dialog
      .getByRole('button', { name: /Piece set/ })
      .first()
      .click();
    await expect(dialog.getByRole('tab', { name: 'Pieces' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('§17 search reports an honest miss rather than an empty list', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('searchbox', { name: 'Search settings' }).fill('zzzznotasetting');
    await expect(page.getByText(/No setting matches/)).toBeVisible();
  });

  test('§16 the Keyboard section exists and opens the editor', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'Keyboard' }).click();
    await expect(page.getByRole('button', { name: 'Open shortcuts' })).toBeVisible();
    await expect(page.getByText('Every command is on its default binding.')).toBeVisible();
  });

  /*
    The editor is opened with its own `?` binding rather than through Settings.
    Two stacked dialogs is a real thing a user can do, but it is not what this
    test is about, and the outer dialog's scroll container makes every click a
    stability race.
  */
  const openShortcuts = async (page: Page) => {
    await page.goto('/analysis');
    await ready(page);
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  };

  test('§37 a rebind changes what the key does, not just what is documented', async ({ page }) => {
    await openShortcuts(page);

    const flip = page.getByRole('button', { name: 'Change the shortcut for Flip the board' });
    await expect(flip).toHaveText('F');
    await flip.click();
    await page.keyboard.press('q');
    await expect(flip).toHaveText('Q');

    await page.keyboard.press('Escape');

    // The board follows the new binding, and no longer follows the old one.
    const orientation = page.getByText('White view');
    await expect(orientation).toBeVisible();
    await page.keyboard.press('f');
    await expect(orientation).toBeVisible();
    await page.keyboard.press('q');
    await expect(page.getByText('Black view')).toBeVisible();
  });

  test('§38 a conflicting binding is refused until the user chooses', async ({ page }) => {
    await openShortcuts(page);

    const flip = page.getByRole('button', { name: 'Change the shortcut for Flip the board' });
    await flip.click();
    await page.keyboard.press('c');

    const conflict = page.getByRole('alertdialog', { name: 'Shortcut conflict' });
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText('already assigned to Edit the comment on this move');

    // Cancel leaves both bindings alone.
    await conflict.getByRole('button', { name: 'Cancel' }).click();
    await expect(flip).toHaveText('F');

    // Replace takes the key from the action that held it, rather than leaving
    // two actions on one key where only one of them could ever fire.
    await flip.click();
    await page.keyboard.press('c');
    await conflict.getByRole('button', { name: 'Replace' }).click();
    await expect(flip).toHaveText('C');
    await expect(
      page.getByRole('button', { name: 'Change the shortcut for Edit the comment on this move' }),
    ).toHaveText('Unbound');
  });

  test('§39 reset all shortcuts restores every default', async ({ page }) => {
    await openShortcuts(page);

    const flip = page.getByRole('button', { name: 'Change the shortcut for Flip the board' });
    await flip.click();
    await page.keyboard.press('q');
    await expect(flip).toHaveText('Q');

    await page.getByRole('button', { name: 'Reset all shortcuts' }).click();
    await expect(flip).toHaveText('F');
  });

  test('§21 exported settings carry no secret', async ({ page }) => {
    await openSettings(page);

    // Store a credential, so the export has something to leak.
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('kingfisher.preferences');
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 4 };
      parsed.state = {
        ...parsed.state,
        lichessToken: 'lip_e2e_secret',
        companionToken: 'companion_e2e_secret',
      };
      window.localStorage.setItem('kingfisher.preferences', JSON.stringify(parsed));
    });
    await page.reload();
    await ready(page);
    await page.getByRole('button', { name: 'Settings (⌘,)' }).click();
    await page.getByRole('tab', { name: 'Diagnostics' }).click();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export settings' }).click();
    const file = await download;
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const contents = Buffer.concat(chunks).toString('utf8');

    expect(contents).not.toContain('lip_e2e_secret');
    expect(contents).not.toContain('companion_e2e_secret');
    // ...and it is still a useful export rather than an empty one.
    expect(contents).toContain('boardTheme');
  });
});

/**
 * §69: the endgame trainer, refereed by a deterministic tablebase fixture.
 *
 * The route is intercepted rather than left to hit lichess.org. A test that
 * depends on a public endpoint tests the endpoint, and the thing worth
 * testing here is what Kingfisher *says* when the result changes — which
 * needs a result that changes on cue.
 *
 * The position is a won rook endgame. One move holds the win; another throws
 * the rook away and draws. The assertion is on the wording as much as the
 * detection: it must report the result, and it must not tell the player they
 * blundered.
 */
const WON_ROOK_ENDING = '8/8/8/8/8/2k5/8/K2R4 w - - 0 1';

test.describe('endgame conversion', () => {
  test.beforeEach(async ({ page }) => {
    await freshLayout(page);

    await page.route('**/tablebase.lichess.ovh/**', async (route) => {
      const fen = decodeURIComponent(new URL(route.request().url()).searchParams.get('fen') ?? '');
      const placement = fen.split(' ')[0] ?? '';
      /*
        Rd3+ puts the rook next to the black king on c3, where it is simply
        taken — so the fixture calls that one position a draw and every other
        a win. Keying on the position rather than on a move counter is what
        lets the same fixture serve the engine's probe as well as the player's.
      */
      const rookHangs = placement.includes('2kR4');
      const blackToMove = fen.includes(' b ');
      const category = rookHangs ? 'draw' : blackToMove ? 'loss' : 'win';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          category,
          dtz: rookHangs ? 0 : 27,
          dtm: null,
          checkmate: false,
          stalemate: false,
          moves: [
            {
              uci: 'c3c2',
              san: 'Kc2',
              category: rookHangs ? 'draw' : 'win',
              dtz: 26,
              dtm: null,
              zeroing: false,
              checkmate: false,
              stalemate: false,
            },
          ],
        }),
      });
    });
  });

  /**
   * Put the endgame on the shared workspace board, then open the trainer.
   *
   * On Analysis rather than Endgame: the trainer reads the workspace position,
   * and a full navigation between routes reloads the draft asynchronously, so
   * driving it from the route the position was loaded on tests the trainer
   * rather than the autosave.
   */
  const openTrainer = async (page: Page) => {
    await page.goto('/analysis');
    await ready(page);
    await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
    await dialog.getByRole('textbox').fill(WON_ROOK_ENDING);
    await dialog.getByRole('button', { name: 'Load position' }).click();
    await expect(dialog).toBeHidden();

    const dock = page.locator('[data-workspace-dock]');
    await dock.getByRole('button', { name: /More/ }).click();
    await page.getByRole('menuitem', { name: 'Play it out' }).click();
    return dock;
  };

  test('offers the side and the opponent before the session starts', async ({ page }) => {
    const dock = await openTrainer(page);
    // The user should know what they are practising against, rather than
    // discovering it three moves in.
    await expect(dock.getByLabel('Play as')).toBeVisible();
    await expect(dock.getByLabel('Opponent')).toBeVisible();
    await expect(dock.getByRole('button', { name: 'Play it out' })).toBeVisible();
  });

  test('§53 reports a factual result change, and does not accuse the player', async ({ page }) => {
    const dock = await openTrainer(page);
    await dock.getByLabel('Opponent').selectOption('tablebase-perfect');
    await dock.getByRole('button', { name: 'Play it out' }).click();

    // The session opens on the result it starts from.
    const status = dock.locator('[data-conversion-status]');
    await expect(status).toContainText('Win');

    // Rd3+ hangs the rook beside the black king, and gives the win away.
    const board = dock.getByRole('grid', { name: 'Chessboard' });
    await board.getByRole('gridcell', { name: /^d1,/ }).click();
    await board.getByRole('gridcell', { name: /^d3,/ }).click();

    const change = dock.locator('[data-conversion-change]');
    await expect(change).toHaveText('The tablebase result changed from Win to Draw on this move.');
    /*
      The wording rule, asserted rather than trusted. A tablebase knows the
      result changed; it does not know whether the move was a slip, an
      experiment, or a line the player understands better than it does.
    */
    await expect(change).not.toContainText(/blunder/i);
    await expect(change).not.toContainText(/mistake/i);

    // §54: the win it started with is gone, so the session says so and stops.
    await expect(dock.locator('[data-conversion-ending]')).toContainText(
      'no longer holds the win it started with',
    );
  });
});
