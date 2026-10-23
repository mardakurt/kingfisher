/**
 * Move sounds: off by default; on, a step forward plays one, and a jump, a
 * step back or a new document plays none.
 *
 * The browser's audio output cannot be listened to from a test, so the
 * boundary is stubbed instead: `AudioBufferSourceNode.prototype.start` is
 * wrapped before the page loads, and each knock's noise burst is counted.
 * The synthesis itself runs for real.
 */

import { expect, test, type Page } from '@playwright/test';

async function countSounds(page: Page) {
  await page.addInitScript(() => {
    const started: number[] = [];
    (window as unknown as { __starts: number[] }).__starts = started;
    // A buffer source has its own `start` (with an offset and a duration), so
    // it is wrapped there rather than on the scheduled-source base class.
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function start(
      this: AudioBufferSourceNode,
      ...args: Parameters<typeof original>
    ) {
      started.push(Date.now());
      return original.apply(this, args);
    };
  });
}

/** Knocks begun so far: one noise burst per move, two for a capture. */
const bursts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __starts: number[] }).__starts.length);

async function open(page: Page, moveSounds: boolean | undefined) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await countSounds(page);
  await page.goto('/analysis');
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  if (moveSounds !== undefined) {
    await page.evaluate((value) => {
      const raw = window.localStorage.getItem('kingfisher.preferences');
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 7 };
      parsed.state = { ...parsed.state, moveSounds: value };
      window.localStorage.setItem('kingfisher.preferences', JSON.stringify(parsed));
    }, moveSounds);
    await page.reload();
    await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  }
}

async function play(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

test('silent by default', async ({ page }) => {
  await open(page, undefined);
  await play(page, 'e2', 'e4');
  await expect(page.getByRole('gridcell', { name: 'e4, White pawn' })).toBeVisible();
  await page.waitForTimeout(200);
  expect(await bursts(page)).toBe(0);
});

test('on, a step forward sounds and a jump does not', async ({ page }) => {
  await open(page, true);
  await play(page, 'e2', 'e4');
  await expect.poll(() => bursts(page)).toBe(1);
  await play(page, 'd7', 'd5');
  await expect.poll(() => bursts(page)).toBe(2);
  // A capture is the heavier knock: two bursts.
  await play(page, 'e4', 'd5');
  await expect.poll(() => bursts(page)).toBe(4);

  // Back is silent; forward again sounds the move it steps onto.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  expect(await bursts(page)).toBe(4);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => bursts(page)).toBe(5);

  // A jump to the start and to the end is not a game being played.
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  await page.waitForTimeout(150);
  expect(await bursts(page)).toBe(5);
});
