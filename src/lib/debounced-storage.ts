/**
 * A `Storage`-shaped writer that coalesces bursts of writes.
 *
 * Zustand's persist middleware serialises the whole store and writes it
 * synchronously on every `set`. That is fine for a preference toggled once a
 * month and wrong for a value that changes on every `pointermove`: dragging a
 * panel across a wide screen produced several hundred synchronous JSON
 * serialisations and localStorage writes, on the same thread as the drag.
 *
 * Reads stay synchronous and read through the pending value, so a read
 * immediately after a write sees the write. Only the trip to disk is delayed.
 */
export function debouncedStorage(delayMs: number): Storage {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    for (const [key, value] of pending) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // A full or disabled store must not take the workspace down with it.
        // The layout stays correct in memory for this session; §33 asks only
        // that a quota failure not break the screen.
      }
    }
    pending.clear();
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  };

  if (typeof window !== 'undefined') {
    // A reload or a closed tab must not lose the last drag.
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  return {
    get length() {
      return window.localStorage.length;
    },
    key: (index) => window.localStorage.key(index),
    clear: () => {
      pending.clear();
      window.localStorage.clear();
    },
    getItem: (name) => pending.get(name) ?? window.localStorage.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      schedule();
    },
    removeItem: (name) => {
      pending.delete(name);
      window.localStorage.removeItem(name);
    },
  };
}
