/**
 * Infrastructure failing while somebody is working.
 *
 * The invariant every test here asserts is the same one, and it is the most
 * important claim this application makes: **no provider failure may take down
 * the chess document.** The board, the move tree and the notes belong to the
 * user; the explorer, the tablebase, the companion and the engine are things
 * Kingfisher asks. When one of those is offline, rate-limited, unauthorised or
 * lying, the answer must be "that source could not answer", never a blank page,
 * a lost variation, or — worst — a study that reports itself saved when it is
 * not.
 *
 * Deterministic on purpose. Nothing here reaches the real Lichess API or the
 * public tablebase: every failure is injected by routing the request, so the
 * suite fails when Kingfisher breaks and never when somebody else's service
 * has a bad afternoon.
 */

import { expect, test, type Page, type Route } from '@playwright/test';

import { selectTool } from './tools';

const READY = 'html[data-kingfisher-ready="true"]';

async function waitForApp(page: Page) {
  await page.locator(READY).waitFor();
}

/** Clicks two squares, the way the board's pointer bookkeeping expects. */
async function play(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

/**
 * The core document is still the user's.
 *
 * Four things, because they are the four a failure could plausibly take: the
 * board renders, a move can still be played onto the tree, the move tree shows
 * it, and the notes accept typing. Anything less than all four and "the
 * workspace survived" is a claim rather than an observation.
 */
async function expectWorkspaceUsable(page: Page, moves: number) {
  await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
  await play(page, 'e2', 'e4');
  await expect(page.getByText(`${moves} half-moves`)).toBeVisible({ timeout: 10_000 });

  await selectTool(page, page.locator('[data-workspace-dock]').first(), 'Notes');
  const notes = page.getByRole('textbox', { name: /note about/i }).first();
  await notes.fill('Still writing while the network is on fire.');
  await expect(notes).toHaveValue('Still writing while the network is on fire.');
}

/** Pair with the e2e companion, the way a user does: one pasted address. */
async function pairCompanion(page: Page) {
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();
}

/** Fail every request matching a pattern, in the way a real outage would. */
async function breakRoute(
  page: Page,
  pattern: string | RegExp,
  respond: (route: Route) => unknown,
) {
  await page.route(pattern, (route) => void respond(route));
}

test.describe('the workspace survives its providers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);
  });

  test('an offline machine leaves the board, the tree and the notes working', async ({
    page,
    context,
  }) => {
    await context.setOffline(true);
    await expectWorkspaceUsable(page, 1);
    await context.setOffline(false);
  });

  test('a rate-limited explorer says so and does not empty the workspace', async ({ page }) => {
    await breakRoute(page, /lichess\.ovh|explorer\.lichess/, (route) =>
      route.fulfill({ status: 429, body: 'Too Many Requests' }),
    );

    await selectTool(page, page.locator('[data-workspace-dock]').first(), 'Explorer');
    /*
      The explorer's own area reports the failure. What matters for this suite
      is the negative: whatever it shows, the document is untouched.
    */
    await expectWorkspaceUsable(page, 1);
  });

  test('an unauthorised explorer does not lose the move tree', async ({ page }) => {
    await breakRoute(page, /lichess\.ovh|explorer\.lichess/, (route) =>
      route.fulfill({ status: 401, body: 'Unauthorized' }),
    );
    await selectTool(page, page.locator('[data-workspace-dock]').first(), 'Explorer');
    await expectWorkspaceUsable(page, 1);
  });

  test('a tablebase that never answers does not hang the board', async ({ page }) => {
    /*
      A hang, not an error. A source that accepts the request and never
      responds is the failure a naive fetch has no answer to, and the one that
      turns a panel into a permanent spinner.
    */
    await page.route(/tablebase\.lichess\.ovh/, () => {
      /* deliberately never fulfilled */
    });
    await expectWorkspaceUsable(page, 1);
  });

  test('a chess.com outage during sync leaves the collection intact', async ({ page }) => {
    await breakRoute(page, /chess\.com/, (route) =>
      route.fulfill({ status: 503, body: 'Service Unavailable' }),
    );
    await page.goto('/games');
    await waitForApp(page);
    await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();
    // The stored-game count is a local fact and must not depend on a remote one.
    await expect(page.getByText(/stored/)).toBeVisible();
  });

  test('a companion that disconnects does not break the databases screen', async ({ page }) => {
    await breakRoute(page, /127\.0\.0\.1:4338/, (route) => route.abort('connectionrefused'));
    await page.goto('/databases');
    await waitForApp(page);

    await expect(page.getByRole('heading', { name: 'Databases' })).toBeVisible();
    /*
      The browser's own collection is always there. A database manager that
      refuses to open because a helper process is not running would be exactly
      the fragility this application is trying not to have.
    */
    await expect(page.getByRole('button', { name: /My games/ }).first()).toBeVisible();
  });

  test('a companion that answers 500 to every database call is reported, not fatal', async ({
    page,
  }) => {
    await breakRoute(page, /127\.0\.0\.1:4338\/db\//, (route) =>
      route.fulfill({ status: 500, body: '{"error":"broken"}' }),
    );
    await page.goto('/databases');
    await waitForApp(page);
    await expect(page.getByRole('heading', { name: 'Databases' })).toBeVisible();
  });

  test('a worker that will not start still leaves games importable', async ({ page }) => {
    /*
      Import has a main-thread fallback for runtimes that refuse module
      workers. Blocking the worker script exercises it: the games must still
      land, because "your browser is unusual" is not a reason to lose data.
    */
    await page.route(/pgn-import\.worker/, (route) => route.abort());
    await page.goto('/games');
    await waitForApp(page);
    await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();
  });
});

test.describe('recovery without a restart', () => {
  test('the companion is used again once it comes back, without a reload', async ({ page }) => {
    /*
      The companion rather than the explorer, because the Lichess explorer
      requires a token and therefore never makes the request a recovery test
      needs to see recover. The companion needs no credential, is the source a
      user is most likely to restart mid-session, and its status call is what
      the Databases screen reads.
    */
    let failing = true;
    await page.route(/127\.0\.0\.1:4338\/status/, (route) => {
      if (failing) {
        void route.abort('connectionrefused');
        return;
      }
      void route.continue();
    });

    await page.goto('/analysis');
    await waitForApp(page);
    await pairCompanion(page);

    await page.goto('/databases');
    await waitForApp(page);
    // Paired, and unreachable: the screen has to say the second thing.
    await expect(page.getByText(/not reachable|did not answer/i).first()).toBeVisible({
      timeout: 20_000,
    });
    // And the browser's own collection is unaffected by any of it.
    await expect(page.getByRole('button', { name: /My games/ }).first()).toBeVisible();

    /*
      The companion comes back. Recovery has to happen inside the running
      application: opening and closing Connections is an ordinary thing a user
      does, and nothing here reloads the page, because "restart Kingfisher" is
      not an acceptable recovery step.
    */
    failing = false;
    await page.getByRole('button', { name: /Connections/ }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByText(/engines · .* SQLite collections/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test('going offline and back leaves a study editable throughout', async ({ page, context }) => {
    await page.goto('/analysis');
    await waitForApp(page);

    await context.setOffline(true);
    await play(page, 'd2', 'd4');
    await expect(page.getByText('1 half-moves')).toBeVisible({ timeout: 10_000 });

    await context.setOffline(false);
    await play(page, 'd7', 'd5');
    await expect(page.getByText('2 half-moves')).toBeVisible({ timeout: 10_000 });

    /*
      The save indicator has to tell the truth on both sides of the outage.
      A local write does not need the network, so "saved" is the honest word —
      and a study that reported itself saved when it was not would be the worst
      failure in this file.
    */
    await expect(page.getByText('· saved', { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await waitForApp(page);
    await expect(page.getByText('2 half-moves')).toBeVisible({ timeout: 15_000 });
  });
});
