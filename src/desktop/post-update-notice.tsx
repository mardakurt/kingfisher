'use client';

/**
 * "Kingfisher was updated to 1.1.0" — one-time post-update notice.
 *
 * The desktop main process sends `kingfisher:update-installed` on the
 * first did-finish-load of a build that is *strictly newer* than the
 * one the user has acknowledged. The renderer is responsible for
 * surfacing the notice and for calling `acknowledgeUpdate(version)`
 * once the user has seen it.
 *
 * The notice is small, non-modal, and lives in the document flow.
 * It does not steal focus and does not interrupt board interaction.
 * Screen readers announce it through `role="status"` + `aria-live`.
 *
 * The notice only mounts in the desktop build. The web build has
 * its own service-worker banner; conflating the two would be
 * misleading.
 */

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { publicUrl } from '@/release/public-urls';

import { desktop } from './bridge';

interface PostUpdatePayload {
  readonly version: string;
  readonly previousVersion: string | null;
}

/**
 * Build the user-facing string for a post-update notice. Kept as a
 * pure function so it can be tested without rendering the JSX and
 * so any future surface (a notification, a system log) can use the
 * same wording.
 */
export function buildPostUpdateMessage(payload: PostUpdatePayload): string {
  if (payload.previousVersion) {
    return `Kingfisher was updated from ${payload.previousVersion} to ${payload.version}.`;
  }
  return `Kingfisher was updated to ${payload.version}.`;
}

/**
 * The notifier. Mounted once at the top of the workspace.
 *
 * It uses a `useState<{...} | null>` for the payload: the notice
 * is *one-shot*, so the second `update-installed` event for the
 * same version must not produce a second banner. The acknowledgement
 * is the boundary; once it has been sent, the component is done
 * with that payload.
 */
export function PostUpdateNotice() {
  const [payload, setPayload] = useState<PostUpdatePayload | null>(null);
  const bridge = desktop();

  useEffect(() => {
    if (!bridge) return;
    const off = bridge.onUpdateInstalled((next) => {
      // Defensive: the bridge contract says `version` and
      // `previousVersion` are always present. The main process
      // owns the comparison; the renderer is just the surface.
      if (!next || typeof next.version !== 'string') return;
      setPayload({
        version: next.version,
        previousVersion: typeof next.previousVersion === 'string' ? next.previousVersion : null,
      });
    });
    return off;
  }, [bridge]);

  const dismiss = useCallback(() => {
    if (!payload) return;
    // Acknowledge first — the main process will not send the event
    // again for this version after the file is written. Then drop
    // the payload from local state so the banner disappears.
    void bridge?.acknowledgeUpdate(payload.version).finally(() => {
      setPayload(null);
    });
  }, [bridge, payload]);

  if (!bridge || !payload) return null;

  return (
    <div
      className="post-update-notice"
      role="status"
      aria-live="polite"
      aria-label={`Kingfisher was updated to ${payload.version}.`}
    >
      <div className="post-update-notice__copy">
        <strong>Kingfisher was updated to {payload.version}.</strong>
        {payload.previousVersion ? (
          <span className="post-update-notice__previous">
            {' '}
            Previously {payload.previousVersion}.
          </span>
        ) : null}
      </div>
      <div className="post-update-notice__actions">
        <a
          className="post-update-notice__link"
          href={publicUrl.release}
          rel="noopener noreferrer"
          target="_blank"
        >
          What’s New
        </a>
        <Button variant="subtle" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
