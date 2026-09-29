import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The one Settings control, addressed once.
 *
 * There are two of them and they open the same dialog: the sidebar's
 * navigation row, and the control at the right of every page header that
 * commit 55902b6 added to the six routes that had none. Until this helper
 * existed, twenty-eight call sites across fifteen spec files named one of them
 * by its accessible name — and the two names differed only in punctuation.
 * The header control read "Settings (⌘,)" and the sidebar row computed
 * "Settings ⌘," from its `<span>` and its `<kbd>`, because the accessible-name
 * algorithm joins an element's text children with a space. Playwright's
 * substring matching then made `getByRole('button', { name: 'Settings ⌘,' })`
 * resolve to the **sidebar** row and nothing else, so those twenty-eight
 * assertions silently exercised the sidebar even on the routes whose whole
 * point was the new header control.
 *
 * Both controls now name themselves "Settings" and announce ⌘, through
 * `aria-keyshortcuts`, so the name says what the control does. That makes the
 * bare name ambiguous by construction, which is why the locator is written
 * here once, scoped to the navigation landmark, instead of twenty-eight times
 * by a punctuation accident.
 */
export const settingsButton = (page: Page): Locator =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Settings' });

/** Open Settings, the way a person does, and wait for the dialog. */
export const openSettings = async (page: Page): Promise<Locator> => {
  await settingsButton(page).click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible();
  return dialog;
};
