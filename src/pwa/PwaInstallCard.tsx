'use client';

/**
 * Subtle "Install Kingfisher" card for the Settings and Help pages.
 *
 * The directive is explicit: no giant banner over the chessboard.
 * This card appears in a settings panel and only on the studio
 * origin (where installability is meaningful). The card never asks
 * twice without a fresh `beforeinstallprompt` event; the browser
 * will not always raise one, in which case the user sees a Help
 * note explaining how to install from their browser.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';

import { promptInstall, subscribeInstall, type InstallPromptState } from './install-prompt';
import { isStudioDocument } from './host';

export function PwaInstallCard() {
  const [state, setState] = useState<InstallPromptState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isStudioDocument()) return;
    // `subscribeInstall` invokes the listener with the current
    // state on first call, so no separate `setState` is needed on
    // mount. The pattern matches `register.ts` and is one render
    // cheaper than the manual seed.
    const unsubscribe = subscribeInstall(setState);
    return unsubscribe;
  }, []);

  if (!isStudioDocument()) return null;
  if (state === null) return null;

  if (state.installed) {
    return (
      <div className="pwa-install-card" data-state="installed">
        <h3>Kingfisher is installed</h3>
        <p>
          You can open Kingfisher from your applications or home screen. Removing the app from the
          system will not delete your Studies or Repertoire — those live in the browser&apos;s
          storage for this origin, not in the app bundle.
        </p>
      </div>
    );
  }

  if (!state.available) {
    return (
      <div className="pwa-install-card" data-state="hint">
        <h3>Install from your browser</h3>
        <p>
          Chromium-based browsers can install Kingfisher Studio as an application from the address
          bar (the <em>Install</em> button or the page-info menu). Safari and Firefox expose the
          same option through <em>File &rsaquo; Add to Dock</em> or{' '}
          <em>Share &rsaquo; Add to Home Screen</em>, depending on the platform.
        </p>
        <p>
          The browser only offers the install once per site visit; if you have already dismissed it,
          reload the page to ask again.
        </p>
      </div>
    );
  }

  const onClick = async () => {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pwa-install-card" data-state="available">
      <h3>Install Kingfisher</h3>
      <p>
        Add Kingfisher Studio to your applications so you can reopen it like a native app — same
        origin, same Studies, same Repertoire, no second copy of any reference data.
      </p>
      <Button variant="accent" onClick={onClick} disabled={busy}>
        {busy ? 'Asking browser…' : 'Install Kingfisher'}
      </Button>
    </div>
  );
}
