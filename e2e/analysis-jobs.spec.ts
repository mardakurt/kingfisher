/**
 * Every durable analysis job in one list (Phase 86, P0.3), reached from the
 * command palette: a queued game and a deep analysis that was saved and is
 * waiting to be resumed, each with its engine, budget and checkpoint.
 */

import { expect, test } from '@playwright/test';

import type { AppRepositories } from '../src/persistence/types';

test('the analysis jobs list shows the queue and deep analysis in one vocabulary', async ({
  page,
}) => {
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  await page.evaluate(async () => {
    const app = (globalThis as unknown as { __kingfisher: AppRepositories }).__kingfisher;
    const job = await app.analysisQueue.enqueue({
      gameId: 'g-jobs',
      gameLabel: 'Jobs, White – Jobs, Black',
      engineId: 'stockfish-browser',
      preset: 'standard',
      multiPv: 3,
      limit: { kind: 'depth', depth: 18 },
      strategy: 'every-move',
      startPly: 0,
      totalPositions: 40,
    });
    await app.analysisQueue.update(job.id, { status: 'paused', nextIndex: 12 });
    await app.deepAnalysis.create({
      startFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      engineId: 'stockfish-browser',
      engineName: 'Stockfish 18 (browser)',
      options: { breadth: 3, marginCp: 30, maxPlies: 20, budget: 200, msPerPosition: 2_000 },
      status: 'running',
      searched: 57,
      root: {
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        depthFromRoot: 0,
        children: [],
      },
      resumed: 1,
      startedAt: 1,
    });
  });

  await page.locator('button[aria-label="Search commands"]').click();
  const palette = page.locator('div[role="dialog"][aria-label="Command palette"]');
  await palette.locator('input[role="searchbox"]').fill('Analysis jobs');
  await palette.getByText('Analysis jobs', { exact: true }).first().click();

  const jobs = page.locator('[data-analysis-jobs]');
  const queued = jobs.locator('[data-analysis-job="paused"]', { hasText: 'Jobs, White' });
  await expect(queued).toContainText('Analysis queue');
  await expect(queued).toContainText('depth 18 a position · MultiPV 3');
  await expect(queued).toContainText('12 of 40 positions');
  // Saved, and nothing in this page is working on it: paused, with its checkpoint.
  const deep = jobs.locator('[data-analysis-job="paused"]', { hasText: 'Deep analysis' });
  await expect(deep).toContainText('Stockfish 18 (browser)');
  await expect(deep).toContainText('57 of 200 positions searched');
  await expect(deep).toContainText('resumed 1×');
});
