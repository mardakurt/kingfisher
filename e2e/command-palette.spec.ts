/**
 * The command palette must read as one list with named groups, not as a flat
 * ladder of small captions.
 *
 * Before Phase 53, every row carried its own uppercase group label (a 74 px
 * column on the left). A search that returned two openings, two players and
 * three games showed the same "OPENINGS / PLAYERS / GAMES" labels twice or
 * thrice, with no visual rule telling the reader where one group ended and
 * the next began. The fix is a section divider: a row of caps that appears
 * once, at the top of every run of consecutive same-group items. The in-row
 * label is gone, the divider is the header.
 */

import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

test('the command palette renders section dividers between runs of different groups', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/openings');
  await ready(page);
  // The palette listens for the platform's "mod" key (Cmd on Mac, Ctrl
  // elsewhere); the keyboard binding tests in `bindings.test.ts` already lock
  // this contract, so here we open the palette by clicking the search field.
  await page.locator('button[aria-label="Search commands"]').click();
  const dialog = page.locator('div[role="dialog"][aria-label="Command palette"]');
  await dialog.waitFor();
  const input = dialog.locator('input[role="searchbox"]');
  await input.fill('the');
  // Two groups are guaranteed at the top of the empty-palette state (the
  // commands themselves and the first thing they navigate to). After typing
  // "the", the opening index has to load — give it room.
  await page.waitForTimeout(2_500);
  const dividers = await dialog.locator('[data-group-header]').count();
  expect(dividers, 'at least one section divider is rendered').toBeGreaterThanOrEqual(1);
  // The dividers are the only place a group name reaches the screen now —
  // the row no longer carries one. A row with the old in-row label would
  // have a wide uppercase span; nothing of the sort survives this test.
  const oldInRowLabel = await dialog.locator('span.w-\\[74px\\]').count();
  expect(oldInRowLabel, 'the old 74 px in-row group label is gone').toBe(0);
});
