import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

/**
 * A late answer to a question nobody is asking any more.
 *
 * Kingfisher's three asynchronous surfaces — the opening explorer, the player
 * library and the engine — all have the same failure available to them. A user
 * moves faster than a query: they play a move, play another, switch the source,
 * change a filter, and the answers come back in whatever order the disk, the
 * network and the scheduler produce. If any one of them is allowed to reach the
 * screen on arrival rather than on relevance, the panel shows evidence about a
 * position that is no longer on the board, under the name of a source that is
 * no longer selected, and nothing about it looks wrong.
 *
 * That is the worst class of defect this application can have. A crash is
 * visible. A statistic from the wrong position is a research tool lying with a
 * straight face, and a player would act on it.
 *
 * ## How these are written
 *
 * Differentially, not by inspection. Each test reaches a state twice — once
 * deliberately, waiting at every step, and once as fast as Playwright can drive
 * it — and asserts the two agree exactly. An assertion that merely checked the
 * panel was "not empty" or that the heading matched would pass on a panel full
 * of the previous position's moves.
 *
 * The deliberate walk is the oracle. It is not a hard-coded expectation, so the
 * tests do not need updating when the bundled reference does, and they cannot
 * be satisfied by a stale render that happens to match a constant.
 */

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function referenceReady(page: Page) {
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
      { timeout: 120_000 },
    )
    .toBe('ready');
}

/** The explorer's answer, as a reader of the panel would describe it. */
async function explorerState(page: Page) {
  const panel = page.locator('[data-workspace-dock]').first();
  await panel.waitFor();
  return page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Evidence source"]',
    );
    const rows = [...document.querySelectorAll<HTMLElement>('[data-explorer-move]')].map(
      (button) => {
        const cells = [...(button.closest('tr')?.querySelectorAll('td') ?? [])].map((cell) =>
          (cell.textContent ?? '').trim(),
        );
        return `${button.dataset.explorerMove}:${cells.slice(2, 4).join('/')}`;
      },
    );
    return {
      source: select?.value ?? null,
      // The move list *and* its numbers. The moves alone would match between
      // two positions that share their most-played continuations.
      rows,
      fen: document.querySelector<HTMLElement>('[data-fen]')?.dataset.fen ?? null,
    };
  });
}

/** Play a move from the board's move list, by its SAN, without waiting. */
const playMove = (page: Page, san: string) =>
  page.evaluate((move) => {
    const button = document.querySelector<HTMLElement>(`[data-explorer-move="${move}"]`);
    button?.click();
  }, san);

async function openExplorer(page: Page) {
  await page.goto('/analysis');
  await ready(page);
  await referenceReady(page);
  await page.reload();
  await ready(page);
  const dock = page.locator('[data-workspace-dock]').first();
  await selectTool(page, dock, 'Explorer');
  await expect(page.locator('[data-explorer-move]').first()).toBeVisible({ timeout: 60_000 });
}

test('the explorer ends on the position and source the user actually chose', async ({ page }) => {
  test.setTimeout(180_000);
  await openExplorer(page);

  const select = page.locator('select[aria-label="Evidence source"]');
  const options = await select
    .locator('option:not([disabled])')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  const answering = await select.inputValue();
  const other = options.find((id) => id !== answering);
  /*
    Phase 40 replaces the previous "skip when only one source is
    selectable" gate with an honest assertion. A single-source
    environment is a configuration the application has to keep
    working, not a configuration the test is allowed to ignore.
    With only one source available, the explorer still has to
    end on the position and source the user chose — and the
    race scenario below collapses to a single in-flight query,
    which is itself a useful coverage of the panel's stale-answer
    defence against rapid navigation.
  */

  /*
    The oracle: three plies, each one waited for, on the source that answers.

    e4/e5/Nf3 because they are the most-played continuations in the bundled
    reference — so the rows exist to be clicked without knowing what the pack
    holds — and because they share a first move with a great many other lines,
    which is what makes a stale answer plausible rather than obviously wrong.
  */
  const walk = ['e4', 'e5', 'Nf3'];
  for (const san of walk) {
    await page.locator(`[data-explorer-move="${san}"]`).click();
    await expect(page.locator('[data-explorer-move]').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
  }
  const deliberate = await explorerState(page);
  expect(deliberate.source).toBe(answering);
  expect(
    deliberate.rows.length,
    'the oracle must have real evidence to compare against',
  ).toBeGreaterThan(0);

  /*
    The race. Same destination, no waits, and a detour through a source that
    cannot answer while two position queries are still in flight.

    Switching away and back is the point. Ending on the empty source would let
    a blank panel pass; ending back on the one with evidence means the panel
    has to produce the *right* evidence, having been asked three positions and
    two sources in under a fifth of a second.
  */
  await page.reload();
  await ready(page);
  const dock = page.locator('[data-workspace-dock]').first();
  await selectTool(page, dock, 'Explorer');
  await expect(page.locator('[data-explorer-move]').first()).toBeVisible({ timeout: 60_000 });

  await playMove(page, 'e4');
  await page.waitForTimeout(30);
  await playMove(page, 'e5');
  if (other) {
    await select.selectOption(other);
    await select.selectOption(answering);
  }
  await page.waitForTimeout(30);
  await playMove(page, 'Nf3');

  // Let every in-flight answer land, including the ones now irrelevant.
  await page.waitForTimeout(5_000);
  const raced = await explorerState(page);

  expect(raced.source, 'the panel is showing a source the user switched away from').toBe(answering);
  expect(
    raced.rows,
    'the explorer settled on evidence that does not match the deliberate walk to the same position',
  ).toEqual(deliberate.rows);
});

test('rapid typing leaves the player list on the last thing typed', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/players');
  await ready(page);
  await referenceReady(page);
  await page.reload();
  await ready(page);

  const search = page.getByLabel('Search players');
  await expect(page.locator('[data-player-row]').first()).toBeVisible({ timeout: 60_000 });

  const rows = () =>
    page
      .locator('[data-player-row]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.playerRow ?? ''));

  // The oracle: the whole word, typed once.
  await search.fill('carlsen');
  await page.waitForTimeout(1_200);
  const deliberate = await rows();
  expect(deliberate.length, 'the reference should know Carlsen').toBeGreaterThan(0);

  // The race: every prefix, as fast as the keyboard can produce them.
  await search.fill('');
  await page.waitForTimeout(400);
  for (const prefix of ['c', 'ca', 'car', 'carl', 'carls', 'carlse', 'carlsen']) {
    await search.fill(prefix);
  }
  await page.waitForTimeout(1_500);
  const raced = await rows();

  expect(raced, 'the list settled on a prefix the user had already typed past').toEqual(deliberate);

  /*
    And the reason it cannot go wrong, asserted rather than assumed.

    Player search is a synchronous filter over a catalogue loaded once, so
    there is no per-keystroke request that could return late. That is a
    stronger guarantee than cancelling one, and it is worth pinning: if this
    ever becomes a request per keystroke, this assertion fails and whoever
    made the change has to deal with ordering deliberately.
  */
  const requestsWhileTyping: string[] = [];
  const record = (url: string) => {
    if (/player|search/i.test(url)) requestsWhileTyping.push(url);
  };
  page.on('request', (request) => record(request.url()));
  await search.fill('');
  for (const prefix of ['n', 'na', 'nak', 'naka']) await search.fill(prefix);
  await page.waitForTimeout(1_000);
  expect(
    requestsWhileTyping,
    'player search has grown a request per keystroke — it now needs ordering guarantees',
  ).toEqual([]);
});
