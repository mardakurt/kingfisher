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

contextBridge.exposeInMainWorld('kingfisher', {
  platform: 'desktop',
  os: process.platform,
  version: switchValue('kingfisher-app-version'),

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

  /** A document the user opened from the Finder, the menu, or a drop. */
  onOpenDocument: (listener) => on('kingfisher:open-document', listener),
  onShowDiagnostics: (listener) => on('kingfisher:show-diagnostics', listener),
});
