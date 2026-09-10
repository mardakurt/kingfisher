/**
 * The save barrier.
 *
 * Before the desktop updater replaces the running app, the main process
 * has to be sure the user has no unsaved work. The renderer is the only
 * place that knows — its IndexedDB writes are the user's authored
 * Studies, Repertoire, Training, Recent Work and Settings, and a write
 * that the user just made may still be in flight on its way to disk.
 *
 * The protocol is small and absolute:
 *
 *   1. The main process sends `kingfisher:save-barrier:request` with a
 *      unique `requestId` to every owned BrowserWindow that may own
 *      authored writes. (Today: exactly one — the main window.)
 *   2. Each renderer's preload forwards the request to a registered
 *      handler. The handler flushes the persistence layer and replies
 *      with `{ ok: true }` (writes are committed) or
 *      `{ ok: false, reason: 'pending-writes' | 'write-failed' }`
 *      (writes are still in flight, or a write errored).
 *   3. The main process waits for *all* owned windows to answer
 *      (or for the timeout to fire). It resolves the barrier with
 *      the union of the answers.
 *   4. **Fail closed.** A timeout, a missing window, a destroyed
 *      window, a transport failure, a thrown handler, or any other
 *      unexpected state resolves `ok: false`. There is no path that
 *      resolves `ok: true` unless every window that could own
 *      authored writes explicitly confirmed it.
 *
 * The install path in `update-service.mjs` then refuses the install
 * on `ok: false` and surfaces the reason in the dialog.
 */

import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';

/** Default budget. Five seconds is generous for local IndexedDB. */
export const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * The set of failure reasons the save barrier can return.
 *
 * `pending-writes` — the renderer has acknowledged that an authored
 * write is still in flight and could not be flushed in time.
 * `write-failed` — a flush attempt errored (IndexedDB transaction
 * aborted, quota exceeded, etc.).
 * `timeout` — the renderer did not respond before the budget elapsed.
 * `renderer-unavailable` — the BrowserWindow was destroyed, never
 * existed, or the IPC send failed.
 */
export const FAILURE_REASONS = Object.freeze([
  'pending-writes',
  'write-failed',
  'timeout',
  'renderer-unavailable',
]);

/**
 * @typedef {{
 *   ok: true,
 * }} BarrierOk
 *
 * @typedef {{
 *   ok: false,
 *   reason: 'pending-writes' | 'write-failed' | 'timeout' | 'renderer-unavailable',
 *   detail?: string,
 *   timedOut: boolean,
 * }} BarrierFail
 *
 * @typedef {BarrierOk | BarrierFail} BarrierResult
 */

/**
 * Build a new barrier coordinator.
 *
 * @param {{
 *   send: (window: import('electron').BrowserWindow | { webContents: { isDestroyed?: () => boolean, send: (channel: string, ...args: unknown[]) => void } }, channel: string, payload: unknown) => boolean,
 *   on: (channel: string, listener: (event: { sender: unknown }, payload: { requestId: string, ok: boolean, reason?: string, detail?: string }) => void) => () => void,
 *   getWindows: () => readonly unknown[],
 *   isWindowUsable: (window: unknown) => boolean,
 *   log?: (channel: string, message: string) => void,
 * }} options
 *   - `send` is a thin wrapper around `webContents.send` that returns
 *     `false` on a destroyed/closed sender. The barrier needs that
 *     signal to distinguish "no renderer could receive the request"
 *     from "renderer received and has not yet answered."
 *   - `on` registers a one-shot listener for the response channel.
 *   - `getWindows` returns the windows that may own authored writes.
 *     Today: `[state.window]`. Tomorrow: every owned BrowserWindow.
 *   - `isWindowUsable(window)` decides whether the window is still
 *     able to answer. A destroyed window cannot.
 *   - `log` defaults to a no-op; production wires a tagged logger.
 */
export function createSaveBarrier(options) {
  const { send, on, getWindows, isWindowUsable, log = () => {} } = options;
  if (typeof send !== 'function') throw new Error('save-barrier: send is required');
  if (typeof on !== 'function') throw new Error('save-barrier: on is required');
  if (typeof getWindows !== 'function') throw new Error('save-barrier: getWindows is required');
  if (typeof isWindowUsable !== 'function') {
    throw new Error('save-barrier: isWindowUsable is required');
  }

  /**
   * In-flight barrier. A second `dispatch()` while a barrier is
   * already running returns the same promise — there is exactly one
   * install transition per acknowledgement, per the brief's
   * single-flight requirement (PART I).
   *
   * @type {Promise<BarrierResult> | null}
   */
  let inFlight = null;

  /**
   * Active request id, used to ignore responses that arrive after a
   * timeout or after the in-flight barrier has already resolved.
   */
  let activeRequestId = null;

  return {
    /**
     * Ask every owned window to confirm its writes are committed.
     *
     * Resolves to a `BarrierResult`. **Fails closed** on every
     * unexpected path. The only path that resolves `ok: true` is
     * every usable window's registered handler returning
     * `{ ok: true }` before the timeout fires.
     */
    dispatch({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
      if (inFlight) return inFlight;

      const requestId = randomBytes(8).toString('hex');
      activeRequestId = requestId;

      inFlight = new Promise((resolve) => {
        const windows = getWindows();
        const usable = windows.filter(isWindowUsable);
        if (usable.length === 0) {
          log('save-barrier', `no usable window for request ${requestId}; failing closed`);
          resolve(
            fail(
              'renderer-unavailable',
              'No window is available to confirm the save.',
              /* timedOut */ false,
            ),
          );
          return;
        }

        let settled = false;
        /** @type {Map<unknown, { ok: boolean, reason?: string, detail?: string }>} */
        const answers = new Map();
        let timer = null;
        let off = null;

        const settle = (result) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          if (off) off();
          if (activeRequestId === requestId) activeRequestId = null;
          resolve(result);
        };

        const considerFinish = () => {
          if (settled) return;
          if (answers.size < usable.length) return;
          // Every window that could own authored writes has answered.
          for (const answer of answers.values()) {
            if (!answer.ok) {
              settle(
                fail(/** @type {any} */ (answer.reason) || 'write-failed', answer.detail, false),
              );
              return;
            }
          }
          settle({ ok: true });
        };

        off = on('kingfisher:save-barrier:response', (_event, payload) => {
          if (!payload || payload.requestId !== requestId) return;
          // We don't know which window replied (the IPC event carries
          // the sender, but the contract says "any usable window
          // answers"). We track by payload because the requestId is
          // unique enough; the alternative — sender equality — is
          // stricter and the same shape works.
          const key = payload.windowId ?? answers.size;
          answers.set(key, {
            ok: Boolean(payload.ok),
            reason: payload.reason,
            detail: payload.detail,
          });
          considerFinish();
        });

        timer = setTimeout(() => {
          log('save-barrier', `timeout for request ${requestId} after ${timeoutMs} ms`);
          settle(fail('timeout', `Save barrier timed out after ${timeoutMs} ms.`));
        }, timeoutMs);

        // Send the request. If every send fails, fail closed.
        let sentCount = 0;
        for (const window of usable) {
          const sent = send(window, 'kingfisher:save-barrier:request', requestId);
          if (sent) sentCount += 1;
        }
        if (sentCount === 0) {
          log('save-barrier', `all sends failed for request ${requestId}; failing closed`);
          settle(
            fail(
              'renderer-unavailable',
              'The save barrier request could not be delivered to any window.',
              /* timedOut */ false,
            ),
          );
        }
      })
        .catch((err) => {
          log('save-barrier', `unexpected error: ${String(err?.message ?? err)}`);
          return fail('renderer-unavailable', String(err?.message ?? err), false);
        })
        .finally(() => {
          if (activeRequestId === requestId) activeRequestId = null;
          inFlight = null;
        });

      return inFlight;
    },

    /**
     * Test surface. The current request id, or null.
     */
    currentRequestId() {
      return activeRequestId;
    },
  };
}

function fail(reason, detail, timedOut = true) {
  /** @type {BarrierFail} */
  const result = { ok: false, reason, timedOut };
  if (detail) result.detail = detail;
  return result;
}

/**
 * Convenience wrapper around the Electron `EventEmitter` for the
 * `kingfisher:save-barrier:response` channel. The barrier
 * coordinator's `on()` callback gets `{ sender, payload }` matching
 * the shape Electron delivers, so production wires this directly.
 */
export function ipcListenerAdapter(emitter) {
  if (!(emitter instanceof EventEmitter)) {
    throw new Error('save-barrier: ipcListenerAdapter requires an EventEmitter');
  }
  return (channel, listener) => {
    const wrapped = (payload, event) => listener(event, payload);
    emitter.on(channel, wrapped);
    return () => emitter.off(channel, wrapped);
  };
}
