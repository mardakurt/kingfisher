/**
 * The workflows Phase 8 exists for.
 *
 * The self-analysis test is the important one: it asserts the *absence* of
 * evidence before reveal, which is the property the whole workspace is built
 * around and the one most easily broken by an innocent change elsewhere. A
 * regression there would not look like a failure — it would look like a
 * helpful engine line appearing a little earlier than intended.
 */

import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

const GAME_PGN = `[Event "Phase 8"]
[Site "Local"]
[Date "2026.09.02"]
[Round "1"]
[White "Alpha, A"]
[Black "Beta, B"]
[Result "1-0"]

1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6 7. Bh4 b6 1-0`;

const STRUCTURE_PGNS = `[Event "Structure one"]
[Date "2025.01.01"]
[White "One"]
[Black "A"]
[WhiteElo "2600"]
[Result "*"]

1. Nf3 Nf6 2. d4 d5 3. c4 e6 4. Nc3 *

[Event "Structure two"]
[Date "2026.01.01"]
[White "Two"]
[Black "B"]
[WhiteElo "2500"]
[Result "*"]

1. d4 d5 2. c4 e6 3. Nh3 Nf6 4. Nc3 *`;

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * Wait for the development persistence bridge, not just for a painted page.
 *
 * `data-kingfisher-ready` says the shell has hydrated; `__kingfisher` appears
 * only once the repository singleton has opened IndexedDB. A route that does
 * not read persistence on mount can paint well before that, and a test that
 * reaches for the bridge then fails with an unhelpful "cannot read properties
 * of undefined".
 */
async function bridgeReady(page: Page) {
  await page.waitForFunction(
    () => Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    undefined,
    { timeout: 30_000 },
  );
}

async function importGame(page: Page, pgn = GAME_PGN) {
  await page.goto('/games');
  await ready(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(pgn);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();
}

test('self-analysis records a decision before the evidence, and keeps it after', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleFailures: string[] = [];
  page.on('pageerror', (error) => consoleFailures.push(error.message));

  await importGame(page);

  // Open the game for review from the Games workspace.
  await page
    .getByRole('checkbox', { name: /Select Alpha, A/ })
    .first()
    .check();
  await page.getByRole('button', { name: 'Review this game' }).click();
  await expect(page).toHaveURL(/\/review$/);
  await ready(page);

  // Walk to a middlegame position.
  await page.getByRole('button', { name: 'Bh4', exact: true }).first().click();

  /*
    The gate. Every evidence tool must be withheld, and the dock must say so
    rather than merely showing nothing — "empty" and "hidden by your own
    choice" are different states and the workspace has to distinguish them.
  */
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Engine');
  await expect(page.getByText(/Computer evidence is hidden/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start analysis (E)' })).toHaveCount(0);
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Explorer');
  await expect(page.getByText(/Computer evidence is hidden/)).toBeVisible();
  await expect(page.getByLabel('Evidence source')).toHaveCount(0);

  // Record three candidates on the journal's own board, an estimate and a plan.
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Journal');
  const board = page.getByRole('grid', { name: 'Chessboard' }).nth(1);
  const play = async (from: string, to: string) => {
    await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
    await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
  };
  await play('c7', 'c5');
  await play('b8', 'd7');
  await play('d5', 'c4');
  await expect(page.getByText('3 candidates')).toBeVisible();

  await page.getByRole('radio', { name: 'Equal' }).click();
  await page.getByLabel('Evaluation estimate in pawns').fill('0.1');
  await page.getByLabel('Your plan').fill('Finish development with Bb7 and Nbd7.');
  await page
    .getByLabel('What you calculated')
    .fill('Looked at dxc4 but disliked the isolated pawn.');

  // Mark one candidate as the move I would actually play.
  await page.getByRole('button', { name: 'Nbd7', exact: true }).click();

  await page.getByRole('button', { name: 'Submit and reveal' }).click();

  // After reveal: the answers survive verbatim and the dock is usable.
  await expect(page.getByText('Finish development with Bb7 and Nbd7.')).toBeVisible();
  await expect(page.getByText(/Compared with the engine/)).toBeVisible();
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Engine');
  await expect(page.getByRole('button', { name: 'Start analysis (E)' })).toBeVisible();

  // The record is frozen: what was written before the reveal cannot be rewritten.
  const frozen = await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher?: {
          review: {
            listDecisions(): Promise<
              {
                id: string;
                revision: number;
                plan?: string;
                candidates: unknown[];
                revealedAt?: number;
              }[]
            >;
            updateDecision(
              id: string,
              revision: number,
              input: Record<string, unknown>,
            ): Promise<unknown>;
          };
        };
      }
    ).__kingfisher!;
    const [decision] = await app.review.listDecisions();
    if (!decision) return { error: 'no decision stored' };
    let refused = false;
    try {
      await app.review.updateDecision(decision.id, decision.revision, {
        positionKey: 'x',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        sideToMove: 'w',
        plan: 'rewritten after seeing the engine',
      });
    } catch {
      refused = true;
    }
    const [after] = await app.review.listDecisions();
    return {
      refused,
      plan: after?.plan,
      candidates: after?.candidates.length ?? 0,
      revealed: Boolean(after?.revealedAt),
    };
  });

  expect(frozen).toMatchObject({
    refused: true,
    plan: 'Finish development with Bb7 and Nbd7.',
    candidates: 3,
    revealed: true,
  });

  // Tag it, and the review summary counts it.
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Journal');
  await page
    .getByLabel('Workspace tools', { exact: true })
    .getByRole('button', { name: 'Calculation', exact: true })
    .click();
  // A Review sidebar tab, not a dock tool.
  await page.getByRole('tab', { name: 'Improvement' }).click();
  await expect(page.getByText('Themes you assigned')).toBeVisible();

  expect(consoleFailures).toEqual([]);
});

test('a marked position joins the queue and can be carried into training', async ({ page }) => {
  test.setTimeout(180_000);
  await importGame(page);
  await page
    .getByRole('checkbox', { name: /Select Alpha, A/ })
    .first()
    .check();
  await page.getByRole('button', { name: 'Review this game' }).click();
  await ready(page);
  await page.getByRole('button', { name: 'Bh4', exact: true }).first().click();

  // Phase 41 renamed the action; the test had kept the Phase 8 copy and
  // failed on it since.
  await page.getByRole('button', { name: 'Mark for review' }).click();
  await expect(page.getByText('Marked for review.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Alpha, A/ }).first()).toBeVisible();

  // Reveal, then hand the position to training inside a new set.
  await page.getByRole('button', { name: 'Reveal', exact: true }).click();
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Journal');
  await page.getByLabel('Training set').selectOption({ label: 'New set…' });
  await page.getByLabel('New set name').fill('Phase 8 set');
  await page.getByRole('button', { name: 'Create training position' }).click();

  const capture = page.getByRole('dialog', { name: 'Create training position' });
  const answer = capture.getByRole('grid', { name: 'Chessboard' });
  await answer.getByRole('gridcell', { name: /^b8,/ }).click();
  await answer.getByRole('gridcell', { name: /^d7,/ }).click();
  await expect(capture.getByRole('button', { name: 'Remove Nbd7' })).toBeVisible();
  await capture.getByRole('button', { name: 'Create item' }).click();
  await expect(capture).toBeHidden();

  const stored = await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher?: {
          trainingSets: {
            list(): Promise<{ id: string; name: string }[]>;
            resolve(id: string): Promise<{ id: string }[]>;
          };
          review: { listReviewItems(status?: string): Promise<{ status: string }[]> };
        };
      }
    ).__kingfisher!;
    const sets = await app.trainingSets.list();
    const set = sets.find((entry) => entry.name === 'Phase 8 set');
    return {
      setExists: Boolean(set),
      members: set ? (await app.trainingSets.resolve(set.id)).length : 0,
      converted: (await app.review.listReviewItems('converted')).length,
    };
  });

  // One item, in the set, and the queue entry marked as dealt with.
  expect(stored).toEqual({ setExists: true, members: 1, converted: 1 });

  await page.goto('/training');
  await ready(page);
  await page.getByRole('button', { name: 'Training sets' }).click();
  const setsDialog = page.getByRole('dialog', { name: 'Training sets' });
  await setsDialog.getByRole('button', { name: /Phase 8 set/ }).click();
  await expect(setsDialog.getByText('Chosen membership · 1 positions')).toBeVisible();
  await setsDialog.getByRole('button', { name: 'All training' }).click();
  await setsDialog.getByLabel('Training set name').fill('Recent review positions');
  await setsDialog.getByLabel('Training set kind').selectOption('dynamic');
  await setsDialog.getByLabel('Created within days').fill('90');
  await setsDialog.getByRole('button', { name: 'Create set' }).click();
  await expect(setsDialog.getByText('Saved filters · 1 positions')).toBeVisible();
});

test('review candidates are suggested from stored evidence, with their reasons', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await importGame(page);

  /*
    Evidence planted directly rather than by running an engine: the suggester
    is being tested here, not Stockfish, and a deterministic pair of scores is
    what makes the assertion about its reason exact.
  */
  const planted = await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher?: {
          games: { search(query: Record<string, unknown>): Promise<{ games: { id: string }[] }> };
          analysisQueue: {
            enqueue(input: Record<string, unknown>): Promise<{ id: string }>;
            saveEvidence(evidence: Record<string, unknown>): Promise<void>;
          };
        };
      }
    ).__kingfisher!;
    const found = await app.games.search({ limit: 1 });
    const gameId = found.games[0]?.id;
    if (!gameId) return { error: 'no game' };
    const job = await app.analysisQueue.enqueue({
      gameId,
      gameLabel: 'Alpha, A – Beta, B',
      engineId: 'stockfish-wasm',
      preset: 'standard',
      multiPv: 1,
      limit: { kind: 'movetime', ms: 1000 },
      strategy: 'every-move',
      startPly: 1,
      totalPositions: 2,
    });
    // Node ids in this tree are deterministic: n0 is the root, then n1, n2…
    const at = (nodeId: string, cp: number) => ({
      id: `${job.id}|${nodeId}`,
      jobId: job.id,
      gameId,
      nodeId,
      positionKey: 'planted',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      engineId: 'stockfish-wasm',
      engineName: 'Planted',
      score: { kind: 'cp', cp },
      depth: 20,
      nodes: 1,
      timeMs: 1,
      pv: ['d2d4'],
      analysedAt: Date.now(),
    });
    // 12.Bh4 in this game is node n13; the pair below straddles it.
    await app.analysisQueue.saveEvidence(at('n12', 40));
    await app.analysisQueue.saveEvidence(at('n13', -180));
    return { gameId };
  });
  expect(planted).not.toHaveProperty('error');

  await page
    .getByRole('checkbox', { name: /Select Alpha, A/ })
    .first()
    .check();
  await page.getByRole('button', { name: 'Review this game' }).click();
  await ready(page);

  await page.getByRole('button', { name: 'Suggest positions' }).click();
  await expect(page.getByText(/suggested for review/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/engine evaluation changed from \+0\.40 to -1\.80/)).toBeVisible();

  // Running it again adds nothing.
  await page.getByRole('button', { name: 'Suggest positions' }).click();
  const count = await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher?: { review: { listReviewItems(): Promise<unknown[]> } };
      }
    ).__kingfisher!;
    return (await app.review.listReviewItems()).length;
  });
  expect(count).toBe(1);
});

test('pawn-skeleton research opens a model game with the engine off', async ({ page }) => {
  await importGame(page, STRUCTURE_PGNS);
  await page
    .getByRole('checkbox', { name: /Select One/ })
    .first()
    .check();
  await page.getByRole('button', { name: 'Review this game' }).click();
  await ready(page);
  await page.getByRole('button', { name: 'e6', exact: true }).click();

  await page.getByRole('button', { name: 'Reveal', exact: true }).click();
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Features');
  await page.getByRole('button', { name: 'Same pawns' }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const matching = page.getByRole('listitem').filter({ hasText: 'Two – B' }).first();
  await expect(matching.getByText('Same pawn skeleton')).toBeVisible();
  await matching.getByRole('button', { name: 'Study game' }).click();

  await expect(page).toHaveURL(/\/model-game$/);
  await expect(page.getByText(/Model game study .* engine off by default/)).toBeVisible();
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Engine');
  await expect(page.getByText('No analysis yet')).toBeVisible();
});

test('SQLite selection deletion updates exact counts and passes integrity', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  await settings.getByPlaceholder('New collection name').fill('Phase 8 deletion E2E');
  await settings.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(settings.getByText('Phase 8 deletion E2E').first()).toBeVisible();
  await settings.getByPlaceholder('Paste a PGN collection…').fill(STRUCTURE_PGNS);
  await settings.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(settings.getByText(/2 games/).first()).toBeVisible({ timeout: 30_000 });
  await settings.getByRole('button', { name: 'Close' }).click();

  await page.goto('/databases');
  await ready(page);
  await page.getByRole('button', { name: /Phase 8 deletion E2E/ }).click();
  await expect(page.getByText('exact match count 2')).toBeVisible();
  /*
    Scoped to the game list. Phase 12's database control centre put selection
    checkboxes in the collection list too — for cross-collection search and
    duplicate detection — so an unscoped `first()` now ticks a collection
    rather than a game, and the delete button never enables.
  */
  const gameList = page.locator('label').filter({ has: page.getByRole('checkbox') });
  await gameList.filter({ hasText: '–' }).first().getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Delete selected (1)' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete SQLite games?' });
  await expect(confirmation.getByText(/one transaction/)).toBeVisible();
  await confirmation.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('exact match count 1')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Run integrity check' }).click();
  await expect(page.getByText(/Aggregates agree with the source rows/)).toBeVisible();

  await page.getByRole('button', { name: 'Delete collection' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this SQLite collection?' })
    .getByRole('button', { name: 'Delete permanently' })
    .click();
  await expect(page.getByRole('button', { name: /Phase 8 deletion E2E/ })).toHaveCount(0);
});

test('a 20,000-node branched study virtualizes and keeps keyboard navigation responsive', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/studies');
  await ready(page);
  await bridgeReady(page);
  const createMs = await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher?: {
          studies: {
            create(input: { title: string }): Promise<{ id: string }>;
            createChapter(input: Record<string, unknown>): Promise<unknown>;
          };
        };
      }
    ).__kingfisher!;
    const started = performance.now();
    const total = 20_000;
    const branches = 2_000;
    const main = total - branches;
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const byParent = new Map<number, string[]>();
    for (let index = 0; index < branches; index += 1) {
      const parent = Math.floor((index * (main - 1)) / branches);
      byParent.set(parent, [...(byParent.get(parent) ?? []), `v${index}`]);
    }
    const nodes: Record<string, unknown> = {
      r: {
        id: 'r',
        parentId: null,
        children: ['n1', ...(byParent.get(0) ?? [])],
        move: null,
        fen: start,
        ply: 0,
        nags: [],
        shapes: [],
        meta: {},
      },
    };
    const move = (id: string, parentId: string, ply: number, children: string[], san: string) => ({
      id,
      parentId,
      children,
      move: {
        from: 'g1',
        to: 'f3',
        piece: 'n',
        color: ply % 2 ? 'w' : 'b',
        san,
        uci: ply % 2 ? 'g1f3' : 'g8f6',
        flags: {
          capture: false,
          enPassant: false,
          promotion: false,
          kingsideCastle: false,
          queensideCastle: false,
          doublePawnPush: false,
        },
        before: start,
        after: start,
      },
      fen: start,
      ply,
      nags: [],
      ...(ply % 997 === 0 ? { comment: 'Measured variable-height comment.' } : {}),
      shapes: [],
      meta: {},
    });
    for (let index = 1; index <= main; index += 1) {
      nodes[`n${index}`] = move(
        `n${index}`,
        index === 1 ? 'r' : `n${index - 1}`,
        index,
        index < main ? [`n${index + 1}`, ...(byParent.get(index) ?? [])] : [],
        index % 2 ? 'Nf3' : 'Nf6',
      );
    }
    for (let index = 0; index < branches; index += 1) {
      const parent = Math.floor((index * (main - 1)) / branches);
      nodes[`v${index}`] = move(
        `v${index}`,
        parent === 0 ? 'r' : `n${parent}`,
        parent + 1,
        [],
        'd4',
      );
    }
    const study = await app.studies.create({ title: '20k scale study' });
    await app.studies.createChapter({
      studyId: study.id,
      title: '20,000 nodes',
      tree: { rootId: 'r', nodes, startFen: start, headers: { Result: '*' }, nextId: total + 1 },
    });
    return performance.now() - started;
  });

  const reloadStarted = Date.now();
  await page.reload();
  await ready(page);
  await expect(page.getByText('20000 moves')).toBeVisible();
  const virtual = page.locator('[data-virtualized-move-tree="true"]');
  await expect(virtual).toBeVisible();
  const reloadMs = Date.now() - reloadStarted;
  expect(await virtual.getByRole('listitem').count()).toBeLessThan(100);

  const navigationStarted = Date.now();
  await page.keyboard.press('End');
  await expect(virtual.locator('[data-current="true"]')).toBeVisible();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(virtual.locator('[data-current="true"]')).toBeVisible();
  const navigationMs = Date.now() - navigationStarted;
  expect(navigationMs).toBeLessThan(2_000);
  console.warn(
    `Phase 8 20k tree: create/save ${createMs.toFixed(1)} ms; reload/render ${reloadMs} ms; End/Home/Right ${navigationMs} ms`,
  );
});

/**
 * The preparation queue's whole claim is that it reflects the repertoire.
 *
 * A priority that is computed once and then goes stale is worse than no
 * priority at all: the player prepares the move, the queue keeps demanding it,
 * and the queue stops being trusted. So this walks the real loop — find the
 * unanswered move, answer it on the board, come back — and asserts the reason
 * changed because the evidence changed.
 */
test('a frequent opponent move with no answer leaves the queue once it is prepared', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await importGame(
    page,
    `[Event "Prep one"]
[Date "2026.02.01"]
[White "Opponent, O"]
[Black "Rival, R"]
[Result "1-0"]

1. e4 c5 2. Nf3 1-0

[Event "Prep two"]
[Date "2026.03.01"]
[White "Opponent, O"]
[Black "Second, S"]
[Result "1-0"]

1. e4 e6 2. d4 1-0`,
  );

  await page.goto('/preparation');
  await ready(page);
  await page.getByLabel('Player name').fill('Opponent, O');
  await page.getByRole('button', { name: 'Prepare' }).click();

  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  await selectTool(page, dock, 'Opening tree');
  const queue = dock.getByRole('article').filter({ hasText: 'e4' }).first();
  await expect(queue.getByText('No response')).toBeVisible();
  await expect(queue.getByText(/no prepared answer/i)).toBeVisible();
  // Every priority states the facts it was ordered by, never a blended score.
  await expect(queue.getByText('Local 100%')).toBeVisible();

  // Answer it on the board the button hands over, and file the answer.
  await queue.getByRole('button', { name: 'Add response' }).click();
  await expect(page).toHaveURL(/\/analysis$/);
  await ready(page);
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: /^e7,/ }).click();
  await board.getByRole('gridcell', { name: /^e5,/ }).click();
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
  await page.getByLabel('Title').fill('Answer to 1.e4');
  await page.getByRole('button', { name: /Save \d+ position/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add to repertoire' })).toBeHidden();

  // Back to the queue: the same move, now carrying a prepared answer.
  await page.goto('/preparation');
  await ready(page);
  await page.getByLabel('Player name').fill('Opponent, O');
  await page.getByRole('button', { name: 'Prepare' }).click();
  await selectTool(page, dock, 'Opening tree');
  const answered = dock.getByRole('article').filter({ hasText: 'e4' }).first();
  await expect(answered.getByText('Prepared')).toBeVisible();
  await expect(answered.getByText('No response')).toHaveCount(0);
});
