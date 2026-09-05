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
  { width: 2560, height: 1440, board: 760 },
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
  const measurements: string[] = [];

  for (const floor of FLOORS) {
    await page.setViewportSize({ width: floor.width, height: floor.height });
    for (const route of BOARD_ROUTES) {
      await page.goto(route);
      await ready(page);
      await page.waitForTimeout(500);
      const size = await boardSize(page);
      measurements.push(`${floor.width}x${floor.height} ${route} ${size}px`);
      if (size < floor.board) {
        tooSmall.push(
          `${floor.width}x${floor.height} ${route}: board ${size}px, floor ${floor.board}px`,
        );
      }
    }
  }

  expect(tooSmall).toEqual([]);
  await test.info().attach('board-measurements.txt', {
    body: measurements.join('\n'),
    contentType: 'text/plain',
  });
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

/**
 * An arrangement of the kind selecting a tool tab writes.
 *
 * It records a choice and no dimensions, which is exactly what the store
 * produces when the user clicks Engine in the dock — an action with no layout
 * intent at all. The previous version of this test deleted the layout key
 * before measuring, so it passed throughout the period in which Board priority
 * did nothing for anybody who had ever clicked a tab.
 */
const TAB_SELECTED_LAYOUT = {
  state: {
    sidebarCollapsed: false,
    compact: false,
    preset: 'analysis',
    arrangements: {
      'desktop:analysis': { placement: {}, active: { dock: 'engine' }, dockCollapsed: false },
    },
    savedLayouts: [],
    pinnedTools: {},
  },
  version: 4,
};

const withPriority = async (page: Page, priority: string, layout: unknown) => {
  await page.evaluate(
    ({ value, layout }) => {
      const key = 'kingfisher.preferences';
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 4 };
      parsed.state = { ...parsed.state, boardPriority: value };
      localStorage.setItem(key, JSON.stringify(parsed));
      if (layout === null) localStorage.removeItem('kingfisher.workspace-layout');
      else localStorage.setItem('kingfisher.workspace-layout', JSON.stringify(layout));
    },
    { value: priority, layout },
  );
  await page.reload();
  await ready(page);
  await page.waitForTimeout(500);
  return boardSize(page);
};

test('board priority actually changes the board, in the direction it says', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const balanced = await withPriority(page, 'balanced', null);
  const large = await withPriority(page, 'large', null);
  const maximum = await withPriority(page, 'maximum', null);

  expect(large).toBeGreaterThan(balanced);
  expect(maximum).toBeGreaterThan(large);
});

/**
 * The bug a user reported, and the reason the test above was not enough.
 *
 * Selecting a tool tab writes an arrangement. The old model let any stored
 * arrangement override the board policy wholesale, so that one click pinned
 * the dock width and notation height for ever: measured at 1440x900, Balanced,
 * Large and Maximum all produced a 583px board. The three settings were
 * indistinguishable for every user who had used the application at all.
 */
test('board priority still moves a workspace whose tab has been clicked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const balanced = await withPriority(page, 'balanced', TAB_SELECTED_LAYOUT);
  const large = await withPriority(page, 'large', TAB_SELECTED_LAYOUT);
  const maximum = await withPriority(page, 'maximum', TAB_SELECTED_LAYOUT);

  expect(large).toBeGreaterThan(balanced);
  expect(maximum).toBeGreaterThan(large);

  await test.info().attach('board-priority-with-stored-layout.txt', {
    body: `balanced ${balanced}px\nlarge ${large}px\nmaximum ${maximum}px`,
    contentType: 'text/plain',
  });
});

/**
 * A width the user dragged is theirs, and the policy must not take it back.
 *
 * This is the other half of the contract: releasing the dimensions nobody
 * chose is only correct if the ones somebody did choose survive.
 */
test('a dock width the user set survives a change of board priority', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const dragged = {
    ...TAB_SELECTED_LAYOUT,
    state: {
      ...TAB_SELECTED_LAYOUT.state,
      arrangements: {
        'desktop:analysis': {
          placement: {},
          active: { dock: 'engine' },
          dockCollapsed: false,
          dockWidth: 512,
        },
      },
    },
  };

  const dockWidth = async () =>
    page
      .locator('[data-workspace-dock]')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().width));

  await withPriority(page, 'balanced', dragged);
  const atBalanced = await dockWidth();
  await withPriority(page, 'maximum', dragged);
  const atMaximum = await dockWidth();

  expect(atBalanced).toBe(512);
  expect(atMaximum).toBe(512);
});
