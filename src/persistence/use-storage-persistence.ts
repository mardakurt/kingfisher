'use client';

/**
 * React view of the storage-persistence promise.
 *
 * The shape this hook returns matches the four states the brief
 * (PART AJ-AK) wants surfaced in the workspace chrome:
 *
 *   'persistent'           — saved on this device, the browser has
 *                            agreed to keep the IndexedDB origin
 *                            alive across pressure events.
 *   'not-persistent'       — IndexedDB is up, but the browser has
 *                            not yet been asked (or has refused) to
 *                            make it durable. Clicking the indicator
 *                            calls `requestPersistence`.
 *   'unavailable'          — the runtime does not implement
 *                            `navigator.storage.persisted` (e.g. a
 *                            webview or a test environment). The
 *                            UI says "Storage protection
 *                            unavailable" rather than implying
 *                            coverage that does not exist.
 *   'pending'              — the synchronous probe has run but the
 *                            async one has not; the indicator
 *                            renders a quiet placeholder.
 *
 * Server and first browser render use the same pending state. The async
 * probe runs after mount; reading browser capabilities during initialization
 * would produce different HTML on the server and cause a hydration failure.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  persistenceState,
  requestPersistence,
  type StoragePersistence,
} from './storage-persistence';

export type StoragePersistenceStatus = StoragePersistence | 'pending';

export interface UseStoragePersistenceResult {
  readonly status: StoragePersistenceStatus;
  readonly request: () => Promise<StoragePersistence>;
}

export function useStoragePersistence(): UseStoragePersistenceResult {
  const [status, setStatus] = useState<StoragePersistenceStatus>('pending');

  useEffect(() => {
    let cancelled = false;
    void persistenceState().then((resolved) => {
      if (!cancelled) setStatus(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async (): Promise<StoragePersistence> => {
    const granted = await requestPersistence();
    setStatus(granted);
    return granted;
  }, []);

  return { status, request };
}
