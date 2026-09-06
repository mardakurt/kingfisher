/**
 * Screenshot regressions for the surfaces a layout change would break.
 *
 * Deliberately few. A snapshot of every component is a suite that fails on
 * every deliberate change and is therefore a suite people update without
 * looking — which is worse than no suite, because it launders a regression as
 * an approved diff. What is captured here is the small set where "it still
 * renders correctly" is hard to say in words: whole-workspace arrangement at a
 * known viewport, and the two concealed states where the absence of something
 * is the whole point.
 *
 * The semantic assertions in `phase10.spec.ts` and `reliability.spec.ts` remain
 * the real contract. These supplement them: a screenshot cannot tell you the
 * board is large enough or that concealed evidence is absent from the DOM, and
 * those tests already do. What a screenshot catches is the class of breakage
 * that satisfies every assertion and still looks wrong.
 *
 * Determinism is the whole difficulty, so it is handled explicitly:
 *
 *  - a fixed viewport per shot, set on the test rather than inherited;
 *  - animations disabled through the application's own preference, not by
 *    injecting CSS, so what is captured is a state the product can be in;
 *  - the clock frozen, because a "saved 3 seconds ago" is a pixel diff every
 *    run;
 *  - no network evidence on screen — nothing here waits for an explorer, an
 *    engine or a tablebase, because a snapshot that depends on somebody else's
 *    service is a snapshot that fails for reasons nobody changed.
 *
 * Baselines are written on first run. A missing baseline is not a pass: the
 * first run of a new shot fails, which is the correct way to force somebody to
 * look at the picture before it becomes the reference.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const READY = 'html[data-kingfisher-ready="true"]';

const SNAPSHOTS = path.join(process.cwd(), 'e2e', 'visual.spec.ts-snapshots');

/**
 * Whether this platform has committed baselines.
 *
 * Playwright names snapshots by platform because it has to: Chromium
 * rasterises text differently on macOS and on Linux, by far more than any
 * tolerance that would still catch a moved panel. Committing one platform's
 * baselines and comparing against them everywhere would produce a suite that
 * fails on every machine but one, which is a suite people learn to ignore.
 *
 * So a platform without baselines skips, visibly, with the command that fixes
 * it. The `baselines exist at all` test below is what stops that skip from
 * quietly becoming "this suite never runs anywhere".
 */
const platformSuffix = process.platform === 'win32' ? 'win32' : process.platform;
const hasBaselines =
  process.env.UPDATE_VISUAL_BASELINES === '1' ||
  (existsSync(SNAPSHOTS) &&
    readdirSync(SNAPSHOTS).some((file) => file.endsWith(`-${platformSuffix}.png`)));

/**
 * Everything that has to be true before a pixel is compared.
 *
 * Applied per test rather than in a global setup so each shot states its own
 * preconditions; a snapshot whose determinism comes from somewhere else in the
 * file is one nobody can reason about when it starts flaking.
 */
async function settle(page: Page) {
  await page.locator(READY).waitFor();
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      /* The blinking cursor and any scroll shadow are per-frame noise. */
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
      /* Next's dev-only route badge lives outside the application. Error-free
         product baselines must compare Kingfisher, not framework chrome. */
      nextjs-portal { display: none !important; }
    `,
  });
  // One frame for the style tag, then one for anything it changed.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** Turn animation off through the product's own preference. */
async function calmPreferences(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript((selectedTheme) => {
    const raw = window.localStorage.getItem('kingfisher.preferences');
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    parsed.state = { ...parsed.state, animationSpeed: 'off', theme: selectedTheme };
    window.localStorage.setItem('kingfisher.preferences', JSON.stringify(parsed));
  }, theme);
}

interface Shot {
  readonly name: string;
  readonly route: string;
  readonly width: number;
  readonly height: number;
  readonly theme?: 'dark' | 'light';
  /**
   * A CSS selector to shoot instead of the page.
   *
   * A whole-page shot measures its tolerance against the whole page, and that
   * is what let a 7% change to every piece pass: the pieces are a small share
   * of 1440×900, so a change that is enormous on the board is a fraction of a
   * percent of the frame. Cropping to the board makes the denominator the
   * board.
   */
  readonly selector?: string;
  /**
   * Allowed fraction of differing pixels, in this shot's own frame.
   *
   * Per shot rather than global, because the shots are not measuring the same
   * thing. A page shot has to tolerate a pixel or two of font rasterisation
   * across a large frame; a board shot has no text in it and should tolerate
   * almost nothing.
   */
  readonly tolerance?: number;
}

/**
 * The default for a full-page shot.
 *
 * Font rasterisation differs by a pixel or two between machines and a
 * threshold generous enough to absorb a moved panel would absorb the bug too.
 * This is the number Phase 17 found was too coarse for artwork, which is why
 * the board now has its own shot rather than why this number moved.
 */
const PAGE_TOLERANCE = 0.02;

/**
 * The default for a shot cropped to the board.
 *
 * Chosen from measurement. Phase 17 found the gate could absorb a seven per
 * cent change to every piece on the board; the board shot was added to fix
 * that, and then the piece scale was actually moved to find out what the new
 * shot would catch. Measured on macOS arm64 against a 584 × 583 board — that
 * is 340,472 pixels — by editing `visualScale` for the default set and
 * re-running:
 *
 *   piece scale change   differing pixels   as a ratio
 *   ------------------   ----------------   ----------
 *   none                                0        0
 *   0.56% smaller                      55        0.00016
 *   1.03% smaller                     218        0.00064
 *   2.52% smaller                   1,505        0.0044
 *   7.00% smaller                   9,110        0.0268
 *
 * The first row is the load-bearing one: an unchanged board is byte-identical.
 * A board has no text on it, so there is nothing here that rasterises
 * differently between runs, and the tolerance exists only for whatever a
 * different machine of the same platform might do at the edges of the artwork.
 *
 * 0.002 is 681 pixels. It catches the 2.52% change with more than twice the
 * margin it needs and the 7% change by a factor of thirteen, and leaves 681
 * pixels of room against a measurement of zero.
 *
 * What it does **not** catch is a change of one per cent or less, and that is
 * a deliberate trade rather than an oversight: going tighter would mean
 * choosing a threshold against antialiasing behaviour on the Linux CI runner
 * that has not been measured from here, and a gate that fails at random is
 * worse than one that misses a change nobody can see.
 */
const BOARD_TOLERANCE = 0.002;

const SHOTS: readonly Shot[] = [
  { name: 'analysis-desktop', route: '/analysis', width: 1440, height: 900 },
  { name: 'analysis-light', route: '/analysis', width: 1440, height: 900, theme: 'light' },
  { name: 'analysis-laptop', route: '/analysis', width: 1280, height: 720 },
  { name: 'analysis-large', route: '/analysis', width: 1920, height: 1080 },
  { name: 'analysis-compact', route: '/analysis', width: 1024, height: 720 },
  { name: 'analysis-mobile', route: '/analysis', width: 390, height: 844 },
  { name: 'openings', route: '/openings', width: 1440, height: 900 },
  { name: 'studies', route: '/studies', width: 1440, height: 900 },
  { name: 'repertoire', route: '/repertoire', width: 1440, height: 900 },
  { name: 'preparation', route: '/preparation', width: 1440, height: 900 },
  { name: 'players', route: '/players', width: 1440, height: 900 },
  { name: 'databases', route: '/databases', width: 1440, height: 900 },
  { name: 'games', route: '/games', width: 1440, height: 900 },
  { name: 'endgame', route: '/endgame', width: 1440, height: 900 },
  { name: 'review-concealed', route: '/review', width: 1440, height: 900 },
  { name: 'training-concealed', route: '/training', width: 1440, height: 900 },
  { name: 'player-profile', route: '/player/nobody', width: 1440, height: 900 },
  /*
    The board alone, in both themes, at the tolerance a board deserves.

    Phase 17 found that the visual gate could absorb a seven per cent change to
    every piece on the board without failing, because every shot was a whole
    page and every page was allowed two per cent. These two shots are the fix:
    the frame is the board, so a change to the artwork is measured against the
    artwork.
  */
  {
    name: 'board-pieces',
    route: '/analysis',
    width: 1440,
    height: 900,
    selector: '[data-chessboard]',
    tolerance: BOARD_TOLERANCE,
  },
  {
    name: 'board-pieces-light',
    route: '/analysis',
    width: 1440,
    height: 900,
    theme: 'light',
    selector: '[data-chessboard]',
    tolerance: BOARD_TOLERANCE,
  },
];

test('baselines exist for at least one platform', () => {
  /*
    The guard on the skip above. A repository with no baselines at all would
    let every visual test skip and report green, which is the failure mode this
    whole file exists to avoid being.
  */
  expect(existsSync(SNAPSHOTS), 'No visual baselines are committed at all.').toBe(true);
  expect(readdirSync(SNAPSHOTS).filter((file) => file.endsWith('.png')).length).toBeGreaterThan(10);
});

test.describe(() => {
  test.skip(
    !hasBaselines,
    `No visual baselines are committed for ${platformSuffix}. Generate them once with ` +
      '`npm run visual:baselines` and commit e2e/visual.spec.ts-snapshots.',
  );

  for (const shot of SHOTS) {
    test(`${shot.name} looks the way it is supposed to`, async ({ page }) => {
      await calmPreferences(page, shot.theme);
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.goto(shot.route);
      await settle(page);

      /*
        A page shot's point is the arrangement — a dock that has stopped
        fitting, a board that has stopped being the largest thing on screen —
        and cropping it to one panel would miss exactly those. A board shot's
        point is the artwork, and including the page would drown it. So the
        target is per shot, and so is the tolerance.
      */
      const target = shot.selector ? page.locator(shot.selector) : page;
      if (shot.selector) await expect(page.locator(shot.selector)).toBeVisible();

      await expect(target).toHaveScreenshot(`${shot.name}.png`, {
        ...(shot.selector ? {} : { fullPage: false }),
        maxDiffPixelRatio: shot.tolerance ?? PAGE_TOLERANCE,
        animations: 'disabled',
        caret: 'hide',
        /*
          The status bar carries a clock and a live save state, which change
          between runs without anything having regressed. A board shot has no
          footer in frame and masking one would be masking nothing.
        */
        ...(shot.selector
          ? {}
          : {
              mask: [page.locator('footer')],
              maskColor: shot.theme === 'light' ? '#f3f1ed' : '#071827',
            }),
      });
    });
  }

  test('the settings dialog looks the way it is supposed to', async ({ page }) => {
    await calmPreferences(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analysis');
    await settle(page);
    await page.getByRole('button', { name: 'Settings ⌘,' }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await page.getByRole('tab', { name: 'Board', exact: true }).click();
    await expect(page.locator('[data-mini-board="board-preview"]')).toBeVisible();
    await settle(page);

    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveScreenshot('settings.png', {
      maxDiffPixelRatio: PAGE_TOLERANCE,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('the calculation tool looks the way it is supposed to', async ({ page }) => {
    await calmPreferences(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analysis');
    await settle(page);
    await page.getByRole('button', { name: /More/ }).first().click();
    await page.getByRole('menuitem', { name: 'Calculation' }).click();
    await expect(page.getByRole('button', { name: 'Start calculation' })).toBeVisible();
    await settle(page);

    await expect(page).toHaveScreenshot('calculation-concealed.png', {
      fullPage: false,
      maxDiffPixelRatio: PAGE_TOLERANCE,
      animations: 'disabled',
      caret: 'hide',
      mask: [page.locator('footer')],
      maskColor: '#071827',
    });
  });

  test('position setup uses the board visual system', async ({ page }) => {
    await calmPreferences(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analysis');
    await settle(page);
    await page.getByRole('button', { name: 'Position actions' }).click();
    await page.getByRole('menuitem', { name: 'Set up position…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Set up position' });
    await expect(dialog).toBeVisible();
    await settle(page);
    await expect(dialog).toHaveScreenshot('position-setup.png', {
      maxDiffPixelRatio: PAGE_TOLERANCE,
      animations: 'disabled',
      caret: 'hide',
    });
  });

  test('play from here stays subordinate to the main board', async ({ page }) => {
    await calmPreferences(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analysis');
    await settle(page);
    await page.getByRole('button', { name: 'Position actions' }).click();
    await page.getByRole('menuitem', { name: 'Play from this position' }).click();
    await expect(page.getByRole('button', { name: 'Start practice' })).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot('play-from-here.png', {
      fullPage: false,
      maxDiffPixelRatio: PAGE_TOLERANCE,
      animations: 'disabled',
      caret: 'hide',
      mask: [page.locator('footer')],
      maskColor: '#071827',
    });
  });
});
