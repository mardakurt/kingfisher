import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.waitForFunction(
    () => Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * The night before the round: their games, your repertoire and one named
 * source, joined — with all three denominators on every row, and nothing
 * anywhere that says what they will play.
 */
test('a surprise is their move, your gap and the source’s silence, each counted', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/preparation');
  await ready(page);

  await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: {
          importGames(pgn: string, repository: unknown): Promise<unknown>;
          games: unknown;
          repertoires: {
            create(input: { title: string; color: string }): Promise<{ id: string }>;
            upsertPosition(input: unknown): Promise<unknown>;
          };
        };
      }
    ).__kingfisher;
    const game = (moves: string, result: string) =>
      `[Event "Club"]\n[White "Rival, R"]\n[Black "Kurt, Metin"]\n[Result "${result}"]\n\n${moves} ${result}\n\n`;
    // Both of their games answer 2.Nf3 with the rare 2...Nh6.
    await app.importGames(
      game('1. e4 c5 2. Nf3 Nh6 3. d4 cxd4', '1-0') + game('1. e4 c5 2. Nf3 Nh6 3. Nc3 g6', '0-1'),
      app.games,
    );
    const repertoire = await app.repertoires.create({ title: 'Open Sicilian', color: 'w' });
    // The repertoire reaches the position and expects 2...d6 — so 2...Nh6 is
    // a move it has no answer to.
    await app.repertoires.upsertPosition({
      repertoireId: repertoire.id,
      fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      sideToMove: 'b',
      depth: 3,
      moves: [{ uci: 'd7d6', san: 'd6', role: 'main', expected: true, updatedAt: Date.now() }],
    });
  });

  await page.reload();
  await ready(page);
  await page.getByLabel('Player name').fill('Rival, R');
  await page.getByRole('button', { name: 'Prepare', exact: true }).first().click();

  const panel = page.getByTestId('surprises');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel).toContainText('Three populations, three denominators');
  await expect(panel).toContainText('nothing here says what they will play');

  const row = panel.getByRole('button', { name: /Nh6/ });
  await expect(row).toBeVisible({ timeout: 30_000 });
  // Their count, with their denominator.
  await expect(row).toContainText('2 of their 2 games here');
  // And the source's, with its name — "none of N", not "0.0%", which would
  // read as the source having said nothing.
  await expect(row).toContainText(/none of [\d,]+ in Kingfisher Starter Reference/);
  await expect(row).not.toContainText('0.0%');
});
