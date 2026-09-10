/**
 * Renderer-side handler for the desktop save barrier.
 *
 * When the main process is about to install an update it asks every
 * owned BrowserWindow to confirm that all authored writes are
 * committed. The main process sends a request on
 * `kingfisher:save-barrier:request`; the renderer's preload
 * (`desktop/src/preload.cjs`) forwards it to this module's
 * registered handler. The handler awaits the renderer's write
 * tracker, replies with a structured result, and is uninstalled
 * after one use.
 *
 * The handler must:
 *   - never throw (a thrown handler becomes a `write-failed`
 *     result, which is the safe default, but we still wrap
 *     every body in a try/catch);
 *   - answer `ok: true` only when the tracker reports
 *     `ok: true` *and* the user has no in-flight autosave
 *     debounce timer pending;
 *   - translate the tracker's structured result into a
 *     `BarrierResult` that the main process understands.
 *
 * A single in-flight handler is enough. The main process is
 * single-flight on its side (see `save-barrier.mjs`).
 */

import { getWriteTracker } from '@/persistence/write-tracker';
import type { DesktopBridge } from './bridge';

/**
 * The shape the main process expects on the response channel. The
 * failure reasons are the same four the save barrier module
 * produces; we re-export the union for callers that want to type
 * a reply without depending on the desktop side directly.
 */
export type SaveBarrierResponse =
  | { ok: true }
  | {
      ok: false;
      reason: 'pending-writes' | 'write-failed';
      detail?: string;
    };

/**
 * The bridge surface used by this handler. Only the methods the
 * handler needs are pulled in, so tests can pass a stub.
 */
export interface SaveBarrierBridge {
  onSaveBarrierRequest: NonNullable<DesktopBridge['onSaveBarrierRequest']>;
}

/**
 * How long the renderer is willing to wait for in-flight writes
 * to settle. The main process has a larger budget (5s) so the
 * renderer's answer is always delivered before the main process
 * times out — anything still in flight here is a `pending-writes`
 * answer, not a `timeout`.
 */
export const HANDLER_BUDGET_MS = 3_000;

/**
 * Install the handler. Returns an `uninstall` function that
 * detaches the IPC listener. Calling it more than once is a
 * no-op. The handler is intended to live for the entire lifetime
 * of the application — `useDesktopIntegration` wires it on mount
 * and does not uninstall — but the option is there for tests and
 * for any future hot-reload scenario.
 */
export function installSaveBarrierHandler(bridge: SaveBarrierBridge): () => void {
  const off = bridge.onSaveBarrierRequest(async (requestId: string) => {
    return handleSaveBarrierRequest(requestId);
  });
  return off;
}

/**
 * The body of a single barrier request. Exposed for tests so the
 * flush budget and the tracker contract are pinned independently
 * of the IPC layer.
 */
export async function handleSaveBarrierRequest(
  requestId: string,
  options: { budgetMs?: number; tracker?: ReturnType<typeof getWriteTracker> } = {},
): Promise<SaveBarrierResponse> {
  const tracker = options.tracker ?? getWriteTracker();
  const budgetMs = options.budgetMs ?? HANDLER_BUDGET_MS;
  try {
    const result = await tracker.flush(budgetMs);
    if (result.ok) {
      return { ok: true };
    }
    if (result.reason === 'write-failed') {
      return {
        ok: false,
        reason: 'write-failed',
        detail: `A previous write failed before the save barrier. ${result.inflight} write(s) still in flight.`,
      };
    }
    if (result.reason === 'timeout') {
      // A render-side timeout still becomes "pending-writes" from
      // the main process's point of view: the user is not blocked
      // by an error, the writes are simply still on their way to
      // disk and we could not confirm completion in time.
      return {
        ok: false,
        reason: 'pending-writes',
        detail: `The renderer's write tracker did not confirm a clean state within ${budgetMs} ms.`,
      };
    }
    return {
      ok: false,
      reason: 'pending-writes',
      detail: `${result.inflight} write(s) still in flight after the budget elapsed.`,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'write-failed',
      detail: err instanceof Error ? err.message : 'Unknown error in the save barrier handler.',
    };
  }
  // The unused requestId is part of the protocol surface — the
  // main process correlates by it — but our reply is the same for
  // every id.
  void requestId;
}
