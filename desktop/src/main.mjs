/**
 * Kingfisher, as a Mac application.
 *
 * What this process is responsible for, and nothing else:
 *
 *   - starting the web server and the companion, and ending both;
 *   - opening one window on the server it started;
 *   - the native things a browser has no way to do — file dialogs, documents
 *     opened from the Finder, an application menu.
 *
 * What it is deliberately **not** responsible for is chess. There is no board,
 * no move tree, no engine session and no database query in this process. The
 * renderer is the same Next application the browser runs, unmodified, and the
 * bridge in `preload.mjs` is the whole of the surface between them. A desktop
 * feature that needed a second copy of any chess state would be a bug in this
 * design, not a feature of it.
 *
 * See `docs/adr/0049-the-desktop-shell.md` for why this is Electron, which was
 * a measured decision and not a default.
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { log, logFile, openLog, redactInLog } from './log.mjs';
import { buildTemplate } from './menu.mjs';
import {
  DATABASE_EXTENSIONS,
  PGN_EXTENSIONS,
  RecentDocuments,
  isDatabasePath,
  isPgnPath,
  openableFromArgv,
  readPgn,
} from './files.mjs';
import { missingParts, resolveLayout } from './paths.mjs';
import { PortUnavailableError, portFree, resolveAppPort } from './origin.mjs';
import { Service, freePort } from './services.mjs';
import { MAC_TRAFFIC_LIGHT_POSITION, windowChromeFor } from './window-chrome.mjs';
import {
  STATUS,
  acknowledgeUpdate,
  cancelDownload,
  check,
  hasAcknowledgedUpdate,
  installAndRestart,
  pruneUpdateCache,
  setStagingFeed,
  subscribe as subscribeToUpdates,
} from './update-service.mjs';
import * as updateWindow from './update-window.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';

/**
 * When each stage of launch finished, measured from process start.
 *
 * Phase 19 reported one number — 5.4 seconds to a window, packaged — and one
 * number cannot be optimised, because it does not say which part to look at.
 * Phase 20 needed the breakdown before touching anything, and it is kept
 * rather than deleted afterwards: it is how a regression in launch becomes
 * visible instead of becoming folklore.
 *
 * `process.uptime()` rather than a captured `Date.now()` at module load,
 * because the interesting part includes everything before this file was
 * evaluated — Electron's own bootstrap is a real part of the wait.
 */
const marks = [];
const mark = (stage) => {
  const at = Math.round(process.uptime() * 1000);
  marks.push({ stage, at });
  // stderr, and written directly: this is diagnostic trace rather than
  // program output, and it must not land in anything parsing stdout.
  if (process.env.KINGFISHER_STARTUP_TRACE) process.stderr.write(`[startup] ${stage} ${at} ms\n`);
  return at;
};

/** Everything the shell owns for one run. Assembled in `start()`. */
const state = {
  layout: null,
  web: null,
  companion: null,
  appUrl: null,
  companionUrl: null,
  companionToken: null,
  window: null,
  recent: new RecentDocuments(),
  /** Resolves when the background companion start has settled, either way. */
  companionStarted: null,
  /** Why the companion is not running, when it failed rather than was stopped. */
  companionError: null,
  /** Documents that arrived before anything was listening for them. */
  pending: [],
  /** Whether the renderer has attached its document listener. */
  documentsWanted: false,
  /**
   * The current update verdict, mirrored into the application menu and
   * the Check for Updates dialog. Mutated only through `updateStatus.set`,
   * which also rebuilds the menu and forwards the verdict to the dialog
   * if it is open.
   */
  updateStatus: { value: { status: 'idle' } },
};

/**
 * A small reactive cell for the update verdict.
 *
 * The application menu's *Check for Updates…* label depends on whether
 * a check is in flight, whether an update is ready, etc., so changing
 * the verdict has to rebuild the menu. The dialog subscribes through
 * `subscribeToUpdates` from `update-service.mjs`, which is how the
 * progress bar moves while a download runs.
 */
const updateStatus = {
  get value() {
    return state.updateStatus.value;
  },
  set(next) {
    state.updateStatus.value = next ?? { status: 'idle' };
    rebuildMenu();
    updateWindow.sendVerdict(state.updateStatus.value);
    state.window?.webContents.send('kingfisher:update-verdict', state.updateStatus.value);
    log('update', `verdict: ${state.updateStatus.value.status}`);
  },
};

/**
 * A token that exists only for this run, in memory.
 *
 * The web companion mints one and prints it for a person to paste. Here nobody
 * pastes anything, so the only requirement left is the one that always
 * mattered: it is new every launch and never written to disk, so a token that
 * leaks is worthless the moment Kingfisher is quit.
 */
const newToken = () => randomBytes(32).toString('hex');

async function startServices() {
  const layout = resolveLayout({ resourcesPath: process.resourcesPath, packaged: app.isPackaged });
  const missing = missingParts(layout);
  if (missing.length > 0) {
    throw new Error(
      `Kingfisher could not find part of itself:\n\n${missing.join('\n')}\n\n` +
        (layout.packaged
          ? 'This build is incomplete.'
          : 'Run `npm run desktop:build:web` in the repository first.'),
    );
  }
  state.layout = layout;

  /*
    The web port is a property of the profile; the companion's is not.

    A browser partitions IndexedDB and localStorage by origin, and an origin
    includes the port — so a shell that took a fresh free port every launch was
    giving the user a brand-new, empty machine every time they reopened
    Kingfisher. It did, and it threw away every study, repertoire, note and
    preference on every restart. `origin.mjs` has the measurement.

    The companion keeps a free port because nothing is stored against it: the
    renderer is handed its URL and a token at launch, and neither is persisted.
  */
  const [webPort, companionPort] = await Promise.all([
    resolveAppPort(app.getPath('userData'), portFree, HOST),
    freePort(HOST),
  ]);
  state.appUrl = `http://${HOST}:${webPort}`;
  state.companionUrl = `http://${HOST}:${companionPort}`;
  state.companionToken = newToken();
  // Registered before anything can print it. See log.mjs on why redaction
  // happens at the write and not at the read.
  redactInLog(state.companionToken);

  const companionData = path.join(app.getPath('userData'), 'companion');

  state.web = new Service({
    name: 'The Kingfisher server',
    entry: layout.webEntry,
    cwd: path.dirname(layout.webEntry),
    healthUrl: `${state.appUrl}/analysis`,
    env: {
      ...process.env,
      PORT: String(webPort),
      HOSTNAME: HOST,
      NODE_ENV: 'production',
      KINGFISHER_CROSS_ORIGIN_ISOLATION: '1',
    },
  });

  state.companion = new Service({
    name: 'The Kingfisher companion',
    entry: layout.companionEntry,
    cwd: layout.repo,
    healthUrl: `${state.companionUrl}/health`,
    env: {
      ...process.env,
      KINGFISHER_COMPANION_PORT: String(companionPort),
      KINGFISHER_COMPANION_TOKEN: state.companionToken,
      KINGFISHER_COMPANION_DATA_DIR: companionData,
      // A signed application bundle is read-only, and writing into it would
      // invalidate the signature that let it launch. Managed engines and the
      // records that describe them belong to the user, not to the build.
      KINGFISHER_ENGINE_DIR: path.join(app.getPath('userData'), 'engines'),
      // The shell chose the port it serves from, so it is the only thing that
      // can tell the companion which origin to accept. `allowedOrigins`
      // validates it as loopback before adding it.
      KINGFISHER_COMPANION_ALLOWED_ORIGINS: state.appUrl,
    },
  });

  /*
    Started together, and waited on separately.

    Both are launched at once, because neither needs the other. But only the
    web server is a prerequisite for a *window*: Kingfisher runs with the
    companion switched off — that is the entire web story — so a board that
    waited for it would be waiting for something it does not need.

    Until Phase 20 this was one `Promise.all`, and the effect was that the
    slower of the two decided when anything appeared on screen. The companion
    is often the slower one, and for structural reasons rather than accidental
    ones: it replays the collections and custom engines a user has registered,
    stats each recorded path to see whether it still exists, and probes for a
    tablebase helper. That is work proportional to how much the user has set
    up, and it was on the path to a blank board.

    So `startServices` now resolves when the *application* can be shown, and
    the companion continues in the background. A failure to start it is
    reported where it belongs — in the status bar the renderer already has for
    exactly this — rather than in a dialog that would preempt a working board.
  */
  const companionStarted = state.companion.start().then(
    () => {
      mark('companion ready');
      return true;
    },
    (error) => {
      /*
        Not fatal, and not silent.

        The renderer discovers the companion through the same status query the
        web build uses, so an offline companion already has a truthful
        rendering. What it cannot know is *why*, and the log the Service kept
        is the only place the reason exists.
      */
      state.companionError = error instanceof Error ? error.message : String(error);
      log('companion', `did not start: ${state.companionError}`);
      for (const line of state.companion?.log.slice(-20) ?? []) log('companion', line);
      console.error(`The Kingfisher companion did not start: ${state.companionError}`);
      return false;
    },
  );
  // Held so that quit can wait for a start still in flight rather than racing
  // it, which would leave a companion nobody had a handle to.
  state.companionStarted = companionStarted;

  await state.web.start();
  mark('web server ready');
}

/**
 * Stop everything this run started, and say whether it had to be forced.
 *
 * Called from `will-quit`, which Electron holds open until it resolves. That
 * wait is the entire point: quitting before the companion has run its own
 * shutdown is how engines are orphaned.
 */
async function stopServices() {
  /*
    Wait for a start still in flight before stopping it.

    Since Phase 20 the companion starts in the background, so quitting during
    launch — which is exactly what someone does when a launch feels slow — can
    arrive before the fork has returned a pid. Stopping then would find nothing
    to stop and report success, and the process would finish starting into an
    application that had already gone. Settling the promise first costs the
    remainder of a start that was happening anyway.
  */
  await state.companionStarted?.catch(() => false);

  const results = await Promise.all([
    state.companion?.stop() ?? { stopped: true, escalated: false },
    state.web?.stop() ?? { stopped: true, escalated: false },
  ]);
  state.companion = null;
  state.web = null;
  state.companionStarted = null;
  return results;
}

function createWindow() {
  const mac = process.platform === 'darwin';
  /*
    `hidden` rather than `hiddenInset`, and a position rather than a default.

    `hiddenInset` was what this window used for nineteen phases, and its whole
    contribution is an inset macOS chooses and will not tell anybody. The
    renderer therefore could not know where the buttons were, reserved nothing,
    and drew the Kingfisher mark underneath them. Stating the position makes the
    rectangle a number two processes can share — see `window-chrome.mjs`, which
    is the only place either of them gets it from.
  */
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d11',
    titleBarStyle: mac ? 'hidden' : 'default',
    ...(mac ? { trafficLightPosition: { ...MAC_TRAFFIC_LIGHT_POSITION } } : {}),
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'),
      // The three that matter, stated rather than inherited. The renderer runs
      // a web application; it has no reason to hold a Node handle, and the
      // bridge it does hold is the one in preload.cjs.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      additionalArguments: [
        `--kingfisher-companion-url=${state.companionUrl}`,
        `--kingfisher-companion-token=${state.companionToken}`,
        `--kingfisher-app-version=${app.getVersion()}`,
        `--kingfisher-window-chrome=${JSON.stringify(windowChromeFor(process.platform))}`,
      ],
    },
  });

  window.once('ready-to-show', () => {
    mark('window shown');
    window.show();
    // Not a flush point on its own — see `flushPending`. Harmless, and kept
    // for the case where the renderer attached before the first paint.
    flushPending();
  });

  /*
    A reload is a new renderer with no listeners, so anything sent before it
    calls `onOpenDocument` again would be lost the same way.
  */
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) state.documentsWanted = false;
  });

  // The renderer telling the shell it is interactive. Everything before this
  // is the shell's to improve; everything after it is the application's.
  window.webContents.once('did-finish-load', () => mark('renderer loaded'));

  /*
    Navigation is pinned to the server this shell started.

    Kingfisher fetches from Lichess and downloads engines, so the renderer does
    reach the network — but it never *navigates* anywhere, and an application
    window that can be navigated to an arbitrary page is a browser with the
    address bar taken away. A link that wants a real page gets the user's own
    browser instead.
  */
  const external = (url) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  };
  window.webContents.setWindowOpenHandler(({ url }) => external(url));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(state.appUrl)) {
      event.preventDefault();
      external(url);
    }
  });
  // A renderer that has crashed cannot be recovered by pretending otherwise.
  window.webContents.on('render-process-gone', (_event, details) => {
    dialog.showErrorBox(
      'Kingfisher stopped responding',
      `The window closed unexpectedly (${details.reason}). Your work is saved as you go; ` +
        'reopening Kingfisher will bring back the last session.',
    );
  });

  window.on('closed', () => {
    state.window = null;
  });

  state.window = window;
  void window.loadURL(`${state.appUrl}/analysis`);
  return window;
}

// --- documents -------------------------------------------------------------

/** Hand a chosen file to the renderer, or hold it until there is one. */
function deliver(document) {
  state.recent.add(document.path);
  rebuildMenu();
  /*
    Queue first, then flush. The old test was `!webContents.isLoading()`, which
    answers "has the page finished loading" and not "is anything listening" —
    two different questions with the same answer only most of the time.
  */
  state.pending.push(document);
  const waiting = state.pending.length;
  flushPending();
  return state.pending.length < waiting;
}

/**
 * Send what is waiting, once there is somebody to send it to.
 *
 * `state.documentsWanted` is the renderer having attached its listener, and it
 * is the condition this used to get wrong. It was called from `ready-to-show`,
 * which fires when the first frame can be painted — before React has mounted
 * and before `onOpenDocument` has been called. The document went to a renderer
 * that was not listening, `ipcRenderer.on` does not replay what it missed, and
 * a PGN double-clicked on a cold launch simply never appeared. Phase 19
 * declared the `.pgn` association and never exercised it; the first test that
 * did, failed.
 */
function flushPending() {
  if (!state.documentsWanted || !state.window) return;
  const queued = state.pending.splice(0);
  for (const document of queued)
    state.window.webContents.send('kingfisher:open-document', document);
}

/** Turn a path into the document the renderer is given, by what it is. */
async function documentFor(file) {
  if (isDatabasePath(file)) {
    return { kind: 'database', path: file, name: path.basename(file) };
  }
  const pgn = await readPgn(file);
  return { kind: 'pgn', ...pgn };
}

async function openPaths(files) {
  for (const file of files) {
    try {
      deliver(await documentFor(file));
    } catch (error) {
      dialog.showErrorBox('Kingfisher could not open that file', String(error?.message ?? error));
    }
  }
}

async function chooseAndOpen(kind) {
  const filters =
    kind === 'database'
      ? [{ name: 'Chess databases', extensions: DATABASE_EXTENSIONS }]
      : [{ name: 'PGN games', extensions: PGN_EXTENSIONS }];
  const result = await dialog.showOpenDialog(state.window ?? undefined, {
    title: kind === 'database' ? 'Open a database' : 'Open a PGN',
    properties: ['openFile'],
    filters,
  });
  if (result.canceled) return { canceled: true };
  await openPaths(result.filePaths);
  return { canceled: false, paths: result.filePaths };
}

function rebuildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildTemplate({
        recent: state.recent.list(),
        onOpenPgn: () => void chooseAndOpen('pgn'),
        onOpenDatabase: () => void chooseAndOpen('database'),
        onOpenRecent: (file) => void openPaths([file]),
        onClearRecent: () => {
          state.recent.clear();
          rebuildMenu();
        },
        onCheckForUpdates: () => openUpdateDialog(),
        onOpenSettings: () => state.window?.webContents.send('kingfisher:show-settings'),
        onOpenDocumentation: () => {
          const url = `${process.env.KINGFISHER_PUBLIC_REPOSITORY_URL || 'https://github.com/mardakurt/kingfisher'}`;
          void shell.openExternal(url);
        },
        onReportIssue: () => {
          const url = `${process.env.KINGFISHER_PUBLIC_ISSUES_URL || 'https://github.com/mardakurt/kingfisher/issues'}/new`;
          void shell.openExternal(url);
        },
        onDiagnostics: () => state.window?.webContents.send('kingfisher:show-diagnostics'),
        appName: app.getName(),
        updateStatus: updateStatus.value,
      }),
    ),
  );
}

/**
 * Open the Check for Updates… dialog. The single entry point used by
 * the application menu, the File menu (non-mac), the Settings panel and
 * the command palette. The dialog is single-instance; a second call
 * focuses the existing window.
 */
async function openUpdateDialog() {
  await updateWindow.open({
    parent: state.window ?? undefined,
    onAction: handleUpdateAction,
    onClose: () => {
      // Re-enable the menu when the dialog closes; the menu's own label
      // reverts because the verdict listener drives `updateStatus.value`.
    },
  });
  // Send the verdict the dialog is currently on so it does not blank to
  // 'idle' if the user opens the dialog a second time after a previous
  // verdict is still cached.
  updateWindow.sendVerdict(updateStatus.value);
}

/**
 * Dispatch an action from the dialog to the update service.
 *
 * `action` is one of: 'check', 'install', 'cancel', 'close', 'notes',
 * 'fallback'. Anything unknown is a no-op; the dialog should not
 * produce them, but the service does not trust its own callers.
 *
 * The action names map to user-visible intent. `install` is the
 * canonical "Install Update" button — it owns the entire chain from
 * download through auto-relaunch. `cancel` is meaningful only
 * mid-download; once the engine is in `ready` the button is
 * replaced by the in-progress messaging rather than a fake cancel.
 */
async function handleUpdateAction(action) {
  try {
    switch (action) {
      case 'check': {
        await check();
        return;
      }
      case 'install': {
        // The Install Update flow owns the full chain: download
        // (if needed), save barrier, engine shutdown, quit, install,
        // relaunch. The verdict listener updates the dialog in
        // lockstep as the state machine moves.
        await installAndRestart({ onSaveBarrier: requestSaveBarrier });
        return;
      }
      case 'cancel': {
        await cancelDownload();
        return;
      }
      case 'notes': {
        const url = `${process.env.KINGFISHER_PUBLIC_RELEASE_URL || 'https://github.com/mardakurt/kingfisher/releases/latest'}`;
        void shell.openExternal(url);
        return;
      }
      case 'fallback': {
        // Manual fallback: open the polished DMG download page.
        // Used when auto-install is not viable on this machine.
        const url = `${process.env.KINGFISHER_PUBLIC_REPOSITORY_URL || 'https://github.com/mardakurt/kingfisher'}/releases/latest`;
        void shell.openExternal(url);
        return;
      }
      case 'acknowledge': {
        acknowledgeUpdate();
        state.window?.webContents.send('kingfisher:update-acknowledged');
        return;
      }
      case 'close':
        updateWindow.close();
        return;
      default:
        return;
    }
  } catch (err) {
    log('update', `dialog action failed: ${String(err?.message ?? err)}`);
    updateStatus.set({
      status: STATUS.FAILED,
      reason: 'The updater could not complete the request.',
    });
  }
}

/**
 * Save barrier: ask the main window to flush any in-flight writes
 * and report back. The renderer is the only thing that knows
 * whether authored data is in the middle of being persisted, so the
 * question has to be asked there.
 *
 * The contract is small:
 *
 *   - We send a `kingfisher:save-barrier:request` with a unique
 *     `requestId`. The renderer's preload forwards it to a
 *     registered handler, awaits the result, and sends the response
 *     on `kingfisher:save-barrier:response`.
 *   - We resolve on the first matching response, or on a timeout.
 *   - The handler is responsible for waiting until its own writes
 *     have actually been committed (not "the next microtask" but
 *     "the data is on disk"); a `true` reply is a strong claim and
 *     a `false` reply aborts the install path.
 *   - If no renderer is registered, or the renderer never
 *     responds, we treat it as suspicious but allow the install to
 *     proceed. The user has already clicked Install Update; a
 *     missing handler is a *preference* state ("the renderer
 *     doesn't know about the save barrier yet"), not a hard
 *     failure of the data path.
 */
function requestSaveBarrier({ timeoutMs = 5000 } = {}) {
  if (!state.window || state.window.isDestroyed()) {
    return Promise.resolve({ ok: true, reason: 'no-window', timedOut: false });
  }
  const requestId = randomBytes(8).toString('hex');
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ipcMain.removeListener('kingfisher:save-barrier:response', listener);
      log('update', `save barrier timed out after ${timeoutMs} ms`);
      resolve({ ok: true, reason: 'no-renderer-handler', timedOut: true });
    }, timeoutMs);
    const listener = (event, payload) => {
      if (!payload || payload.requestId !== requestId) return;
      clearTimeout(timer);
      ipcMain.removeListener('kingfisher:save-barrier:response', listener);
      if (payload.ok) {
        resolve({ ok: true, timedOut: false });
      } else {
        resolve({
          ok: false,
          reason: payload.reason || 'Renderer reported an unfinished save.',
          timedOut: false,
        });
      }
    };
    ipcMain.on('kingfisher:save-barrier:response', listener);
    try {
      state.window.webContents.send('kingfisher:save-barrier:request', requestId);
    } catch (err) {
      clearTimeout(timer);
      ipcMain.removeListener('kingfisher:save-barrier:response', listener);
      log('update', `save barrier dispatch failed: ${String(err?.message ?? err)}`);
      resolve({ ok: true, reason: 'send-failed', timedOut: false });
    }
  });
}

// --- ipc -------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle('kingfisher:open-pgn', () => chooseAndOpen('pgn'));
  ipcMain.handle('kingfisher:open-database', () => chooseAndOpen('database'));

  ipcMain.handle('kingfisher:choose-directory', async (_event, { title } = {}) => {
    const result = await dialog.showOpenDialog(state.window ?? undefined, {
      title: title ?? 'Choose a folder',
      properties: ['openDirectory'],
    });
    return result.canceled ? { canceled: true } : { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle('kingfisher:choose-file', async (_event, { title, extensions } = {}) => {
    const result = await dialog.showOpenDialog(state.window ?? undefined, {
      title: title ?? 'Choose a file',
      properties: ['openFile'],
      filters:
        Array.isArray(extensions) && extensions.length ? [{ name: 'Files', extensions }] : [],
    });
    return result.canceled ? { canceled: true } : { canceled: false, path: result.filePaths[0] };
  });

  // Files dropped on the window. The renderer can see a dropped file's path
  // but cannot read it; this is the only way that path becomes content.
  ipcMain.handle('kingfisher:open-paths', async (_event, files) => {
    const wanted = (Array.isArray(files) ? files : [])
      .filter((file) => typeof file === 'string')
      .filter((file) => isPgnPath(file) || isDatabasePath(file));
    await openPaths(wanted);
    return { opened: wanted.length };
  });

  ipcMain.handle('kingfisher:recent', () => state.recent.list());

  /*
    What the shell itself can say about its own health.

    Deliberately factual and deliberately small: whether each process is
    running, and its last few lines if it is not. Diagnostics that guess are
    worse than none, and a normal user should never have to read this at all.
  */
  /*
    The renderer saying it can receive documents. See `flushPending` for the
    defect this exists to close.
  */
  ipcMain.on('kingfisher:documents-wanted', (event) => {
    if (event.sender !== state.window?.webContents) return;
    state.documentsWanted = true;
    flushPending();
  });

  /*
    Open the log directory in the Finder.

    A path is not a way to reach a file for most people, and the two folders it
    lives under are hidden by default. `showItemInFolder` reveals it selected,
    which is the difference between a support instruction somebody follows and
    one they give up on.
  */
  ipcMain.handle('kingfisher:open-logs', () => {
    const target = logFile();
    if (!target) return false;
    shell.showItemInFolder(target);
    return true;
  });

  ipcMain.handle('kingfisher:diagnostics', () => ({
    shell: {
      name: 'Electron',
      version: process.versions.electron,
      chrome: process.versions.chrome,
    },
    node: process.versions.node,
    /*
      The machine, from the process that is actually on it.

      A renderer cannot find this out. `navigator.userAgent` is frozen and
      describes Chromium; on Apple silicon it still says "Intel Mac OS X", so a
      report from an M-series Mac and one from a 2019 Intel Mac read the same —
      and they are entirely different bug reports the moment a native engine is
      involved, since the arm64 and x64 binaries are different downloads.
    */
    platform: { os: process.platform, arch: process.arch, release: os.release() },
    logPath: logFile(),
    packaged: app.isPackaged,
    web: { running: Boolean(state.web?.running), pid: state.web?.pid ?? null, url: state.appUrl },
    companion: {
      running: Boolean(state.companion?.running),
      pid: state.companion?.pid ?? null,
      url: state.companionUrl,
      /*
        The log only when it is not running, and the recorded reason with it.

        Since the companion starts in the background, "not running" now has two
        shapes a user can hit: still starting, and failed to start. The log
        distinguishes them, and `companionError` is the sentence the rejection
        carried, which is otherwise nowhere the renderer can see.
      */
      log: state.companion?.running
        ? []
        : [
            ...(state.companionError ? [state.companionError] : []),
            ...(state.companion?.log.slice(-5) ?? []),
          ],
    },
    /** What launch cost, stage by stage. See `marks` for why it is kept. */
    startup: marks.map(({ stage, at }) => ({ stage, at })),
  }));

  /*
    Phase 35: the canonical update surface. The main window never calls
    `fetch` or `fs` to check for updates; it asks the main process, and
    the main process is the only place network and filesystem happen.
    This is what keeps the renderer trust boundary small.
  */
  ipcMain.handle('kingfisher:update-status', () => updateStatus.value);

  ipcMain.on('kingfisher:show-update-dialog', () => {
    void openUpdateDialog();
  });

  /*
    Phase 36: the renderer confirms it has shown the
    "Kingfisher was updated to X.Y.Z" surface. The main process
    records the current version as acknowledged so the next launch
    starts with a clean slate.
  */
  ipcMain.on('kingfisher:update-acknowledge', () => {
    acknowledgeUpdate();
  });
}

// --- lifecycle -------------------------------------------------------------

/*
  One Kingfisher per machine.

  Not tidiness: two shells would be two companions, each with its own engines
  and each opening the same SQLite collections. A second launch — including a
  double-clicked PGN — hands its documents to the window that already exists.
*/
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (state.window) {
      if (state.window.isMinimized()) state.window.restore();
      state.window.focus();
    }
    void openPaths(openableFromArgv(argv));
  });

  // macOS delivers a double-clicked document here, and can do so before
  // `ready`. `deliver` queues it until there is a window to hand it to.
  app.on('open-file', (event, file) => {
    event.preventDefault();
    void openPaths([file]);
  });

  app.whenReady().then(async () => {
    mark('electron ready');
    /*
      The log is opened before anything can fail, because the failures worth
      recording are the ones that happen before there is a window to show them
      in. A start that dies in `startServices` currently produces a modal, an
      exit, and no trace at all once the dialog is dismissed.
    */
    openLog(app.getPath('userData'));
    log(
      'launch',
      `Kingfisher ${app.getVersion()} · Electron ${process.versions.electron} · ` +
        `${process.platform}-${process.arch} ${os.release()} · packaged=${app.isPackaged}`,
    );
    registerIpc();
    rebuildMenu();
    // Mirror every update-service verdict through `updateStatus` so the
    // menu and the dialog stay in lockstep with the service's own state.
    subscribeToUpdates((verdict) => {
      // The service emits progress events; update the menu on the
      // status changes that matter to its label.
      const next = verdict ?? { status: 'idle' };
      if (
        state.updateStatus.value.status !== next.status ||
        state.updateStatus.value.latestVersion !== next.latestVersion ||
        state.updateStatus.value.path !== next.path ||
        state.updateStatus.value.reason !== next.reason
      ) {
        state.updateStatus.value = next;
        rebuildMenu();
        updateWindow.sendVerdict(next);
        state.window?.webContents.send('kingfisher:update-verdict', next);
      } else {
        // Same shape, but the progress numbers have moved.
        updateWindow.sendVerdict(next);
        state.window?.webContents.send('kingfisher:update-verdict', next);
      }
    });
    try {
      await startServices();
    } catch (error) {
      log('launch', `could not start: ${String(error?.message ?? error)}`);
      dialog.showErrorBox(
        error instanceof PortUnavailableError
          ? 'Kingfisher needs its own port'
          : 'Kingfisher could not start',
        String(error?.message ?? error),
      );
      app.exit(1);
      return;
    }
    createWindow();
    mark('window created');
    void openPaths(openableFromArgv(process.argv));

    /*
      Phase 36: the small "Kingfisher was updated to X.Y.Z" notice.
      We only know the previous version because the last launch
      recorded it; if the user has never acknowledged this version,
      ask the renderer to surface the post-update surface once.
      Doing it from the main process means the renderer never has
      to read the userData directory itself.
    */
    const currentVersion = app.getVersion();
    if (app.isPackaged && !hasAcknowledgedUpdate(currentVersion)) {
      state.window?.webContents.once('did-finish-load', () => {
        state.window?.webContents.send('kingfisher:update-installed', {
          version: currentVersion,
        });
      });
    }

    /*
      Phase 36: staging feed override. The local E2E test sets
      `KINGFISHER_UPDATER_FEED_URL` to point at a staging HTTP
      server so the same packaged binary can be exercised against a
      deterministic candidate. Production builds never set this.
    */
    const stagingFeed = process.env.KINGFISHER_UPDATER_FEED_URL;
    if (stagingFeed) {
      try {
        await setStagingFeed({ url: stagingFeed, channel: 'latest' });
        log('update', `staging feed configured: ${stagingFeed}`);
      } catch (err) {
        log('update', `staging feed set failed: ${String(err?.message ?? err)}`);
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  /*
    Quitting is where the orphan-process guarantee is kept or lost.

    `will-quit` is held open until both children have gone. The alternative —
    letting the shell exit and trusting the operating system — is exactly the
    case that leaves a native engine searching on four cores with nothing to
    report to.
  */
  let stopping = false;
  app.on('will-quit', (event) => {
    if (stopping) return;
    stopping = true;
    event.preventDefault();
    log('quit', 'stopping services');
    // Cancel any in-flight update before the children are stopped, so
    // the user does not return to a half-finished download and a
    // `READY` verdict that the next launch inherits as stale state.
    cancelDownload();
    // Bounded cleanup of the update cache. Keeps the most recent
    // verified download (the user may quit and reopen expecting it)
    // and unlinks everything else.
    try {
      const removed = pruneUpdateCache();
      if (removed > 0) log('quit', `pruned ${removed} cached update files`);
    } catch (err) {
      log('quit', `prune failed: ${String(err?.message ?? err)}`);
    }
    void stopServices().finally(() => {
      log('quit', 'services stopped');
      app.exit(0);
    });
  });

  // The Mac convention is that closing the window does not quit. Kingfisher
  // holds a companion and possibly a running search, so it follows it: the
  // application stays in the Dock and the services stay up.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
