import { expect, test, type Page } from '@playwright/test';

/**
 * "Where have I seen this position?" — across studies, team hand-ins and
 * the repertoire, from one pasted FEN, opening the chapter at the move.
 *
 * The position is 1.e4 e5 2.Nf3, kept only in a *sideline* of a chapter
 * whose main line goes 2.Nc3 — the case every study tool loses. A second
 * chapter has the same pawns with a bishop instead of the knight, and is
 * offered as "Same pawns", never as the position.
 */

const READY = 'html[data-kingfisher-ready="true"]';

async function ready(page: Page) {
  await page.locator(READY).waitFor();
  await page.waitForFunction(
    () => Boolean((globalThis as { __kingfisher?: unknown }).__kingfisher),
    undefined,
    { timeout: 30_000 },
  );
}

async function importOnBoard(page: Page, pgn: string) {
  await page
    .getByRole('button', { name: /^Import( PGN or FEN)?$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
  await dialog.getByRole('textbox').fill(pgn);
  await dialog.getByRole('button', { name: 'Import games' }).click();
  await expect(dialog).toBeHidden();
}

async function saveChapter(page: Page, study: string, chapter: string, newStudy: boolean) {
  await page.getByRole('button', { name: 'Save this analysis to a study' }).click();
  const save = page.getByRole('dialog', { name: 'Save to study' });
  if (newStudy) {
    await save.getByRole('combobox').selectOption({ label: 'New study…' });
    await save.getByLabel('New study title').fill(study);
  } else {
    await save.getByRole('combobox').selectOption({ label: study });
  }
  await save.getByLabel('Chapter title').fill(chapter);
  await save.getByRole('button', { name: 'Save chapter' }).click();
  await expect(save).toBeHidden();
  await expect(page.getByText('· saved', { exact: true })).toBeVisible({ timeout: 30_000 });
}

const AFTER_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

test('a pasted position is found in a chapter sideline and opened at the move', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await ready(page);

  await importOnBoard(
    page,
    '[White "Sidelines"]\n[Black "Study"]\n\n1. e4 e5 2. Nc3 (2. Nf3 Nf6 3. Nxe5) Nf6 *',
  );
  await saveChapter(page, 'Open games', 'Vienna or Petroff', true);

  await importOnBoard(page, '[White "Bishop"]\n[Black "Study"]\n\n1. e4 e5 2. Bc4 Nf6 *');
  await saveChapter(page, 'Open games', 'Italian pawns', false);

  // A team hand-in with the position, through the repositories the UI uses.
  await page.evaluate(async () => {
    const app = (
      globalThis as typeof globalThis & {
        __kingfisher: {
          team: {
            createTeam(input: unknown): Promise<{ id: string; members: { id: string }[] }>;
            createAssignment(input: unknown): Promise<{ id: string; revision: number }>;
            addHandover(id: string, revision: number, input: unknown): Promise<unknown>;
          };
        };
      }
    ).__kingfisher;
    const team = await app.team.createTeam({
      name: 'Academy',
      members: [{ name: 'Ana', role: 'student' }],
      meIndex: 0,
    });
    const assignment = await app.team.createAssignment({
      teamId: team.id,
      title: 'Round 3 game',
      kind: 'game',
      brief: '',
      setBy: team.members[0]!.id,
    });
    await app.team.addHandover(assignment.id, assignment.revision, {
      kind: 'hand-in',
      authorId: team.members[0]!.id,
      note: 'Done.',
      pgn: '1. e4 e5 2. Nf3 Nc6 *',
    });
  });

  // Paste the position into the palette.
  await page.locator('button[aria-label="Search commands"]').click();
  const palette = page.locator('div[role="dialog"][aria-label="Command palette"]');
  await palette.waitFor();
  await palette.locator('input[role="searchbox"]').fill(AFTER_NF3);

  const chapterHit = palette.getByRole('button', {
    name: 'Open games · Vienna or Petroff — at 2.Nf3',
  });
  await expect(chapterHit).toBeVisible({ timeout: 20_000 });
  await expect(
    palette.getByRole('button', { name: 'Academy · Round 3 game — hand-in by Ana' }),
  ).toBeVisible();
  // The same pawns, elsewhere: offered under its own heading, not as the position.
  await expect(
    palette.getByRole('button', { name: 'Open games · Italian pawns — same pawns from 1…e5' }),
  ).toBeVisible();
  await expect(
    palette.locator('[data-group-header]', { hasText: 'Same pawns · Chapter' }),
  ).toBeVisible();

  // Opening the chapter hit lands on the move inside the sideline.
  await chapterHit.click();
  await page.waitForURL(/\/studies\?study=.*&chapter=.*&node=/);
  await ready(page);
  await expect(page.getByRole('button', { name: /1\. Vienna or Petroff/ })).toBeVisible();
  // The board is at the position: Nf3 has been played, and it is Black's turn.
  await expect(page.getByText('Black to play').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nf3', exact: true }).first()).toBeVisible();

  // Known position? in position setup says the same, and names the structure hit.
  await page.getByRole('button', { name: 'Set up position — add or remove pieces' }).click();
  const known = page.locator('[data-known-position]');
  await expect(known).toContainText('Chapter · Open games · Vienna or Petroff', {
    timeout: 20_000,
  });
  await expect(known).toContainText('Team · Academy · Round 3 game');
  await expect(known.locator('[data-known-structure]')).toContainText('Open games · Italian pawns');
});
