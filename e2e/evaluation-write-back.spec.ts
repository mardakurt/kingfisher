/**
 * Stored evaluations written into a study chapter as one undoable batch
 * (Phase 86, P0.3): what the analysis queue stored, by canonical position,
 * added to the chapter the person has open — never over an evaluation it
 * already carries, undone in one step, and refused, with nothing written,
 * when the chapter changed in another tab.
 */

import { expect, test, type Page } from '@playwright/test';

import type { AppRepositories } from '../src/persistence/types';

const READY = 'html[data-kingfisher-ready="true"]';

async function play(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

async function expectSaved(page: Page) {
  await expect(page.getByText('· unsaved', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('· saved', { exact: true })).toBeVisible({ timeout: 15_000 });
}

type App = AppRepositories;

/** The open chapter's id, from storage: the one study with this title. */
async function chapterEvaluations(page: Page, title: string) {
  return page.evaluate(async (wanted) => {
    const repositories = (globalThis as unknown as { __kingfisher: App }).__kingfisher;
    const study = (await repositories.studies.list()).find((entry) => entry.title === wanted)!;
    const full = await repositories.studies.get(study.id);
    const chapter = full!.chapters[0]!;
    const stored = await repositories.studies.getChapter(chapter.id);
    return {
      id: chapter.id,
      revision: stored!.revision,
      evaluations: Object.values(stored!.tree.nodes)
        .filter((node) => node.evaluation)
        .map((node) => node.evaluation!.engine),
    };
  }, title);
}

test('stored evaluations go into the chapter, come back out, and never over a newer version', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/studies');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'New study' }).click();
  await page
    .getByRole('dialog', { name: 'New study' })
    .getByLabel('Title')
    .fill('Write-back study');
  await page.getByRole('button', { name: 'Create study' }).click();
  await page.getByRole('button', { name: 'New chapter' }).click();
  await page.getByRole('dialog', { name: 'New chapter' }).getByLabel('Title').fill('Open games');
  await page.getByRole('button', { name: 'Create chapter' }).click();
  await expect(page.getByText('0 half-moves')).toBeVisible();
  await play(page, 'e2', 'e4');
  await play(page, 'e7', 'e5');
  await play(page, 'g1', 'f3');
  await expectSaved(page);

  // What the analysis queue would have stored, from some other game that
  // reached these positions: two of the three main-line positions.
  await page.evaluate(async () => {
    const repositories = (globalThis as unknown as { __kingfisher: App }).__kingfisher;
    const positions = [
      ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'e7e5', 30],
      ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3', 28],
    ] as const;
    for (const [key, move, cp] of positions) {
      await repositories.analysisQueue.saveEvidence({
        id: `e2e-${key}`,
        jobId: 'e2e-job',
        gameId: 'another-game',
        nodeId: 'n',
        positionKey: key as never,
        fen: `${key} 0 1` as never,
        engineId: 'stockfish',
        engineName: 'Stockfish 18 (queue)',
        score: { kind: 'cp', cp },
        depth: 24,
        nodes: 1_000_000,
        timeMs: 1_000,
        pv: [move as never],
        analysedAt: 1,
      });
    }
  });

  // The chapter stays the open document on the Analysis page, where the
  // document's actions are.
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Analysis', exact: true })
    .click();
  await expect(page).toHaveURL(/\/analysis/);
  const frame = page.locator('[data-workspace-frame="analysis"]');
  await expect(frame.getByRole('button', { name: 'Nf3', exact: true })).toBeVisible();
  const actions = frame.getByRole('button', { name: 'Document actions' });
  await actions.click();
  await page.getByRole('menuitem', { name: 'Add stored evaluations' }).click();
  await expect(page.getByText(/Added 2 stored evaluations/)).toBeVisible();
  const after = await chapterEvaluations(page, 'Write-back study');
  expect(after.evaluations).toEqual(['Stockfish 18 (queue)', 'Stockfish 18 (queue)']);

  // One undo takes the batch back out.
  await actions.click();
  await page.getByRole('menuitem', { name: 'Undo added evaluations' }).click();
  await expect(page.getByText(/Removed 2 added evaluations/)).toBeVisible();
  const undone = await chapterEvaluations(page, 'Write-back study');
  expect(undone.evaluations).toEqual([]);
  expect(undone.revision).toBe(after.revision + 1);

  // Another tab saves the chapter: this tab's revision is now stale, and
  // adding writes nothing and says why.
  await page.evaluate(async (id) => {
    const repositories = (globalThis as unknown as { __kingfisher: App }).__kingfisher;
    const chapter = await repositories.studies.getChapter(id);
    await repositories.studies.saveChapter({ ...chapter!, title: 'Open games, renamed elsewhere' });
  }, undone.id);
  await actions.click();
  await page.getByRole('menuitem', { name: 'Add stored evaluations' }).click();
  await expect(page.getByText(/changed in another tab, so nothing was written/)).toBeVisible();
  const refused = await chapterEvaluations(page, 'Write-back study');
  expect(refused.evaluations).toEqual([]);
  expect(refused.revision).toBe(undone.revision + 1);
});
