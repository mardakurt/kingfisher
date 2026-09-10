/**
 * The whole of the surface between the desktop shell and Kingfisher.
 *
 * Everything the renderer can ask the operating system for is on this object,
 * and there is nothing else — no `require`, no `ipcRenderer`, no filesystem.
 * That is what `contextIsolation` buys, and it is only worth anything if this
 * file stays small enough to read in one sitting.
 *
 * Two rules it exists to enforce:
 *
 *  1. **The renderer never names a path it was not given.** Every call that
 *     reads something opens a dialog, or acts on a path the user dropped on
 *     the window. There is no `readFile(path)`, because that one function
 *     would make a chess application into a file browser for any script that
 *     reached it.
 *
 *  2. **The companion's token is handed over, never discovered.** On the web
 *     it is pasted by a person, deliberately, because anything that could hand
 *     it to Kingfisher could hand it to any other page. In the shell the same
 *     reasoning gives the opposite answer: this page *is* Kingfisher, served
 *     by the process that minted the token, so it is passed in at construction
 *     rather than stored anywhere a second page could read it.
 *
 * CommonJS because a sandboxed preload is not an ES module.
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const switchValue = (name) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};

/** Listener registration that hands back its own removal. */
const on = (channel, listener) => {
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

/**
 * The window chrome the shell asked macOS for.
 *
 * Relayed rather than computed. `desktop/src/window-chrome.mjs` is the single
 * place the rectangle is decided, the main process reads it there to place the
 * buttons, and this hands the renderer the same object so the application can
 * reserve exactly what was reserved for it. A preload that worked the numbers
 * out for itself would be a second source of truth, and two sources of truth
 * for one rectangle is how the bug this fixes was possible.
 */
const resolvedWindowChrome = (() => {
  const raw = switchValue('kingfisher-window-chrome');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
})();

contextBridge.exposeInMainWorld('kingfisher', {
  platform: 'desktop',
  os: process.platform,
  version: switchValue('kingfisher-app-version'),

  /** Null off macOS, where the shell keeps a real title bar and owes nothing. */
  windowChrome: resolvedWindowChrome,

  /** The companion this shell started, already authenticated. */
  companion: {
    url: switchValue('kingfisher-companion-url'),
    token: switchValue('kingfisher-companion-token'),
  },

  /** Native pickers. Each resolves `{ canceled }` or the chosen thing. */
  openPgn: () => ipcRenderer.invoke('kingfisher:open-pgn'),
  openDatabase: () => ipcRenderer.invoke('kingfisher:open-database'),
  chooseDirectory: (options) => ipcRenderer.invoke('kingfisher:choose-directory', options),
  chooseFile: (options) => ipcRenderer.invoke('kingfisher:choose-file', options),

  /**
   * Open files dropped on the window.
   *
   * A dropped `File` carries no path in a sandboxed renderer; `webUtils`
   * turns the drop into one, and the main process is what actually reads it.
   * So a drop is still a choice the user made, in the same sense a dialog is.
   */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
  openPaths: (paths) => ipcRenderer.invoke('kingfisher:open-paths', paths),

  recentDocuments: () => ipcRenderer.invoke('kingfisher:recent'),
  diagnostics: () => ipcRenderer.invoke('kingfisher:diagnostics'),
  openLogs: () => ipcRenderer.invoke('kingfisher:open-logs'),

  /**
   * Phase 35: the renderer-facing surface of the desktop update service.
   * See `src/desktop/bridge.ts` for the full contract and the rationale
   * for what is and is not exposed here. The check itself is manual;
   * the macOS menu's *Check for Updates…* item is the primary entry point.
   */
  updateStatus: () => ipcRenderer.invoke('kingfisher:update-status'),
  subscribeUpdates: (listener) => on('kingfisher:update-verdict', listener),
  showUpdateDialog: () => ipcRenderer.send('kingfisher:show-update-dialog'),

  /**
   * A document the user opened from the Finder, the menu, or a drop.
   *
   * Attaching the first listener tells the shell that this renderer can now
   * receive one, and that message is the whole fix for a real defect: a PGN
   * double-clicked on a *cold* launch reached the shell before the window
   * existed, was queued, and was flushed on `ready-to-show` — which fires when
   * the first frame can be painted, and therefore before React has mounted and
   * called this. The send went to a renderer with no listener, `ipcRenderer.on`
   * does not replay, and the game silently never appeared.
   *
   * Sent on every attach rather than once. It is idempotent on the other side,
   * and a renderer that reloads is a renderer that has to be told again.
   */
  onOpenDocument: (listener) => {
    const off = on('kingfisher:open-document', listener);
    ipcRenderer.send('kingfisher:documents-wanted');
    return off;
  },
  onShowDiagnostics: (listener) => on('kingfisher:show-diagnostics', listener),
  onShowSettings: (listener) => on('kingfisher:show-settings', listener),
});
