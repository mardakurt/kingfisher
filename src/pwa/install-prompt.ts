/**
 * Install-prompt handling.
 *
 * Chromium-family browsers raise a `beforeinstallprompt` event when
 * a document is installable. Capturing that event gives the
 * application a deferred prompt it can show at a moment of its own
 * choosing — in this case, a subtle action inside Settings or Help,
 * not a banner over the chessboard.
 *
 * Safari and Firefox do not raise this event. The same code path
 * degrades to: the user sees the standard browser "Add to Home
 * Screen" / "Install Site" affordance, and the Kingfisher UI shows
 * a Help note explaining how to install from their browser.
 *
 * The captured prompt is a one-shot. Showing it consumes the
 * `userChoice` promise. A second install attempt requires the
 * browser to raise a fresh `beforeinstallprompt`, which it does
 * not always do.
 */

import { isStudioDocument } from './host';

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export interface InstallPromptState {
  /**
   * A deferred `beforeinstallprompt` is available. Calling
   * `promptInstall()` will ask the browser to show its install UI.
   */
  readonly available: boolean;
  /**
   * Has the user already installed this origin? A standalone
   * `display-mode: standalone` media query tells us without
   * relying on UA sniffing.
   */
  readonly installed: boolean;
}

type Listener = (state: InstallPromptState) => void;

let captured: BeforeInstallPromptEvent | null = null;
let installed = false;
let listeners: Listener[] = [];

function readInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  // `display-mode: standalone` covers installed PWAs and the
  // macOS TWA-style install. iOS Safari uses `navigator.standalone`.
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

function notify() {
  const state: InstallPromptState = {
    available: captured !== null,
    installed,
  };
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // A misbehaving listener should not break registration for
      // the rest of the application.
    }
  }
}

export function beginListening(): () => void {
  if (typeof window === 'undefined') return () => {};
  // Only the studio origin can be installed. Registering on the
  // marketing origin would let a visitor pin the landing page as a
  // PWA, which the directive explicitly forbids.
  if (!isStudioDocument()) return () => {};

  installed = readInstalled();
  const onBeforeInstall = (event: Event) => {
    event.preventDefault();
    captured = event as BeforeInstallPromptEvent;
    notify();
  };
  const onAppInstalled = () => {
    installed = true;
    captured = null;
    notify();
  };
  const mql = window.matchMedia?.('(display-mode: standalone)');
  const onDisplayModeChange = () => {
    installed = readInstalled();
    notify();
  };
  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  window.addEventListener('appinstalled', onAppInstalled);
  mql?.addEventListener?.('change', onDisplayModeChange);
  // Notify anyone who is already mounted so they can render the
  // correct state without a flash.
  notify();
  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    window.removeEventListener('appinstalled', onAppInstalled);
    mql?.removeEventListener?.('change', onDisplayModeChange);
  };
}

export function getState(): InstallPromptState {
  return {
    available: captured !== null,
    installed,
  };
}

// Re-export with the friendly names the application code uses
// outside this module. The internal name (`getState` / `subscribe`)
// is the most natural inside the module; the application wants
// something the imports and the `getState` calls do not collide.
export { getState as getInstallState, subscribe as subscribeInstall };

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  listener(getState());
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/**
 * Ask the browser to show its native install UI. Resolves with the
 * outcome the browser reported, or `'unavailable'` if no deferred
 * prompt was captured.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!captured) return 'unavailable';
  const deferred = captured;
  captured = null;
  notify();
  try {
    await deferred.prompt();
  } catch {
    return 'unavailable';
  }
  try {
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      installed = true;
      notify();
    }
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}
