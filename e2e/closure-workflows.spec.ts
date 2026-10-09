import { expect, test } from '@playwright/test';
import type { AppRepositories } from '../src/persistence/types';
import { settingsButton } from './support/settings-control';
import { selectTool } from './tools';

const READY = 'html[data-kingfisher-ready="true"]';

test.afterEach(async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath('screen.png') });
});

test('saving profile names preserves favourites used by Preparation', async ({ page }, info) => {
  await page.goto('/player/carlsen%2C%20magnus');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Add to favourites', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favourite', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('profile-favourite.png') });
  // Preparation's saved-opponent list belongs to the personal profile.
  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as { __kingfisher?: AppRepositories }).__kingfisher),
  );
  await page.evaluate(async () => {
    const app = (globalThis as unknown as { __kingfisher: AppRepositories }).__kingfisher;
    await app.profile.addFavoritePlayer('Carlsen, Magnus', 'Prepare for this opponent');
  });
  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Profile', exact: true }).click();
  await settings.getByPlaceholder('e.g. Magnus').fill('Closure test');
  await settings.locator('textarea').fill('Closure, Player');
  await settings.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByText('Saved as Closure test.', { exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto('/preparation');
  const favourites = page.getByRole('combobox', { name: 'Favourite players' });
  await expect(favourites).toBeVisible();
  await favourites.selectOption('Carlsen, Magnus');
  await expect(
    page.getByRole('heading', { name: 'Preparation against Carlsen, Magnus' }),
  ).toBeVisible();
});

test('the storage status downloads portable preferences with the backup', async ({
  page,
}, info) => {
  // A granted persistence boundary makes the status popover directly reachable.
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => true });
    localStorage.setItem(
      'kingfisher.preferences',
      JSON.stringify({
        state: { engineThreads: 6, boardTheme: 'walnut' },
        version: 7,
      }),
    );
  });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  const status = page.getByTestId('storage-persistence-status');
  await expect(status).toHaveAttribute('data-write-state', 'saved');
  await status.getByRole('button').click();
  await expect(page.getByRole('dialog', { name: 'Saved status' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('status-backup.png') });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup', exact: true }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(backup.preferences.engineThreads).toBe(6);
  expect(backup.preferences.boardTheme).toBe('walnut');
});

test('My games speed filters keep distinct recorded time controls apart', async ({ page }) => {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog
    .getByRole('textbox')
    .fill(
      ['180+2', '1800+30']
        .map(
          (time, i) =>
            `[Event "Speed filter fixture ${i}"]\n[White "Test A"]\n[Black "Test B"]\n[TimeControl "${time}"]\n[Result "*"]\n\n1. e4 e5 *`,
        )
        .join('\n\n'),
    );
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();
  const dock = page.locator('[data-workspace-dock]').first();
  await selectTool(page, dock, 'Explorer');
  await dock.getByRole('combobox', { name: 'Evidence source' }).selectOption('local-collection');
  await expect(dock).toContainText('2 games here');
  await dock.getByRole('button', { name: 'Explorer filters' }).click();
  await dock.getByRole('button', { name: 'Blitz', exact: true }).click();
  await expect(dock).toContainText('1 game here');
  await dock.getByRole('button', { name: 'Rapid', exact: true }).click();
  await expect(dock).toContainText('No games reach this position');
  await dock.getByRole('button', { name: 'All', exact: true }).click();
  await expect(dock).toContainText('2 games here');
});

test('tablebase-perfect defence declines a reply when the tablebase supplies no move', async ({
  page,
}) => {
  // Exercise the real provider and trainer with a deliberately incomplete HTTP answer.
  await page.route('https://tablebase.lichess.ovh/**', (route) =>
    route.fulfill({
      json: {
        category: 'loss',
        dtz: -20,
        dtm: null,
        checkmate: false,
        stalemate: false,
        moves: [],
      },
    }),
  );
  const fen = '8/8/8/4k3/8/8/4K3/4R3 b - - 0 1';
  await page.goto(`/analysis?fen=${encodeURIComponent(fen)}`);
  await page.locator(READY).waitFor();
  const dock = page.locator('[data-workspace-dock]').first();
  await selectTool(page, dock, 'Play it out');
  await dock.getByLabel('Play as').selectOption('w');
  await dock.getByLabel('Opponent').selectOption('tablebase-perfect');
  await dock.getByRole('button', { name: 'Play it out', exact: true }).click();
  await expect(dock).toContainText('The tablebase did not answer, so no defence was played.');
  await expect(dock.getByRole('gridcell', { name: 'e5, Black king', exact: true })).toBeVisible();
  await expect(page.locator('footer')).toContainText('Engine off');
});

test('repertoire coverage distinguishes a queried source from an uninstalled one', async ({
  page,
}) => {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as { __kingfisher?: AppRepositories }).__kingfisher),
  );
  await page.evaluate(async () => {
    const app = (globalThis as unknown as { __kingfisher: AppRepositories }).__kingfisher;
    const repertoire = await app.repertoires.create({ title: 'Coverage fixture', color: 'w' });
    await app.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' as never,
      sideToMove: 'w',
      depth: 0,
      moves: [{ uci: 'e2e4' as never, san: 'e4' as never, role: 'main', updatedAt: Date.now() }],
    });
  });
  await page.goto('/repertoire');
  const coverage = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Coverage against reference', exact: true }),
  });
  await expect(coverage).toContainText('top gaps');
  await expect(coverage).toContainText('d4');
  await coverage.getByRole('combobox').selectOption('kingfisher-elite-otb');
  await expect(coverage).toContainText('This reference is not installed.');
  await expect(coverage.getByRole('button', { name: 'Train these gaps' })).toHaveCount(0);
  await coverage.getByRole('combobox').selectOption('kingfisher-starter');
  await expect(coverage).toContainText('top gaps');
  await coverage.scrollIntoViewIfNeeded();
});
