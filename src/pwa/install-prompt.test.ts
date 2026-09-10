import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadModule() {
  vi.resetModules();
  return import('./install-prompt');
}

/**
 * These tests pin the install-prompt contract:
 *
 *   1. Only the studio origin is allowed to install.
 *   2. The first `beforeinstallprompt` is captured; a later one
 *      replaces it.
 *   3. `promptInstall()` consumes the captured event exactly once
 *      and returns the browser's reported outcome.
 *   4. `appinstalled` clears the captured prompt and flips the
 *      installed flag.
 *
 * The test suite does not depend on jsdom. It builds a minimal
 * `window` object with `addEventListener`, `removeEventListener`,
 * `dispatchEvent`, `matchMedia`, and `location.host`, then stubs
 * `globalThis` to it. After each test the original globals are
 * restored, so the rest of the suite keeps running under
 * `environment: 'node'`.
 */

interface DeferredInstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function createDeferredEvent(
  outcome: 'accepted' | 'dismissed' = 'accepted'
): DeferredInstallEvent {
  const event = new Event('beforeinstallprompt') as DeferredInstallEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
}

type Listener = (event: Event) => void;

class FakeEventTarget {
  private listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event: Event) {
    const set = this.listeners.get(event.type);
    if (set) for (const l of set) l(event);
    return !event.defaultPrevented;
  }
}

class FakeWindow extends FakeEventTarget {
  public matchMedia: (query: string) => MediaQueryList;
  public location: { host: string; hostname: string };
  constructor(host: string) {
    super();
    this.location = { host, hostname: host.split(':')[0] ?? '' };
    this.matchMedia = (() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList));
  }
}

class FakeNavigator {
  public standalone: boolean = false;
}

let originalWindow: unknown;
let originalNavigator: unknown;

function installFakeBrowser(host: string) {
  const fw = new FakeWindow(host);
  const fn = new FakeNavigator();
  vi.stubGlobal('window', fw);
  vi.stubGlobal('navigator', fn);
  return { window: fw, navigator: fn };
}

beforeEach(async () => {
  originalWindow = (globalThis as { window?: unknown }).window;
  originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  // The install-prompt module keeps captured state at module
  // scope. Re-import the module under test for every test so
  // each one starts from a clean slate.
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalWindow !== undefined) vi.stubGlobal('window', originalWindow);
  if (originalNavigator !== undefined) vi.stubGlobal('navigator', originalNavigator);
});

describe('install-prompt', () => {
  it('does not register listeners on the marketing origin', async () => {
    const { window } = installFakeBrowser('kingfisher-chess.vercel.app');
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { beginListening } = await loadModule();
    const stop = beginListening();
    expect(addSpy).not.toHaveBeenCalledWith('beforeinstallprompt', expect.anything());
    stop();
  });

  it('registers listeners on the studio origin', async () => {
    const { window } = installFakeBrowser('kingfisher-roan.vercel.app');
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { beginListening } = await loadModule();
    const stop = beginListening();
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain('beforeinstallprompt');
    expect(events).toContain('appinstalled');
    stop();
  });

  it('captures a `beforeinstallprompt` and exposes it via getState', async () => {
    const { window } = installFakeBrowser('kingfisher-roan.vercel.app');
    const { beginListening, getState } = await loadModule();
    const stop = beginListening();
    window.dispatchEvent(createDeferredEvent());
    expect(getState().available).toBe(true);
    stop();
  });

  it('replaces a previously captured prompt when a new one fires', async () => {
    const { window } = installFakeBrowser('kingfisher-roan.vercel.app');
    const { beginListening, getState } = await loadModule();
    const stop = beginListening();
    window.dispatchEvent(createDeferredEvent('accepted'));
    window.dispatchEvent(createDeferredEvent('dismissed'));
    expect(getState().available).toBe(true);
    stop();
  });

  it('returns "unavailable" when no prompt has been captured', async () => {
    installFakeBrowser('kingfisher-roan.vercel.app');
    const { beginListening, getState, promptInstall } = await loadModule();
    const stop = beginListening();
    expect(getState().available).toBe(false);
    expect(await promptInstall()).toBe('unavailable');
    stop();
  });

  it('returns the browser-reported outcome when prompting succeeds', async () => {
    const { window } = installFakeBrowser('kingfisher-roan.vercel.app');
    const { beginListening, getState, promptInstall } = await loadModule();
    const stop = beginListening();
    const event = createDeferredEvent('accepted');
    window.dispatchEvent(event);
    const result = await promptInstall();
    expect(result).toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(getState().available).toBe(false);
    expect(await promptInstall()).toBe('unavailable');
    stop();
  });

  it('clears the captured prompt on `appinstalled`', async () => {
    const { window } = installFakeBrowser('kingfisher-roan.vercel.app');
    const { beginListening, getState } = await loadModule();
    const stop = beginListening();
    window.dispatchEvent(createDeferredEvent());
    expect(getState().available).toBe(true);
    window.dispatchEvent(new Event('appinstalled'));
    expect(getState().available).toBe(false);
    expect(getState().installed).toBe(true);
    stop();
  });

  it('notifies subscribers when state changes', async () => {
    const { window } = installFakeBrowser('kingfisher-roan.vercel.app');
    const { beginListening, subscribe } = await loadModule();
    const stop = beginListening();
    const observed: Array<{ available: boolean; installed: boolean }> = [];
    const unsubscribe = subscribe((s) => observed.push({ ...s }));
    window.dispatchEvent(createDeferredEvent());
    window.dispatchEvent(new Event('appinstalled'));
    unsubscribe();
    expect(observed.length).toBeGreaterThanOrEqual(3);
    expect(observed[observed.length - 1]).toEqual({
      available: false,
      installed: true,
    });
    stop();
  });
});
