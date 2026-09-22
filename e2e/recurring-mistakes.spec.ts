import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
}

const pgn = (index: number, result: '1-0' | '0-1') => `[Event "Recurring facts"]
[Site "Club"]
[Date "2026.09.${String(15 + index).padStart(2, '0')}"]
[Round "${index}"]
[White "Recurring Player"]
[Black "Opponent ${index}"]
[Result "${result}"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 ${result}`;

test('Improvement shows the four factual joins, changes the threshold, and opens evidence', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(
    async ({ games }) => {
      const app = (
        globalThis as typeof globalThis & {
          __kingfisher: AppRepositories & { importGames: typeof importGames };
        }
      ).__kingfisher;
      await app.profile.setAliases(['Recurring Player']);
      for (const record of games) await app.importGames(record, app.games);

      const summaries = await app.games.search({ limit: 10 });
      const full = await app.games.getMany(summaries.games.map((summary) => summary.id));
      const engineGame = full.find((record) => record.black === 'Opponent 2')!;
      const path: string[] = [];
      let node = engineGame.tree.nodes[engineGame.tree.rootId]!;
      path.push(node.id);
      while (node.children[0]) {
        node = engineGame.tree.nodes[node.children[0]]!;
        path.push(node.id);
      }
      const before = engineGame.tree.nodes[path[2]!]!;
      const after = engineGame.tree.nodes[path[3]!]!;
      const jobId = 'recurring-engine-job';
      const storedEvidence = (
        nodeId: typeof before.id,
        fen: typeof before.fen,
        score: number,
        at: number,
      ) => ({
        id: `${jobId}|${nodeId}`,
        jobId,
        gameId: engineGame.id,
        nodeId,
        positionKey: 'recurring-test-position',
        fen,
        engineId: 'stockfish-wasm',
        engineName: 'Stockfish',
        score: { kind: 'cp' as const, cp: score },
        depth: 18,
        nodes: 10_000,
        timeMs: 500,
        pv: [],
        analysedAt: at,
      });
      await app.analysisQueue.saveEvidence(storedEvidence(before.id, before.fen, 50, 1));
      await app.analysisQueue.saveEvidence(storedEvidence(after.id, after.fen, -100, 2));

      const repertoire = await app.repertoires.create({
        title: 'White match repertoire',
        color: 'w',
      });
      await app.repertoires.upsertPosition({
        repertoireId: repertoire.id,
        fen: before.fen,
        sideToMove: 'w',
        depth: 2,
        moves: [],
      });
      const beforeParts = before.fen.split(' ');
      const canonicalBefore = [beforeParts[0], beforeParts[1], beforeParts[2], '-'].join(' ');
      await app.endgames.create({
        positionKey: canonicalBefore,
        fen: before.fen,
        sideToMove: 'w',
        title: 'Saved test ending',
        category: 'rook',
        goal: 'study',
      });
    },
    {
      games: [pgn(1, '1-0'), pgn(2, '0-1'), pgn(3, '0-1'), pgn(4, '0-1'), pgn(5, '0-1')],
    },
  );

  await page.goto('/review');
  await ready(page);
  await page.getByRole('tab', { name: 'Improvement' }).click();

  await expect(page.getByText(/facts in your games this period/)).toBeVisible();
  for (const heading of [
    'What the engine flagged',
    'What the same structure lost',
    'What this endgame type lost',
    'What this opening left',
  ]) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Stockfish depth 18/)).toBeVisible();
  await expect(page.getByText(/1W · 4L · 0D · 5 games · 20% score/).first()).toBeVisible();

  await page.getByLabel('Engine loss threshold').selectOption('200');
  await expect(page.getByText(/No stored engine pair crosses this threshold/)).toBeVisible();
  await page.getByLabel('Engine loss threshold').selectOption('100');
  await expect(page.getByText(/Stockfish depth 18/)).toBeVisible();

  const engineSection = page
    .getByRole('heading', { name: 'What the engine flagged', exact: true })
    .locator('..');
  await engineSection.getByRole('button', { name: /Recurring Player/ }).click();
  await page.waitForURL(/\/analysis$/);
  await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nf3', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('an endgame fact opens its category filter', async ({ page }) => {
  await page.goto('/endgame?category=rook');
  await ready(page);
  await expect(page.getByLabel('Endgame category')).toHaveValue('rook');
});
