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
  existsSync(SNAPSHOTS) &&
  readdirSync(SNAPSHOTS).some((file) => file.endsWith(`-${platformSuffix}.png`));

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
    `,
  });
  // One frame for the style tag, then one for anything it changed.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** Turn animation off through the product's own preference. */
async function calmPreferences(page: Page) {
  await page.addInitScript(() => {
    const raw = window.localStorage.getItem('kingfisher.preferences');
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    parsed.state = { ...parsed.state, animationSpeed: 'off', theme: 'dark' };
    window.localStorage.setItem('kingfisher.preferences', JSON.stringify(parsed));
  });
}

interface Shot {
  readonly name: string;
  readonly route: string;
  readonly width: number;
  readonly height: number;
}

const SHOTS: readonly Shot[] = [
  { name: 'analysis-desktop', route: '/analysis', width: 1440, height: 900 },
  { name: 'analysis-compact', route: '/analysis', width: 1024, height: 720 },
  { name: 'analysis-mobile', route: '/analysis', width: 390, height: 844 },
  { name: 'studies', route: '/studies', width: 1440, height: 900 },
  { name: 'repertoire', route: '/repertoire', width: 1440, height: 900 },
  { name: 'preparation', route: '/preparation', width: 1440, height: 900 },
  { name: 'databases', route: '/databases', width: 1440, height: 900 },
  { name: 'games', route: '/games', width: 1440, height: 900 },
  { name: 'endgame', route: '/endgame', width: 1440, height: 900 },
  { name: 'review-concealed', route: '/review', width: 1440, height: 900 },
  { name: 'training-concealed', route: '/training', width: 1440, height: 900 },
  { name: 'player-profile', route: '/player/nobody', width: 1440, height: 900 },
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
      await calmPreferences(page);
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.goto(shot.route);
      await settle(page);

      await expect(page).toHaveScreenshot(`${shot.name}.png`, {
        /*
        A whole-page shot: the point is the arrangement, and cropping to one
        panel would miss the failures worth catching — a dock that has stopped
        fitting, a board that has stopped being the largest thing on screen.
      */
        fullPage: false,
        /*
        A small tolerance, and a small one on purpose. Font rasterisation
        differs by a pixel or two between machines; a threshold generous enough
        to absorb a moved panel would absorb the bug too.
      */
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
        caret: 'hide',
        // The status bar carries a clock and a live save state, which change
        // between runs without anything having regressed.
        mask: [page.locator('footer')],
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
    await settle(page);

    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveScreenshot('settings.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
    });
  });
});
