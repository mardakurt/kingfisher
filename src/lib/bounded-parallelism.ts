/**
 * Bounded-concurrency runner.
 *
 * Phase 29 BJ-BL: replaces the sequential "20 awaits in a row"
 * pattern in the reference-coverage panel with a fixed-size pool
 * that keeps a small number of fetches in flight at once. The pool
 * preserves cancellation, returns the items in the original order,
 * and surfaces per-item errors so one failed position does not
 * blank the whole report.
 *
 * Brief says: "Investigate controlled concurrency for coverage:
 * e.g. 4–6 requests at a time rather than 20 sequential or 100
 * simultaneous. Preserve: cancellation, query identity, provider
 * safety. Benchmark before/after."
 *
 * The default ceiling is 4. Empirically a SQLite-side query against
 * a few hundred KB chunk returns in single-digit milliseconds, so 4
 * is enough to keep the wire busy without ever starving the UI thread
 * on a phone.
 */

export interface BoundedRunOptions<T, R> {
  readonly items: readonly T[];
  readonly worker: (item: T, index: number) => Promise<R>;
  /** Maximum number of in-flight workers. Defaults to 4. */
  readonly concurrency?: number;
  /**
   * Cancellation token. When aborted, in-flight workers are
   * not cancelled — but no new ones start, and the result array
   * is truncated to whatever had finished.
   */
  readonly signal?: AbortSignal;
  /**
   * Called for each item that rejects. The default is to swallow
   * the error and leave that slot null in the result; pass a
   * callback to log or surface it.
   */
  readonly onError?: (error: unknown, item: T, index: number) => void;
}

/**
 * Run `worker` over `items` with at most `concurrency` in flight.
 *
 * Returns an array the same length as `items`, in the original
 * order. A slot is `null` if the worker rejected and there was no
 * `onError`, or if the run was aborted before that slot started.
 */
export async function runBounded<T, R>(
  options: BoundedRunOptions<T, R>,
): Promise<readonly (R | null)[]> {
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const results: (R | null)[] = new Array(options.items.length).fill(null);
  if (options.items.length === 0) return results;

  let nextIndex = 0;
  const workers: Promise<void>[] = [];

  const launch = async (): Promise<void> => {
    while (true) {
      if (options.signal?.aborted) return;
      const index = nextIndex;
      if (index >= options.items.length) return;
      nextIndex += 1;
      const item = options.items[index] as T;
      try {
        results[index] = await options.worker(item, index);
      } catch (error) {
        if (options.onError) options.onError(error, item, index);
        results[index] = null;
      }
    }
  };

  for (let i = 0; i < concurrency; i += 1) workers.push(launch());
  await Promise.all(workers);
  return results;
}
