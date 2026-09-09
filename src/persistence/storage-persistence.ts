/**
 * Persistent-storage detection and request.
 *
 * The user-visible promise "your work is saved on this device" only
 * holds while the browser keeps the IndexedDB origin alive. Some
 * browsers (Safari in private mode, Firefox with strict mode, etc.)
 * reserve the right to evict any origin that has not asked for
 * persistent storage.
 *
 * We do not ask at first paint. We ask only after the user has
 * authored something worth protecting, and only when the browser
 * says the origin is not already persistent. The Promise stays the
 * same shape across browsers that lack the API entirely.
 *
 * Read first (`persistenceState`) and request second
 * (`requestPersistence`) are deliberately separate — a UI that
 * shows "saved on this device" must know whether the browser
 * considers the storage durable before it makes the claim.
 */

export type StoragePersistence =
  | 'persistent'
  | 'not-persistent'
  | 'unavailable';

/**
 * What the browser currently guarantees about this origin's
 * IndexedDB. Returns `'unavailable'` when the API is missing
 * (Safari iOS, some embedded webviews) so callers can render a
 * truthful, conservative UI.
 */
export async function persistenceState(): Promise<StoragePersistence> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return 'unavailable';
  }
  try {
    const persisted = await navigator.storage.persisted();
    return persisted ? 'persistent' : 'not-persistent';
  } catch {
    return 'unavailable';
  }
}

/**
 * Ask the browser to mark the origin as persistent.
 *
 * The result is what the browser chose to do, not what we asked for.
 * A `'unavailable'` return means the API does not exist and the UI
 * should not pretend to know. The caller is responsible for any
 * UI side-effect (notification, copy, etc.) — this function does
 * not throw, so a button can call it without try/catch.
 */
export async function requestPersistence(): Promise<StoragePersistence> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return 'unavailable';
  }
  try {
    const granted = await navigator.storage.persist();
    if (granted) return 'persistent';
    return (await persistenceState()) === 'persistent' ? 'persistent' : 'not-persistent';
  } catch {
    return 'unavailable';
  }
}

/**
 * The same logic, never asynchronous, for callers that need a
 * synchronous label (status badges, telemetry, etc.). When the API
 * is missing the answer is `unavailable`; otherwise we do not know
 * synchronously and return `not-persistent` until the async probe
 * resolves. The async probe should still be awaited once at startup
 * to update any badge that did display a placeholder.
 */
export function persistenceStateSync(): StoragePersistence {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return 'unavailable';
  }
  return 'not-persistent';
}

/** Stable identifier for the persistence-state machine. */
export const STORAGE_PERSISTENCE_STATE = {
  PERSISTENT: 'persistent',
  NOT_PERSISTENT: 'not-persistent',
  UNAVAILABLE: 'unavailable',
} as const;