/**
 * The dialog's two halves agree.
 *
 * `dialogs/update-preload.cjs` names the channels the dialog speaks;
 * `update-window.mjs` must answer every one of them. The preload's own
 * comment promised that "a typo on either side fails the integration test";
 * there was no such test, and for ten phases no handler existed at all.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fakeIpc() {
  const handlers = new Map();
  const listeners = new Map();
  return {
    handlers,
    listeners,
    handle: vi.fn((channel, fn) => {
      if (handlers.has(channel))
        throw new Error(`Attempted to register a second handler for '${channel}'`);
      handlers.set(channel, fn);
    }),
    on: vi.fn((channel, fn) => listeners.set(channel, fn)),
  };
}

async function load() {
  vi.resetModules();
  vi.doMock('electron', () => ({
    BrowserWindow: class {},
    app: { getVersion: () => '1.0.0' },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
  }));
  return import('./update-window.mjs');
}

/** The channel names exactly as the preload declares them. */
function preloadChannels() {
  const source = readFileSync(path.join(HERE, 'dialogs', 'update-preload.cjs'), 'utf8');
  const block = /const channels = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(source)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
}

describe('update-window IPC', () => {
  let mod;
  beforeEach(async () => {
    mod = await load();
    mod.__resetForTests();
  });

  it('names the same channels as the preload', () => {
    expect(mod.CHANNELS).toEqual(preloadChannels());
  });

  it('answers every channel the preload invokes or sends on', () => {
    const ipc = fakeIpc();
    mod.registerIpc(ipc);
    const channels = preloadChannels();
    expect(ipc.handlers.has(channels.initial)).toBe(true);
    expect(ipc.handlers.has(channels.dispatch)).toBe(true);
    expect(ipc.listeners.has(channels.close)).toBe(true);
  });

  it('registers once, so reopening the dialog cannot throw on a duplicate handler', () => {
    const ipc = fakeIpc();
    mod.registerIpc(ipc);
    expect(() => mod.registerIpc(ipc)).not.toThrow();
    expect(ipc.handle).toHaveBeenCalledTimes(2);
  });

  it('refuses a dispatch from anything that is not the dialog', async () => {
    const ipc = fakeIpc();
    const actions = [];
    mod.setDispatchHandler((action) => actions.push(action));
    mod.registerIpc(ipc);
    const dispatch = ipc.handlers.get(mod.CHANNELS.dispatch);
    // No dialog window exists, so no sender can be it.
    expect(await dispatch({ sender: {} }, 'check')).toEqual({ ok: false });
    expect(actions).toEqual([]);
    expect(await ipc.handlers.get(mod.CHANNELS.initial)({ sender: {} })).toBeNull();
  });
});
