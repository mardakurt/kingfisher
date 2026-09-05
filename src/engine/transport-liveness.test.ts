/**
 * A dead engine must fail its waiters immediately.
 *
 * Both transports clear their listener set when they shut down, so a `waitFor`
 * registered only through `onLine` can never be woken again. Before this was
 * fixed it still sat until its timeout — ten seconds for a `bestmove`, twenty
 * for a `readyok` — with the session's command queue blocked behind it, so a
 * crashed engine looked like a frozen panel rather than a failed one.
 *
 * These exercise the real transport classes; only the browser globals they sit
 * on (`Worker`, `EventSource`) and the companion's HTTP client are stood in for.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CompanionClient } from '@/companion/client';

import { CompanionTransport } from './companion/transport';
import { UciWorkerClient } from './stockfish/worker-client';

/** Resolves to `'pending'` if the promise has not settled by the next tick. */
async function settlement(promise: Promise<unknown>): Promise<string> {
  return Promise.race([
    promise.then(
      () => 'resolved',
      () => 'rejected',
    ),
    Promise.resolve().then(() => 'pending'),
  ]);
}

class FakeWorker {
  handlers: Record<string, ((event: unknown) => void)[]> = {};
  terminated = false;
  addEventListener(type: string, handler: (event: unknown) => void) {
    (this.handlers[type] ??= []).push(handler);
  }
  removeEventListener(type: string, handler: (event: unknown) => void) {
    this.handlers[type] = (this.handlers[type] ?? []).filter((entry) => entry !== handler);
  }
  postMessage(command: string) {
    if (command === 'uci') this.emit('message', { data: 'uciok' });
  }
  terminate() {
    this.terminated = true;
  }
  emit(type: string, event: unknown) {
    for (const handler of [...(this.handlers[type] ?? [])]) handler(event);
  }
}

describe('a transport releases its waiters when the engine dies', () => {
  const realWorker = globalThis.Worker;
  const realEventSource = globalThis.EventSource;

  afterEach(() => {
    if (realWorker) globalThis.Worker = realWorker;
    else delete (globalThis as { Worker?: unknown }).Worker;
    if (realEventSource) globalThis.EventSource = realEventSource;
    else delete (globalThis as { EventSource?: unknown }).EventSource;
    vi.useRealTimers();
  });

  async function startWorkerClient() {
    let created!: FakeWorker;
    (globalThis as { Worker?: unknown }).Worker = class {
      constructor() {
        created = new FakeWorker();
        return created as unknown as Worker;
      }
    };
    const client = await UciWorkerClient.start('engine.js');
    return { client, worker: created };
  }

  it('fails a pending wait when the worker is disposed', async () => {
    const { client, worker } = await startWorkerClient();
    const waiting = client.waitFor((line) => line === 'bestmove e2e4', 10_000, 'bestmove');
    expect(await settlement(waiting)).toBe('pending');

    client.dispose();

    await expect(waiting).rejects.toThrow(/closed/i);
    expect(worker.terminated).toBe(true);
  });

  it('fails a pending wait when the worker crashes', async () => {
    const { client, worker } = await startWorkerClient();
    const waiting = client.waitFor((line) => line === 'readyok', 20_000, 'readyok');

    worker.emit('error', { message: 'wasm memory exhausted' });

    await expect(waiting).rejects.toThrow(/wasm memory exhausted/);
  });

  it('refuses a new wait on an already dead worker', async () => {
    const { client, worker } = await startWorkerClient();
    worker.emit('error', { message: 'gone' });
    await expect(client.waitFor(() => true, 10_000, 'anything')).rejects.toThrow(/gone/);
  });

  async function startCompanionTransport() {
    (globalThis as { EventSource?: unknown }).EventSource = { CLOSED: 2 };
    const source: Record<string, unknown> = { close: vi.fn(), addEventListener: vi.fn() };
    const client = {
      startEngine: vi.fn(async () => ({ session: 's1', engine: 'e1' })),
      stream: vi.fn(() => source as unknown as EventSource),
      send: vi.fn(async () => undefined),
      stopEngine: vi.fn(async () => undefined),
    } as unknown as CompanionClient;
    const pending = CompanionTransport.start(client, 'e1');
    // `start` awaits the companion's HTTP handshake before it opens the stream,
    // so the source has no handlers until those microtasks have run.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    (source.onopen as () => void)();
    return { transport: await pending, source, client };
  }

  it('fails a pending wait when the companion reports the engine died', async () => {
    const { transport, source } = await startCompanionTransport();
    const seen: string[] = [];
    transport.onLine((line) => seen.push(line));
    const waiting = transport.waitFor((line) => line.startsWith('bestmove'), 10_000, 'bestmove');
    expect(await settlement(waiting)).toBe('pending');

    (source.onmessage as (event: { data: string }) => void)({
      data: JSON.stringify('#exit 139'),
    });

    await expect(waiting).rejects.toThrow(/139/);
    // The line is still delivered, so a diagnostic panel can report the cause.
    expect(seen).toEqual(['#exit 139']);
  });

  it('fails a pending wait when the companion transport is disposed', async () => {
    const { transport } = await startCompanionTransport();
    const waiting = transport.waitFor((line) => line === 'readyok', 20_000, 'readyok');

    transport.dispose();

    await expect(waiting).rejects.toThrow(/closed/i);
  });

  it('still resolves normally when the engine answers', async () => {
    const { transport, source } = await startCompanionTransport();
    const waiting = transport.waitFor((line) => line === 'readyok', 20_000, 'readyok');
    (source.onmessage as (event: { data: string }) => void)({ data: JSON.stringify('readyok') });
    await expect(waiting).resolves.toBe('readyok');
  });
});
