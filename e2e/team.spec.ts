/**
 * The team hub, end to end, across two machines.
 *
 * Two browser contexts are two IndexedDBs, which is exactly a coach's Mac and
 * a student's laptop: nothing is shared but the packet file. The coach sets
 * an assignment and shares a packet; the student receives it, chooses who
 * they are, puts moves on the board and hands in; the student's packet comes
 * back and the coach sees the hand-in, opens it on the board and returns it
 * with notes. Every step is the real UI, every file the real download.
 *
 * What the spec also asserts, because each one was a design decision: a
 * hand-in with an empty board is refused; a packet whose board does not play
 * is refused whole with a reason; `me` never travels in a packet; the same
 * packet received twice changes nothing; and the reset button says where the
 * board goes.
 */

import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isNavigationAbortNoise } from './tools';

function watchConsole(page: Page, browserName: string): string[] {
  const failures: string[] = [];
  const note = (text: string) => {
    if (!isNavigationAbortNoise(text, browserName)) failures.push(text);
  };
  page.on('console', (message) => {
    if (message.type() === 'error') note(`error: ${message.text()}`);
  });
  page.on('pageerror', (error) => note(`pageerror: ${error.message}`));
  return failures;
}

async function openTeam(page: Page) {
  await page.goto('/team');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function play(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

const thread = (page: Page) => page.locator('[data-team-thread]');

/**
 * A route action, wherever the header's fold put it.
 *
 * At 1280 px the Team header keeps New, Share and Receive in the row and folds
 * Members… and New team behind "More actions"; the test must not care which.
 */
async function routeAction(page: Page, name: string) {
  const inRow = page.locator('[data-header-actions]').getByRole('button', { name, exact: true });
  if (await inRow.isVisible()) {
    await inRow.click();
    return;
  }
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

async function sharePacket(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await routeAction(page, 'Share packet');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.kingfisher-team\.json$/);
  const saved = path.join(test.info().outputDir, `${Date.now()}-${file.suggestedFilename()}`);
  await file.saveAs(saved);
  return saved;
}

async function receivePacket(page: Page, file: string) {
  await page.locator('[data-team-packet-input]').setInputFiles(file);
}

/** Drop the packet on the route, the way a file from Finder or a mail arrives. */
async function dropPacket(page: Page, file: string) {
  const bytes = await readFile(file, 'utf8');
  const transfer = await page.evaluateHandle(
    ([name, text]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], name, { type: 'application/json' }));
      return dt;
    },
    [path.basename(file), bytes] as const,
  );
  await page.locator('[data-team-drop]').dispatchEvent('drop', { dataTransfer: transfer });
}

async function studentMachine(browser: Browser) {
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3210',
          localStorage: [
            { name: 'kingfisher.preferences', value: JSON.stringify({ state: {}, version: 6 }) },
          ],
        },
      ],
    },
  });
  return { context, page: await context.newPage() };
}

test('a coach and a student hand work to each other through packets', async ({
  page: coach,
  browser,
  browserName,
}) => {
  test.setTimeout(120_000);
  const coachConsole = watchConsole(coach, browserName);
  await openTeam(coach);

  // --- The coach creates the team, adds Ana, and sets an assignment for her.
  await routeAction(coach, 'New team');
  await coach.locator('[data-team-name]').fill('Academy U16');
  await coach.locator('[data-team-my-name]').fill('Coach');
  await coach.getByRole('button', { name: 'Create team' }).click();
  await expect(coach.getByText('you are Coach (Coach)').first()).toBeVisible();

  await routeAction(coach, 'Members…');
  await coach.locator('[data-team-member-name]').fill('Ana');
  await coach.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(coach.locator('[data-team-member="Ana"]')).toBeVisible();
  await coach.getByRole('button', { name: 'Done' }).click();

  await routeAction(coach, 'New assignment');
  await coach.locator('[data-team-assignment-title]').fill('Round 3 game');
  await coach.locator('[data-team-assignment-for]').selectOption({ label: 'Ana' });
  await coach.locator('[data-team-assignment-brief]').fill('Annotate your game.');
  await coach.getByRole('button', { name: 'Set assignment' }).click();
  await expect(coach.locator('[data-team-column="todo"]')).toContainText('Round 3 game');
  await expect(thread(coach).locator('[data-team-status]')).toHaveText('To do');

  // A coach is a reviewer: the review buttons come first, and a review with
  // an empty board is a note, not a board.
  await expect(thread(coach).getByRole('button', { name: 'Return with notes' })).toBeVisible();
  await expect(thread(coach).getByRole('checkbox')).toBeDisabled();

  const coachPacket = await sharePacket(coach);
  const written = JSON.parse(await readFile(coachPacket, 'utf8')) as {
    team: Record<string, unknown>;
    assignments: readonly Record<string, unknown>[];
  };
  // `me` is a fact about the coach's machine and must not travel.
  expect('me' in written.team).toBe(false);
  expect(written.assignments).toHaveLength(1);

  // --- The student's machine: nothing there but what the packet brings.
  const student = await studentMachine(browser);
  const studentConsole = watchConsole(student.page, browserName);
  await openTeam(student.page);
  await expect(student.page.getByText('No team yet.').first()).toBeVisible();
  await receivePacket(student.page, coachPacket);
  await expect(
    student.page.getByText(/Packet received from Coach: joined “Academy U16”/),
  ).toBeVisible();
  await expect(student.page.getByText('2 members · who are you?').first()).toBeVisible();

  // Until she says who she is, she cannot hand in.
  await student.page.locator('[data-team-assignment="Round 3 game"]').click();
  await expect(thread(student.page).locator('[data-team-actions]')).toHaveCount(0);
  // The thread panel asks who she is, in place.
  await student.page
    .locator('[data-team-who-select]')
    .first()
    .selectOption({ label: 'Ana · Student' });
  await student.page.getByRole('button', { name: 'That’s me' }).first().click();
  await expect(student.page.getByText('you are Ana (Student)').first()).toBeVisible();

  // An empty board cannot be handed in.
  const handIn = thread(student.page).getByRole('button', { name: 'Hand in what’s on the board' });
  await expect(handIn).toBeDisabled();
  await expect(thread(student.page).locator('[data-team-empty-board]')).toContainText(
    'The board is empty',
  );
  await play(student.page, 'e2', 'e4');
  await play(student.page, 'e7', 'e5');
  await expect(handIn).toBeEnabled();
  await thread(student.page)
    .getByRole('textbox', { name: 'Note' })
    .fill('I saw 2.Nf3 but not 2.f4.');
  await handIn.click();
  await expect(student.page.locator('[data-team-column="handed-in"]')).toContainText(
    'Round 3 game',
  );
  await expect(thread(student.page).locator('[data-team-handover="hand-in"]')).toContainText(
    '2 moves · 3 positions · no engine evaluations recorded',
  );
  const studentPacket = await sharePacket(student.page);

  // --- Back on the coach's machine: the packet is dropped on the window; the
  // hand-in arrives, and only it; the row is marked new until it is opened.
  await dropPacket(coach, studentPacket);
  await expect(coach.getByText(/Packet received from Ana: 1 new handover\./)).toBeVisible();
  const handedIn = coach.locator('[data-team-column="handed-in"]');
  await expect(handedIn).toContainText('Round 3 game');
  await expect(handedIn).toContainText('1 new');
  await expect(coach.locator('[data-team-assignment="Round 3 game"][data-team-new]')).toBeVisible();
  await coach.locator('[data-team-assignment="Round 3 game"]').click();
  await expect(coach.locator('[data-team-assignment="Round 3 game"][data-team-new]')).toHaveCount(
    0,
  );
  await expect(handedIn).not.toContainText('new');
  await expect(thread(coach).locator('[data-team-status]')).toHaveText('Handed in');

  // A reload brings the same thread back.
  await coach.reload();
  await coach.locator('html[data-kingfisher-ready="true"]').waitFor();
  await expect(thread(coach).locator('[data-team-status]')).toHaveText('Handed in');
  await expect(thread(coach).locator('[data-team-handover="hand-in"]')).toContainText(
    'I saw 2.Nf3 but not 2.f4.',
  );

  // The same packet again changes nothing.
  await receivePacket(coach, studentPacket);
  await expect(coach.getByText(/Packet received from Ana: nothing new\./)).toBeVisible();
  await expect(thread(coach).locator('[data-team-handover="hand-in"]')).toHaveCount(1);

  // Unsaved moves on the board are not replaced without asking.
  await play(coach, 'd2', 'd4');
  await thread(coach).getByRole('button', { name: 'Open on board' }).click();
  const replace = coach.getByRole('dialog', { name: 'Replace what is on the board?' });
  await expect(replace).toBeVisible();
  await replace.getByRole('button', { name: 'Cancel' }).click();
  await expect(coach.getByRole('button', { name: 'd4', exact: true })).toBeVisible();
  await thread(coach).getByRole('button', { name: 'Open on board' }).click();
  await replace.getByRole('button', { name: 'Replace' }).click();
  // Her moves, named as hers.
  await expect(coach.getByText(/On the board: Round 3 game — Ana’s hand-in/)).toBeVisible();
  await expect(coach.getByRole('button', { name: 'e5', exact: true })).toBeVisible();
  await expect(coach.getByRole('button', { name: 'd4', exact: true })).toHaveCount(0);

  // The PGN goes to the clipboard for whoever works in another program.
  await coach.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await thread(coach).getByRole('button', { name: 'Copy PGN' }).first().click();
  await expect(coach.getByText('PGN copied.', { exact: false })).toBeVisible();
  expect(await coach.evaluate(() => navigator.clipboard.readText())).toContain('1. e4 e5');

  // Return it with notes, attaching the board.
  await thread(coach).getByRole('textbox', { name: 'Note' }).fill('Look at 2.f4 too.');
  await expect(thread(coach).getByRole('checkbox')).toBeChecked();
  await thread(coach).getByRole('button', { name: 'Return with notes' }).click();
  await expect(thread(coach).locator('[data-team-status]')).toHaveText('Returned');
  await expect(coach.locator('[data-team-column="todo"]')).toContainText('Returned');
  await expect(thread(coach).locator('[data-team-handover="review"]')).toContainText(
    'Look at 2.f4 too.',
  );

  // --- Archive hides it behind one toggle; Unarchive brings it back.
  await thread(coach).getByRole('button', { name: 'Archive' }).click();
  await expect(coach.locator('[data-team-column]')).toHaveCount(0);
  await coach.getByRole('button', { name: 'Show 1 archived assignment' }).click();
  await expect(coach.locator('[data-team-assignment="Round 3 game"]')).toContainText('archived');
  await thread(coach).getByRole('button', { name: 'Unarchive' }).click();
  await expect(thread(coach).getByRole('button', { name: 'Archive' })).toBeVisible();
  await coach.getByRole('button', { name: 'Hide archived' }).click();
  await expect(coach.locator('[data-team-column="todo"]')).toContainText('Round 3 game');

  // --- An opponent assignment names the person and the colour, and links to their dossier.
  await routeAction(coach, 'New assignment');
  await coach.locator('[data-team-assignment-title]').fill('Round 5 file');
  await coach.getByRole('combobox', { name: 'Kind' }).selectOption('opponent');
  await coach.locator('[data-team-assignment-opponent]').fill('Rival');
  await coach.getByRole('combobox', { name: 'Our colour' }).selectOption('b');
  await coach.getByRole('button', { name: 'Set assignment' }).click();
  await expect(thread(coach)).toContainText('vs Rival · we have Black');

  // A second is who writes the file: as one, the first button is the hand-in,
  // not the review that the first version of the role split offered.
  await routeAction(coach, 'Members…');
  await coach.locator('[data-team-member-name]').fill('Anish');
  await coach.getByRole('combobox', { name: 'Role' }).selectOption('second');
  await coach.getByRole('button', { name: 'Add', exact: true }).click();
  await coach.getByRole('radio', { name: 'This is me: Anish' }).click();
  await expect(coach.getByRole('radio', { name: 'This is me: Anish' })).toBeChecked();
  await coach.getByRole('button', { name: 'Done' }).click();
  await expect(
    thread(coach).getByRole('button', { name: 'Hand in what’s on the board' }),
  ).toBeVisible();
  await expect(thread(coach).getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await routeAction(coach, 'Members…');
  await coach.getByRole('radio', { name: 'This is me: Coach' }).click();
  await expect(coach.getByRole('radio', { name: 'This is me: Coach' })).toBeChecked();
  await coach.getByRole('button', { name: 'Done' }).click();
  await thread(coach).getByRole('button', { name: 'Open in Preparation' }).click();
  await expect(coach).toHaveURL(/\/preparation\?player=Rival/);

  // --- From any board route, the Position menu leads to the hand-in.
  await coach.goto('/analysis');
  await coach.locator('html[data-kingfisher-ready="true"]').waitFor();
  await coach.getByRole('button', { name: 'Position actions' }).click();
  await coach.getByRole('menuitem', { name: 'Hand in to the team…' }).click();
  await expect(coach).toHaveURL(/\/team$/);
  await expect(coach.locator('[data-team-thread]')).toBeVisible();
  await coach.locator('[data-team-assignment="Round 3 game"]').click();

  // --- A packet whose board does not play is refused whole, with a reason.
  const tampered = JSON.parse(await readFile(studentPacket, 'utf8')) as {
    assignments: { handovers: { pgn?: string }[] }[];
  };
  tampered.assignments[0]!.handovers[0]!.pgn = '1. e4 e5 2. Kd3 *';
  const tamperedFile = path.join(test.info().outputDir, 'tampered.kingfisher-team.json');
  await writeFile(tamperedFile, JSON.stringify(tampered));
  await receivePacket(coach, tamperedFile);
  await expect(coach.getByText('Could not receive the packet.')).toBeVisible();
  await expect(coach.getByText(/A board in “Round 3 game” does not play/)).toBeVisible();
  await expect(thread(coach).locator('[data-team-handover="hand-in"]')).toHaveCount(1);

  // --- The reset control says where the board goes, and goes there.
  // (The board is put in a known state first: what survives a full navigation
  // is the draft's business, not this assertion's.)
  await thread(coach).getByRole('button', { name: 'Open on board' }).first().click();
  const replaceAgain = coach.getByRole('dialog', { name: 'Replace what is on the board?' });
  if (await replaceAgain.isVisible())
    await replaceAgain.getByRole('button', { name: 'Replace' }).click();
  await expect(coach.getByRole('button', { name: 'e5', exact: true })).toBeVisible();
  await coach
    .getByRole('button', { name: /^Clear the move tree — back to the starting position/ })
    .click();
  await expect(coach.getByText('Move tree cleared — back to the starting position.')).toBeVisible();
  await expect(coach.getByRole('button', { name: 'e5', exact: true })).toHaveCount(0);

  await student.context.close();
  expect(coachConsole).toEqual([]);
  expect(studentConsole).toEqual([]);
});
