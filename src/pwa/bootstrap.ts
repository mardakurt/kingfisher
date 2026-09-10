'use client';

/**
 * One-shot PWA bootstrap.
 *
 * Called from the React tree (typically `AppProviders`) once on
 * mount. Registers the studio service worker and starts listening
 * for `beforeinstallprompt`. Both are no-ops on the marketing
 * origin.
 *
 * The bootstrap returns the `stop` cleanup that tears down the
 * install-prompt listeners. It is safe to call this from a
 * `useEffect` with an empty dependency array.
 */

import { useEffect } from 'react';

import { beginInstallListening, registerStudioWorker } from './index';

export interface PwaBootstrapResult {
  /**
   * Diagnostic status. Useful for Support Information: tells the
   * user whether the worker is registered, why a registration did
   * not happen, or whether the marketing origin is serving the
   * document.
   */
  readonly status: 'registered' | 'not-studio' | 'unsupported' | 'failed';
  readonly scriptUrl: string;
  readonly detail?: string;
}

export function usePwaBootstrap(): PwaBootstrapResult {
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      stop = beginInstallListening();
      const result = await registerStudioWorker();
      if (cancelled) return;
      // The first paint does not need to wait for registration,
      // but logging the outcome gives a useful breadcrumb in the
      // browser console without any user-visible side effect.
      if (result.status === 'failed' && typeof console !== 'undefined') {
        console.warn('[kingfisher] service worker failed:', result.detail);
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return { status: 'unsupported', scriptUrl: '' };
}
