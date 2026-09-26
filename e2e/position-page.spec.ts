import { expect, test, type Page } from '@playwright/test';
import type { AppRepositories } from '../src/persistence/types';
import type { importGames } from '../src/persistence/import-game';
import type { Fen, San, Uci } from '../src/chess/types';
import { isNavigationAbortNoise } from './tools';

const FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
const KEY = FEN.split(' ').slice(0, 4).join(' ');
const URL = `/position?fen=${encodeURIComponent(FEN)}`;

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(() =>
    Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
  );
}

async function seed(page: Page) {
  await page.goto('/analysis');
  await ready(page);
  return page.evaluate(
    async ({ fen, key }) => {
      const app = (
        globalThis as typeof globalThis & {
          __kingfisher: AppRepositories & { importGames: typeof importGames };
        }
      ).__kingfisher;
      await app.profile.setAliases(['Ana']);
      await app.importGames(
        '[Event "Club season"]\n[White "Ana"]\n[Black "Rival"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 {[%emt 0:00:13] [%clk 0:04:40]} 1-0',
        app.games,
      );
      await app.importGames(
        '[White "Sideline"]\n[Black "Study"]\n\n1. e4 e5 2. Nc3 (2. Nf3 Nf6) Nc6 *',
        app.games,
      );
      const source = (await app.games.search({ player: 'Sideline' })).games[0]!;
      const game = (await app.games.get(source.id))!;
      const study = await app.studies.create({ title: 'Open-game notes' });
      const chapter = await app.studies.createChapter({
        studyId: study.id,
        title: 'A sideline to remember',
        tree: game.tree,
      });
      const team = await app.team.createTeam({
        name: 'Academy',
        members: [{ name: 'Ana', role: 'student' }],
        meIndex: 0,
      });
      const assignment = await app.team.createAssignment({
        teamId: team.id,
        title: 'Round analysis',
        kind: 'game',
        brief: '',
        setBy: team.members[0]!.id,
      });
      await app.team.addHandover(assignment.id, assignment.revision, {
        kind: 'hand-in',
        authorId: team.members[0]!.id,
        note: 'The critical position.',
        pgn: '1. e4 e5 2. Nc3 (2. Nf3 Nc6) Nf6 *',
      });
      await app.pinnedLines.pin({
        positionKey: key,
        fen: fen as Fen,
        engineId: 'fixture-engine',
        engineName: 'Recorded fixture engine',
        multiPv: 1,
        score: { kind: 'cp', cp: 42 },
        depth: 19,
        nodes: 12345,
        timeMs: 1200,
        pvUci: ['b8c6' as Uci],
        pvSan: ['Nc6' as San],
      });
      await app.training.create({
        mode: 'best-move',
        positionKey: key,
        fen: fen as Fen,
        sideToMove: 'b',
        prompt: 'Remember this reply',
        solutionUci: ['b8c6' as Uci],
        solutionSan: ['Nc6' as San],
        candidatesUci: [],
        plans: [],
        tags: [],
      });
      return { studyId: study.id, chapterId: chapter.id };
    },
    { fen: FEN, key: KEY },
  );
}

test('a position joins local work, clocks and stored evidence and opens the matching nodes', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  // A cancelled load at a navigation is engine noise (e2e/tools.ts), not an error.
  page.on('pageerror', (error) => {
    if (!isNavigationAbortNoise(error.message, browserName)) errors.push(error.message);
  });
  const seeded = await seed(page);
  await page.goto(URL);
  await ready(page);
  await expect(page).toHaveTitle(/Position/);
  await expect(page.getByRole('heading', { name: 'Position page', exact: true })).toBeVisible();
  await expect(page.locator('[data-position-key]')).toHaveText(KEY);
  /*
   * Two sections list this game: "Games from this position" (where the row
   * carries Next, the elapsed time and the clock) and "Same pawns in local
   * games" (where the row carries `before <san>`). The regex would match
   * both; the assertions below are about the first.
   */
  const game = page
    .getByRole('heading', { name: 'Games from this position', exact: true })
    .locator('..')
    .getByRole('button', { name: /Ana – Rival · 1-0/ });
  await expect(game).toContainText('Next: Nc6');
  await expect(game).toContainText('Recorded elapsed 0:13');
  await expect(game).toContainText('Clock after this move 4:40');
  await expect(game).toContainText('You played White');
  await expect(page.getByText('Recorded fixture engine', { exact: false })).toContainText(
    'depth 19 · +0.4',
  );
  await expect(
    page.getByRole('button', { name: /Open-game notes · A sideline to remember/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Academy · Round analysis/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Remember this reply/ })).toBeVisible();
  await page.getByRole('button', { name: 'Query Lichess Masters', exact: true }).click();
  const reference = page.locator('[data-position-source="lichess-masters"]');
  await expect(reference.getByRole('alert')).toBeVisible();
  // A source failure must not erase local chess evidence.
  await expect(game).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-position-key]')).toHaveText(KEY);
  await page.getByRole('button', { name: /Open-game notes · A sideline to remember/ }).click();
  await page.waitForURL(
    new RegExp(`/studies\\?study=${seeded.studyId}&chapter=${seeded.chapterId}&node=`),
  );
  await expect(page.getByText('Black to play').first()).toBeVisible();
  await page.goto(URL);
  await page.getByRole('button', { name: /Academy · Round analysis/ }).click();
  await page.waitForURL(/\/team\?/);
  await expect(page.getByText('Black to play').first()).toBeVisible();
  await page.goto(URL);
  await game.click();
  await page.waitForURL(/\/analysis$/);
  // The index's outgoing ply is 4; the matched position is after ply 3.
  await expect(page.getByText('Black to play').first()).toBeVisible();
  await expect(page.getByRole('gridcell', { name: /^b8,.*knight/i })).toBeVisible();
  await page.getByRole('button', { name: 'Open position page', exact: true }).click();
  await page.waitForURL(/\/position\?fen=/);
  await expect(page.locator('[data-position-key]')).toHaveText(KEY);
  await page.screenshot({ path: '/tmp/kingfisher-position-desktop.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: '/tmp/kingfisher-position-mobile.png', fullPage: false });
  expect(errors).toEqual([]);
});

test('the palette reaches the page and concealed work cannot disclose it', async ({ page }) => {
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Search commands', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('searchbox').fill('Open position page');
  await palette.getByRole('button', { name: 'Open position page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Position page', exact: true })).toBeVisible();
  /*
   * The Review board is concealed until the player chooses Reveal. The board
   * only mounts once a game is opened for review — `/review` on its own shows
   * the empty state and the test would be passing a board that does not
   * exist. Seed a game and open it for review the way the product does.
   */
  await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: AppRepositories & { importGames: typeof importGames };
      }
    ).__kingfisher;
    await app.importGames(
      '[White "Alpha, A"]\n[Black "Beta, B"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *',
      app.games,
    );
  });
  await page.goto('/games');
  await ready(page);
  await page
    .getByRole('checkbox', { name: /Select Alpha, A/ })
    .first()
    .check();
  await page.getByRole('button', { name: 'Review this game' }).click();
  await page.waitForURL(/\/review$/);
  await ready(page);
  await expect(page.locator('[data-board-conceals="evidence"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open position page', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Search commands', exact: true }).click();
  await palette.getByRole('searchbox').fill('Open position page');
  await expect(
    palette.getByRole('button', { name: 'Open position page', exact: true }),
  ).toHaveCount(0);
});
