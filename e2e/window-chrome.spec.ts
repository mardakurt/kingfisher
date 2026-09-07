import { expect, test, type Page } from '@playwright/test';

/**
 * The web build owes the macOS window buttons nothing, and must reserve nothing.
 *
 * Kingfisher's desktop shell hides the title bar, so the application reserves
 * the top-left corner for the three controls macOS draws there. That
 * reservation is the fix for a real defect — the Kingfisher mark spent nineteen
 * phases underneath the close button — and the risk it introduces is the
 * mirror image: a browser tab that grows an empty 76-pixel notch for a control
 * that does not exist, and a sidebar shifted sideways for no reason a web user
 * could ever discover.
 *
 * So this is the other half of `scripts/desktop-chrome.mjs`. That one proves
 * the application makes room in the shell; this one proves it makes none here.
 *
 * The mechanism is deliberately testable from a browser: the reservation is
 * always in the DOM and is sized entirely by two custom properties, which the
 * shell sets and a browser leaves at zero. A test that looked for the *absence*
 * of an element would pass for the wrong reason the day somebody rendered it
 * unconditionally with a hard-coded width.
 */

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

test('a browser reserves nothing for a title bar it does not have', async ({ page }) => {
  await page.goto('/analysis');
  await ready(page);

  const state = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      titlebar: document.documentElement.dataset.titlebar ?? null,
      safeWidth: style.getPropertyValue('--titlebar-safe-w').trim(),
      safeHeight: style.getPropertyValue('--titlebar-safe-h').trim(),
      reservations: [...document.querySelectorAll('[data-titlebar-safe]')].map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          kind: (el as HTMLElement).dataset.titlebarSafe,
          width: rect.width,
          height: rect.height,
        };
      }),
    };
  });

  // No shell said there was a hidden title bar, so no bootstrap ran.
  expect(state.titlebar, 'a browser must not think it is inside a Mac window').toBeNull();
  expect(state.safeWidth).toBe('0px');
  expect(state.safeHeight).toBe('0px');

  // The elements exist — that is what keeps the markup identical across the two
  // identities — but they occupy nothing at all.
  expect(state.reservations.length, 'the reservation should still be in the tree').toBeGreaterThan(
    0,
  );
  for (const reservation of state.reservations) {
    expect(reservation.width, `${reservation.kind} has width in a browser`).toBe(0);
    expect(reservation.height, `${reservation.kind} has height in a browser`).toBe(0);
  }
});

test('the sidebar and its mark sit where they always did', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  /*
    The measurements this asserts are the ones from before the desktop work:
    a 228px sidebar whose header is 56px tall, with the Kingfisher mark 14px
    from the left edge and 10px from the top. If the reservation ever leaked
    into the web build, the mark is the first thing that moves.
  */
  const layout = await page.evaluate(() => {
    const nav = document.querySelector('nav[data-sidebar]') as HTMLElement | null;
    const mark = nav?.querySelector('.kf-titlebar-yield');
    const markRect = mark?.getBoundingClientRect();
    return {
      sidebar: nav?.dataset.sidebar ?? null,
      sidebarWidth: nav ? Math.round(nav.getBoundingClientRect().width) : null,
      headerHeight: nav?.firstElementChild
        ? Math.round(nav.firstElementChild.getBoundingClientRect().height)
        : null,
      mark: markRect ? { x: Math.round(markRect.x), y: Math.round(markRect.y) } : null,
    };
  });

  expect(layout.sidebar).toBe('expanded');
  expect(layout.sidebarWidth).toBe(228);
  expect(layout.headerHeight).toBe(56);
  expect(layout.mark, 'the mark has been pushed right by a desktop reservation').toEqual({
    x: 14,
    y: 10,
  });
});

test('nothing in the web build is a window-drag region', async ({ page }) => {
  await page.goto('/analysis');
  await ready(page);

  /*
    `-webkit-app-region: drag` is inert in a browser, but it is not harmless to
    leave lying around: Chrome honours it inside an installed PWA, where a
    dragging region over the interface would swallow clicks for a window move
    that never happens. The reservation carries it because the shell needs it;
    nothing that has a size in a browser may.
  */
  const dragging = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('*')]
      .filter((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region').trim() === 'drag')
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          kind: el.dataset.titlebarSafe ?? null,
          area: Math.round(rect.width * rect.height),
        };
      }),
  );

  const withArea = dragging.filter((element) => element.area > 0);
  expect(withArea, 'a drag region with real area in a browser').toEqual([]);
});
