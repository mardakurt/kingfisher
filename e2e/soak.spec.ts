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

import { expect, test, type Page } from '@playwright/test';

/** How many full cycles to drive after the warm-up snapshot. */
const CYCLES = 8;

interface LiveResources {
  readonly workers: number;
  readonly channels: number;
  readonly eventSources: number;
  readonly intervals: number;
  readonly windowListeners: number;
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
    const live = { workers: 0, channels: 0, eventSources: 0, intervals: 0, windowListeners: 0 };

    const NativeWorker = window.Worker;
    class CountedWorker extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        live.workers += 1;
      }
      override terminate() {
        live.workers -= 1;
        super.terminate();
      }
    }
    window.Worker = CountedWorker as unknown as typeof Worker;

    if (typeof BroadcastChannel !== 'undefined') {
      const NativeChannel = BroadcastChannel;
      class CountedChannel extends NativeChannel {
        constructor(name: string) {
          super(name);
          live.channels += 1;
        }
        override close() {
          live.channels -= 1;
          super.close();
        }
      }
      window.BroadcastChannel = CountedChannel as unknown as typeof BroadcastChannel;
    }

    if (typeof EventSource !== 'undefined') {
      const NativeSource = EventSource;
      class CountedSource extends NativeSource {
        constructor(url: string | URL, options?: EventSourceInit) {
          super(url, options);
          live.eventSources += 1;
        }
        override close() {
          live.eventSources -= 1;
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

  await page.getByRole('tab', { name: 'Engine' }).click();
  await page.getByRole('button', { name: 'Start analysis (E)' }).click();
  await expect(page.getByRole('button', { name: 'Stop analysis (E)' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Stop analysis (E)' }).click();
  await expect(page.getByRole('button', { name: 'Start analysis (E)' })).toBeVisible();

  await page.getByRole('tab', { name: 'Explorer' }).click();
  await page.getByRole('tab', { name: 'Notes' }).click();

  await navigate(page, 'Studies');
  await navigate(page, 'Games');
  await navigate(page, 'Training');

  // Every other pass leaves the analysis tree behind entirely, so route
  // teardown is exercised from a route that owns a board and from one that
  // does not.
  if (index % 2 === 0) await navigate(page, 'Repertoire');
}

test('an afternoon of tool, engine and route switching leaks no observable resource', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const consoleFailures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleFailures.push(message.text());
  });
  page.on('pageerror', (error) => consoleFailures.push(`pageerror: ${error.message}`));

  await instrument(page);
  await page.goto('/analysis');
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
  expect(consoleFailures).toEqual([]);
});
