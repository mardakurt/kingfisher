/**
 * Transport between the application and a UCI engine running in a Web Worker.
 *
 * Deliberately dumb: it moves lines of text in and out and reports failure. All
 * protocol knowledge lives in `../uci.ts`, all search orchestration in
 * `./session.ts`.
 */

import type { LineListener, UciTransport } from '../transport';
import { EngineError } from '../types';

export type { LineListener };

export class UciWorkerClient implements UciTransport {
  private worker: Worker | null = null;
  private readonly listeners = new Set<LineListener>();
  private failure: Error | null = null;

  private constructor(worker: Worker) {
    this.worker = worker;
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (typeof data !== 'string') return;
      // Engines occasionally emit several lines in one message.
      for (const line of data.split('\n')) {
        if (line.trim() === '') continue;
        for (const listener of this.listeners) listener(line);
      }
    });
    worker.addEventListener('error', (event: ErrorEvent) => {
      this.failure = new Error(event.message || 'The engine worker crashed.');
    });
  }

  /**
   * Start a worker and wait until it produces its first output, so that a
   * missing or broken build fails here rather than during a search.
   */
  static async start(scriptUrl: string, timeoutMs = 20_000): Promise<UciWorkerClient> {
    let worker: Worker;
    try {
      worker = new Worker(scriptUrl);
    } catch (error) {
      throw new EngineError(
        `The engine worker could not be created: ${describe(error)}`,
        'Check that the engine files exist under public/engine.',
      );
    }

    const client = new UciWorkerClient(worker);
    try {
      await client.handshake(timeoutMs);
    } catch (error) {
      client.dispose();
      throw error;
    }
    return client;
  }

  private handshake(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new EngineError('The engine did not respond in time.', 'Try reloading the page.'));
      }, timeoutMs);

      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(
          new EngineError(
            `The engine failed to load: ${event.message || 'unknown error'}`,
            'Run `npm run engine:install` to download the Stockfish build.',
          ),
        );
      };

      const onLine = (line: string) => {
        if (!line.startsWith('uciok')) return;
        cleanup();
        resolve();
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(onLine);
        this.worker?.removeEventListener('error', onError);
      };

      this.listeners.add(onLine);
      this.worker?.addEventListener('error', onError);
      this.send('uci');
    });
  }

  onLine(listener: LineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(command: string): void {
    if (this.failure) throw new EngineError(this.failure.message);
    if (!this.worker) throw new EngineError('The engine session has been closed.');
    this.worker.postMessage(command);
  }

  /** Resolve once a line satisfying `match` arrives, or reject on timeout. */
  waitFor(
    match: (line: string) => boolean,
    timeoutMs = 30_000,
    label = 'a response',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stop();
        reject(new EngineError(`Timed out waiting for ${label} from the engine.`));
      }, timeoutMs);

      const stop = this.onLine((line) => {
        if (!match(line)) return;
        clearTimeout(timer);
        stop();
        resolve(line);
      });
    });
  }

  dispose(): void {
    if (!this.worker) return;
    try {
      this.worker.postMessage('quit');
    } catch {
      // The worker may already be gone; termination below is what matters.
    }
    this.worker.terminate();
    this.worker = null;
    this.listeners.clear();
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
