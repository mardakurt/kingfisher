import { expect, test, type Page } from '@playwright/test';

import { selectTool } from './tools';

/**
 * The Opening Report, driven the way a player would drive it.
 *
 * `src/features/openings/opening-report.test.ts` proves the report's rules —
 * every section cites a source or says why it is empty, populations are never
 * merged, authored prose stays labelled. What it cannot prove is that a player
 * can reach the thing at all, or that real installed data flows into it, which
 * is the difference between a module and a feature.
 *
 * So this drives the actual dock, plays actual moves on the actual board, and
 * reads what the panel actually rendered.
 */

const READY = 'html[data-kingfisher-ready="true"]';

const report = (page: Page) => page.locator('[data-opening-report]');
const section = (page: Page, id: string) => page.locator(`[data-report-section="${id}"]`);

async function openReport(page: Page) {
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await selectTool(page, page.locator('[data-workspace-dock]').first(), 'Opening Report');
  await report(page).waitFor();
}

/** Play a move by clicking its two squares on the real board. */
async function play(page: Page, from: string, to: string) {
  const board = page.locator('[data-chessboard]').first();
  const box = await board.boundingBox();
  if (!box) throw new Error('the board has no box');
  const square = (name: string) => {
    const file = name.charCodeAt(0) - 97;
    const rank = Number(name[1]) - 1;
    const size = box.width / 8;
    return { x: box.x + (file + 0.5) * size, y: box.y + (7 - rank + 0.5) * size };
  };
  await page.mouse.click(square(from).x, square(from).y);
  await page.mouse.click(square(to).x, square(to).y);
}

test('the report names the opening, and says where the name came from', async ({ page }) => {
  await openReport(page);
  // 1.e4 c5 — a position the classification dataset names exactly.
  await play(page, 'e2', 'e4');
  await play(page, 'c7', 'c5');

  const identity = section(page, 'identity');
  await expect(identity).toContainText('Sicilian Defense');
  /*
    The provenance line is the difference between a citation and a rumour. A
    report that named the opening and not its source would be making a claim
    nobody could check.
  */
  await expect(identity).toContainText('lichess-org/chess-openings');
  await expect(identity).toContainText('CC0-1.0');
});

test('a section with nothing to say says why, rather than going blank', async ({ page }) => {
  await openReport(page);
  /*
    The starting position is not named by the dataset, and the honest answer is
    that no name is invented for it — not an empty heading the reader has to
    interpret.
  */
  const identity = section(page, 'identity');
  await expect(identity.locator('[data-report-empty]')).toContainText('none is invented');
});

test('every section either cites a source or explains its absence', async ({ page }) => {
  await openReport(page);
  await play(page, 'e2', 'e4');
  await play(page, 'c7', 'c5');
  await expect(section(page, 'branches')).toBeVisible();

  /*
    Never both silent. This is the rule the module guarantees, checked against
    what the browser actually painted — in every frame, while sections are
    still arriving too (a population's history section appears once its
    history loads). So each check reads all sections from one frame: walking
    them by index across frames read a slot the list had just vacated, and
    found neither marker in a section that had both (Firefox, Phase 86).
  */
  for (let frame = 0; frame < 10; frame += 1) {
    const painted = await report(page).evaluate((root) =>
      [...root.querySelectorAll('[data-report-section]')].map((element) => ({
        id: element.getAttribute('data-report-section'),
        cited: element.querySelector('[data-report-provenance]') !== null,
        explained: element.querySelector('[data-report-empty]') !== null,
      })),
    );
    expect(painted.length).toBeGreaterThan(3);
    for (const entry of painted) {
      expect(entry.cited || entry.explained, `${entry.id} is silent`).toBe(true);
    }
    await page.waitForTimeout(200);
  }
});

test('every population keeps its own game count, and none are combined', async ({ page }) => {
  await openReport(page);
  await play(page, 'e2', 'e4');

  const populations = section(page, 'populations');
  await expect(populations).toContainText('Nothing here is combined across them');
  // Each row names its source and how many games that source has.
  await expect(populations.locator('li').first()).toContainText('games');
});

test('a branch carries the numbers behind it, not a rank', async ({ page }) => {
  await openReport(page);
  await play(page, 'e2', 'e4');
  await play(page, 'c7', 'c5');

  const branches = section(page, 'branches');
  const first = branches.locator('li').first();
  // A share, and the two counts it was computed from.
  await expect(first).toContainText(/%/);
  await expect(first).toContainText(/\d+ of [\d,]+/);
  /*
    And no score of any kind. The ordering number exists inside the module and
    never reaches a reader; if one ever leaked into the markup, this is where
    it would show up.
  */
  await expect(branches).not.toContainText(/score/i);
  await expect(branches).not.toContainText(/criticality/i);
  await expect(branches).not.toContainText(/rank/i);
});

test('the theory book section below the report shows no counts', async ({ page }) => {
  await openReport(page);
  await play(page, 'e2', 'e4');
  await play(page, 'c7', 'c5');

  /*
    The named variations come from the classification dataset, which is
    entitled to say what a position is called and nothing else. A count here
    would be the explorer's answer wearing the book's label — the conflation
    AGENTS.md names as how a statistic becomes mistaken for theory.
  */
  const named = section(page, 'named-branches');
  await expect(named).toContainText('Sicilian Defense');
  await expect(named).not.toContainText(/\d+%/);
  await expect(named).not.toContainText(/\bgames\b/);
});

/**
 * The plan sections, against a real SQLite collection through the companion.
 *
 * These are the two sections nothing else can reach. `opening-plans.test.ts`
 * proves the counting and `opening-report.test.ts` proves the wording, and both
 * passed for a build in which the sections could never appear: the panel looked
 * for a source that could supply continuations among the *reference packs* it
 * draws its population columns from, and a pack has aggregated its games into
 * per-position counts before Kingfisher ever sees it. No pack can answer, so
 * the search never found one, so the report always dropped both sections — a
 * feature with green tests and no way to see it.
 *
 * So this pairs the companion Playwright is already running, creates a
 * collection, imports three real Najdorf games, and reads what the panel
 * painted. It fails on that build.
 */
const NAJDORF_PGNS = [
  '[Event "Plan evidence 1"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be7 8. f3 O-O 9. Qd2 Be6 10. O-O-O Nbd7 *',
  '[Event "Plan evidence 2"]\n[White "C"]\n[Black "D"]\n[Result "*"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 *',
  '[Event "Plan evidence 3"]\n[White "E"]\n[Black "F"]\n[Result "*"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 7. f4 Be7 8. Qf3 Qc7 9. O-O-O Nbd7 10. g4 b5 *',
].join('\n\n');

test('the plan sections count a real collection, and cite how many games they replayed', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await page.locator(READY).waitFor();

  await page.getByRole('button', { name: 'Settings ⌘,' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Companion' }).click();
  await settings.getByLabel('Pairing address').fill('http://127.0.0.1:4338#token=phase8-e2e-token');
  await settings.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(settings.getByText(/Paired with/)).toBeVisible();
  await settings.getByPlaceholder('New collection name').fill('Plan evidence E2E');
  await settings.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(settings.getByText('Plan evidence E2E').first()).toBeVisible();
  await settings.getByPlaceholder('Paste a PGN collection…').fill(NAJDORF_PGNS);
  await settings.getByRole('button', { name: 'Import', exact: true }).click();
  // This import's own completion: the paste is cleared and its toast names
  // its count only on success. "3 games" anywhere in the dialog matched
  // an earlier collection, and the page navigated away mid-import.
  await expect(settings.getByPlaceholder('Paste a PGN collection…')).toHaveValue('', {
    timeout: 30_000,
  });
  await expect(page.getByText(/\b3 games imported/)).toBeVisible();

  /*
    And choose it, rather than relying on it being the only collection that can
    answer. It is not: other specs in this suite leave their own SQLite
    collections behind, and the report used to take whichever registered first
    — which made this test pass alone and fail in the suite, reading "1 games
    replayed" from somebody else's two-game fixture. That was the product's
    ambiguity, not the test's: a report drawn from an unnamed collection is a
    count with no source.
  */
  await settings.getByRole('tab', { name: 'Database' }).click();
  await settings.getByLabel('Explorer source').selectOption({ label: 'Plan evidence E2E' });
  await settings.getByRole('button', { name: 'Close' }).click();

  await selectTool(page, page.locator('[data-workspace-dock]').first(), 'Opening Report');
  await report(page).waitFor();
  for (const [from, to] of [
    ['e2', 'e4'],
    ['c7', 'c5'],
    ['g1', 'f3'],
    ['d7', 'd6'],
    ['d2', 'd4'],
    ['c5', 'd4'],
    ['f3', 'd4'],
    ['g8', 'f6'],
    ['b1', 'c3'],
    ['a7', 'a6'],
  ] as const) {
    await play(page, from, to);
  }

  /*
    Present at all is the regression. The rest is the claim each section is
    entitled to make: a denominator, and the window it was counted over.
  */
  const destinations = section(page, 'destinations');
  await expect(destinations).toBeVisible({ timeout: 30_000 });
  await expect(destinations).toContainText(
    /\d+ games from Plan evidence E2E, replayed \d+ plies past this position/,
  );
  // Every one of the three games plays ...Be7. A row that could not name the
  // square it came from would be a statistic without a piece attached.
  await expect(destinations).toContainText("Black's bishop on f8 reached e7");
  await expect(destinations).toContainText(/3 of 3 games \(100/);

  const advances = section(page, 'advances');
  await expect(advances).toBeVisible();
  await expect(advances).toContainText(
    /\d+ games from Plan evidence E2E, replayed \d+ plies past this position/,
  );
  /*
    Two of the three play ...e5. Written as the pawn's journey rather than as a
    move, because a pawn that reaches a square over two moves would otherwise be
    printed as a move nobody can play.
  */
  await expect(advances).toContainText("Black's e7 pawn reaches e5");
  await expect(advances).toContainText(/2 of 3 games/);

  await page.goto('/databases');
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: /Plan evidence E2E/ }).click();
  await page.getByRole('button', { name: 'Delete collection' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this SQLite collection?' })
    .getByRole('button', { name: 'Delete permanently' })
    .click();
  await expect(page.getByRole('button', { name: /Plan evidence E2E/ })).toHaveCount(0);
});

test('the report checks branches against the chosen saved repertoire', async ({ page }) => {
  await openReport(page);
  await play(page, 'e2', 'e4');
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
  await page.getByLabel('Title').fill('Report White e4');
  await page.getByRole('button', { name: /Save \d+ position/ }).click();
  await expect(page.getByRole('dialog', { name: 'Add to repertoire' })).toBeHidden();
  await page.keyboard.press('Home');
  await page.getByLabel('Report repertoire').selectOption({ label: 'Report White e4' });
  await expect(section(page, 'repertoire')).toContainText('Report White e4');
  await expect(section(page, 'repertoire').locator('li').filter({ hasText: /^e4/ })).toContainText(
    'answered',
  );
  await expect(section(page, 'repertoire')).toContainText('no response');
});

/*
  Phase 85 (D1.2): the built-in pack carries each position's history, so the
  report answers ChessBase's popularity, Elo-class and first-game questions
  from a population — and names it on every section.
*/
test('popularity by year, Elo classes and first games come from the built-in pack, named', async ({
  page,
}) => {
  await openReport(page);
  await play(page, 'e2', 'e4');

  const popularity = section(page, 'popularity:kingfisher-starter');
  await expect(popularity).toContainText('Popularity by year — Kingfisher Starter Reference', {
    timeout: 30_000,
  });
  await expect(popularity.locator('[data-report-provenance]')).toContainText(
    'One population; nothing combined.',
  );
  // The archive begins in 2020. (A "1708" row once appeared here: a relay's
  // 17.08.2023 read as a year; src/reference/pack.ts packDate, Phase 85.)
  const recent = popularity.locator('li', { hasText: /^202[0-6]/ });
  await expect(recent.first()).toContainText(/share of Kingfisher Starter Reference/);
  expect(await recent.count()).toBeGreaterThanOrEqual(5);

  const elo = section(page, 'elo:kingfisher-starter');
  await expect(elo).toContainText('Results by Elo class — Kingfisher Starter Reference');
  await expect(elo.locator('li').first()).toContainText(/White won \d+(\.\d)?%/);

  const first = section(page, 'pioneers:kingfisher-starter');
  await expect(first).toContainText('First games — Kingfisher Starter Reference');
  await expect(first.locator('li').first()).toContainText('earliest in this population');
});
