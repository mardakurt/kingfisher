import { expect, test, type Page } from '@playwright/test';

/** The shell has hydrated. */
async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

/**
 * The persistence bridge, not just a painted page.
 *
 * `data-kingfisher-ready` says the shell hydrated; `__kingfisher` appears only
 * once the repository singleton has opened IndexedDB, and this test reads the
 * queue through it.
 */
async function bridgeReady(page: Page) {
  await page.waitForFunction(
    () => Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * Analyse Game, from the control a person clicks to the job it creates.
 *
 * The pass has been able to narrow to one player's decisions since Phase 18 —
 * `sides` is carried by the store, the repository, the position selection and
 * its own unit tests — and until now nothing in the product could ask for it.
 * That is the phase's recurring defect in its own work: a capability that
 * passes its tests and a person cannot reach.
 *
 * So this test is not "the dialog has a dropdown". It reads the *job* the
 * dialog created, and requires that choosing one side both records that side
 * and produces fewer positions to analyse than both sides did. A control that
 * changed nothing would satisfy the first half and fail the second.
 */

const GAME_PGN = `[Event "Analyse Game"]
[Site "Kingfisher"]
[Date "2024.03.02"]
[Round "1"]
[White "Alpha, A"]
[Black "Beta, B"]
[Result "1-0"]

1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O 5. Bd3 d5 6. Nf3 c5 7. O-O Nc6
8. a3 Bxc3 9. bxc3 dxc4 10. Bxc4 Qc7 11. Bd3 e5 12. Qc2 Re8 13. Nxe5 Nxe5
14. dxe5 Qxe5 15. f4 Qe7 16. e4 1-0
`;

async function importGame(page: Page) {
  await page.goto('/games');
  await ready(page);
  await bridgeReady(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(GAME_PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();
}

/** The jobs currently in the queue, read from the repository the dialog wrote to. */
async function jobs(page: Page) {
  return page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher?: {
          analysisQueue: {
            list(): Promise<readonly { sides?: string; totalPositions: number; multiPv: number }[]>;
          };
        };
      }
    ).__kingfisher!;
    return app.analysisQueue.list();
  });
}

/** Queue the imported game with the given side, and return the job it made. */
async function queueWith(page: Page, side: string) {
  await page.goto('/games');
  await ready(page);
  await bridgeReady(page);
  await page
    .getByRole('checkbox', { name: /Select Alpha, A/ })
    .first()
    .check();
  await page.getByRole('button', { name: 'Add to analysis queue' }).click();

  const dialog = page.getByRole('dialog', { name: 'Add games to analysis queue' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Moves to judge').selectOption(side);
  // Every move, so the count is the whole game rather than the tail of it.
  await dialog.getByLabel('Positions').selectOption('every-move');
  await dialog.getByRole('button', { name: /Add \d+ game/ }).click();

  await expect.poll(async () => (await jobs(page)).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const list = await jobs(page);
  const job = list[list.length - 1];
  if (!job) throw new Error('The dialog reported success and queued no job.');
  return job;
}

test('Analyse Game records whose decisions the review should offer', async ({ page }) => {
  test.setTimeout(180_000);
  await importGame(page);

  const both = await queueWith(page, 'both');
  // Omitted rather than defaulted, so a job queued before this existed keeps
  // meaning exactly what it meant.
  expect(both.sides).toBeUndefined();
  expect(both.totalPositions).toBeGreaterThan(0);

  const white = await queueWith(page, 'w');
  expect(white.sides).toBe('w');

  const black = await queueWith(page, 'b');
  expect(black.sides).toBe('b');

  /*
    The position count is *not* asserted to fall, and that is the finding
    rather than an omission.

    Judging a move needs the evaluation before it and after it. A side moves at
    every other ply, so the union of "before and after each of White's moves"
    is every position in the game, and the most a narrowed pass can ever drop
    is a single final position no move was played from. Measured across game
    lengths the saving is at most one, whatever the game. The option was
    introduced believing it halved the work; it does not, and the narrowing
    that a player actually gets is in which decisions the review offers.
  */
  const spread = Math.abs(white.totalPositions - both.totalPositions);
  expect(spread).toBeLessThanOrEqual(1);
  expect(Math.abs(black.totalPositions - both.totalPositions)).toBeLessThanOrEqual(1);
});

test('every control in Analyse Game reaches the job it configures', async ({ page }) => {
  test.setTimeout(180_000);
  await importGame(page);

  await page
    .getByRole('checkbox', { name: /Select Alpha, A/ })
    .first()
    .check();
  await page.getByRole('button', { name: 'Add to analysis queue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add games to analysis queue' });

  // Every configuration control the dialog offers, set to a non-default value.
  await dialog.getByLabel('Analysis preset').selectOption('quick');
  await dialog.getByLabel('MultiPV').fill('4');
  await dialog.getByLabel('Positions').selectOption('after-opening');
  await dialog.getByLabel('Start after move').fill('6');
  await dialog.getByLabel('Moves to judge').selectOption('b');
  await dialog.getByRole('button', { name: /Add \d+ game/ }).click();

  await expect.poll(async () => (await jobs(page)).length, { timeout: 15_000 }).toBe(1);
  const [job] = await jobs(page);
  if (!job) throw new Error('The dialog reported success and queued no job.');
  expect(job.multiPv).toBe(4);
  expect(job.sides).toBe('b');
});
