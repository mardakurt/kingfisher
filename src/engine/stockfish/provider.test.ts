/**
 * The WebAssembly provider falls back to the single-threaded build when the
 * threaded one cannot start. An embedded Chromium that is cross-origin
 * isolated still refused the threaded build's pthread workers, and the board
 * said "Engine error" with a working single-threaded engine sitting beside
 * it. The boundary — `Worker` and `fetch` — is stubbed; the provider, the
 * transport and the UCI session are the real ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStockfishProviderState, StockfishWasmProvider } from './provider';

const THREADED = '/engine/stockfish/stockfish-18-lite.js';
const SINGLE = '/engine/stockfish/stockfish-18-lite-single.js';

const manifest = {
  engine: 'Stockfish 18',
  license: 'GPL-3.0-or-later',
  builds: [
    { id: 'lite-single', label: 'single', script: SINGLE, threads: false, network: 'lite' },
    { id: 'lite-mt', label: 'threaded', script: THREADED, threads: true, network: 'lite' },
  ],
};

/** Scripts this test's fake browser refuses to run, as the embedded one did. */
let broken = new Set<string>();
let started: string[] = [];

class FakeWorker extends EventTarget {
  constructor(readonly script: string) {
    super();
    started.push(script);
  }

  postMessage(command: string): void {
    queueMicrotask(() => {
      if (broken.has(this.script)) {
        const error = new Event('error') as Event & { message: string };
        error.message = 'Uncaught [object Event]';
        this.dispatchEvent(error);
        return;
      }
      const threaded = this.script === THREADED;
      const reply = (data: string) =>
        this.dispatchEvent(Object.assign(new Event('message'), { data }));
      if (command === 'uci') {
        reply(`id name Stockfish 18 Lite WASM${threaded ? ' Multithreaded' : ''}`);
        reply(`option name Threads type spin default 1 min 1 max ${threaded ? 512 : 1}`);
        reply('option name Hash type spin default 16 min 1 max 1024');
        reply('option name MultiPV type spin default 1 min 1 max 256');
        reply('uciok');
      } else if (command === 'isready') {
        reply('readyok');
      }
    });
  }

  terminate(): void {}
}

beforeEach(() => {
  broken = new Set();
  started = [];
  resetStockfishProviderState();
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('crossOriginIsolated', true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the WebAssembly Stockfish provider', () => {
  it('uses the threaded build when the page can run it', async () => {
    const session = await new StockfishWasmProvider('lite').create();
    expect(started).toEqual([THREADED]);
    expect(session.identity.name).toContain('Multithreaded');
    expect(session.capabilities.threads).toBe(true);
    await session.dispose();
  });

  it('falls back to the single-threaded build when the threaded one will not start', async () => {
    broken.add(THREADED);
    const session = await new StockfishWasmProvider('lite').create({ threads: 4 });
    expect(started).toEqual([THREADED, SINGLE]);
    // The session describes the engine that is actually running.
    expect(session.identity.name).not.toContain('Multithreaded');
    expect(session.capabilities.threads).toBe(false);
    expect(session.capabilities.maxThreads).toBe(1);
    await session.dispose();

    // The next session in this page does not fail first again.
    started = [];
    const next = await new StockfishWasmProvider('lite').create();
    expect(started).toEqual([SINGLE]);
    await next.dispose();
  });

  it('still reports the failure when no build will start', async () => {
    broken.add(THREADED);
    broken.add(SINGLE);
    await expect(new StockfishWasmProvider('lite').create()).rejects.toThrow(/failed to load/);
  });
});
