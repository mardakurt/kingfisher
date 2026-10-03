/**
 * Piece notation, switched the way a person switches it — in Settings — and
 * read where moves are read: the notation and the Explorer. The PGN is not
 * a display, and keeps its letters.
 */

import { expect, test } from '@playwright/test';
import { settingsButton } from './support/settings-control';
import { selectTool } from './tools';

const PGN = `[Event "Notation"]\n[White "Alpha, A"]\n[Black "Beta, B"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *`;

test('figurines replace piece letters in the notation and the Explorer, and only there', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/games');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(PGN);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('1 game added to your database.')).toBeVisible();
  await page.locator('[data-library-list]').getByText('Alpha, A').first().dblclick();

  const notation = page.locator('[data-move-tree]').first();
  await expect(notation).toContainText('Nf3');
  await expect(notation).toContainText('O-O');

  await settingsButton(page).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Board', exact: true }).click();
  await settings.getByRole('button', { name: 'Figurines' }).click();
  await settings.getByRole('button', { name: 'Close' }).click();

  // Each figure is the piece set's own knight or bishop; the letter stays in
  // the text at size zero, so the move is still named — and copied as — "Nf3".
  const knight = notation.getByRole('button', { name: 'Nf3', exact: true });
  await expect(knight.locator('img[data-figurine="N"]')).toHaveAttribute(
    'src',
    /\/piece\/.+\/wN\.svg$/,
  );
  await expect(knight).toHaveText('Nf3');
  await expect(
    notation.getByRole('button', { name: 'Bb5', exact: true }).locator('img[data-figurine="B"]'),
  ).toBeVisible();
  await expect(notation).not.toContainText('♘');
  // Pawns and castling are written as they always are.
  await expect(notation.getByRole('button', { name: 'a6', exact: true })).toHaveText('a6');
  await expect(notation.getByRole('button', { name: 'O-O', exact: true })).toHaveText('O-O');
  await expect(notation.locator('img[data-figurine]')).toHaveCount(6);

  // The Explorer's moves, at the position after 1...e5, from My games.
  await notation.getByRole('button', { name: 'e5', exact: true }).click();
  const dock = page.locator('[data-workspace-dock]');
  await selectTool(page, dock, 'Explorer');
  await dock.getByRole('combobox', { name: 'Evidence source' }).selectOption('local-collection');
  const explorerKnight = dock.locator('[data-explorer-move="Nf3"]');
  await expect(explorerKnight).toHaveText('Nf3');
  await expect(explorerKnight.locator('img[data-figurine="N"]')).toBeVisible();

  // A display, not a format: the game's PGN still says Nf3.
  const pgn = await page.evaluate(async () => {
    const app = (
      globalThis as unknown as {
        __kingfisher: {
          games: {
            search(q: object): Promise<{ games: { id: string }[] }>;
            get(id: string): Promise<{ normalizedPgn: string } | null>;
          };
        };
      }
    ).__kingfisher;
    const { games } = await app.games.search({ limit: 1 });
    return (await app.games.get(games[0]!.id))?.normalizedPgn ?? '';
  });
  expect(pgn).toContain('2. Nf3 Nc6');
  expect(pgn).not.toContain('♘');
  expect(pgn).not.toContain('<img');
});
