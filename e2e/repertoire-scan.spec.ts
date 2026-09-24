/**
 * The repertoire scan (Phase 84): a White Ruy Lopez repertoire, four games in
 * My games, and the scan sorts them into the three kinds of departure — a new
 * move against the line, another choice for White, a game past the
 * preparation — leaves out the game that never reached the line, and opens a
 * finding on the board at the move it left by.
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

/** The repertoire's own moves, at the positions White plays them from. */
const RUY = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4', 'e4', 0],
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'g1f3', 'Nf3', 2],
  ['r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'f1b5', 'Bb5', 4],
  ['r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4', 'b5a4', 'Ba4', 6],
  ['r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5', 'e1g1', 'O-O', 8],
] as const;

const game = (white: string, black: string, moves: string) =>
  `[Event "Scan Test"]\n[Site "Riverside"]\n[Date "2026.06.01"]\n[White "${white}"]\n[Black "${black}"]\n[Result "*"]\n\n${moves} *`;

const GAMES = [
  game('Ruy, Mainliner', 'Steinitz, Fan', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 d6 5. c3 Bd7'),
  game('Italian, Player', 'Giuoco, Fan', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3'),
  game(
    'Closed, Ruy',
    'Morphy, Defender',
    '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1',
  ),
  game('Queen, Pawn', 'Slav, Player', '1. d4 d5 2. c4 c6'),
];

test('scans My games against a repertoire and sorts the departures', async ({ page }) => {
  await page.goto('/analysis');
  await ready(page);
  await page.evaluate(
    async ({ games, ruy }) => {
      const app = (
        globalThis as typeof globalThis & {
          __kingfisher: AppRepositories & { importGames: typeof importGames };
        }
      ).__kingfisher;
      await app.games.clear();
      for (const pgn of games) await app.importGames(pgn, app.games);
      for (const existing of await app.repertoires.list())
        await app.repertoires.delete(existing.id);
      const repertoire = await app.repertoires.create({ title: 'Ruy Lopez', color: 'w' });
      for (const [fen, uci, san, depth] of ruy) {
        await app.repertoires.upsertPosition({
          repertoireId: repertoire.id,
          fen: fen as never,
          sideToMove: 'w',
          depth,
          moves: [{ uci: uci as never, san: san as never, role: 'main', updatedAt: Date.now() }],
        });
      }
    },
    { games: GAMES, ruy: RUY },
  );

  await page.goto('/repertoire');
  await ready(page);
  // In the header, or folded into its overflow on a narrower window.
  const inline = page.getByRole('button', { name: 'Scan games against this repertoire' });
  if (await inline.isVisible().catch(() => false)) await inline.click();
  else {
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Scan games/ }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'Scan games against this repertoire' });
  await dialog.getByLabel('Minimum depth').selectOption('4');
  await dialog.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(dialog.locator('[data-scan-status="done"]')).toContainText(
    '4 games read; 3 left your repertoire at least 2 moves in.',
  );

  const newMoves = dialog.locator('[data-scan-kind="new-move"]');
  await expect(newMoves).toContainText('4... d6');
  await expect(newMoves).toContainText('your repertoire: Nf6');
  await expect(dialog.locator('[data-scan-kind="own-alternative"]')).toContainText('3. Bc4');
  await expect(dialog.locator('[data-scan-kind="own-alternative"]')).toContainText(
    'your repertoire: Bb5',
  );
  await expect(dialog.locator('[data-scan-kind="past-preparation"]')).toContainText('5... Be7');
  // The Slav never reached a 1.e4 repertoire.
  await expect(dialog).not.toContainText('Queen, Pawn');

  await newMoves.getByRole('button', { name: /Ruy, Mainliner/ }).click();
  await expect(page).toHaveURL(/\/analysis/);
  await expect(page.getByText('Ruy, Mainliner – Steinitz, Fan').first()).toBeVisible();
});
