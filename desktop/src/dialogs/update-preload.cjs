/**
 * The preload for the Check-for-Updates dialog.
 *
 * The dialog is a separate BrowserWindow from the main application
 * shell. It has a sandboxed renderer, no Node, and only the typed
 * `kingfisherUpdate` surface the renderer JS uses. The main
 * application surface (`window.kingfisher`) is intentionally not
 * exposed here — the update dialog does not need the file dialog,
 * the document opener, or the companion status.
 *
 * The IPC channel names live in this file as the only place they
 * appear. A typo on either side fails the integration test, not the
 * user.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron');

const channels = Object.freeze({
  initial: 'kingfisher-update:initial',
  verdict: 'kingfisher-update:verdict',
  dispatch: 'kingfisher-update:dispatch',
  close: 'kingfisher-update:close',
});

let unsubscribe = null;

contextBridge.exposeInMainWorld('kingfisherUpdate', {
  getInitial() {
    return ipcRenderer.invoke(channels.initial);
  },
  onVerdict(listener) {
    if (unsubscribe) unsubscribe();
    const handler = (_event, verdict) => listener(verdict);
    ipcRenderer.on(channels.verdict, handler);
    unsubscribe = () => ipcRenderer.removeListener(channels.verdict, handler);
    return unsubscribe;
  },
  dispatch(action) {
    return ipcRenderer.invoke(channels.dispatch, action);
  },
  close() {
    ipcRenderer.send(channels.close);
  },
});
