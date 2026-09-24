/**
 * Where many games leave a source (Phase 85): ChessBase's Novelty Annotation
 * over a Library selection, against the built-in reference, reported as facts
 * about that population. The games that left can be saved, annotated, as a
 * study; the stored games are not changed.
 */

import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
}

const header = (white: string, black: string) =>
  `[Event "Club"]\n[Site "Riverside"]\n[Date "2026.05.01"]\n[White "${white}"]\n[Black "${black}"]\n[Result "*"]\n`;

const GAMES = [
  // A Najdorf until move six, then a king walk no reference game has played.
  `${header('Walker, King', 'Najdorf, Fan')}\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Kd2 e5 *`,
  // The same opening, leaving at the same position by undeveloping a knight.
  `${header('Hopper, Rook', 'Najdorf, Fan')}\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Nb1 e5 *`,
  // Two moves that stay inside any reference.
  `${header('Short, Game', 'Main, Line')}\n1. e4 e5 *`,
];

test('finds where each selected game leaves the built-in reference, and saves the facts as a study', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(async (games) => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.games.clear();
    for (const pgn of games) await app.importGames(pgn, app.games);
  }, GAMES);
  await page.goto('/games');
  await ready(page);

  const list = page.locator('[data-library-list]');
  await expect(list.getByText('Walker, King').first()).toBeVisible();
  for (const white of ['Walker, King', 'Hopper, Rook', 'Short, Game']) {
    await list
      .getByRole('checkbox', { name: new RegExp(`^Select ${white}`) })
      .first()
      .check();
  }
  await page.getByRole('button', { name: 'Where they leave the source…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Where the games leave the source' });
  await expect(dialog.getByRole('combobox', { name: 'Departure source' })).toHaveValue(
    'kingfisher-starter',
    { timeout: 120_000 },
  );
  await dialog.getByRole('button', { name: 'Find departures' }).click();

  await expect(dialog.locator('[data-batch-counts]')).toContainText(
    '2 left Kingfisher Starter Reference',
    { timeout: 60_000 },
  );
  await expect(dialog.locator('[data-batch-counts]')).toContainText('1 never left');
  await expect(dialog.locator('[data-batch-row="left"]')).toHaveCount(2);
  await expect(dialog.locator('[data-batch-rows]')).toContainText(
    '6.Kd2 is not in Kingfisher Starter Reference',
  );
  await expect(dialog.locator('[data-batch-rows]')).toContainText(
    '6.Nb1 is not in Kingfisher Starter Reference',
  );
  // The shared Najdorf was asked once for both games.
  await expect(dialog.locator('[data-batch-progress]')).toContainText(
    /3 of 3 games read · \d+ positions asked of Kingfisher Starter Reference, \d+ answered from earlier games in this job/,
  );
  const reused = await dialog
    .locator('[data-batch-progress]')
    .innerText()
    .then((text) => Number(/(\d+) answered from earlier/.exec(text)?.[1] ?? 0));
  expect(reused).toBeGreaterThanOrEqual(11);
  // The rows state facts about the population; none calls a move a novelty.
  await expect(dialog.locator('[data-batch-rows]')).not.toContainText(/novelty/i);

  await dialog.getByRole('button', { name: 'Save 2 annotated copies as a study' }).click();
  await expect(page.getByText(/Saved 2 annotated copies as the study/)).toBeVisible();

  const stored = await page.evaluate(async () => {
    const app = (globalThis as typeof globalThis & { __kingfisher: AppRepositories }).__kingfisher;
    const studies = await app.studies.list();
    const study = studies.find((entry) => entry.title.startsWith('Where 2 games leave'));
    const full = study ? await app.studies.get(study.id) : null;
    const games = await app.games.search({ limit: 10 });
    const originals = await Promise.all(games.games.map((game) => app.games.get(game.id)));
    return {
      title: study?.title ?? null,
      chapters: full?.chapters.map((chapter) =>
        Object.values(chapter.tree.nodes)
          .map((node) => node.comment ?? '')
          .join(' '),
      ),
      originalComments: originals
        .flatMap((game) => Object.values(game?.tree.nodes ?? {}))
        .map((node) => node.comment ?? '')
        .join(''),
    };
  });
  expect(stored.title).toBe('Where 2 games leave Kingfisher Starter Reference');
  expect(stored.chapters).toHaveLength(2);
  for (const comments of stored.chapters ?? []) {
    expect(comments).toContain('Not in Kingfisher Starter Reference:');
  }
  // The stored games themselves were not written to.
  expect(stored.originalComments).toBe('');
});
