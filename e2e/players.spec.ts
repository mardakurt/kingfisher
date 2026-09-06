import { expect, test, type Page } from '@playwright/test';

/**
 * The player library, held to the rule that it must not waste anybody's time.
 *
 * A famous name that opens a profile with nothing behind it teaches a user
 * that the library is unreliable — and Kingfisher's packs begin in 2020, so
 * before this the World champions list opened with Steinitz, Lasker and
 * Capablanca. The rule is that a set Kingfisher *offers* you leads somewhere;
 * the people it cannot show games for live in an index of their own that says
 * what it is.
 *
 * Searching is the deliberate exception. Typing "Morphy" is naming a person,
 * and silence would read as "never heard of him".
 */

const READY = 'html[data-kingfisher-ready="true"]';

/** Sets Kingfisher offers. The historical index is deliberately not one. */
const PRIMARY_SETS = [
  'Everyone',
  'Top 100',
  'Top 500',
  'World champions',
  'Women’s champions',
  'Historical',
  'With games here',
] as const;

async function players(page: Page) {
  await page.goto('/players');
  await page.locator(READY).waitFor();
  await page.locator('[data-player-results]').waitFor();
}

/** Every row's game count, read from the row rather than from a store. */
async function gameCounts(page: Page): Promise<readonly number[]> {
  return page.locator('[data-player-results] li').evaluateAll((rows) =>
    rows.map((row) => {
      const match = /(\d[\d,]*)\s*games?\s*here/.exec(row.textContent ?? '');
      return match ? Number(match[1]!.replace(/,/g, '')) : -1;
    }),
  );
}

test('every browse set leads somewhere', async ({ page }) => {
  await players(page);
  const report: string[] = [];
  const dead: string[] = [];

  for (const set of PRIMARY_SETS) {
    await page.getByRole('button', { name: set, exact: true }).click();
    await page.waitForTimeout(400);
    const counts = await gameCounts(page);
    report.push(`${set}: ${counts.length} rows, min ${Math.min(...counts, Infinity)}`);
    if (counts.length === 0) continue;
    const empty = counts.filter((count) => count === 0).length;
    if (empty > 0) dead.push(`${set}: ${empty} of ${counts.length} rows have no games`);
  }

  await test.info().attach('browse-sets.txt', {
    body: report.join('\n'),
    contentType: 'text/plain',
  });
  expect(dead, 'browse sets offering players with nothing behind them').toEqual([]);
});

test('the people with no games are in an index that says so', async ({ page }) => {
  await players(page);
  await page.getByRole('button', { name: 'Historical index', exact: true }).click();
  await page.locator('[data-filter-note="historical-index"]').waitFor();

  const note = page.locator('[data-filter-note="historical-index"]');
  await expect(note).toContainText('no games for');
  await expect(note).toContainText('Nothing here implies a game exists');

  // And it contains only such people — it is not a second copy of the library.
  const counts = await gameCounts(page);
  expect(counts.length).toBeGreaterThan(10);
  expect(counts.every((count) => count === 0)).toBe(true);
});

test('a historical profile shows what Kingfisher does know, not a blank page', async ({ page }) => {
  await players(page);
  await page.getByRole('button', { name: 'Historical index', exact: true }).click();
  await page.locator('[data-player-results] li a').first().click();
  await page.locator('[data-roster-facts]').waitFor();

  const facts = page.locator('[data-roster-facts]');
  await expect(facts).toContainText('Historical roster');
  await expect(facts).toContainText('Title');
  await expect(facts).toContainText('Lived');
  // And it does not pretend the absence of games is a mystery.
  await expect(page.locator('body')).toContainText('begins in 2020');
});

test('a profile is headed by a name, not by a lookup key', async ({ page }) => {
  /*
    Profiles had no stored identity for anybody who came from the catalog, and
    fell back to the route id — every historical page was headed
    "steinitz, wilhelm".
  */
  await page.goto('/player/steinitz%2C%20wilhelm');
  await page.locator(READY).waitFor();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Steinitz, Wilhelm');
});

test('searching finds the elite players a pack actually contains', async ({ page }) => {
  await players(page);
  const box = page.getByRole('searchbox', { name: 'Search players' });
  for (const name of ['Carlsen', 'Caruana', 'Nakamura', 'Gukesh', 'Anand', 'Firouzja']) {
    await box.fill(name);
    await page.waitForTimeout(350);
    const counts = await gameCounts(page);
    expect(counts.length, `${name} found nothing`).toBeGreaterThan(0);
    expect(counts[0], `${name}'s first result has no games`).toBeGreaterThan(0);
  }
});

test('searching finds a name however it is spelled', async ({ page }) => {
  await players(page);
  const box = page.getByRole('searchbox', { name: 'Search players' });
  const firstName = async (query: string) => {
    await box.fill(query);
    await page.waitForTimeout(350);
    return page.locator('[data-player-results] li').first().innerText();
  };

  // Diacritics, both ways round.
  expect(await firstName('Polgár')).toContain('Polgar');
  expect(await firstName('Polgar')).toContain('Polgar');
  // A hyphen the user may not type.
  expect(await firstName('Vachier-Lagrave')).toContain('Vachier-Lagrave');
  expect(await firstName('vachier lagrave')).toContain('Vachier-Lagrave');
  // A nickname no database writes.
  expect(await firstName('MVL')).toContain('Vachier-Lagrave');
  // Surname, given name, and the reversed form a pack may use.
  expect(await firstName('Magnus Carlsen')).toContain('Carlsen');
  expect(await firstName('carlsen, magnus')).toContain('Carlsen');
});

test('searching still finds a historical player, and says they have no games', async ({ page }) => {
  await players(page);
  const box = page.getByRole('searchbox', { name: 'Search players' });
  await box.fill('Morphy');
  await page.waitForTimeout(400);
  const first = page.locator('[data-player-results] li').first();
  await expect(first).toContainText('Morphy');
  await expect(first).toContainText('0');
  await expect(first).toContainText('games here');
});

test('a search result opens a profile that works', async ({ page }) => {
  await players(page);
  const box = page.getByRole('searchbox', { name: 'Search players' });
  await box.fill('Carlsen');
  await page.waitForTimeout(400);
  await page.locator('[data-player-results] li a').first().click();
  await page.locator(READY).waitFor();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Carlsen');
  // Not an empty shell: the profile reports games and offers its sections.
  await expect(page.locator('body')).toContainText('games in this collection');
  for (const section of ['Overview', 'Openings', 'Opponents']) {
    await expect(page.getByRole('button', { name: section, exact: true })).toBeVisible();
  }
});
