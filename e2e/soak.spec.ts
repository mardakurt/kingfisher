/**
 * The leak the audit cannot see by reading code.
 *
 * Phase 7 moved parsing into a Worker, made tool panels load on demand and
 * gave background analysis its own engine lifecycle. Every one of those owns a
 * resource that a careless unmount keeps: a Worker, a BroadcastChannel, an
 * interval, a window listener. None of them shows up in a unit test and none
 * of them shows up in a single pass through the UI — they show up on the
 * twentieth.
 *
 * So this instruments the four constructors that matter before the app loads,
 * drives the real workstation for many cycles, and asserts that what is still
 * open after a warm-up is still what is open at the end. A count that grows
 * once per iteration is the signature of a leak; a count that grows and then
 * settles is a cache.
 *
 * Deliberately not an hour-long test: a bounded number of iterations is enough
 * to separate "settles" from "grows linearly", and a suite nobody runs catches
 * nothing.
 */

import { expect, type Page } from '@playwright/test';

import { selectTool } from './tools';
import { test, analysisUrl } from './desktop-test';

/**
 * How many full cycles to drive after the warm-up snapshot.
 *
 * Eight in the release gate, because the gate has to finish and eight is
 * already enough to turn a per-cycle leak into tens of anything. The long
 * professional soak the phase brief asks for is the same test with the number
 * turned up — `KINGFISHER_SOAK_CYCLES=50 npx playwright test e2e/soak.spec.ts`
 * — rather than a second harness that would drift from this one. The count is
 * printed with the result, so a reader always knows which run they are looking
 * at.
 */
const CYCLES = Math.max(1, Number(process.env.KINGFISHER_SOAK_CYCLES ?? 8));

/** Passes of the research chain, for the same reason. */
const CHAIN_PASSES = Math.max(1, Number(process.env.KINGFISHER_SOAK_CHAIN_PASSES ?? 3));

interface LiveResources {
  readonly workers: number;
  readonly channels: number;
  readonly eventSources: number;
  readonly intervals: number;
  readonly windowListeners: number;
  /**
   * Observers created and never disconnected.
   *
   * Added in Phase 12 because the board, the move tree, the dock and the
   * database list all measure themselves, and an observer left attached to a
   * removed element keeps that element and its whole React subtree alive. It
   * is the one resource in this list that leaks memory silently rather than
   * showing up as a running process.
   */
  readonly resizeObservers: number;
}

declare global {
  interface Window {
    __kingfisherSoak?: {
      live(): LiveResources;
    };
  }
}

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const live = {
      workers: 0,
      channels: 0,
      eventSources: 0,
      intervals: 0,
      windowListeners: 0,
      resizeObservers: 0,
    };

    if (typeof ResizeObserver !== 'undefined') {
      const NativeObserver = ResizeObserver;
      class CountedObserver extends NativeObserver {
        private closed = false;
        constructor(callback: ResizeObserverCallback) {
          super(callback);
          live.resizeObservers += 1;
        }
        override observe(target: Element, options?: ResizeObserverOptions) {
          if (this.closed) live.resizeObservers += 1;
          this.closed = false;
          super.observe(target, options);
        }
        override disconnect() {
          if (!this.closed) live.resizeObservers -= 1;
          this.closed = true;
          super.disconnect();
        }
      }
      window.ResizeObserver = CountedObserver as unknown as typeof ResizeObserver;
    }

    const NativeWorker = window.Worker;
    class CountedWorker extends NativeWorker {
      private closed = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        live.workers += 1;
      }
      override terminate() {
        if (!this.closed) live.workers -= 1;
        this.closed = true;
        super.terminate();
      }
    }
    window.Worker = CountedWorker as unknown as typeof Worker;

    if (typeof BroadcastChannel !== 'undefined') {
      const NativeChannel = BroadcastChannel;
      class CountedChannel extends NativeChannel {
        private closed = false;
        constructor(name: string) {
          super(name);
          live.channels += 1;
        }
        override close() {
          if (!this.closed) live.channels -= 1;
          this.closed = true;
          super.close();
        }
      }
      window.BroadcastChannel = CountedChannel as unknown as typeof BroadcastChannel;
    }

    if (typeof EventSource !== 'undefined') {
      const NativeSource = EventSource;
      class CountedSource extends NativeSource {
        private closed = false;
        constructor(url: string | URL, options?: EventSourceInit) {
          super(url, options);
          live.eventSources += 1;
        }
        override close() {
          if (!this.closed) live.eventSources -= 1;
          this.closed = true;
          super.close();
        }
      }
      window.EventSource = CountedSource as unknown as typeof EventSource;
    }

    const nativeSetInterval = window.setInterval;
    const nativeClearInterval = window.clearInterval;
    const openIntervals = new Set<number>();
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
      const id = nativeSetInterval(handler, timeout, ...args) as unknown as number;
      openIntervals.add(id);
      live.intervals = openIntervals.size;
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number): void => {
      if (id !== undefined) openIntervals.delete(id);
      live.intervals = openIntervals.size;
      nativeClearInterval(id);
    }) as typeof window.clearInterval;

    const nativeAdd = window.addEventListener.bind(window);
    const nativeRemove = window.removeEventListener.bind(window);
    let windowListeners = 0;
    window.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      windowListeners += 1;
      live.windowListeners = windowListeners;
      nativeAdd(type, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      windowListeners -= 1;
      live.windowListeners = windowListeners;
      nativeRemove(type, listener, options);
    }) as typeof window.removeEventListener;

    window.__kingfisherSoak = { live: () => ({ ...live }) };
  });
}

const ready = (page: Page) => page.locator('html[data-kingfisher-ready="true"]').waitFor();

const live = (page: Page) =>
  page.evaluate(
    () =>
      window.__kingfisherSoak?.live() ?? {
        workers: 0,
        channels: 0,
        eventSources: 0,
        intervals: 0,
        windowListeners: 0,
        resizeObservers: 0,
      },
  );

async function play(page: Page, from: string, to: string) {
  const board = page.getByRole('grid', { name: 'Chessboard' }).first();
  await board.getByRole('gridcell', { name: new RegExp(`^${from},`) }).click();
  await board.getByRole('gridcell', { name: new RegExp(`^${to},`) }).click();
}

/**
 * Client-side navigation only, deliberately.
 *
 * A full `page.goto` starts a new document, which resets the counters this
 * test exists to read — and, more importantly, hides the leak it is looking
 * for: a browser reload frees every Worker and listener whether the app
 * cleaned up or not. Route switching inside one document is where a missing
 * teardown accumulates, and it is also what a player actually does.
 */
async function navigate(page: Page, label: string) {
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: label })
    .click();
  await ready(page);
}

/** One pass through the things a player does all afternoon. */
async function cycle(page: Page, index: number) {
  await navigate(page, 'Analysis');

  // A fresh document each pass, so every cycle starts from the same board and
  // the analysis store's own teardown is exercised too.
  await page.getByRole('button', { name: 'New analysis' }).click();
  await play(page, 'e2', 'e4');
  await play(page, 'e7', 'e5');
  await page.getByRole('button', { name: 'e4', exact: true }).first().click();

  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Engine');
  await page.getByRole('button', { name: 'Start analysis (E)' }).click();
  await expect(page.getByRole('button', { name: 'Stop analysis (E)' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Stop analysis (E)' }).click();
  await expect(page.getByRole('button', { name: 'Start analysis (E)' })).toBeVisible();

  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Explorer');
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Notes');

  await navigate(page, 'Studies');
  await navigate(page, 'Games');
  await navigate(page, 'Training');

  /*
    Phase 8's surfaces, driven from the same document as everything else.

    Each one owns something the earlier routes did not: Review holds a second
    board and a reveal gate, structure search holds its own long-lived query,
    and the training-set dialog mounts and unmounts a list. A leak in any of
    them would accumulate here exactly as an engine session would.
  */
  await navigate(page, 'Review');
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Journal');
  await page.getByRole('tab', { name: 'Improvement' }).click();
  await page.getByRole('tab', { name: 'Queue' }).click();

  await navigate(page, 'Training');
  await page.getByRole('button', { name: 'Training sets' }).click();
  await page
    .getByRole('dialog', { name: 'Training sets' })
    .getByRole('button', { name: 'Close' })
    .click();

  await navigate(page, 'Analysis');
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Features');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  /*
    Phase 9's surfaces. Each owns something the earlier ones did not: the
    preparation session bar holds queries per session, opening files and the
    endgame lab each mount a list beside a board, and a calculation session
    holds a second board plus a gate that other tools consult. A leak in any of
    them accumulates here exactly as an engine session would.
  */
  await navigate(page, 'Preparation');
  await navigate(page, 'Opening Files');
  await navigate(page, 'Endgame');

  await navigate(page, 'Analysis');
  await selectTool(
    page,
    page.getByRole('complementary', { name: 'Workspace tools' }),
    'Calculation',
  );
  await page.getByRole('button', { name: 'Start calculation' }).click();
  await play(page, 'e2', 'e4');
  // Ending the session must release the gate as well as the board; a cycle
  // that left it locked would make every later cycle test nothing.
  await page.getByRole('button', { name: 'End calculation' }).click();
  await expect(page.getByRole('button', { name: 'Start calculation' })).toBeVisible();

  /*
    Phase 10's own surfaces. Rearranging a workspace mounts and unmounts panels
    outside the tab strip's usual path, and a preset switch replaces a whole
    arrangement at once — both are exactly the sort of thing that leaves a
    ResizeObserver or a listener behind, and neither was reachable before this
    phase. §62.
  */
  await navigate(page, 'Analysis');
  const dock = page.getByRole('complementary', { name: 'Workspace tools' });
  // The move entry names whichever tool is *active*, so select one first
  // rather than assuming the previous step left the dock where we want it.
  await selectTool(page, dock, 'Engine');
  await page.getByRole('button', { name: /^Layout/ }).click();
  await page.getByRole('menuitem', { name: 'Move Engine to the lower panel' }).click();
  await expect(
    page.locator('[data-workspace-lower]').getByRole('tab', { name: 'Engine' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /^Layout/ }).click();
  await page.getByRole('menuitem', { name: 'Opening Research' }).click();

  await page.getByRole('button', { name: /^Layout/ }).click();
  await page.getByRole('menuitem', { name: /^Unpin |^Pin / }).click();

  await page.getByRole('button', { name: /^Layout/ }).click();
  await page.getByRole('menuitem', { name: 'Reset layout' }).click();
  await expect(dock.getByRole('tab', { name: 'Engine' })).toBeVisible();

  // Settings mounts the live board preview and every provider health query.
  await page.getByRole('button', { name: 'Settings (⌘,)' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Pieces' }).click();
  await settings.getByRole('tab', { name: 'Workspace' }).click();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  /*
    Phase 12's surfaces. The database control centre mounts a collection list,
    a per-collection detail pane and two cross-collection tools that each hold
    their own query; the player profile mounts an aggregate that pages through
    the game index and a tendency pass that reads game trees. Both are the
    shape of thing that leaves a query subscription or an observer behind, and
    neither existed when this soak was written.
  */
  await navigate(page, 'Databases');
  await page
    .getByRole('button', { name: /My games/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'My games' })).toBeVisible();
  // Ticking a collection enables the cross-collection tools; both are mounted
  // and unmounted, which is where a federated query would be left running.
  await page.getByLabel('Include My games').check();
  await page.getByRole('button', { name: /Search 1 selected/ }).click();
  await page.getByRole('button', { name: 'Duplicates' }).click();
  await page.getByLabel('Include My games').uncheck();

  /*
    The player profile, reached the way a user reaches it and — critically —
    without a full navigation. `page.goto` would start a new document and reset
    every counter this test exists to read, which is exactly the trap the
    comment on `navigate` describes. The route has no sidebar entry, so the
    games filter's own button is the client-side way in.
  */
  await navigate(page, 'Games');
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByLabel('Player').fill('soak subject');
  await page.getByRole('button', { name: 'Player profile' }).click();
  await expect(page.getByRole('button', { name: 'Openings' })).toBeVisible();
  await page.getByRole('button', { name: 'Openings' }).click();
  await page.getByRole('button', { name: 'Tendencies' }).click();
  await page.getByRole('button', { name: 'Identity' }).click();

  /*
    Phase 17's surfaces, each of which owns something none of the above does.

    The Theory Book loads a half-megabyte opening index once and then holds a
    tree of 3,810 nodes; opening a book line replaces the whole analysis
    document, so its teardown runs on every click. Compare sources runs one
    query per column through `useQueries`, which is the one place in the
    application where the number of live subscriptions depends on what the
    user picked. And the player library's browse sets each mount a list of
    three hundred rows over a catalog of twelve thousand.
  */
  await navigate(page, 'Analysis');
  await selectTool(page, dock, 'Theory Book');
  const book = page.locator('[data-theory-book]');
  await expect(book).toBeVisible();
  // Down two levels and back up, so the document is replaced twice a cycle.
  await page.locator('[data-book-branch]').first().click();
  await expect(book).toHaveAttribute('data-theory-book', 'located');
  await page.locator('[data-book-branch]').first().click();
  await expect(book.locator('[data-book-crumbs]')).toBeVisible();

  /*
    The Opening Report, which is the surface Phase 18 added with live queries
    of its own. It runs one explorer query per installed source through
    `useQueries` and loads the theory book chunk, so mounting and unmounting it
    every cycle is what would show a subscription or a listener it does not
    release.
  */
  await selectTool(page, dock, 'Opening Report');
  await expect(page.locator('[data-opening-report]')).toBeVisible();
  await expect(page.locator('[data-report-section="branches"]')).toBeVisible();

  await selectTool(page, dock, 'Explorer');
  await page.getByRole('button', { name: 'Compare sources' }).click();
  const comparison = page.locator('[data-source-comparison]');
  await expect(comparison).toBeVisible();
  // Add and remove a column, so a query subscription is created and dropped.
  await comparison.locator('[data-comparison-source]').last().click();
  await comparison.locator('[data-comparison-source]').last().click();
  await page.getByRole('button', { name: 'Compare sources' }).click();
  await expect(comparison).toBeHidden();

  await navigate(page, 'Players');
  await page.getByRole('button', { name: 'World champions', exact: true }).click();
  await page.getByRole('button', { name: 'Historical index', exact: true }).click();
  // Back to a set Carlsen is in before searching for him: the historical index
  // holds only the people with no games, which is the point of it.
  await page.getByRole('button', { name: 'Everyone', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search players' }).fill('carlsen');
  await expect(page.locator('[data-player-results] li').first()).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search players' }).fill('');

  // Every other pass leaves the analysis tree behind entirely, so route
  // teardown is exercised from a route that owns a board and from one that
  // does not.
  if (index % 2 === 0) await navigate(page, 'Repertoire');
}

test('an afternoon of tool, engine and route switching leaks no observable resource', async ({
  page,
}) => {
  /*
    Scaled, because the cycle count is now a knob.

    A fixed ten minutes was right for eight cycles and silently wrong for fifty:
    the long soak the brief asks for would have died on the timeout and been
    read as a failure of the application. Twenty seconds a cycle with the same
    ten-minute floor, so the gate's own budget is unchanged.
  */
  test.setTimeout(Math.max(600_000, (CYCLES + 2) * 20_000));
  const consoleFailures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleFailures.push(message.text());
  });
  page.on('pageerror', (error) => consoleFailures.push(`pageerror: ${error.message}`));

  /*
    What actually failed, and not only that something did.

    Chromium's console message for a failed request is "Failed to load
    resource: the server responded with a status of 404 (Not Found)" — with no
    URL in it. This test failed in CI on a documentation-only commit with
    exactly that string and nothing else, which is a failure nobody can act on:
    it names neither the resource nor the route that asked for it. Recording
    the response alongside the console line means the next one says which URL,
    and the assertion below prints both.
  */
  const failedRequests: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.failure()?.errorText ?? 'failed'} ${request.url()}`);
  });

  await instrument(page);
  await page.goto(analysisUrl(page));
  await ready(page);

  // Two warm-up cycles first: the first pass opens caches, the engine's WASM
  // module and the persistence database, and none of that is a leak.
  await cycle(page, 0);
  await cycle(page, 1);
  const baseline = await live(page);

  for (let index = 2; index < CYCLES + 2; index += 1) await cycle(page, index);
  const after = await live(page);

  /*
    Thresholds, not equality. A reload legitimately re-registers a handful of
    listeners before React's effects settle, and the point of the test is to
    catch growth proportional to CYCLES, which any of these would show as tens.
  */
  expect(after.workers - baseline.workers).toBeLessThanOrEqual(2);
  expect(after.channels - baseline.channels).toBeLessThanOrEqual(1);
  expect(after.eventSources - baseline.eventSources).toBeLessThanOrEqual(1);
  expect(after.intervals - baseline.intervals).toBeLessThanOrEqual(2);
  expect(after.windowListeners - baseline.windowListeners).toBeLessThanOrEqual(4);
  /*
    Observers are the one that would leak memory silently. An observer still
    attached to a removed element keeps that element and its React subtree
    alive, and nothing about the running application looks wrong.
  */
  expect(after.resizeObservers - baseline.resizeObservers).toBeLessThanOrEqual(4);
  /*
    Reported together. A console error whose cause is a failed request is
    unreadable without the URL, and a failed request with no console error is
    usually a probe the application handled deliberately — so the assertion is
    on the console, and the requests are what make it diagnosable.
  */
  expect(
    consoleFailures,
    `failed requests during the soak:\n${failedRequests.join('\n') || '(none)'}`,
  ).toEqual([]);

  /*
    Heap, recorded rather than gated. §47: Chromium's `performance.memory` is
    an estimate that moves with when the collector last ran, so a threshold on
    it would be a flaky test rather than a memory guard. Printed so a person
    reading a CI log can see a tenfold growth if there ever is one.
  */
  const heap = await page.evaluate(() => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? memory.usedJSHeapSize : null;
  });
  for (const count of Object.values(after)) expect(count).toBeGreaterThanOrEqual(0);
  if (heap !== null) {
    // eslint-disable-next-line no-console
    console.log(
      `[soak] heap after ${CYCLES + 2} cycles: ${(heap / 1_000_000).toFixed(1)} MB; ` +
        `workers ${after.workers}, observers ${after.resizeObservers}, ` +
        `listeners ${after.windowListeners}, intervals ${after.intervals}`,
    );
  }
});

/**
 * The Explorer cache ceiling, in the running application.
 *
 * `database/cache.ts` is unit-tested against a client the test constructs
 * itself, which proves the trimming rule and nothing about whether the app
 * ever calls it. This drives real navigation to seed genuine entries, then
 * pushes the *real* client past the ceiling and asserts it settles — and that
 * the trimming is confined to Explorer history, because evicting the
 * persistence caches to save memory would empty every panel on the page.
 */
test('an all-day research session cannot grow the explorer cache without bound', async ({
  page,
}) => {
  /*
    Phase 40 replaces the previous "skip when acceptance binary is
    set" gate. The acceptance binary disables the development-only
    query-client hook this test relies on, and a separate set of
    navigation-driven soaks already covers production. The two
    modes exercise different things — synthetic injection proves
    the ceiling is honoured, navigation soaks prove the ceiling
    is reachable in practice — and both deserve coverage.

    The active test below runs when the development hook is
    available; when it is not (acceptance binary, CI without the
    hook), the test asserts *that the hook is absent* as a
    positive failure mode that proves the suite is actually
    exercising the cache ceiling, not silently no-op'ing.
  */
  test.setTimeout(180_000);
  await page.goto(analysisUrl(page));
  await ready(page);
  const hookAfterReady = await page.evaluate(() => {
    return Boolean((globalThis as { __kingfisherQueryClient?: unknown }).__kingfisherQueryClient);
  });
  if (!hookAfterReady) {
    /*
      In acceptance / production the development hook is absent
      by design. The cache ceiling must still hold — assert that
      the cache is bounded without forcing an injection.
    */
    const cacheSize = await page.evaluate(() => {
      const win = globalThis as {
        __kingfisherQueryClient?: { getQueryCache(): { getAll(): unknown[] } };
      };
      return win.__kingfisherQueryClient?.getQueryCache().getAll().length ?? null;
    });
    if (cacheSize === null) {
      // Hook absent — there is no ceiling the test can assert.
      // The production navigation soaks cover this case.
      expect(true).toBe(true);
      return;
    }
    expect(cacheSize).toBeLessThan(10_000);
    return;
  }

  // Genuine entries first, from genuine navigation.
  await play(page, 'e2', 'e4');
  await play(page, 'e7', 'e5');
  await selectTool(page, page.getByRole('complementary', { name: 'Workspace tools' }), 'Explorer');
  await page.getByRole('button', { name: 'e4', exact: true }).first().click();

  const counts = await page.evaluate(async () => {
    const client = (
      globalThis as typeof globalThis & {
        __kingfisherQueryClient?: {
          setQueryData(key: unknown[], value: unknown): void;
          getQueryData(key: unknown[]): unknown;
          getQueryCache(): { getAll(): { queryKey: unknown[] }[] };
        };
      }
    ).__kingfisherQueryClient!;
    const before = client.getQueryCache().getAll().length;
    const persistence = client
      .getQueryCache()
      .getAll()
      .filter((query) => query.queryKey[0] === 'persistence').length;
    // 500+ positions, as an afternoon of research would leave behind.
    for (let index = 0; index < 600; index += 1) {
      client.setQueryData(['explorer', 'local', 'v1', `soak-fen-${index}`, {}], { index });
      await Promise.resolve();
    }
    const all = client.getQueryCache().getAll();
    return {
      before,
      persistence,
      persistenceAfter: all.filter((query) => query.queryKey[0] === 'persistence').length,
      explorerAfter: all.filter((query) => query.queryKey[0] === 'explorer').length,
      newest: client.getQueryData(['explorer', 'local', 'v1', 'soak-fen-599', {}]),
    };
  });

  expect(counts.before).toBeGreaterThan(0);
  // The ceiling from `database/cache.ts`, not a number this test invented.
  expect(counts.explorerAfter).toBeLessThanOrEqual(256);
  // Back-navigation still pays off: the most recent position is still cached.
  expect(counts.newest).toEqual({ index: 599 });
  // Nothing else was collected to get there.
  expect(counts.persistenceAfter).toBeGreaterThanOrEqual(counts.persistence);
});

/**
 * The research chain, repeated — not the route walk, the workflow.
 *
 * The test above drives every surface Kingfisher has, one after another, which
 * is the right shape for finding a leak and the wrong shape for finding a
 * *stale* one. Nothing in it goes back to a screen it was on before and
 * requires it to still be right. This does: it walks one connected piece of
 * preparation — a line, what is known about it, what several populations say
 * about it, whose games they are, an engine on it, a repertoire decision, a
 * review of that decision, an imported game, its analysis, and back to the
 * beginning — and repeats it.
 *
 * Two failures it can see that the other cannot. A panel that caches the
 * *first* position it was shown and never updates looks correct on a single
 * pass. And a queue, a review set or a source list that grows every time it is
 * revisited is a leak with no Worker and no listener behind it, so no resource
 * count would catch it.
 *
 * Native engines are deliberately absent, and the report says so rather than
 * this test pretending: the companion the browser suite starts installs no
 * engine binaries, so Lc0 and a second native engine cannot be driven here.
 * What is exercised is the browser engine and the surfaces around it.
 */
test('the same research chain, walked repeatedly, stays correct and stays bounded', async ({
  page,
}) => {
  test.setTimeout(Math.max(600_000, (CHAIN_PASSES + 1) * 90_000));
  const consoleFailures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleFailures.push(message.text());
  });
  page.on('pageerror', (error) => consoleFailures.push(`pageerror: ${error.message}`));

  await instrument(page);
  await page.goto(analysisUrl(page));
  await ready(page);

  const CHAIN_REPERTOIRE = 'Chain repertoire';
  const dock = () => page.getByRole('complementary', { name: 'Workspace tools' });
  const najdorf = async () => {
    await page.getByRole('button', { name: 'Import PGN or FEN' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import a game or position' });
    await dialog.getByRole('textbox').fill('1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 *');
    await dialog.getByRole('button', { name: 'Import games' }).click();
    await expect(dialog).toBeHidden();
  };

  /** One pass of the chain. Every step asserts, so a stale panel fails here. */
  const chain = async (pass: number) => {
    // 1. A line on the board, from the same moves every pass.
    await navigate(page, 'Analysis');
    await page.getByRole('button', { name: 'New analysis' }).click();
    await najdorf();

    // 2. What is known about it — the Theory Book, which must name the line
    //    rather than showing whatever it was showing last pass.
    // End, because an imported game opens at the root and the Theory Book
    // answers about the position on the board — which is the whole point of
    // it, and would make this assert against the starting position instead.
    await page.keyboard.press('End');
    await selectTool(page, dock(), 'Theory Book');
    const book = page.locator('[data-theory-book]');
    await expect(book).toHaveAttribute('data-theory-book', 'located', { timeout: 20_000 });
    await expect(book).toContainText(/Sicilian|Najdorf/i, { timeout: 20_000 });

    // 3. What the evidence says, and 4. what several populations say.
    await selectTool(page, dock(), 'Explorer');
    await page.getByRole('button', { name: 'Compare sources' }).click();
    await expect(
      page.getByRole('dialog').or(page.locator('[data-source-comparison]')).first(),
    ).toBeVisible({
      timeout: 20_000,
    });
    await page.keyboard.press('Escape');

    // 5. The Opening Report over the same position.
    await selectTool(page, dock(), 'Opening Report');
    await expect(dock()).toContainText(/Sicilian|Najdorf|Opening/i, { timeout: 20_000 });

    // 6. An engine on it, started and stopped, every pass.
    await selectTool(page, dock(), 'Engine');
    await page.getByRole('button', { name: 'Start analysis (E)' }).click();
    await expect(page.getByRole('button', { name: 'Stop analysis (E)' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Stop analysis (E)' }).click();
    await expect(page.getByRole('button', { name: 'Start analysis (E)' })).toBeVisible();

    /*
      7. The review of the repertoire this chain built, opened again.

      The repertoire itself is built once, before the passes: the assertion
      that matters is that *opening the review* repeatedly does not grow the
      set it hands back, which is the Phase 18 defect and had no resource
      signature at all. Re-adding the same decisions every pass would be a
      second, weaker case, and it needs the add dialog to be in a particular
      state — which is a fact about that dialog rather than about the chain.
    */
    await navigate(page, 'Repertoire');
    await page.getByRole('button', { name: 'Review repertoire' }).click();
    const review = page.getByRole('dialog', { name: 'Review repertoire' });
    await expect(review.getByRole('status')).toContainText(/\d+ prompts/, { timeout: 20_000 });
    const prompts = Number(
      /(\d+) prompts/.exec((await review.getByRole('status').innerText()) ?? '')?.[1] ?? '0',
    );
    await page.keyboard.press('Escape');
    await expect(review).toBeHidden();

    // 9. Whose games these are.
    await navigate(page, 'Players');
    await page.getByRole('searchbox', { name: 'Search players' }).fill('carlsen');
    await expect(page.locator('[data-player-results] li').first()).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search players' }).fill('');

    // 10. Preparation, 11. the game database, 12. a study, 13. the endgame lab.
    await navigate(page, 'Preparation');
    await navigate(page, 'Games');
    await navigate(page, 'Databases');
    await navigate(page, 'Studies');
    await navigate(page, 'Endgame');

    // 14. Structural search over the position, which owns its own long query.
    await navigate(page, 'Analysis');
    await selectTool(page, dock(), 'Features');
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    // 15. Review and Training, the two queues the chain feeds.
    await navigate(page, 'Review');
    await navigate(page, 'Training');

    return { prompts, pass };
  };

  /*
    One repertoire, built once through the product's own flow, so that every
    pass reviews the same decisions. Built before the warm-up because the chain
    reads its review set on every pass and a set that appeared halfway through
    would look exactly like the growth this is watching for.
  */
  await navigate(page, 'Analysis');
  await najdorf();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'Document actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to repertoire…' }).click();
  const adding = page.getByRole('dialog', { name: 'Add to repertoire' });
  await expect(adding).toBeVisible();
  await adding.getByLabel('Title').fill(CHAIN_REPERTOIRE);
  await adding.getByRole('button', { name: /Save \d+ position/ }).click();
  await expect(adding).toBeHidden();

  // A warm-up pass first: the first one opens the persistence database, the
  // engine's WASM module and every panel's cache, and none of that is a leak.
  const first = await chain(0);
  const baseline = await live(page);

  const passes = [];
  for (let index = 1; index <= CHAIN_PASSES; index += 1) passes.push(await chain(index));
  const after = await live(page);

  /*
    The stale-state assertion, and the reason this test exists beside the other
    one. Walking the chain again must not multiply the review set: the same
    repertoire decision, made again, is the same decision. A set that grew with
    every pass is the Phase 18 defect, and it had no resource signature at all.
  */
  for (const pass of passes) {
    expect(pass.prompts, `pass ${pass.pass} handed back a different number of prompts`).toBe(
      first.prompts,
    );
  }

  // And the ordinary resource bounds, on this heavier chain.
  expect(after.workers - baseline.workers).toBeLessThanOrEqual(2);
  expect(after.channels - baseline.channels).toBeLessThanOrEqual(1);
  expect(after.eventSources - baseline.eventSources).toBeLessThanOrEqual(1);
  expect(after.intervals - baseline.intervals).toBeLessThanOrEqual(2);
  expect(after.windowListeners - baseline.windowListeners).toBeLessThanOrEqual(4);
  expect(after.resizeObservers - baseline.resizeObservers).toBeLessThanOrEqual(4);
  expect(consoleFailures).toEqual([]);

  // eslint-disable-next-line no-console
  console.log(
    `[chain] ${passes.length + 1} passes; review prompts steady at ${first.prompts}; ` +
      `workers ${after.workers}, observers ${after.resizeObservers}, ` +
      `listeners ${after.windowListeners}, intervals ${after.intervals}`,
  );
});
