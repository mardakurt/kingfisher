/**
 * The Check-for-Updates dialog window.
 *
 * One small, modal-ish BrowserWindow that the main process opens on
 * demand. The window is *not* a Kingfisher app surface — it loads a
 * self-contained HTML page that talks to the main process through a
 * preload that exposes only the four channels the dialog needs.
 *
 * The window is closed by:
 *   - the user pressing Escape or clicking the close button,
 *   - the main process tearing down on quit,
 *   - a `cancel` action when a download is mid-flight.
 *
 * There is at most one update window at a time. A second call to
 * `open()` focuses the existing window instead of opening a duplicate.
 */

import { BrowserWindow, app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Width and height chosen to feel like a Kingfisher dialog, not a window. */
const DIALOG_WIDTH = 420;
const DIALOG_HEIGHT = 280;

/** @type {BrowserWindow | null} */
let window = null;

/** @type {((action: string) => Promise<void> | void) | null} */
let dispatchHandler = null;

/** The latest verdict the dialog is displaying, kept so a re-open does not blank. */
let lastVerdict = { status: 'idle' };

export function setDispatchHandler(handler) {
  dispatchHandler = handler;
}

export function sendVerdict(verdict) {
  lastVerdict = verdict ?? { status: 'idle' };
  if (!window || window.isDestroyed()) return;
  window.webContents.send('kingfisher-update:verdict', lastVerdict);
}

export function getLastVerdict() {
  return lastVerdict;
}

export function hasWindow() {
  return Boolean(window && !window.isDestroyed());
}

/**
 * Open the update dialog. `parent` is the main application window, so
 * the dialog floats above it and macOS sheets it in the right place.
 */
export async function open({ parent, onClose, onAction } = {}) {
  if (window && !window.isDestroyed()) {
    window.focus();
    return;
  }
  if (typeof onAction === 'function') dispatchHandler = onAction;
  window = new BrowserWindow({
    width: DIALOG_WIDTH,
    height: DIALOG_HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Kingfisher — Check for Updates',
    backgroundColor: '#1c1c20',
    parent: parent ?? undefined,
    modal: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(HERE, 'dialogs', 'update-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      additionalArguments: [`--kingfisher-app-version=${app.getVersion()}`],
    },
  });
  await window.loadFile(path.join(HERE, 'dialogs', 'update.html'));
  window.show();
  window.on('closed', () => {
    window = null;
    if (typeof onClose === 'function') onClose();
  });
}

/**
 * Run an action triggered by the dialog's buttons. The action string is
 * whatever the dialog sent on `kingfisher-update:dispatch`. If no
 * handler is registered the action is a no-op.
 */
export async function dispatchAction(action) {
  if (!dispatchHandler) return;
  await dispatchHandler(action);
}

export function close() {
  if (window && !window.isDestroyed()) {
    window.close();
  }
}
