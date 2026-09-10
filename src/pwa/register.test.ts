import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadModule() {
  vi.resetModules();
  return import('./register');
}

/**
 * These tests pin the service-worker registration contract without
 * relying on jsdom. The suite fakes the `navigator.serviceWorker`
 * API and the `window.location.host` value, then drives the
 * `registerStudioWorker` entry point through its public outcomes.
 */

interface MockRegistration {
  installing: MockServiceWorker | null;
  waiting: MockServiceWorker | null;
  active: MockServiceWorker | null;
  scope: string;
  scriptURL: string;
  listeners: Map<string, Set<EventListener>>;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  update: () => Promise<void>;
  unregister: () => Promise<boolean>;
}

interface MockServiceWorker extends EventTarget {
  state: 'installing' | 'installed' | 'activating' | 'activated' | 'redundant';
  scriptURL: string;
  postMessage: (data: unknown) => void;
}

function makeServiceWorker(state: MockServiceWorker['state']): MockServiceWorker {
  const target = new EventTarget() as MockServiceWorker;
  target.state = state;
  target.scriptURL = '/sw.js';
  target.postMessage = vi.fn();
  return target;
}

function makeRegistration(
  state: MockServiceWorker['state'] = 'installing'
): { reg: MockRegistration; installing: MockServiceWorker } {
  const listeners = new Map<string, Set<EventListener>>();
  const installing = makeServiceWorker(state);
  const reg: MockRegistration = {
    installing,
    waiting: null,
    active: state === 'activated' ? makeServiceWorker('activated') : null,
    scope: '/',
    scriptURL: '/sw.js',
    listeners,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    update: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(true),
  };
  return { reg, installing };
}

function installFakeBrowser(host: string) {
  vi.stubGlobal('window', {
    location: { host, hostname: host.split(':')[0] },
  });
}

function installFakeServiceWorker(
  options: { register?: ReturnType<typeof vi.fn>; controller?: unknown } = {}
) {
  const register = options.register ?? vi.fn();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: {
        register,
        controller: options.controller ?? null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    },
  });
  return register;
}

let originalWindow: unknown;
let originalNavigator: unknown;

beforeEach(() => {
  originalWindow = (globalThis as { window?: unknown }).window;
  originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  // The register module keeps registration and update flag at
  // module scope. Re-import the module under test for every test
  // so each one starts from a clean slate.
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalWindow !== undefined) vi.stubGlobal('window', originalWindow);
  if (originalNavigator !== undefined) {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  }
});

describe('registerStudioWorker', () => {
  it('returns `unsupported` when the browser has no service-worker API', async () => {
    installFakeBrowser('kingfisher-roan.vercel.app');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    const { registerStudioWorker } = await loadModule();
    const result = await registerStudioWorker();
    expect(result.status).toBe('unsupported');
  });

  it('returns `not-studio` on the marketing host', async () => {
    installFakeBrowser('kingfisher-chess.vercel.app');
    const register = installFakeServiceWorker();
    const { registerStudioWorker } = await loadModule();
    const result = await registerStudioWorker();
    expect(result.status).toBe('not-studio');
    expect(register).not.toHaveBeenCalled();
  });

  it('registers on the studio host and returns `registered`', async () => {
    installFakeBrowser('kingfisher-roan.vercel.app');
    const { reg } = makeRegistration('activated');
    const register = installFakeServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
    });
    const { registerStudioWorker, getRegistration } = await loadModule();
    const result = await registerStudioWorker();
    expect(result.status).toBe('registered');
    expect(result.scriptUrl).toBe('/sw.js');
    expect(register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    expect(getRegistration()).toBe(reg);
  });

  it('returns `failed` when registration throws', async () => {
    installFakeBrowser('kingfisher-roan.vercel.app');
    installFakeServiceWorker({
      register: vi.fn().mockRejectedValue(new Error('bad-cert')),
    });
    const { registerStudioWorker } = await loadModule();
    const result = await registerStudioWorker();
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('bad-cert');
  });

  it('flips the update flag when an installing worker reaches `installed` with a controller', async () => {
    installFakeBrowser('kingfisher-roan.vercel.app');
    const { reg, installing } = makeRegistration('installing');
    installFakeServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
      controller: makeServiceWorker('activated'),
    });
    const { registerStudioWorker, getUpdateState } = await loadModule();
    await registerStudioWorker();
    // The browser fires `updatefound` when a new worker starts
    // installing. The bind lifecycle listens on that event and
    // then hooks `statechange` on the worker itself.
    reg.listeners.get('updatefound')?.forEach((h) => h(new Event('updatefound')));
    expect(getUpdateState().updateReady).toBe(false);
    installing.state = 'installed';
    // The worker is an EventTarget; fire `statechange` on it.
    installing.dispatchEvent(new Event('statechange'));
    expect(getUpdateState().updateReady).toBe(true);
  });

  it('does not flip the update flag on the first install', async () => {
    installFakeBrowser('kingfisher-roan.vercel.app');
    const { reg, installing } = makeRegistration('installing');
    installFakeServiceWorker({ register: vi.fn().mockResolvedValue(reg) });
    const { registerStudioWorker, getUpdateState } = await loadModule();
    await registerStudioWorker();
    reg.listeners.get('updatefound')?.forEach((h) => h(new Event('updatefound')));
    installing.state = 'installed';
    installing.dispatchEvent(new Event('statechange'));
    expect(getUpdateState().updateReady).toBe(false);
  });

  it('applyUpdate posts SKIP_WAITING to the waiting worker', async () => {
    installFakeBrowser('kingfisher-roan.vercel.app');
    const waiting = makeServiceWorker('installed');
    const reg: MockRegistration = {
      installing: null,
      waiting,
      active: null,
      scope: '/',
      scriptURL: '/sw.js',
      listeners: new Map(),
      addEventListener: () => {},
      removeEventListener: () => {},
      update: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(true),
    };
    installFakeServiceWorker({ register: vi.fn().mockResolvedValue(reg) });
    const { registerStudioWorker, applyUpdate } = await loadModule();
    await registerStudioWorker();
    await applyUpdate();
    expect((waiting.postMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toEqual({
      type: 'SKIP_WAITING',
    });
  });

  it('subscribeUpdate notifies listeners immediately with the current state', async () => {
    const { subscribeUpdate } = await loadModule();
    const observed: Array<boolean> = [];
    const unsubscribe = subscribeUpdate((s) => observed.push(s.updateReady));
    unsubscribe();
    expect(observed).toEqual([false]);
  });
});
