import { expect, test, type Page } from '@playwright/test';

interface StoredEvidence {
  readonly nodeId: string;
  readonly engineName: string;
  readonly depth: number;
  readonly pv: readonly string[];
  readonly score: unknown;
}

interface BrowserRepositories {
  analysisQueue: { evidenceForGame(gameId: string): Promise<readonly StoredEvidence[]> };
  drafts: { get(): Promise<{ tree: { nodes: Record<string, unknown> } } | null> };
  games: { search(query: Record<string, unknown>): Promise<{ games: { id: string }[] }> };
  repertoires: {
    create(input: { title: string; color: 'w' | 'b' }): Promise<{ id: string }>;
    upsertPosition(input: Record<string, unknown>): Promise<{ positionKey: string; fen: string }>;
  };
  training: { create(input: Record<string, unknown>): Promise<{ id: string }> };
}

const SAMPLE_PGN = `[Event "Phase 7"]
[Site "Local"]
[Date "2026.09.02"]
[Round "1"]
[White "Queue White"]
[Black "Queue Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`;

const largePgn = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    SAMPLE_PGN.replace('[Round "1"]', `[Round "${index + 1}"]`),
  ).join('\n\n');

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function play(page: Page, from: string, to: string) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

test('a large worker import can be backgrounded, remains responsive and cancels cleanly', async ({
  page,
}) => {
  test.setTimeout(180_000);
  let workers = 0;
  page.on('worker', () => (workers += 1));
  await page.goto('/games');
  await ready(page);
  await page.evaluate(() => {
    const sample = { last: performance.now(), maxGap: 0, ticks: 0 };
    (window as typeof window & { __phase7Responsiveness?: typeof sample }).__phase7Responsiveness =
      sample;
    window.setInterval(() => {
      const now = performance.now();
      sample.maxGap = Math.max(sample.maxGap, now - sample.last);
      sample.last = now;
      sample.ticks += 1;
    }, 25);
  });

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'phase-7-large.pgn',
    mimeType: 'application/x-chess-pgn',
    buffer: Buffer.from(largePgn(20_000)),
  });
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await dialog.getByRole('button', { name: 'Continue in background' }).click();
  await expect(page.getByText('Import continues in the background')).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Analysis' })
    .click();
  await play(page, 'e2', 'e4');
  await expect(page.getByRole('button', { name: 'e4' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await expect(page.getByText(/Import stopped\./)).toBeVisible({ timeout: 30_000 });

  const responsiveness = await page.evaluate(
    () =>
      (window as typeof window & { __phase7Responsiveness?: { maxGap: number; ticks: number } })
        .__phase7Responsiveness,
  );
  expect(workers).toBeGreaterThan(0);
  expect(responsiveness?.ticks ?? 0).toBeGreaterThan(5);
  expect(responsiveness?.maxGap ?? Number.POSITIVE_INFINITY).toBeLessThan(500);
});

test('repertoire and training stale edits offer one shared resolution vocabulary', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto('/analysis');
  await ready(page);
  await play(page, 'e2', 'e4');
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
  await page.getByLabel('Title').fill('Revision E2E');
  await page.getByRole('button', { name: /Save 1 position/ }).click();
  await page.goto('/repertoire');
  await ready(page);

  const second = await context.newPage();
  await second.goto('/repertoire');
  await ready(second);
  await page.getByLabel('Role for e4').selectOption('alternative');
  await second.getByLabel('Role for e4').selectOption('candidate');
  await expect(second.getByText('This repertoire position changed in another tab.')).toBeVisible();
  await second.getByRole('button', { name: 'Save mine as copy' }).click();
  await expect(second.getByText(/Saved this tab's position/)).toBeVisible();

  /*
    A fresh document before capturing, so the training half does not depend on
    the debounced draft of the repertoire half having been restored. Reading
    the board from wherever a previous section left it is how this test fails
    on a slower machine and nowhere else.
  */
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'New analysis' }).click();
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Create training position…' }).click();
  const capture = page.getByRole('dialog', { name: 'Create training position' });
  await capture
    .getByRole('grid', { name: 'Chessboard' })
    .getByRole('gridcell', { name: /^e2,/ })
    .click();
  await capture
    .getByRole('grid', { name: 'Chessboard' })
    .getByRole('gridcell', { name: /^e4,/ })
    .click();
  // The answer has to have registered before the item is created; asserting it
  // here turns "the board click did not take" into an immediate, legible
  // failure instead of a missing button two navigations later.
  await expect(capture.getByRole('button', { name: 'Remove e4' })).toBeVisible();
  await capture.getByRole('button', { name: 'Create item' }).click();
  /*
    Wait for the write, not for the click. Navigating straight after the button
    left a slower machine loading /training before the item had committed, and
    the authoring editor there is only rendered once an item is selected — so
    the failure looked like a missing button rather than a race.
  */
  await expect(capture).toBeHidden();
  await expect(page.getByText(/Training position created/)).toBeVisible({ timeout: 30_000 });

  await page.goto('/training');
  await second.goto('/training');
  await ready(page);
  await ready(second);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(second.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Prompt').fill('Edited in first tab');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await second.getByRole('button', { name: 'Edit', exact: true }).click();
  await second.getByLabel('Prompt').fill('Edited in second tab');
  await second.getByRole('button', { name: 'Save changes' }).click();
  await expect(second.getByText('This training item changed in another tab.')).toBeVisible();
  await second.getByRole('button', { name: 'Reload latest' }).click();
  await expect(second.getByText('Edited in first tab').first()).toBeVisible();
  await second.close();
});

test('study references, saved filters and storage facts are usable', async ({ page }) => {
  await page.goto('/studies');
  await ready(page);
  await page.getByRole('button', { name: 'New study' }).click();
  await page.getByRole('dialog', { name: 'New study' }).getByLabel('Title').fill('References E2E');
  await page.getByRole('button', { name: 'Create study' }).click();
  await page.getByRole('button', { name: 'New chapter' }).click();
  await page
    .getByRole('dialog', { name: 'New chapter' })
    .getByLabel('Title')
    .fill('Start position');
  await page.getByRole('button', { name: 'Create chapter' }).click();

  await page.evaluate(async () => {
    const app = (globalThis as typeof globalThis & { __kingfisher?: BrowserRepositories })
      .__kingfisher!;
    const repertoire = await app.repertoires.create({ title: 'Linked repertoire', color: 'w' });
    const position = await app.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      sideToMove: 'w',
      depth: 0,
      moves: [{ uci: 'e2e4', san: 'e4', role: 'main', updatedAt: Date.now() }],
    });
    const item = await app.training.create({
      mode: 'best-move',
      positionKey: position.positionKey,
      fen: position.fen,
      sideToMove: 'w',
      prompt: 'Linked training',
      solutionUci: ['e2e4'],
      solutionSan: ['e4'],
      candidatesUci: [],
      plans: [],
      tags: [],
    });
    return item.id;
  });
  await page.reload();
  await ready(page);
  await page.getByRole('tab', { name: 'References' }).click();
  await page.getByRole('button', { name: 'Link Linked repertoire' }).click();
  await page.getByRole('button', { name: 'Link training · Linked training' }).click();
  await expect(page.getByText('2 linked')).toBeVisible();
  await page
    .getByRole('button', { name: /Linked training/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/training\?item=/);

  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Games' })
    .click();
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByLabel('Min Elo').fill('2400');
  page.once('dialog', (dialog) => dialog.accept('Masters 2400+'));
  await page.getByRole('button', { name: 'Save filter' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Filters' }).click();
  await expect(
    page.getByLabel('Saved and recent filters').getByRole('option', { name: 'Masters 2400+' }),
  ).toBeAttached();

  await page.goto('/databases');
  await expect(page.getByText(/Estimated browser storage:/)).toBeVisible();
  await expect(page.getByText(/games · .* studies · .* training items/)).toBeVisible();
});

test('background analysis pauses for interactive work and persists resumable progress', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/games');
  await ready(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const importDialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await importDialog.getByRole('textbox').fill(largePgn(2));
  await importDialog.getByRole('button', { name: 'Import games' }).click();
  await expect(importDialog).toBeHidden();

  await page
    .getByRole('checkbox', { name: /Select Queue White/ })
    .first()
    .check();
  await page
    .getByRole('checkbox', { name: /Select Queue White/ })
    .nth(1)
    .check();
  await page.getByRole('button', { name: 'Add to analysis queue' }).click();
  const queue = page.getByRole('dialog', { name: 'Add games to analysis queue' });
  await queue.getByLabel('Analysis preset').selectOption('standard');
  await queue.getByLabel('Positions', { exact: true }).selectOption('every-move');
  await queue.getByRole('button', { name: 'Add 2 games' }).click();
  const manager = page.getByRole('dialog', { name: 'Background analysis queue' });
  await manager.getByRole('button', { name: 'Start queue' }).click();
  await expect(manager.getByText(/running ·/)).toBeVisible({ timeout: 20_000 });
  await manager.getByRole('button', { name: 'Pause' }).click();
  await expect(manager.getByText(/paused ·/)).toBeVisible();
  const before = await manager
    .getByText(/paused ·/)
    .first()
    .textContent();
  await manager.getByText('Close', { exact: true }).click();

  await page.reload();
  await ready(page);
  await page.getByRole('button', { name: 'Analysis queue' }).click();
  const restored = page.getByRole('dialog', { name: 'Background analysis queue' });
  await expect(restored.getByText(/paused ·/)).toContainText(
    before?.match(/\d+ \/ \d+/)?.[0] ?? 'positions',
  );
  await restored.getByRole('button', { name: 'Resume' }).click();
  await restored.getByText('Close', { exact: true }).click();

  await page.getByRole('button', { name: 'Queue White' }).first().click();
  await page.getByRole('tab', { name: 'Engine' }).click();
  await page.getByRole('button', { name: 'Start analysis (E)' }).click();
  await expect(page.getByRole('button', { name: 'Stop analysis (E)' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Games' })
    .click();
  await page.getByRole('button', { name: 'Analysis queue' }).click();
  await expect(
    page.getByText('Background work is waiting while interactive analysis has priority.'),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Background analysis queue' })
    .getByText('Close', { exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Analysis' })
    .click();
  await page.getByRole('button', { name: 'Stop analysis (E)' }).click();
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Games' })
    .click();
  await page.getByRole('button', { name: 'Analysis queue' }).click();
  await expect(page.getByText(/completed ·/).first()).toBeVisible({ timeout: 30_000 });

  /*
    The queue's whole purpose is stored evidence, so the test asserts the
    evidence rather than the label: real engine answers, one row per analysed
    position, and no row invented for a position nobody analysed. That last
    part is Kingfisher's honesty principle — an unanalysed move stays blank.
  */
  const evidence = await page.evaluate(async () => {
    const app = (globalThis as typeof globalThis & { __kingfisher?: BrowserRepositories })
      .__kingfisher!;
    const found = await app.games.search({ limit: 10 });
    const rows = await Promise.all(
      found.games.map((game) => app.analysisQueue.evidenceForGame(game.id)),
    );
    return rows.flat().map((row) => ({
      nodeId: row.nodeId,
      engineName: row.engineName,
      depth: row.depth,
      pv: row.pv.length,
      hasScore: row.score !== undefined && row.score !== null,
    }));
  });
  expect(evidence.length).toBeGreaterThan(0);
  expect(evidence.length).toBeLessThanOrEqual(12);
  expect(new Set(evidence.map((row) => row.nodeId)).size).toBe(evidence.length);
  for (const row of evidence) {
    expect(row.engineName).toMatch(/Stockfish/);
    expect(row.depth).toBeGreaterThan(0);
    expect(row.pv).toBeGreaterThan(0);
    expect(row.hasScore).toBe(true);
  }
});

/**
 * A very large tree, driven the way a user would produce one.
 *
 * The mainline is a deterministic knight shuffle, which is legal for as long
 * as it is repeated, so the size is a parameter rather than a fixture. Two
 * variations and a comment are attached because the requirement is that the
 * tree stays *usable* at this size, not merely that it renders: navigation to
 * the end, branch switching, annotation and a reload that brings it all back.
 */
const CYCLE = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];

function largeTreePgn(plies: number): string {
  const parts: string[] = [];
  for (let ply = 0; ply < plies; ply += 1) {
    const move = CYCLE[ply % CYCLE.length];
    if (ply % 2 === 0) parts.push(`${ply / 2 + 1}.`);
    parts.push(move!);
    // One variation at the very first move and one at the second, so branch
    // switching is exercised near the root where the tree is widest.
    if (ply === 0) parts.push('(1. d4 d5 2. c4 e6)');
    if (ply === 2) parts.push('(2. e4 e5 3. Bc4 Bc5)');
    if (ply === 3) parts.push('{A deterministic stress comment.}');
  }
  return (
    `[Event "Large tree"]\n[Site "Local"]\n[Date "2026.09.02"]\n` +
    `[White "Deep"]\n[Black "Tree"]\n[Result "*"]\n\n${parts.join(' ')} *`
  );
}

test('a study chapter with a thousand-node tree stays navigable and survives a reload', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleFailures: string[] = [];
  page.on('pageerror', (error) => consoleFailures.push(error.message));

  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(largeTreePgn(1_000));

  const started = Date.now();
  await dialog.getByRole('button', { name: /^(Load|Import)/ }).click();
  await expect(dialog).toBeHidden();
  // 1,000 mainline plies plus the eight the two variations carry.
  await expect(page.getByText('1008 half-moves')).toBeVisible({ timeout: 60_000 });
  const renderMs = Date.now() - started;

  // Navigation to the far end of a thousand-ply line, by keyboard.
  await page.getByRole('button', { name: 'End of line (End)' }).click();
  await expect(page.getByRole('button', { name: 'End of line (End)' })).toBeDisabled();
  await page.getByRole('button', { name: 'Start of game (Home)' }).click();
  await expect(page.getByRole('button', { name: 'Start of game (Home)' })).toBeDisabled();

  // Branch switching at the root, where the tree is widest.
  await page.getByRole('button', { name: 'd4', exact: true }).first().click();
  await expect(page.getByText(/^Deep – Tree/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Nf3', exact: true }).first().click();

  // The comment the PGN carried is still attached to its move.
  await expect(page.getByText('A deterministic stress comment.').first()).toBeVisible();

  await page.getByRole('button', { name: 'Save this analysis to a study' }).click();
  const save = page.getByRole('dialog', { name: 'Save to study' });
  // With no studies yet the dialog already offers "New study…", so the only
  // thing to supply is the two titles.
  await save.getByRole('combobox').selectOption({ label: 'New study…' });
  await save.getByLabel('New study title').fill('Large tree study');
  await save.getByLabel('Chapter title').fill('Thousand plies');
  await save.getByRole('button', { name: 'Save chapter' }).click();
  await expect(save).toBeHidden();
  await expect(page.getByText('· saved', { exact: true })).toBeVisible({ timeout: 30_000 });

  /*
    Reopened from the study rather than from the workspace draft, because what
    the requirement is about is whether a tree this size survives *storage* —
    the chapter is the record the user believes in.
  */
  await page.reload();
  await ready(page);
  await page.goto('/studies');
  await ready(page);
  await page
    .getByRole('button', { name: /Thousand plies/ })
    .first()
    .click();
  await expect(page.getByText('1008 half-moves')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('A deterministic stress comment.').first()).toBeVisible();

  expect(consoleFailures).toEqual([]);
  // A generous budget: the point is that a thousand plies is not a hang.
  expect(renderMs).toBeLessThan(45_000);
});

test('an imported game is still on the board after a reload', async ({ page }) => {
  /*
    A bug the Phase 7 audit found rather than a Phase 7 feature. Importing a
    game opened it and left nothing dirty, so autosave never ran, so no draft
    was written — while the indicator said "Draft saved" about a board that a
    reload emptied. The draft is what makes that claim true.
  */
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(SAMPLE_PGN);
  await dialog.getByRole('button', { name: /^(Load|Import)/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Bc4', exact: true })).toBeVisible();

  // Polled on the stored record rather than on the indicator, because the
  // indicator is exactly what used to be wrong: it read "Draft saved" before
  // any draft existed.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const app = (globalThis as typeof globalThis & { __kingfisher?: BrowserRepositories })
            .__kingfisher!;
          const draft = await app.drafts.get();
          return draft ? Object.keys(draft.tree.nodes).length : 0;
        }),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(1);

  await page.reload();
  await ready(page);
  await expect(page.getByRole('button', { name: 'Bc4', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Queue White – Queue Black/).first()).toBeVisible();
});
