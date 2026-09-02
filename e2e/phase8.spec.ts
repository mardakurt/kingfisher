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

const GAME_PGN = `[Event "Phase 8"]
[Site "Local"]
[Date "2026.09.02"]
[Round "1"]
[White "Alpha, A"]
[Black "Beta, B"]
[Result "1-0"]

1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6 7. Bh4 b6 1-0`;

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
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
  await page.getByRole('tab', { name: 'Engine' }).click();
  await expect(page.getByText(/Computer evidence is hidden/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start analysis (E)' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Explorer' }).click();
  await expect(page.getByText(/Computer evidence is hidden/)).toBeVisible();
  await expect(page.getByLabel('Evidence source')).toHaveCount(0);

  // Record three candidates on the journal's own board, an estimate and a plan.
  await page.getByRole('tab', { name: 'Journal' }).click();
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
  await page.getByRole('tab', { name: 'Engine' }).click();
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
  await page.getByRole('tab', { name: 'Journal' }).click();
  await page
    .getByLabel('Workspace tools', { exact: true })
    .getByRole('button', { name: 'Calculation', exact: true })
    .click();
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

  await page.getByRole('button', { name: 'Add to queue' }).click();
  await expect(page.getByText('Added to your review queue.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Alpha, A/ }).first()).toBeVisible();

  // Reveal, then hand the position to training inside a new set.
  await page.getByRole('button', { name: 'Reveal', exact: true }).click();
  await page.getByRole('tab', { name: 'Journal' }).click();
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
