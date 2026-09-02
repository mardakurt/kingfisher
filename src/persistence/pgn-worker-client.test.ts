import { describe, expect, it, vi } from 'vitest';

import { runPgnWorker } from './pgn-worker-client';
import type { PreparedSqliteGame } from './pgn-import-protocol';

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly terminate = vi.fn();
  readonly posted: unknown[] = [];

  postMessage(message: { type: string }) {
    this.posted.push(message);
    if (message.type === 'start') {
      queueMicrotask(() =>
        this.onmessage?.({
          data: {
            type: 'batch',
            batchId: 1,
            parsed: 1,
            issues: 0,
            batch: [{ game: {}, pgn: '', positions: [] }],
          },
        } as MessageEvent),
      );
    } else if (message.type === 'ack') {
      queueMicrotask(() =>
        this.onmessage?.({ data: { type: 'done', total: 1, issues: 0 } } as MessageEvent),
      );
    }
  }
}

describe('PGN worker client', () => {
  it('acknowledges a persisted batch before accepting completion', async () => {
    const worker = new FakeWorker();
    const persisted: number[] = [];
    const result = await runPgnWorker<PreparedSqliteGame>('pgn', {
      target: 'sqlite',
      batchSize: 10,
      createWorker: () => worker as unknown as Worker,
      onBatch: async (batch) => {
        persisted.push(batch.length);
      },
    });

    expect(result).toEqual({ parsed: 1, total: 1, issues: 0, cancelled: false });
    expect(persisted).toEqual([1]);
    expect(worker.posted).toContainEqual({ type: 'ack', batchId: 1 });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates immediately on cancellation and waits for an in-flight commit', async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    let release: () => void = () => {};
    const commit = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = runPgnWorker<PreparedSqliteGame>('pgn', {
      target: 'sqlite',
      batchSize: 10,
      signal: controller.signal,
      createWorker: () => worker as unknown as Worker,
      onBatch: () => commit,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    expect(worker.terminate).toHaveBeenCalledOnce();
    release();
    await expect(running).resolves.toMatchObject({ cancelled: true, parsed: 1 });
    expect(worker.posted).not.toContainEqual({ type: 'ack', batchId: 1 });
  });
});
