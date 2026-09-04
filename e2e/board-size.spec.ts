import { expect, test, type Page } from '@playwright/test';

/**
 * The board is the product, and it was too small.
 *
 * Measured before this test existed, on `/analysis`: 307px at 1280x720, 355 at
 * 1366x768, 487 at 1440x900. Three things were taking the space — a 210px
 * notation panel and 89px of padding out of a 640px column, a hard 740px
 * ceiling that a large display reached and a laptop never did, and a bug where
 * the evaluation bar's 34px was subtracted from the board rather than added to
 * the frame around it.
 *
 * These floors are the ones the brief asks for. They are deliberately absolute
 * pixel numbers rather than proportions: a proportion would pass on a 4K
 * display while the laptop case that motivated all of this stayed broken.
 */

const FLOORS = [
  { width: 1280, height: 720, board: 450 },
  { width: 1366, height: 768, board: 490 },
  { width: 1440, height: 900, board: 560 },
  { width: 1920, height: 1080, board: 650 },
] as const;

/** Routes whose whole purpose is a board, and which therefore must be measured. */
const BOARD_ROUTES = ['/analysis', '/endgame', '/opening-files'] as const;

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

const boardSize = (page: Page) =>
  page
    .locator('[data-board-frame]')
    .first()
    .evaluate((frame) => {
      const rect = frame.getBoundingClientRect();
      return Math.round(Math.min(rect.width, rect.height));
    });

test('the board is large on every display a workstation runs on', async ({ page }) => {
  test.setTimeout(300_000);
  const tooSmall: string[] = [];

  for (const floor of FLOORS) {
    await page.setViewportSize({ width: floor.width, height: floor.height });
    for (const route of BOARD_ROUTES) {
      await page.goto(route);
      await ready(page);
      await page.waitForTimeout(500);
      const size = await boardSize(page);
      if (size < floor.board) {
        tooSmall.push(
          `${floor.width}x${floor.height} ${route}: board ${size}px, floor ${floor.board}px`,
        );
      }
    }
  }

  expect(tooSmall).toEqual([]);
});

test('the board stays square, and never overflows its column', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/analysis');
  await ready(page);
  await page.waitForTimeout(400);

  const geometry = await page
    .locator('[data-board-frame]')
    .first()
    .evaluate((frame) => {
      const rect = frame.getBoundingClientRect();
      const container = frame.closest('[data-board-container]')?.getBoundingClientRect();
      return {
        square: Math.abs(rect.width - rect.height) < 1.5,
        insideWidth: container ? rect.width <= container.width + 1 : false,
        insideHeight: container ? rect.height <= container.height + 1 : false,
      };
    });

  expect(geometry.square).toBe(true);
  expect(geometry.insideWidth).toBe(true);
  expect(geometry.insideHeight).toBe(true);
});

test('board priority actually changes the board, in the direction it says', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const withPriority = async (priority: string) => {
    await page.evaluate((value) => {
      const key = 'kingfisher.preferences';
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 4 };
      parsed.state = { ...parsed.state, boardPriority: value };
      localStorage.setItem(key, JSON.stringify(parsed));
      // A layout the user rearranged wins over the policy, so this test starts
      // from a workspace nobody has touched.
      localStorage.removeItem('kingfisher.workspace-layout');
    }, priority);
    await page.reload();
    await ready(page);
    await page.waitForTimeout(500);
    return boardSize(page);
  };

  const balanced = await withPriority('balanced');
  const large = await withPriority('large');
  const maximum = await withPriority('maximum');

  expect(large).toBeGreaterThan(balanced);
  expect(maximum).toBeGreaterThanOrEqual(large);
});
