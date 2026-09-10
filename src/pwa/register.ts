/**
 * Service-worker registration.
 *
 * The studio origin registers `/sw.js` so the application shell
 * survives an offline launch. The marketing origin does not
 * register anything — installing the landing page as a PWA would
 * trap the visitor in a window with no engine and no data.
 *
 * Registration is best-effort. If the browser refuses, the page
 * still works exactly as it did before; the only loss is the
 * offline shell. The registration function returns a small
 * `RegistrationOutcome` so diagnostics can record what happened.
 *
 * The worker is loaded from a path on the studio origin itself,
 * not from a third-party CDN. Combined with the CSP that allows
 * `'self'` script sources, this is the simplest possible supply
 * chain: the worker is built and served by the same pipeline that
 * ships the application.
 */

import { isStudioDocument } from './host';

export interface RegistrationOutcome {
  /** What the registration attempt actually did. */
  readonly status:
    | 'registered'
    | 'updated'
    | 'unsupported'
    | 'not-studio'
    | 'failed';
  /** The script URL the worker was registered against. */
  readonly scriptUrl: string;
  /** Optional human-readable detail, useful in diagnostics. */
  readonly detail?: string;
}

type UpdateListener = (state: UpdateState) => void;

export interface UpdateState {
  /**
   * `true` when a new worker is installed and waiting. The user
   * must explicitly accept for the new worker to take over.
   */
  readonly updateReady: boolean;
}

let updateReady = false;
let updateListeners: UpdateListener[] = [];
let registration: ServiceWorkerRegistration | null = null;

function notifyUpdate() {
  const state: UpdateState = { updateReady };
  for (const listener of updateListeners) {
    try {
      listener(state);
    } catch (e) {
      /* a misbehaving listener must not break registration */
    }
  }
}

export function subscribeUpdate(listener: UpdateListener): () => void {
  updateListeners.push(listener);
  listener({ updateReady });
  return () => {
    updateListeners = updateListeners.filter((l) => l !== listener);
  };
}

export function getUpdateState(): UpdateState {
  return { updateReady };
}

export function getRegistration(): ServiceWorkerRegistration | null {
  return registration;
}

/**
 * Apply a waiting update. The current page calls
 * `registration.waiting.postMessage({type: 'SKIP_WAITING'})`; the
 * new worker receives it and calls `skipWaiting()`. The next
 * navigation is served by the new worker.
 *
 * The page itself is not force-reloaded here. The banner that
 * surfaces the "Reload" button is the user-initiated action; once
 * they have asked to apply, a `window.location.reload()` is
 * appropriate because the application surfaces an explicit "Reload"
 * button next to the "Update ready" copy.
 */
export async function applyUpdate(): Promise<void> {
  if (!registration) return;
  const waiting = registration.waiting;
  if (!waiting) {
    // No waiting worker — either there is no update, or the new
    // worker has already activated. A page reload is the safe
    // answer in either case; we leave that to the caller.
    return;
  }
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * Register the studio service worker. Safe to call from any host;
 * returns immediately on the marketing origin.
 */
export async function registerStudioWorker(): Promise<RegistrationOutcome> {
  if (typeof window === 'undefined') {
    return { status: 'unsupported', scriptUrl: '' };
  }
  if (!('serviceWorker' in navigator)) {
    return { status: 'unsupported', scriptUrl: '' };
  }
  if (!isStudioDocument()) {
    return { status: 'not-studio', scriptUrl: '' };
  }
  const scriptUrl = '/sw.js';
  try {
    const reg = await navigator.serviceWorker.register(scriptUrl, {
      scope: '/',
      updateViaCache: 'none',
    });
    registration = reg;
    bindUpdateLifecycle(reg);
    return { status: 'registered', scriptUrl };
  } catch (err) {
    return {
      status: 'failed',
      scriptUrl,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function bindUpdateLifecycle(reg: ServiceWorkerRegistration) {
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') {
        if (navigator.serviceWorker.controller) {
          // A new worker is installed and waiting. The user gets a
          // "Reload" button, not an auto-reload.
          updateReady = true;
          notifyUpdate();
        }
        // If there is no controller, this is the first install
        // and the user has no previous build to update from.
      }
    });
  });
  // Also catch a worker that was already waiting when the page
  // loaded (e.g. the user navigated to a second tab before
  // accepting the update).
  if (reg.waiting) {
    updateReady = true;
    notifyUpdate();
  }
}
