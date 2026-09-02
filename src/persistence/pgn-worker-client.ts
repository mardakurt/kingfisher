import type {
  PgnImportTarget,
  PgnWorkerMessage,
  PgnWorkerRequest,
  PreparedLocalGame,
  PreparedSqliteGame,
} from './pgn-import-protocol';

export interface PgnWorkerRun {
  readonly parsed: number;
  readonly total: number;
  readonly issues: number;
  readonly cancelled: boolean;
}

export interface PgnWorkerOptions<T> {
  readonly target: PgnImportTarget;
  readonly batchSize: number;
  readonly signal?: AbortSignal;
  readonly onParsed?: (parsed: number, issues: number) => void;
  readonly onBatch: (batch: readonly T[], parsed: number, issues: number) => Promise<void>;
  readonly createWorker?: () => Worker | null;
}

const defaultWorker = (): Worker | null => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./pgn-import.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};

/**
 * Run the bounded, acknowledged worker pipeline.
 *
 * Only one prepared batch may be in flight. This back-pressure is what stops a
 * fast parser from filling the browser's message queue with a second copy of a
 * very large database while IndexedDB or SQLite is still writing the first.
 */
export function runPgnWorker<T extends PreparedLocalGame | PreparedSqliteGame>(
  source: string | Blob,
  options: PgnWorkerOptions<T>,
): Promise<PgnWorkerRun> | null {
  const worker = (options.createWorker ?? defaultWorker)();
  if (!worker) return null;

  return new Promise((resolve, reject) => {
    let settled = false;
    let cancelled = false;
    let parsed = 0;
    let issues = 0;
    let inFlight: Promise<void> = Promise.resolve();
    let terminated = false;

    const terminate = () => {
      if (terminated) return;
      terminated = true;
      worker.terminate();
    };

    const clean = () => {
      options.signal?.removeEventListener('abort', cancel);
      terminate();
    };
    const succeed = (result: PgnWorkerRun) => {
      if (settled) return;
      settled = true;
      clean();
      resolve(result);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clean();
      reject(error instanceof Error ? error : new Error('The PGN worker failed.'));
    };
    const cancel = () => {
      if (settled || cancelled) return;
      cancelled = true;
      terminate();
      void inFlight.then(() => succeed({ parsed, total: parsed, issues, cancelled: true }), fail);
    };

    if (options.signal?.aborted) {
      cancel();
      return;
    }
    options.signal?.addEventListener('abort', cancel, { once: true });

    worker.onerror = (event) => fail(new Error(event.message || 'The PGN worker failed to load.'));
    worker.onmessage = (event: MessageEvent<PgnWorkerMessage>) => {
      if (cancelled || settled) return;
      const message = event.data;
      if (message.type === 'progress') {
        parsed = message.parsed;
        issues = message.issues;
        options.onParsed?.(parsed, issues);
        return;
      }
      if (message.type === 'error') {
        fail(new Error(message.error));
        return;
      }
      if (message.type === 'done') {
        parsed = message.total;
        issues = message.issues;
        succeed({ parsed, total: message.total, issues, cancelled: false });
        return;
      }

      parsed = message.parsed;
      issues = message.issues;
      options.onParsed?.(parsed, issues);
      inFlight = options.onBatch(message.batch as readonly T[], parsed, issues).then(() => {
        if (cancelled || settled) return;
        const ack: PgnWorkerRequest = { type: 'ack', batchId: message.batchId };
        worker.postMessage(ack);
      });
      void inFlight.catch(fail);
    };

    const request: PgnWorkerRequest = {
      type: 'start',
      source,
      target: options.target,
      batchSize: options.batchSize,
    };
    worker.postMessage(request);
  });
}
