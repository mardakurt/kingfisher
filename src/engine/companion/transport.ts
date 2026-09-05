/**
 * A UCI transport over the local companion.
 *
 * Commands go in over `fetch`, output comes back over Server-Sent Events. The
 * asymmetry is the protocol's: UCI is a stream of lines out and occasional
 * commands in, which is exactly the shape SSE fits — and SSE needs no library,
 * no upgrade handshake, and reconnects on its own.
 *
 * This satisfies the same `UciTransport` interface as the Web Worker client, so
 * a native engine is driven by the same session code as the WebAssembly one.
 */

import type { CompanionClient } from '@/companion/client';

import type { LineListener, UciTransport } from '../transport';
import { EngineError } from '../types';

export class CompanionTransport implements UciTransport {
  private readonly listeners = new Set<LineListener>();
  private readonly waiters = new Set<(error: Error) => void>();
  private source: EventSource | null = null;
  private failure: Error | null = null;
  private closed = false;

  private constructor(
    private readonly client: CompanionClient,
    private readonly session: string,
  ) {}

  static async start(client: CompanionClient, engineId: string): Promise<CompanionTransport> {
    const started = await client.startEngine(engineId);
    const transport = new CompanionTransport(client, started.session);
    await transport.connect();
    return transport;
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const source = this.client.stream(this.session);
      this.source = source;

      const timer = setTimeout(() => {
        reject(new EngineError('The companion did not open an engine stream.'));
      }, 15_000);

      source.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      source.onmessage = (event) => {
        let line: unknown;
        try {
          line = JSON.parse(event.data as string);
        } catch {
          return;
        }
        if (typeof line !== 'string') return;
        /*
          The companion tags out-of-band lines so they cannot be mistaken for
          UCI. `#stderr` is where Lc0 announces its backend and where an engine
          reports a bad option, so it is surfaced rather than dropped.
        */
        if (line.startsWith('#error') || line.startsWith('#exit')) {
          this.failure = new Error(line.replace(/^#\w+\s*/, '') || 'The engine stopped.');
          // Listeners still see the line; waiters are released now rather than
          // waiting out a timeout for output that can no longer arrive.
          for (const listener of [...this.listeners]) listener(line);
          this.abortWaiters(new EngineError(this.failure.message));
          return;
        }
        for (const listener of this.listeners) listener(line);
      };
      source.addEventListener('end', () => this.dispose());
      source.onerror = () => {
        clearTimeout(timer);
        if (this.closed) return;
        // EventSource retries by itself; only a never-opened stream is fatal.
        if (source.readyState === EventSource.CLOSED) {
          this.failure = new Error('The companion engine stream closed.');
          reject(new EngineError('The companion engine stream closed.'));
        }
      };
    });
  }

  onLine(listener: LineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(command: string): void {
    if (this.failure) throw new EngineError(this.failure.message);
    if (this.closed) throw new EngineError('This engine session has been closed.');
    // Fire and forget: UCI has no per-command acknowledgement, and `isready`
    // is the protocol's own way of finding out whether the engine kept up.
    void this.client.send(this.session, command).catch((error: unknown) => {
      this.failure = error instanceof Error ? error : new Error('The companion refused a command.');
    });
  }

  waitFor(match: (line: string) => boolean, timeoutMs = 30_000, label = 'a response') {
    return new Promise<string>((resolve, reject) => {
      /*
        A dead engine must fail now, not at the timeout. `dispose` clears the
        listeners, so a waiter registered only through `onLine` can never fire
        again — it would sit for the full timeout while the session queue behind
        it stalls. Waiters are therefore tracked separately and failed directly.
      */
      if (this.failure) {
        reject(new EngineError(this.failure.message));
        return;
      }
      if (this.closed) {
        reject(new EngineError('This engine session has been closed.'));
        return;
      }
      const fail = (error: Error) => {
        clearTimeout(timer);
        this.waiters.delete(fail);
        stop();
        reject(error);
      };
      const timer = setTimeout(() => {
        fail(new EngineError(`Timed out waiting for ${label} from the engine.`));
      }, timeoutMs);
      const stop = this.onLine((line) => {
        if (!match(line)) return;
        clearTimeout(timer);
        this.waiters.delete(fail);
        stop();
        resolve(line);
      });
      this.waiters.add(fail);
    });
  }

  /** Fail everything still waiting on engine output. */
  private abortWaiters(error: Error): void {
    for (const fail of [...this.waiters]) fail(error);
    this.waiters.clear();
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.source?.close();
    this.source = null;
    this.abortWaiters(
      new EngineError(this.failure?.message ?? 'This engine session has been closed.'),
    );
    this.listeners.clear();
    void this.client.stopEngine(this.session).catch(() => {
      // The companion may already have reaped it; nothing else to do.
    });
  }
}
