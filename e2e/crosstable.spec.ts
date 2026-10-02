import { expect, test, type Page } from '@playwright/test';

import type { importGames } from '../src/persistence/import-game';
import type { AppRepositories } from '../src/persistence/types';

/**
 * The tournament table from the Library's preview: built from exactly the
 * games this database holds for the event and year, scored by hand below.
 *
 *   Alpha: beat Beta, drew Gamma, beat Delta = 2½  (SB 2.75)
 *   Beta:  lost Alpha, beat Gamma, drew Delta = 1½  (SB 1.75)
 *   Gamma: drew Alpha, lost Beta, beat Delta  = 1½  (SB 1.75)
 *   Delta: lost Alpha, drew Beta, lost Gamma  = ½   (SB 0.75)
 *
 * The same event a year later, and a different event the same year, are
 * both in the database and must not reach the table.
 */

const game = (
  event: string,
  date: string,
  round: string,
  white: string,
  black: string,
  result: string,
) => `[Event "${event}"]
[Site "Testville"]
[Date "${date}"]
[Round "${round}"]
[White "${white}"]
[Black "${black}"]
[WhiteElo "2500"]
[BlackElo "2500"]
[Result "${result}"]

1. e4 e5 2. Nf3 Nc6 ${result}
`;

const PGN = [
  game('Crosstable Invitational', '2025.03.01', '1', 'Alpha, A', 'Beta, B', '1-0'),
  game('Crosstable Invitational', '2025.03.01', '1', 'Gamma, G', 'Delta, D', '1-0'),
  game('Crosstable Invitational', '2025.03.02', '2', 'Gamma, G', 'Alpha, A', '1/2-1/2'),
  game('Crosstable Invitational', '2025.03.02', '2', 'Beta, B', 'Delta, D', '1/2-1/2'),
  game('Crosstable Invitational', '2025.03.03', '3', 'Alpha, A', 'Delta, D', '1-0'),
  game('Crosstable Invitational', '2025.03.03', '3', 'Beta, B', 'Gamma, G', '1-0'),
  game('Crosstable Invitational', '2026.03.01', '1', 'Delta, D', 'Alpha, A', '1-0'),
  game('Another Open', '2025.05.01', '1', 'Delta, D', 'Beta, B', '1-0'),
].join('\n');

async function seed(page: Page) {
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
  await page.evaluate(async (text) => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.importGames(text, app.games);
  }, PGN);
  await page.reload();
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

test('a game opens its tournament table, scored and ordered from the event’s own games', async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole('row', { name: /Alpha, A.*Beta, B|Beta, B.*Alpha, A/ })
    .first()
    .click();
  const preview = page.locator('[data-library-preview]');
  await preview.locator('[data-library-tournament]').click();

  const table = page.locator('[data-crosstable]');
  await expect(table.locator('[data-crosstable-format="round-robin"]')).toBeVisible();
  const rows = table.locator('[data-crosstable-grid] tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveAttribute('data-crosstable-player', 'Alpha, A');
  await expect(rows.nth(0)).toContainText('2½');
  await expect(rows.nth(0)).toContainText('2.75');
  await expect(rows.nth(3)).toHaveAttribute('data-crosstable-player', 'Delta, D');
  await expect(rows.nth(3)).toContainText('0.75');
  // Six games: the 2026 rematch and the other event stayed out.
  await expect(table).toContainText('4 players · 6 games');
  await expect(table.locator('[data-crosstable-caveat]')).toContainText(
    'Built from 6 games in this database; a complete round robin',
  );

  // A result in the grid is a game: Delta's "1" against Gamma does not exist,
  // Delta's "½" against Beta does, and it opens on the board.
  await rows.nth(3).locator('[data-crosstable-cell]', { hasText: '½' }).click();
  await page.waitForURL('**/analysis');
  await expect(page.locator('[data-workspace-frame="analysis"]')).toContainText('Beta, B');
});

test('progress by round shows the running tournament', async ({ page }) => {
  await seed(page);
  await page
    .getByRole('row', { name: /Gamma, G.*Delta, D/ })
    .first()
    .click();
  await page.locator('[data-library-preview] [data-library-tournament]').click();
  await page.locator('[data-crosstable-rounds]').click();
  const progress = page.locator('[data-crosstable-progress]');
  await expect(progress.locator('thead')).toContainText('R1');
  await expect(progress.locator('thead')).toContainText('R3');
  await expect(progress.locator('tbody tr')).toHaveCount(4);
});
