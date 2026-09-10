#!/usr/bin/env node
import { mkdtempSync as auditTemp } from 'node:fs';
import { tmpdir as auditTmpdir } from 'node:os';
/**
 * Does anything Kingfisher draws collide with the macOS window buttons?
 *
 * ## Why this is a script and not a Playwright spec
 *
 * The traffic lights are not in the DOM. They are three `NSButton`s the
 * operating system draws on top of the web contents, and no browser test can
 * see them, hit-test them, or notice one sitting on top of a control. The only
 * process that knows where they are is the shell, which put them there.
 *
 * So the check has to straddle both: ask the main process for the rectangle,
 * ask the renderer for every control it has drawn, and intersect the two. That
 * is a semantic assertion rather than a screenshot, which matters because a
 * screenshot comparison would go red for a font change and stay green for a
 * button moved four pixels under the zoom control.
 *
 * ## What it walks
 *
 * Every state in which something different owns the window's top-left corner:
 * the expanded sidebar, the collapsed rail, focus mode with no sidebar at all,
 * both themes, six window sizes from the smallest the shell permits to an
 * external display, and a full-screen round trip — because leaving full screen
 * is where a reservation gets left behind.
 *
 *   npm run desktop:chrome                # the shell, from the checkout
 *   npm run desktop:chrome -- --packaged  # a built Kingfisher.app
 *   npm run desktop:chrome -- --sizes-only
 */

import { _electron as electron } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  MAC_TRAFFIC_LIGHT_BOUNDS,
  MAC_TITLEBAR_SAFE,
  MAC_TITLEBAR_GAP,
  MAC_BRAND_REGION,
} from '../desktop/src/window-chrome.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = { packaged: argv.includes('--packaged'), keepOpen: argv.includes('--keep-open') };

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

function shellBinary() {
  const marker = path.join(ROOT, 'desktop', 'node_modules', 'electron', 'path.txt');
  if (!existsSync(marker)) {
    console.error('The desktop shell is not installed. Run npm run desktop:install.');
    exit(1);
  }
  return path.join(
    ROOT,
    'desktop',
    'node_modules',
    'electron',
    'dist',
    readFileSync(marker, 'utf8').trim(),
  );
}

function packagedBinary() {
  const out = process.env.KINGFISHER_DESKTOP_OUT ?? path.join(ROOT, 'desktop', 'dist');
  for (const directory of ['mac-arm64', 'mac', 'mac-x64', 'mac-universal']) {
    const app = path.join(out, directory, 'Kingfisher.app');
    if (existsSync(app)) return path.join(app, 'Contents', 'MacOS', 'Kingfisher');
  }
  return path.join(out, 'mac-arm64', 'Kingfisher.app', 'Contents', 'MacOS', 'Kingfisher');
}

/**
 * The window sizes a person actually has.
 *
 * The first is the smallest the shell permits — `minWidth`/`minHeight` in
 * main.mjs — because that is where a reservation that is merely *usually* big
 * enough stops being big enough. The rest are the common laptop panels and one
 * external display.
 */
const SIZES = [
  { name: 'minimum', width: 900, height: 600 },
  { name: '1280×720', width: 1280, height: 720 },
  { name: '1366×768', width: 1366, height: 768 },
  { name: '1440×900', width: 1440, height: 900 },
  { name: '1512×982 (14-inch)', width: 1512, height: 982 },
  { name: '1920×1080', width: 1920, height: 1080 },
];

/** Routes whose top-left is owned by a different workspace header. */
const ROUTES = ['/analysis', '/openings', '/players', '/databases', '/repertoire'];

/**
 * Everything the user could aim at, and where it is.
 *
 * Deliberately not "every element": an element that merely *covers* the corner
 * is fine if it does nothing — the sidebar's own background does, and must.
 * What may not be there is something clickable, focusable or scrollable, since
 * that is what a user loses when macOS eats the click for its own button.
 */
const INTERACTIVE = `
  a[href], button, input, select, textarea, summary, [role="button"], [role="tab"],
  [role="link"], [role="menuitem"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])
`;

const collide = (light, rect) =>
  rect.x < light.x + light.width &&
  rect.x + rect.width > light.x &&
  rect.y < light.y + light.height &&
  rect.y + rect.height > light.y;

/** What the renderer has drawn in, and near, the corner. */
async function survey(window) {
  return window.evaluate((selector) => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const controls = [];
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest('[inert]') || el.getAttribute('aria-hidden') === 'true') continue;
      // Only the corner matters, and a generous slice of it.
      if (r.left > 320 || r.top > 120) continue;
      controls.push({
        label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 44),
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      });
    }
    /*
      The Kingfisher mark, by name.

      It is not interactive, so the sweep above will never see it — and it is
      the thing that was actually broken: for nineteen phases the close button
      was drawn on top of it. A contract that only covers controls would have
      gone green on the original bug.
    */
    const mark = document.querySelector('.kf-titlebar-yield');
    const markRect = mark ? mark.getBoundingClientRect() : null;
    const markVisible = mark ? getComputedStyle(mark).display !== 'none' : false;

    /*
      Whether the brand group still fits inside the header it lives in.

      The third symptom of the Phase 21 corner, and the one a person notices
      without being able to name: with the mark pushed to 100 the wordmark ran
      to 223 in a 228 px sidebar, nine pixels past the header's own right inset.
      It never clipped, so nothing failed; it just looked crowded. This measures
      the group's right edge against the header's content box so that "crowded"
      is a number.
    */
    const header = document.querySelector('nav[data-sidebar]')?.firstElementChild ?? null;
    let brandGroup = null;
    if (header) {
      const headerRect = header.getBoundingClientRect();
      const padRight = parseFloat(getComputedStyle(header).paddingRight) || 0;
      let right = null;
      for (const child of header.children) {
        if (child.dataset.titlebarSafe) continue;
        const r = child.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        right = right === null ? r.right : Math.max(right, r.right);
      }
      if (right !== null) {
        brandGroup = { right, contentRight: headerRect.right - padRight };
      }
    }

    const board = document.querySelector('[data-board], [data-testid="board"], .board-surface');
    const boardRect = board?.getBoundingClientRect() ?? null;
    return {
      controls,
      brandGroup,
      safeWidth: style.getPropertyValue('--titlebar-safe-w').trim(),
      safeHeight: style.getPropertyValue('--titlebar-safe-h').trim(),
      titlebar: root.dataset.titlebar ?? null,
      sidebar: document.querySelector('nav[data-sidebar]')?.dataset.sidebar ?? null,
      reservations: [...document.querySelectorAll('[data-titlebar-safe]')].map((el) => ({
        kind: el.dataset.titlebarSafe,
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
        drag: getComputedStyle(el).getPropertyValue('-webkit-app-region').trim(),
      })),
      brand:
        markVisible && markRect
          ? { x: markRect.x, y: markRect.y, width: markRect.width, height: markRect.height }
          : null,
      board: boardRect
        ? { width: Math.round(boardRect.width), height: Math.round(boardRect.height) }
        : null,
    };
  }, INTERACTIVE);
}

async function assertClear(window, light, label) {
  const state = await survey(window);
  const hits = state.controls.filter((c) => collide(light, c));
  const worst = hits[0];
  const clear = check(
    `nothing clickable under the window buttons — ${label}`,
    hits.length === 0,
    worst
      ? `${hits.length} collision(s); first is “${worst.label}” at ${Math.round(worst.x)},${Math.round(worst.y)}`
      : `${state.controls.length} control(s) near the corner, all clear`,
  );
  const brandClear = check(
    `nor the Kingfisher mark — ${label}`,
    state.brand === null || !collide(light, state.brand),
    state.brand
      ? `mark at ${Math.round(state.brand.x)},${Math.round(state.brand.y)}`
      : 'not painted in this layout',
  );
  return clear && brandClear;
}

/**
 * Not "does it collide" but "is it composed".
 *
 * Phase 21 asserted the first and shipped a corner that satisfied it with 32
 * pixels of dead space, buttons riding eight pixels high against their own row,
 * and a brand group overrunning the header's right inset. "No collision" is
 * true of every arrangement with enough room in it, which makes it a safety
 * check and not a design one — so the design is stated in `window-chrome.mjs`
 * and checked here, exactly, in whole pixels.
 *
 * Only meaningful where Kingfisher actually paints a brand into the corner. In
 * the collapsed rail and in focus mode nothing is painted there and there is no
 * composition to hold; those states are covered by `assertClear`.
 */
async function assertComposed(window, light, label) {
  const state = await survey(window);
  if (!state.brand) return check(`composition — ${label}`, true, 'no brand painted in this layout');

  const brand = state.brand;
  const gap = Math.round(brand.x - (light.x + light.width));
  const brandCentre = brand.y + brand.height / 2;
  const lightCentre = light.y + light.height / 2;

  const placed = check(
    `the mark starts where the geometry says — ${label}`,
    Math.round(brand.x) === MAC_BRAND_REGION.x,
    `x ${Math.round(brand.x)}, expected ${MAC_BRAND_REGION.x}`,
  );
  const spaced = check(
    `one design gap between the last button and the mark — ${label}`,
    gap === MAC_TITLEBAR_GAP,
    `${gap}px, expected ${MAC_TITLEBAR_GAP}`,
  );
  /*
    One pixel of tolerance, and only one. The mark is 36 px in a 56 px header,
    so its centre is exact; the buttons' centre is derived from a rectangle
    macOS lays out from the origin it was given. Half a pixel of rounding is
    real and eight pixels of misalignment is the defect.
  */
  const aligned = check(
    `the buttons and the mark share a centre line — ${label}`,
    Math.abs(brandCentre - lightCentre) <= 1,
    `mark centre ${brandCentre.toFixed(1)}, buttons ${lightCentre.toFixed(1)}`,
  );
  const fits = check(
    `the brand group stays inside the header's own inset — ${label}`,
    !state.brandGroup || state.brandGroup.right <= state.brandGroup.contentRight + 0.5,
    state.brandGroup
      ? `ends at ${state.brandGroup.right.toFixed(1)}, header content edge ${state.brandGroup.contentRight.toFixed(1)}`
      : 'no brand group in this layout',
  );
  return placed && spaced && aligned && fits;
}

async function main() {
  if (process.platform !== 'darwin') {
    console.log('The macOS window buttons only exist on macOS. Nothing to check here.');
    exit(0);
  }

  console.log('Kingfisher window chrome');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(args.packaged ? 'target: the packaged application\n' : 'target: the checkout\n');

  const launch = args.packaged
    ? { executablePath: packagedBinary(), args: [] }
    : { executablePath: shellBinary(), args: [path.join(ROOT, 'desktop')] };
  if (args.packaged && !existsSync(launch.executablePath)) {
    console.error(`No packaged application at ${launch.executablePath}. Run npm run desktop:dist.`);
    exit(1);
  }

  const profile = auditTemp(path.join(auditTmpdir(), 'kingfisher-chrome-'));
  const app = await electron.launch({
    ...launch,
    args: [...launch.args, `--user-data-dir=${profile}`],
    timeout: 120_000,
  });
  const window = await app.firstWindow({ timeout: 120_000 });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(
    () => document.documentElement.dataset.kingfisherReady === 'true',
    null,
    {
      timeout: 60_000,
    },
  );

  /*
    The rectangle, from the process that owns it.

    `getWindowButtonPosition()` returns what the shell asked for, and returns
    null when nothing asked — which is the state this whole mechanism replaces,
    and the reason the first assertion is that it is not null. A default nobody
    stated is a rectangle nobody can reserve against.
  */
  const placed = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getWindowButtonPosition(),
  );
  check(
    'the shell states where the window buttons go',
    placed !== null,
    placed ? `${placed.x},${placed.y}` : 'null — macOS is choosing, and nothing can know where',
  );
  check(
    'and states the position window-chrome.mjs decided',
    placed?.x === MAC_TRAFFIC_LIGHT_BOUNDS.x && placed?.y === MAC_TRAFFIC_LIGHT_BOUNDS.y,
    `expected ${MAC_TRAFFIC_LIGHT_BOUNDS.x},${MAC_TRAFFIC_LIGHT_BOUNDS.y}`,
  );

  const light = { ...MAC_TRAFFIC_LIGHT_BOUNDS };

  // The renderer was told the same thing, and acted on it before first paint.
  const initial = await survey(window);
  check(
    'the application knows there is a hidden title bar',
    initial.titlebar === 'mac-hidden-titlebar',
    `data-titlebar=${initial.titlebar ?? 'unset'}`,
  );
  check(
    'and reserved exactly what the shell reserved',
    initial.safeWidth === `${MAC_TITLEBAR_SAFE.width}px` &&
      initial.safeHeight === `${MAC_TITLEBAR_SAFE.height}px`,
    `${initial.safeWidth} × ${initial.safeHeight}`,
  );
  const corner = initial.reservations.find((r) => r.kind === 'corner');
  check(
    'the reservation is a real, draggable region',
    corner?.width === MAC_TITLEBAR_SAFE.width && corner?.drag === 'drag',
    corner
      ? `${corner.width}px, app-region: ${corner.drag || 'none'}`
      : 'no corner reservation rendered',
  );

  // 1. Sizes, on the route the application opens on.
  for (const size of SIZES) {
    await app.evaluate(({ BrowserWindow }, s) => {
      BrowserWindow.getAllWindows()[0].setBounds({
        x: 60,
        y: 60,
        width: s.width,
        height: s.height,
      });
    }, size);
    await window.waitForTimeout(250);
    await assertClear(window, light, size.name);
    await assertComposed(window, light, size.name);
  }

  // Back to a normal laptop for the state walk.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setBounds({ x: 60, y: 60, width: 1440, height: 900 });
  });
  await window.waitForTimeout(250);

  // 2. Routes — each workspace draws its own header into that corner.
  for (const route of ROUTES) {
    await window.evaluate((r) => {
      const link = document.querySelector(`a[href="${r}"]`);
      if (link) link.click();
    }, route);
    await window.waitForTimeout(600);
    await assertClear(window, light, `route ${route}`);
    await assertComposed(window, light, `route ${route}`);
  }

  // 3. The collapsed rail — 72 px, narrower than the reservation.
  await window.click('[aria-label="Collapse navigation"]');
  await window.waitForTimeout(400);
  const collapsed = await survey(window);
  check(
    'the navigation collapses to the rail',
    collapsed.sidebar === 'collapsed',
    `data-sidebar=${collapsed.sidebar}`,
  );
  await assertClear(window, light, 'collapsed rail');
  check(
    'the rail yields the corner rather than overflowing it',
    (collapsed.reservations.find((r) => r.kind === 'corner')?.width ?? 0) <= 72,
    `reservation is ${collapsed.reservations.find((r) => r.kind === 'corner')?.width}px in a 72px rail`,
  );
  await window.click('[aria-label="Expand navigation"]');
  await window.waitForTimeout(400);

  // 4. Focus mode — no sidebar at all, so no header owns the corner.
  await window.keyboard.press('Meta+K');
  await window.waitForTimeout(300);
  await window.keyboard.type('Focus mode');
  await window.waitForTimeout(400);
  await window.keyboard.press('Enter');
  await window.waitForTimeout(600);
  const focused = await survey(window);
  check(
    'focus mode takes the navigation away',
    focused.sidebar === null,
    focused.sidebar === null ? 'no sidebar rendered' : `sidebar still ${focused.sidebar}`,
  );
  const band = focused.reservations.find((r) => r.kind === 'band');
  check(
    'and a band reserves the corner instead',
    band?.height === MAC_TITLEBAR_SAFE.height,
    band ? `${band.height}px tall` : 'no band rendered',
  );
  await assertClear(window, light, 'focus mode');
  await window.keyboard.press('Escape');
  await window.waitForTimeout(500);

  // 5. Light theme. The buttons are the same; what is under them is not.
  await window.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) =>
      /theme/i.test(b.textContent ?? ''),
    );
    button?.click();
  });
  await window.waitForTimeout(400);
  await assertClear(window, light, 'light theme');
  await assertComposed(window, light, 'light theme');
  await window.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) =>
      /theme/i.test(b.textContent ?? ''),
    );
    button?.click();
  });
  await window.waitForTimeout(400);

  /*
    6. The full-screen round trip.

    macOS moves the buttons into the menu bar in full screen and puts them back
    on the way out. What this is really checking is the way out: a reservation
    that survived as a 76 px hole in the corner of a window with a title bar
    again would be the classic leftover, and it is invisible until somebody
    happens to use full screen.
  */
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
  await window.waitForTimeout(1500);
  await assertClear(window, light, 'full screen');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
  await window.waitForTimeout(1500);
  const returned = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { full: w.isFullScreen(), position: w.getWindowButtonPosition() };
  });
  check(
    'the buttons come back where they were',
    returned.full === false && returned.position?.x === light.x && returned.position?.y === light.y,
    `${returned.position?.x},${returned.position?.y}`,
  );
  await assertClear(window, light, 'after leaving full screen');
  await assertComposed(window, light, 'after leaving full screen');

  /*
    6b. The smallest window the shell will make, and whether it is honest.

    `minWidth`/`minHeight` in main.mjs is a promise: below this the user cannot
    go, so at exactly this the application has to work. "Works" is three things
    and not a screenshot — the board is still a board, the page does not scroll
    sideways, and nothing the user needs has fallen off the bottom into a
    region that does not scroll. The last one is the one worth checking: at
    900x600 twenty-five controls sit below the fold, including the move
    navigation, and the question is not whether they are visible but whether
    they can be reached.
  */
  // Back to a board route: the route walk above ended somewhere without one,
  // and "is there still a board" is not a question /repertoire can answer.
  await window.evaluate(() => {
    document.querySelector('a[href="/analysis"]')?.click();
  });
  await window.waitForTimeout(900);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setBounds({ x: 40, y: 40, width: 900, height: 600 });
  });
  await window.waitForTimeout(900);
  const smallest = await window.evaluate(() => {
    const scrollableAncestor = (el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
          return true;
        }
      }
      return false;
    };
    const stranded = [];
    for (const el of document.querySelectorAll('a[href],button,input,select,[role="tab"]')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom > window.innerHeight + 1 && !scrollableAncestor(el)) {
        stranded.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40));
      }
    }
    const frame = document.querySelector('[data-board-frame]')?.getBoundingClientRect();
    const root = document.documentElement;
    return {
      board: frame ? Math.round(Math.min(frame.width, frame.height)) : 0,
      sideways: root.scrollWidth - root.clientWidth,
      stranded,
    };
  });
  check(
    'the smallest window the shell allows still shows a board',
    smallest.board >= 400,
    `${smallest.board}px at 900x600`,
  );
  check('and does not scroll sideways there', smallest.sideways <= 0, `${smallest.sideways}px`);
  check(
    'and strands no control below the fold',
    smallest.stranded.length === 0,
    smallest.stranded.length === 0
      ? 'everything below the fold is in a region that scrolls'
      : `unreachable: ${smallest.stranded.slice(0, 3).join(', ')}`,
  );
  await assertClear(window, light, 'minimum window, after the walk');

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setBounds({ x: 60, y: 60, width: 1440, height: 900 });
  });
  await window.waitForTimeout(400);

  // 7. Maximize, which is a different code path from a size the harness set.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await window.waitForTimeout(800);
  await assertClear(window, light, 'maximized');
  await assertComposed(window, light, 'maximized');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
  await window.waitForTimeout(800);
  await assertClear(window, light, 'restored');

  if (!args.keepOpen) await app.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  exit(1);
});
