'use client';

/**
 * "A Kingfisher update is ready. [Reload]" banner.
 *
 * Surfaces only when a new service worker is installed and waiting
 * for the user to accept. We deliberately do not force-reload the
 * page: the application surfaces an explicit Reload button and
 * waits for the player to be ready.
 *
 * The banner hooks into the application's persistence state. If
 * any save operation is currently running, the banner offers the
 * Reload but does not navigate the player away from in-flight
 * work — the player's authoritative store may not have committed
 * yet.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { useUnsavedWork } from '@/features/shell/unsaved-work';

import {
  applyUpdate,
  getUpdateState,
  subscribeUpdate,
  type UpdateState,
} from './register';
import { isStudioDocument } from './host';

export function PwaUpdateBanner() {
  const [state, setState] = useState<UpdateState>({ updateReady: false });
  const { isSaving, hasFailed } = useUnsavedWork();

  useEffect(() => {
    if (!isStudioDocument()) return;
    setState(getUpdateState());
    const unsubscribe = subscribeUpdate(setState);
    return unsubscribe;
  }, []);

  if (!isStudioDocument() || !state.updateReady) return null;

  const onReload = async () => {
    if (isSaving) return;
    await applyUpdate();
    // Force-reload so the next navigation re-fetches the document
    // under the new worker. The application surfaces this
    // explicit button; reload mid-analysis is exactly the bug we
    // are avoiding.
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const blocked = isSaving || hasFailed;

  return (
    <div className="pwa-update-banner" role="status" aria-live="polite">
      <div className="pwa-update-banner__copy">
        <strong>A Kingfisher update is ready.</strong>
        {blocked ? (
          <span>
            {' '}
            Your current edits {isSaving ? 'are saving' : 'have not finished saving'};
            the update will activate on the next reload once they have committed.
          </span>
        ) : (
          <span> Reload to apply it.</span>
        )}
      </div>
      <Button variant="accent" onClick={onReload} disabled={blocked}>
        Reload
      </Button>
    </div>
  );
}
