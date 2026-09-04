'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import {
  initialiseReferences,
  referenceSnapshot,
  subscribeReferences,
  type ReferenceSnapshot,
} from './manager';

const SERVER: ReferenceSnapshot = { loaded: false, sources: [], progress: {}, errors: {} };

/**
 * The reference catalog, and the guarantee that it has been started.
 *
 * Mounting this is what installs the bundled pack on a fresh profile, so the
 * shell mounts it once rather than every panel doing so — but calling it from
 * several places is harmless, because `initialiseReferences` is idempotent.
 */
export function useReferenceSources(): ReferenceSnapshot {
  const snapshot = useSyncExternalStore(
    subscribeReferences,
    referenceSnapshot,
    useCallback(() => SERVER, []),
  );
  useEffect(() => {
    void initialiseReferences();
  }, []);
  return snapshot;
}
