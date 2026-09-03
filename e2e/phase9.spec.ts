/**
 * The workflows Phase 9 exists for.
 *
 * The calculation test is the important one, for the same reason the Phase 8
 * self-analysis test was: it asserts the *absence* of evidence. A regression
 * there would not look like a failure — it would look like an engine line
 * appearing beside a position somebody asked to think about unaided.
 *
 * The transposition test is the second: it asserts that editing a repertoire
 * decision through one move order changes what every other move order shows.
 * That is the claim the whole position-keyed design rests on, and it is the one
 * a reasonable person would not believe without being shown.
 */

import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

const OPPONENT_GAMES = `[Event "Prep A"]
[Date "2026.02.01"]
[White "Opponent, O"]
[Black "Rival, R"]
[WhiteElo "2700"]
[Opening "Catalan Opening"]
[Result "1-0"]

1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. g3 1-0

[Event "Prep B"]
[Date "2026.03.01"]
[White "Opponent, O"]
[Black "Second, S"]
[WhiteElo "2690"]
[Opening "London System"]
[Result "1/2-1/2"]

1. d4 d5 2. Bf4 Nf6 3. e3 1/2-1/2

[Event "Prep C"]
[Date "2019.03.01"]
[White "Opponent, O"]
[Black "Third, T"]
[WhiteElo "2650"]
[Opening "Catalan Opening"]
[Result "1-0"]

1. Nf3 Nf6 2. d4 e6 3. c4 d5 4. g3 1-0`;

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/** Wait for the development persistence bridge, not just a painted page. */
async function bridgeReady(page: Page) {
  await page.waitForFunction(
    () => Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    undefined,
    { timeout: 30_000 },
  );
}

async function importGames(page: Page, pgn: string) {
  await page.goto('/games');
  await ready(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(pgn);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();
}

/** Play a move on the nth chessboard on the page. */
async function playOn(page: Page, boardIndex: number, from: string, to: string) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).nth(boardIndex);
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

test('a tournament preparation session carries an opponent through to a game-day sheet', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleFailures: string[] = [];
  page.on('pageerror', (error) => consoleFailures.push(error.message));

  await importGames(page, OPPONENT_GAMES);

  await page.goto('/preparation');
  await ready(page);

  // Create the session first: it states the colour, which decides what the
  // dossier is even about.
  await page.getByRole('button', { name: 'New session' }).click();
  const dialog = page.getByRole('dialog', { name: 'New preparation session' });
  await dialog.getByLabel('Title').fill('Round 6');
  await dialog.getByLabel('Opponent').fill('Opponent, O');
  await dialog.getByRole('radio', { name: 'Black' }).check();
  await dialog.getByRole('button', { name: 'Create session' }).click();
  await expect(dialog).toBeHidden();

  // Creating it with an opponent runs the search, so the tree is already built.
  await expect(page.getByText('I have Black')).toBeVisible();
  await expect(page.getByText('Game-day sheet')).toBeVisible();

  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  await selectTool(page, dock, 'Opening tree');

  // The dossier states the evidence before anything derived from it.
  await expect(dock.getByText(/3 games · 3 as White/)).toBeVisible();

  // Recent versus historical, with the thin-sample warning doing its job.
  await dock.getByRole('button', { name: 'Changed' }).click();
  await expect(dock.getByText(/Too few games/)).toBeVisible();

  // Move orders that actually occurred, not inferred tendencies.
  await dock.getByRole('button', { name: 'Move orders' }).click();
  await expect(dock.getByText('1.Nf3 before d4')).toBeVisible();

  // The highest-priority gap, with its reason printed.
  await expect(dock.getByText(/no prepared answer/i).first()).toBeVisible();

  // Carry a position onto the sheet.
  await page.getByRole('button', { name: 'Add to sheet' }).click();
  await expect(page.getByText('Added to the game-day sheet.')).toBeVisible();

  await page.getByRole('button', { name: /Game-day sheet/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Game-day sheet' });
  await expect(sheet.getByText('Round 6 · vs Opponent, O')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Print / export' })).toBeEnabled();
  // Both export formats are offered from the sheet itself.
  await expect(sheet.getByRole('button', { name: 'Markdown' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'PGN' })).toBeVisible();

  expect(consoleFailures).toEqual([]);
});

test('calculation hides every source of evidence until the lines are submitted', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await ready(page);
  await bridgeReady(page);

  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  await selectTool(page, dock, 'Calculation');
  await page.getByRole('button', { name: 'Start calculation' }).click();

  /*
    The gate. Every evidence tool must be withheld — and withheld visibly,
    because "empty" and "hidden by your own choice" are different states.
  */
  await expect(
    dock.getByText(/Engine, explorer, database, tablebase and repertoire are hidden/),
  ).toBeVisible();
  for (const tool of ['Engine', 'Explorer', 'Database']) {
    await selectTool(page, dock, tool);
    await expect(dock.getByText('Evidence is hidden while you calculate.')).toBeVisible();
  }
  await selectTool(page, dock, 'Calculation');

  // Enter two candidates, one of them a real line rather than a single move.
  // The calculation board is the second board on the page.
  await playOn(page, 1, 'e2', 'e4');
  await playOn(page, 1, 'e7', 'e5');
  await expect(dock.getByText('e4 e5').first()).toBeVisible();
  await dock.getByRole('button', { name: 'To start' }).click();
  await playOn(page, 1, 'd2', 'd4');
  await expect(dock.getByText('d4', { exact: true }).first()).toBeVisible();

  // The candidate list is derived from the tree's roots.
  await dock.getByRole('button', { name: 'e4', exact: true }).click();
  await dock.getByRole('radio', { name: 'Equal' }).click();
  await dock.getByLabel('Evaluation estimate in pawns').fill('0.2');
  await dock.getByLabel('Calculation notes').fill('Open game, nothing forced.');

  await dock.getByRole('button', { name: 'Submit and reveal' }).click();
  await expect(dock.getByText(/Recorded and frozen/)).toBeVisible();

  /*
    A calculated position joins the review queue, so the loop that brings a
    position you thought hard about back weeks later applies to positions you
    studied and not only to games you played.
  */
  await expect(dock.getByRole('heading', { name: 'Review again' })).toBeVisible();
  await dock.getByRole('button', { name: 'In a week' }).click();
  // The confirmation is a global notice, not part of the dock.
  await expect(page.getByText(/Scheduled: due in 7 days/i)).toBeVisible();

  // After the reveal the dock is usable again.
  await selectTool(page, dock, 'Engine');
  await expect(dock.getByText('Evidence is hidden while you calculate.')).toHaveCount(0);

  // The record landed in the journal, with the tree attached.
  const stored = await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher?: {
          review: {
            listDecisions(): Promise<
              {
                candidates: { san: string }[];
                calculation?: unknown[];
                revealedAt?: number;
              }[]
            >;
          };
        };
      }
    ).__kingfisher!;
    const [decision] = await app.review.listDecisions();
    return {
      candidates: decision?.candidates.map((candidate) => candidate.san) ?? [],
      branches: decision?.calculation?.length ?? 0,
      revealed: Boolean(decision?.revealedAt),
    };
  });

  expect(stored.candidates).toEqual(['e4', 'd4']);
  expect(stored.branches).toBe(2);
  expect(stored.revealed).toBe(true);
});

test('a repertoire decision is shared by every move order that reaches it', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await ready(page);
  await bridgeReady(page);

  /*
    Two move orders into one Queen's Gambit Declined position, filed as one
    repertoire. The claim under test is that they are one decision, so the
    repertoire is built through move order A and read through move order B.
  */
  for (const move of [
    ['d2', 'd4'],
    ['g8', 'f6'],
    ['c2', 'c4'],
    ['e7', 'e6'],
    ['g1', 'f3'],
    ['d7', 'd5'],
    ['b1', 'c3'],
  ]) {
    await playOn(page, 0, move[0]!, move[1]!);
  }
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
  await page.getByLabel('Title').fill('QGD transpositions');
  await page.getByRole('button', { name: /Save \d+ position/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add to repertoire' })).toBeHidden();

  // Now arrive at the same position by a different order.
  await page.getByRole('button', { name: 'New analysis' }).click();
  for (const move of [
    ['g1', 'f3'],
    ['d7', 'd5'],
    ['d2', 'd4'],
    ['g8', 'f6'],
    ['c2', 'c4'],
    ['e7', 'e6'],
  ]) {
    await playOn(page, 0, move[0]!, move[1]!);
  }

  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  await selectTool(page, dock, 'Repertoire');

  // The decision made through the other move order is here, and the panel says
  // why: one record, reached several ways.
  await expect(dock.getByText('Reached through')).toBeVisible();
  await expect(dock.getByText(/editing it through any route changes every route/)).toBeVisible();
});

test('the endgame library stores what the player chose, with tablebase eligibility counted', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/endgame');
  await ready(page);
  await bridgeReady(page);

  // A three-piece rook ending, set up through the bridge so the test is about
  // the library rather than about dragging pieces.
  await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher?: {
          endgames: {
            create(input: Record<string, unknown>): Promise<{ id: string; pieceCount: number }>;
          };
        };
      }
    ).__kingfisher!;
    await app.endgames.create({
      positionKey: '7k/8/8/8/8/8/8/R6K w - -',
      fen: '7k/8/8/8/8/8/8/R6K w - - 0 1',
      sideToMove: 'w',
      title: 'Rook and king against king',
      category: 'rook',
      goal: 'convert-win',
    });
  });

  await page.reload();
  await ready(page);
  await expect(page.getByText('Rook and king against king')).toBeVisible();
  // The piece count is counted from the board, so eligibility is a fact.
  await expect(page.getByText(/3 pieces · tablebase/)).toBeVisible();

  // Filtering is by the player's own category.
  await page.getByLabel('Endgame category').selectOption('pawn');
  await expect(page.getByText('Rook and king against king')).toHaveCount(0);
  await page.getByLabel('Endgame category').selectOption('rook');
  await expect(page.getByText('Rook and king against king')).toBeVisible();

  // The tablebase tool states where a proof would come from.
  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  await selectTool(page, dock, 'Tablebase');
  await expect(dock.getByText('Tablebase')).toBeVisible();
});

test('a pasted position finds everywhere it is stored', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await ready(page);
  await bridgeReady(page);

  await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher?: {
          openingFiles: {
            create(input: Record<string, unknown>): Promise<{ id: string; revision: number }>;
            addPosition(
              id: string,
              revision: number,
              position: Record<string, unknown>,
            ): Promise<unknown>;
          };
        };
      }
    ).__kingfisher!;
    const file = await app.openingFiles.create({ name: 'Start position file', color: 'w' });
    await app.openingFiles.addPosition(file.id, file.revision, {
      positionKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      line: [],
    });
  });

  await page.getByRole('button', { name: /Search commands/ }).click();
  // A FEN with different move counters: the canonical key is what matches.
  await page
    .getByPlaceholder(/Search commands/)
    .fill('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 40 90');

  // The record's kind is the palette's group column, and its name the title.
  await expect(
    page.getByRole('button', { name: /Opening file.*Start position file/ }),
  ).toBeVisible();
});

test('focus mode hides the navigation and Escape brings it back', async ({ page }) => {
  await page.goto('/analysis');
  await ready(page);

  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();

  await page.getByRole('button', { name: /Search commands/ }).click();
  await page.getByPlaceholder(/Search commands/).fill('focus mode');
  // Palette results are ordinary buttons whose accessible name is the group
  // plus the title, so this matches the entry and not the trigger.
  await page
    .getByRole('button', { name: /Focus mode/ })
    .first()
    .click();

  await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0);
  // A mode that hides the way out has to say how to leave.
  await expect(page.getByText('Navigation hidden. The command palette still works.')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
});
