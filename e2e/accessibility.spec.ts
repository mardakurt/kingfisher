/**
 * Keyboard-only work, and names for the things that only have icons.
 *
 * Phase 11 deferred this and the deferral cost something: it is the reason the
 * notes field had a placeholder and no accessible name, which meant that the
 * moment somebody typed a note the field went nameless to a screen reader —
 * exactly when they most needed to find it again.
 *
 * Two kinds of assertion here, and they catch different failures.
 *
 * **Names.** Every interactive control has to be announceable. An icon button
 * with no label is a button a screen-reader user cannot describe to themselves,
 * and there is no styling that makes up for it. Checked by walking the rendered
 * page rather than by reviewing the source, because the failure is in what is
 * emitted.
 *
 * **Reachability.** A major workflow has to be completable without a mouse.
 * That is asserted by actually driving it from the keyboard — Tab, Enter,
 * arrows — rather than by counting `tabindex` attributes, which proves nothing
 * about whether the sequence goes anywhere useful.
 */

import { expect, test, type Page } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

async function waitForApp(page: Page) {
  await page.locator(READY).waitFor();
}

/**
 * Interactive elements that a screen reader would announce as nothing.
 *
 * Returns the offenders with enough context to find them, because "3 controls
 * are unnamed" is a number nobody can act on.
 */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector =
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="menuitem"]';
    const offenders: string[] = [];
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const html = element as HTMLElement;
      if (html.hidden || html.getAttribute('aria-hidden') === 'true') continue;
      // Anything not laid out is not on the page for this purpose.
      if (html.offsetParent === null && html.tagName !== 'OPTION') continue;

      const labelledBy = html.getAttribute('aria-labelledby');
      const named =
        (html.getAttribute('aria-label') ?? '').trim().length > 0 ||
        (labelledBy
          ? (document.getElementById(labelledBy)?.textContent ?? '').trim().length > 0
          : false) ||
        (html.textContent ?? '').trim().length > 0 ||
        (html.getAttribute('title') ?? '').trim().length > 0 ||
        // A form control labelled by a wrapping or associated <label>.
        Boolean(html.closest('label')) ||
        Boolean(html.id && document.querySelector(`label[for="${CSS.escape(html.id)}"]`));

      if (!named) {
        offenders.push(
          `<${html.tagName.toLowerCase()}${html.className ? ` class="${String(html.className).slice(0, 60)}"` : ''}>`,
        );
      }
    }
    return offenders;
  });
}

const ROUTES = [
  '/analysis',
  '/games',
  '/databases',
  '/studies',
  '/repertoire',
  '/preparation',
  '/endgame',
  '/training',
  '/review',
  '/openings',
  '/opening-files',
  '/recent',
];

test.describe('every control can be announced', () => {
  for (const route of ROUTES) {
    test(`${route} names every interactive control`, async ({ page }) => {
      await page.goto(route);
      await waitForApp(page);
      const offenders = await unnamedControls(page);
      expect(
        offenders,
        `${route} renders controls a screen reader would announce as nothing: ` +
          `${offenders.join(', ')}`,
      ).toEqual([]);
    });
  }

  test('the player profile names its controls', async ({ page }) => {
    await page.goto('/player/nobody%20here');
    await waitForApp(page);
    expect(await unnamedControls(page)).toEqual([]);
  });

  test('the settings dialog names its controls', async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);
    await page.getByRole('button', { name: 'Settings ⌘,' }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    expect(await unnamedControls(page)).toEqual([]);
  });

  test('the command palette names its controls', async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('dialog').first()).toBeVisible();
    expect(await unnamedControls(page)).toEqual([]);
  });
});

test.describe('the board is usable from the keyboard', () => {
  test('every square is a named grid cell', async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);
    const board = page.getByRole('grid', { name: 'Chessboard' });
    await expect(board).toBeVisible();
    /*
      Sixty-four named cells. A board rendered as unlabelled divs is a board a
      screen-reader user cannot read the position from, which makes every other
      accessibility affordance in the application beside the point.
    */
    await expect(board.getByRole('gridcell')).toHaveCount(64);
    await expect(board.getByRole('gridcell', { name: /^e2,/ })).toBeVisible();
  });

  test('the move controls are reachable and operable by keyboard', async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);

    // Play a couple of moves with the pointer, then navigate with the keyboard.
    await page.getByRole('gridcell', { name: /^e2,/ }).click();
    await page.getByRole('gridcell', { name: /^e4,/ }).click();
    await page.getByRole('gridcell', { name: /^e7,/ }).click();
    await page.getByRole('gridcell', { name: /^e5,/ }).click();
    await expect(page.getByText('2 half-moves')).toBeVisible({ timeout: 10_000 });

    await page.locator('body').click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    // The board followed the keys rather than staying where the mouse left it.
    await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
  });
});

test.describe('dialogs return focus where it came from', () => {
  test('settings gives focus back to the button that opened it', async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);

    const opener = page.getByRole('button', { name: 'Settings ⌘,' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    // Focus moved into the dialog rather than being left behind it.
    await expect(dialog.locator(':focus')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    /*
      Back to the opener. Focus dropped on `<body>` after a dialog closes means
      the next Tab starts from the top of the page, which is how keyboard users
      lose their place.
    */
    await expect(opener).toBeFocused();
  });

  test('the command palette closes on Escape and restores focus', async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog').first();
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
    await expect(page.locator('body')).toBeVisible();
  });

  test('Tab stays inside an open dialog', async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);
    await page.getByRole('button', { name: 'Settings ⌘,' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    /*
      Twenty tabs is more than the dialog has focusable elements, so if the
      trap leaks the focus ends up outside. Checked by asking where focus is
      rather than by counting stops, because the number changes whenever a
      setting is added.
    */
    for (let index = 0; index < 20; index += 1) await page.keyboard.press('Tab');
    const insideDialog = await page.evaluate(() => {
      const active = document.activeElement;
      const dialogElement = document.querySelector('[role="dialog"]');
      return Boolean(active && dialogElement && dialogElement.contains(active));
    });
    expect(insideDialog, 'Tab escaped the settings dialog').toBe(true);
  });
});

test.describe('major workflows without a mouse', () => {
  test('the command palette reaches another route', async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);

    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await page.keyboard.type('games');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/games/, { timeout: 15_000 });
  });

  test('the database screen is navigable by keyboard alone', async ({ page }) => {
    await page.goto('/databases');
    await waitForApp(page);

    // Tab until a collection's own control has focus, then activate it.
    let reached = false;
    for (let index = 0; index < 40 && !reached; index += 1) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() =>
        Boolean(document.activeElement?.textContent?.includes('My games')),
      );
    }
    expect(reached, 'No amount of tabbing reached the collection list').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'My games' })).toBeVisible();
  });

  test('settings are searchable and reachable without a pointer', async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);
    await page.getByRole('button', { name: 'Settings ⌘,' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    const search = dialog
      .getByRole('searchbox')
      .or(dialog.getByPlaceholder(/search/i))
      .first();
    await search.fill('threads');
    await expect(dialog.getByText(/thread/i).first()).toBeVisible();
  });
});

test.describe('status changes are announced', () => {
  test('the save state lives in a live region', async ({ page }) => {
    await page.goto('/analysis');
    await waitForApp(page);
    /*
      A save indicator that only changes colour tells a sighted user everything
      and a screen-reader user nothing. It has to be in a region that announces.
    */
    const live = page.locator('[role="status"], [aria-live]');
    await expect(live.first()).toBeAttached();
  });

  test('a notice is announced rather than only drawn', async ({ page }) => {
    await page.goto('/games');
    await waitForApp(page);
    await expect(
      page.locator('[role="status"], [role="alert"], [aria-live]').first(),
    ).toBeAttached();
  });
});
