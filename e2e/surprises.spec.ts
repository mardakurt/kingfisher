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

/**
 * The round brief: one page, assembled from what is already on the machine,
 * with every section naming its population and every empty one saying which
 * input was missing.
 */
test('the round brief is one self-contained page that names its populations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/preparation');
  await ready(page);

  // Created through the product's own control, which is also how a person
  // makes one — and avoids racing a write against the reload.
  await page.getByRole('button', { name: 'New session', exact: true }).click();
  const creating = page.getByRole('dialog');
  await creating.getByLabel('Title').fill('Round 3');
  await creating.getByLabel('Opponent').fill('Rival, R');
  await creating.getByLabel('Event').fill('Club Open');
  await creating.getByRole('button', { name: 'Create session', exact: true }).click();

  await expect(page.getByLabel('Preparation session')).toHaveValue(/prep-/, { timeout: 30_000 });
  // The action appears once the session itself has loaded, not when its id is set.
  const action = page.getByRole('button', { name: /Round brief/ });
  await expect(action).toBeVisible({ timeout: 30_000 });
  await action.click();
  const dialog = page.getByRole('dialog', { name: 'Round brief' });
  await expect(dialog).toBeVisible();
  const summary = dialog.getByTestId('brief');
  await expect(summary).toContainText('Round 3 · vs Rival, R · Club Open');
  await expect(summary).toContainText('Playing White');
  // With nothing prepared yet, every section says which input it lacked.
  await expect(summary).toContainText('What they play with Black');
  await expect(summary).toContainText('there is nothing to describe');
  await expect(summary).toContainText('After the round writes one line per game here');

  const download = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Save as HTML', exact: true }).click(),
  ]).then(([event]) => event);
  const stream = await download.createReadStream();
  const html = await new Promise<string>((resolve, reject) => {
    let text = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => (text += chunk));
    stream.on('end', () => resolve(text));
    stream.on('error', reject);
  });
  expect(html).toContain('Round 3 · vs Rival, R');
  expect(html).toContain('names the population it came from');
  expect(html).not.toMatch(/<script|<link|<img/i);
  expect(html).not.toMatch(/(?:src|href)\s*=\s*"[^"]*:\/\//i);
});
