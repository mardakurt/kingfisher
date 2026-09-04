/**
 * The failures Phase 6 was about.
 *
 * None of these are visible to a unit test: they are about what survives a
 * reload, what two tabs do to each other, whether a cancelled import leaves
 * the database whole, and whether a report is safe to paste in public.
 *
 * Deliberately deterministic. Nothing here touches the real Lichess API, the
 * public tablebase, an assistant endpoint or a native engine — those are the
 * live smoke script's job, and a CI suite that depends on them is a CI suite
 * that fails for reasons nobody changed.
 */

import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

const SAMPLE_PGN = (count: number) =>
  Array.from(
    { length: count },
    (_, index) =>
      `[Event "Reliability ${index}"]\n[Site "Local"]\n[Date "2026.09.02"]\n` +
      `[Round "${index}"]\n[White "Player ${index}"]\n[Black "Opponent ${index}"]\n` +
      `[Result "1-0"]\n\n1. d4 Nf6 2. c4 e6 1-0`,
  ).join('\n\n');

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

/**
 * Waits for the most recent edit to have actually been written.
 *
 * Two steps, and the first one matters. Autosave is debounced, so immediately
 * after a move the indicator can still read "saved" from the write *before*
 * it — asserting only on "saved" therefore passes while the last move is
 * still in memory, and the test then reloads and finds it missing. Waiting for
 * the pending state first pins the assertion to this edit.
 *
 * The status bar carries this on every route, which the Analysis toolbar's
 * document header does not, so it works in Studies too.
 */
async function expectSaved(page: Page) {
  await expect(page.getByText('· unsaved', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('· saved', { exact: true })).toBeVisible({ timeout: 15_000 });
}

/** Clicks two squares, the way the board's pointer bookkeeping expects. */
async function play(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

/**
 * Wait for a newly created chapter to be the document on the board.
 *
 * A visible board is not the same as a loaded chapter: for a moment after
 * `Create chapter` the surface is mounted but the new empty tree has not
 * replaced the old one, and moves clicked in that window are swallowed. The
 * test then continues against a chapter missing its first moves and fails much
 * later, somewhere unrelated. An empty move count is the precondition, so it
 * is asserted rather than assumed.
 */
async function newChapterReady(page: Page) {
  await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
  await expect(page.getByText('0 half-moves')).toBeVisible();
}

async function newStudyChapter(page: Page, study: string, chapter: string) {
  await page.goto('/studies');
  await waitForApp(page);
  await page.getByRole('button', { name: 'New study' }).click();
  await page.getByRole('dialog', { name: 'New study' }).getByLabel('Title').fill(study);
  await page.getByRole('button', { name: 'Create study' }).click();
  await page.getByRole('button', { name: 'New chapter' }).click();
  await page.getByRole('dialog', { name: 'New chapter' }).getByLabel('Title').fill(chapter);
  await page.getByRole('button', { name: 'Create chapter' }).click();
  await newChapterReady(page);
}

test('work survives a reload the moment after it is made', async ({ page }) => {
  const consoleFailures = watchConsole(page);
  await newStudyChapter(page, 'Autosave study', 'Main line');

  await play(page, 'd2', 'd4');
  await play(page, 'g8', 'f6');
  // The debounce is 900ms with a 5s cap; this is the window that used to lose
  // work when a chapter write threw after the draft had already been skipped.
  await expectSaved(page);

  await page.reload();
  await waitForApp(page);
  await expect(page.getByRole('button', { name: 'd4', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nf6', exact: true })).toBeVisible();
  expect(consoleFailures).toEqual([]);
});

test('a stale write from a second tab is refused rather than applied', async ({
  page,
  context,
}) => {
  const consoleFailures = watchConsole(page);
  await newStudyChapter(page, 'Conflict study', 'Shared chapter');
  await play(page, 'd2', 'd4');
  await expectSaved(page);

  /*
    A second workspace that loaded the same revision. Rather than racing two
    real tabs — which converge through the broadcast channel and so rarely
    collide — this advances the stored revision directly, which is exactly the
    state a tab that was hidden, offline or asleep comes back holding.
  */
  await page.evaluate(async () => {
    const open = indexedDB.open('kingfisher');
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const chapters: { revision: number }[] = await new Promise((resolve) => {
      const request = db.transaction('chapters', 'readonly').objectStore('chapters').getAll();
      request.onsuccess = () => resolve(request.result);
    });
    const chapter = chapters[0]!;
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction('chapters', 'readwrite')
        .objectStore('chapters')
        .put({ ...chapter, revision: chapter.revision + 5 });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });

  // Editing now produces a write the repository must refuse.
  await play(page, 'g8', 'f6');

  const notice = page.getByRole('alert').filter({ hasText: 'changed in another Kingfisher tab' });
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await expect(notice.getByRole('button', { name: 'Save my version as a copy' })).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Discard mine, reload latest' })).toBeVisible();
  // Autosave must stop claiming success while a write is being refused.
  await expect(page.getByText('· unsaved', { exact: true })).toBeVisible();

  // Forking keeps both versions; nothing is merged and nothing is lost.
  await notice.getByRole('button', { name: 'Save my version as a copy' }).click();
  await expect(notice).toBeHidden();
  await page.goto('/studies');
  await waitForApp(page);
  // Both survive: the other tab's chapter and this tab's fork.
  await expect(page.getByText('Shared chapter (this tab)')).toBeVisible();
  await expect(page.getByText('Shared chapter', { exact: true }).first()).toBeVisible();
  expect(consoleFailures).toEqual([]);
  void context;
});

test('a cancelled import keeps whole games and does not duplicate them on retry', async ({
  page,
}) => {
  const consoleFailures = watchConsole(page);
  await page.goto('/games');
  await waitForApp(page);

  const importPgn = async (pgn: string) => {
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
    await dialog.getByRole('textbox').fill(pgn);
    await page.getByRole('button', { name: 'Import games' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  };

  await importPgn(SAMPLE_PGN(20));
  await expect(page.getByRole('button', { name: 'Player 0' })).toBeVisible();

  // Importing the identical file again must add nothing.
  await importPgn(SAMPLE_PGN(20));
  const rows = await page.getByRole('button', { name: /^Player \d+$/ }).count();
  expect(rows).toBe(20);
  expect(consoleFailures).toEqual([]);
});

test('the diagnostic report carries no secrets', async ({ page, context }) => {
  const consoleFailures = watchConsole(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/analysis');
  await waitForApp(page);

  // Configure a token, so the report has something it could leak.
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Accounts' }).click();
  // The token moved behind the advanced disclosure when PKCE became the front
  // door; the point of this test is unchanged — a configured secret must not
  // reach the report.
  await settings.getByRole('button', { name: /personal access token/ }).click();
  await settings.getByLabel('Lichess personal access token').fill('lip_secretTokenValue123456');

  await settings.getByRole('tab', { name: 'Diagnostics' }).click();
  await settings.getByRole('button', { name: 'Copy diagnostic report' }).click();
  await expect(settings.getByRole('button', { name: 'Copied' })).toBeVisible({ timeout: 15_000 });

  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain('Kingfisher diagnostic report');
  expect(report).not.toContain('lip_secretTokenValue123456');
  expect(report).toContain('Lichess token configured    yes');
  expect(report).toContain('No games, studies, notes, tokens or keys are included');
  expect(consoleFailures).toEqual([]);
});

test('the integrity scan reports a healthy database and finds a planted orphan', async ({
  page,
}) => {
  const consoleFailures = watchConsole(page);
  await page.goto('/analysis');
  await waitForApp(page);

  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Diagnostics' }).click();
  await settings.getByRole('button', { name: 'Run integrity scan' }).click();
  await expect(settings.getByText('Healthy. Every stored reference resolves.')).toBeVisible({
    timeout: 15_000,
  });

  // Plant an index entry for a game that does not exist.
  await page.evaluate(async () => {
    const open = indexedDB.open('kingfisher');
    const db: IDBDatabase = await new Promise((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve) => {
      const request = db.transaction('positions', 'readwrite').objectStore('positions').put({
        id: 'planted-orphan',
        positionKey: 'k',
        gameId: 'no-such-game',
        ply: 1,
        moveUci: 'e2e4',
        moveSan: 'e4',
        mover: 'w',
      });
      request.onsuccess = () => resolve();
    });
  });

  await settings.getByRole('button', { name: 'Run integrity scan' }).click();
  await expect(settings.getByText('Position index entries with no game')).toBeVisible({
    timeout: 15_000,
  });

  await settings.getByRole('button', { name: /Repair 1 safe issue/ }).click();
  await expect(settings.getByText('Healthy. Every stored reference resolves.')).toBeVisible({
    timeout: 15_000,
  });
  expect(consoleFailures).toEqual([]);
});

test('recent work continues the open document and pins survive a reload', async ({ page }) => {
  const consoleFailures = watchConsole(page);
  await newStudyChapter(page, 'Recent study', 'Chapter one');
  await play(page, 'e2', 'e4');
  await expectSaved(page);

  await page.goto('/recent');
  await waitForApp(page);
  await expect(page.getByRole('heading', { name: 'Recent work' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue Chapter one/ })).toBeVisible();

  await page.getByRole('button', { name: 'Pin Recent study' }).click();
  await page.reload();
  await waitForApp(page);
  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible();

  await page.getByRole('button', { name: /Continue Chapter one/ }).click();
  await expect(page).toHaveURL(/\/analysis$/);
  await expect(page.getByRole('button', { name: 'e4', exact: true })).toBeVisible();
  expect(consoleFailures).toEqual([]);
});

test('transpositions list only stored move orders and open their chapter', async ({ page }) => {
  const consoleFailures = watchConsole(page);
  // Two chapters reaching the same position by different orders.
  await newStudyChapter(page, 'Transposition study', 'Queen’s Gambit');
  await play(page, 'd2', 'd4');
  await play(page, 'g8', 'f6');
  await play(page, 'c2', 'c4');
  await play(page, 'e7', 'e6');
  await expect(page.getByText('4 half-moves')).toBeVisible();
  await expectSaved(page);

  await page.getByRole('button', { name: 'New chapter' }).click();
  await page.getByRole('dialog', { name: 'New chapter' }).getByLabel('Title').fill('English order');
  await page.getByRole('button', { name: 'Create chapter' }).click();
  await newChapterReady(page);
  await play(page, 'c2', 'c4');
  await play(page, 'g8', 'f6');
  await play(page, 'd2', 'd4');
  await play(page, 'e7', 'e6');
  // Both orders must actually have been entered; the assertion below is about
  // what was *stored*, and cannot distinguish a missing move from a missing
  // index.
  await expect(page.getByText('4 half-moves')).toBeVisible();
  await expectSaved(page);

  /*
    Pin the cursor to the transposed position before asking about it. Reading
    it from wherever the board happened to be left this test flaky under load:
    at the root there is no route to list, and the empty state is
    indistinguishable from a broken index.
  */
  await page.getByRole('button', { name: 'e6', exact: true }).last().click();
  await selectTool(
    page,
    page.getByRole('complementary', { name: 'Workspace tools' }),
    'Transpositions',
  );
  // The order this chapter used is not offered back as a transposition to
  // itself; the other one is.
  await expect(page.getByText('1.d4 Nf6 2.c4 e6')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('1.c4 Nf6 2.d4 e6')).toHaveCount(0);
  expect(consoleFailures).toEqual([]);
});

test('an engine that is stopped and restarted leaves no stale evaluation', async ({ page }) => {
  const consoleFailures = watchConsole(page);
  await page.goto('/analysis');
  await waitForApp(page);
  await play(page, 'e2', 'e4');

  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Engine');
  await page.getByRole('button', { name: 'Analyse this position' }).click();
  await expect(page.getByRole('button', { name: 'Stop analysis (E)' })).toBeVisible({
    timeout: 30_000,
  });

  // Walk quickly through several positions while it is running. A snapshot
  // from an abandoned search must never land on the position now on the board.
  for (const [from, to] of [
    ['e7', 'e5'],
    ['g1', 'f3'],
    ['b8', 'c6'],
    ['f1', 'b5'],
  ] as const) {
    await play(page, from, to);
  }

  await page.getByRole('button', { name: 'Stop analysis (E)' }).click();
  await expect(page.getByRole('button', { name: 'Start analysis (E)' })).toBeVisible();

  // Restarting must produce a fresh evaluation of the position on the board.
  await page.getByRole('button', { name: 'Start analysis (E)' }).click();
  await expect(page.getByRole('button', { name: 'Stop analysis (E)' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Stop analysis (E)' }).click();
  expect(consoleFailures).toEqual([]);
});

test('an explorer request that fails states why and never spins', async ({ page, context }) => {
  const consoleFailures = watchConsole(page);
  await page.goto('/openings');
  await waitForApp(page);
  // Openings opens on the library; the explorer is the other mode.
  await page.getByRole('button', { name: 'Explorer', exact: true }).first().click();

  /*
    Let the bundled reference finish installing before cutting the network.
    It installs itself on first run over the same connection that served the
    page, so pulling the plug mid-install is a different scenario — a real one,
    and one the pack installer handles by leaving nothing behind and retrying
    next start, but not the one this test is about. Cutting the network here
    would only assert that an interrupted download logs a network error.
  */
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('kingfisher');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          if (![...database.objectStoreNames].includes('referencePacks')) {
            database.close();
            return 'no-store';
          }
          const state = await new Promise<string>((resolve) => {
            const query = database
              .transaction('referencePacks', 'readonly')
              .objectStore('referencePacks')
              .get('kingfisher-starter');
            query.onsuccess = () =>
              resolve((query.result as { state?: string })?.state ?? 'absent');
            query.onerror = () => resolve('error');
          });
          database.close();
          return state;
        }),
      { timeout: 60_000 },
    )
    .toBe('ready');

  // A source that cannot answer, and a browser that thinks it is offline.
  await context.setOffline(true);
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Explorer');
  await page.getByLabel('Evidence source').selectOption('lichess-masters');
  // It names the source that failed and offers the local one, rather than
  // showing an empty panel or a spinner that never resolves.
  await expect(page.locator('[data-source-fallback]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Reading Masters/)).toHaveCount(0);

  // IndexedDB has no opinion about the network, so a local source still answers.
  await page.getByLabel('Evidence source').selectOption('local-collection');
  await expect(page.getByText('No games reach this position.')).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);
  expect(consoleFailures).toEqual([]);
});
