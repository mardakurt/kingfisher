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

import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readBuildIdentity } from './build-identity.mjs';
import { log, logFile, openLog, redactInLog } from './log.mjs';
import { buildTemplate } from './menu.mjs';
import {
  attachBoundsPersistence,
  resolveStartupBounds,
  WINDOW_BOUNDS_FILE,
} from './window-bounds.mjs';
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
import {
  createSaveBarrier,
  DEFAULT_TIMEOUT_MS as SAVE_BARRIER_TIMEOUT_MS,
} from './save-barrier.mjs';
import { Service, freePort } from './services.mjs';
import { MAC_TRAFFIC_LIGHT_POSITION, windowChromeFor } from './window-chrome.mjs';
import {
  STATUS,
  acknowledgeUpdate,
  cancelDownload,
  check,
  configureChannel,
  manualDownloadUrl,
  hasAcknowledgedUpdate,
  installAndRestart,
  pruneUpdateCache,
  setStagingFeed,
  subscribe as subscribeToUpdates,
} from './update-service.mjs';
import * as updateWindow from './update-window.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';

/** What the application is called where a person reads it. */
const PRODUCT_NAME = 'Kingfisher';

/**
 * What this build is — version, build number, commit, channel — as
 * `desktop/scripts/build.mjs` recorded it into the packaged `package.json`.
 * Read once; `build-identity.mjs` says why a version alone is not enough.
 */
const buildIdentity = readBuildIdentity(createRequire(import.meta.url)('../package.json'), {
  packaged: app.isPackaged,
});

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
    onUnexpectedExit: (exit) => void reviveService('web', exit),
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
    onUnexpectedExit: (exit) => void reviveService('companion', exit),
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
      startedAt.companion = Date.now();
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
  startedAt.web = Date.now();
  mark('web server ready');
}

/**
 * Bring a service back after it died on its own.
 *
 * The web server is what the window is looking at: when it dies the
 * renderer shows a connection error and, before Phase 46, nothing brought it
 * back short of quitting Kingfisher. The companion's loss was survivable
 * but every native engine and collection went with it. Both are the shell's
 * own children, started with the same port and token, so starting them again
 * is exactly the launch the renderer already paired with.
 *
 * Bounded: three revivals in five minutes, then the service stays down and
 * the log says so — a child that dies on every start would otherwise be
 * restarted for ever, and the reason it dies is what a person needs to see.
 * Never during quit, when an exit is the plan.
 */
const revivals = { web: [], companion: [] };
const startedAt = { web: 0, companion: 0 };
const REVIVAL_LIMIT = 3;
const REVIVAL_WINDOW_MS = 5 * 60_000;
/** An exit this soon after a start is a crash loop, not a healthy service that was killed. */
const CRASH_LOOP_MS = 30_000;

async function reviveService(which, exit) {
  if (state.quitting) return;
  const service = state[which];
  if (!service || service.running) return;
  const now = Date.now();
  const reason = exit?.signal ?? exit?.code ?? 'unknown';
  /*
    Only a crash loop counts against the budget. A service that ran for
    minutes and was then killed — by a person, by the operating system, by a
    test — is simply started again; one that dies within seconds of every
    start is started three times in five minutes and then left down, with
    the reason in the log, because restarting it for ever would hide it.
  */
  const crashLoop = now - startedAt[which] < CRASH_LOOP_MS;
  revivals[which] = revivals[which].filter((at) => now - at < REVIVAL_WINDOW_MS);
  if (crashLoop && revivals[which].length >= REVIVAL_LIMIT) {
    log(
      which,
      `exited (${reason}) ${Math.round((now - startedAt[which]) / 1000)} s after starting and was not restarted: ${REVIVAL_LIMIT} crash-loop restarts in five minutes`,
    );
    return;
  }
  if (crashLoop) revivals[which].push(now);
  else revivals[which] = [];
  startedAt[which] = now;
  log(which, `exited unexpectedly (${reason}); restarting`);
  try {
    if (which === 'companion') {
      state.companionError = null;
      state.companionStarted = service.start().then(
        () => true,
        (error) => {
          state.companionError = error instanceof Error ? error.message : String(error);
          return false;
        },
      );
      await state.companionStarted;
    } else {
      await service.start();
      // The window was looking at a server that is gone; the one that
      // replaced it serves the same origin, so a reload is the whole fix.
      if (state.window && !state.window.isDestroyed()) state.window.webContents.reload();
    }
    log(which, 'restarted');
  } catch (error) {
    log(which, `did not restart: ${String(error?.message ?? error)}`);
  }
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
  const defaultSize = { width: 1440, height: 920 };
  const boundsFile = path.join(app.getPath('userData'), WINDOW_BOUNDS_FILE);
  const displays = screen.getAllDisplays().map((d) => d.workArea);
  const startupBounds = resolveStartupBounds(boundsFile, displays, defaultSize) ?? {
    x: undefined,
    y: undefined,
    ...defaultSize,
  };
  const window = new BrowserWindow({
    width: startupBounds.width,
    height: startupBounds.height,
    x: startupBounds.x,
    y: startupBounds.y,
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
  /*
    The page could not be fetched from the shell's own server. That is the
    server being gone — during a revival, or after one failed — and the
    window is the only thing a person can see. Try once more, then reload.
  */
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted: a navigation superseded it */) return;
    log('window', `could not load ${url.replace(/\?.*$/, '')}: ${description} (${code})`);
    if (state.web && !state.web.running && !state.quitting) {
      void reviveService('web', { code: 'did-fail-load' });
    } else if (state.web?.running && !state.quitting) {
      setTimeout(() => {
        if (!window.isDestroyed()) window.webContents.reload();
      }, 1_000);
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

  /*
    Persist the window frame across restarts.

    macOS does not remember an Electron window's position between launches,
    so without an explicit save a user who has sized and placed Kingfisher
    redoes it on every launch. Worse, a window last seen on an external
    display reopens at coordinates nothing can see when that display is gone,
    and the application looks broken. `resolveStartupBounds` clamps the
    remembered frame to a display the user actually has, so a stale frame
    cannot trap a window off-screen. The save is debounced because a drag
    or resize fires the event dozens of times per second.
  */
  attachBoundsPersistence(window, { file: boundsFile, log });

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
      // The name only: the log is local, but a path is more than a support
      // report needs, and the Finder route is the one worth being able to see.
      log('document', `opening ${path.basename(file)}`);
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
        // The product name, not `app.getName()`: that is the package name,
        // `kingfisher-desktop`, and it also names the profile directory, so
        // it stays what it is. See the note in menu.mjs.
        appName: PRODUCT_NAME,
        updateStatus: updateStatus.value,
        packaged: app.isPackaged,
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
        await installAndRestart({
          onSaveBarrier: requestSaveBarrier,
          isQuitting: () => Boolean(state.quitting),
        });
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
        // Manual fallback: the page this channel's newest build is on. For a
        // preview that is the landing page, never `/releases/latest`, which
        // is the *stable* release and may be older than the preview.
        const url =
          manualDownloadUrl() ??
          `${process.env.KINGFISHER_PUBLIC_REPOSITORY_URL || 'https://github.com/mardakurt/kingfisher'}/releases/latest`;
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
 * The contract is enforced by `createSaveBarrier` in
 * `save-barrier.mjs`: it fails closed on every unexpected path
 * (no usable window, send failure, timeout, renderer's own
 * `ok: false` reply). DATA SAFETY > UPDATE CONVENIENCE — a barrier
 * that resolves `ok: true` for any reason other than an explicit
 * `ok: true` from every window that may own authored writes is a
 * bug.
 *
 * The handler in the renderer's preload (`onSaveBarrierRequest`)
 * forwards the request to a registered function. That function
 * must call into the persistence layer, await the flush, and
 * answer `{ ok: true }` only when the bytes are on disk.
 */
const saveBarrier = createSaveBarrier({
  send: (window, channel, payload) => {
    if (!window || !window.webContents || window.webContents.isDestroyed?.()) return false;
    if (window.isDestroyed?.()) return false;
    try {
      window.webContents.send(channel, payload);
      return true;
    } catch {
      return false;
    }
  },
  on: (channel, listener) => {
    const wrapped = (event, payload) => listener(event, payload);
    ipcMain.on(channel, wrapped);
    return () => ipcMain.removeListener(channel, wrapped);
  },
  getWindows: () => (state.window && !state.window.isDestroyed() ? [state.window] : []),
  isWindowUsable: (window) =>
    Boolean(window) && !window.isDestroyed() && !window.webContents?.isDestroyed?.(),
  log: (tag, message) => log(tag, message),
});

/**
 * Ask the main window to confirm its writes are committed.
 *
 * The result is a `BarrierResult` (see `save-barrier.mjs`). The
 * update service treats `ok: false` as a refusal to install and
 * surfaces the reason in the dialog. The `onQuitRequested` flag is
 * reserved for a future tightening where the user's own Quit
 * cancels an in-flight barrier; today the install path is the only
 * caller.
 */
function requestSaveBarrier({ timeoutMs = SAVE_BARRIER_TIMEOUT_MS } = {}) {
  return saveBarrier.dispatch({ timeoutMs });
}

// --- ipc -------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle('kingfisher:open-pgn', () => chooseAndOpen('pgn'));
  ipcMain.handle('kingfisher:open-database', () => chooseAndOpen('database'));

  /*
    What reaches a native panel is a string and a list of extensions, or the
    defaults. The renderer is trusted no further than that: a fuzzed call
    with a number for a title, or objects for extensions, must become a
    normal chooser or a refusal, not an exception inside the dialog module.
  */
  const chooserTitle = (title, fallback) =>
    typeof title === 'string' && title.trim() ? title.slice(0, 200) : fallback;
  const chooserExtensions = (extensions) =>
    Array.isArray(extensions)
      ? extensions.filter((e) => typeof e === 'string' && /^[a-z0-9]{1,16}$/i.test(e)).slice(0, 32)
      : [];

  ipcMain.handle('kingfisher:choose-directory', async (_event, options) => {
    const result = await dialog.showOpenDialog(state.window ?? undefined, {
      title: chooserTitle(options?.title, 'Choose a folder'),
      properties: ['openDirectory'],
    });
    return result.canceled ? { canceled: true } : { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle('kingfisher:choose-file', async (_event, options) => {
    const extensions = chooserExtensions(options?.extensions);
    const result = await dialog.showOpenDialog(state.window ?? undefined, {
      title: chooserTitle(options?.title, 'Choose a file'),
      properties: ['openFile'],
      filters: extensions.length ? [{ name: 'Files', extensions }] : [],
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

  /*
    Bring the companion back after it has died.

    A companion can be killed from outside — a crash in a native module, the
    operating system under memory pressure, a person in Activity Monitor —
    and until Phase 46 the only way back was to quit and reopen Kingfisher.
    The same `Service` is started again with the same port and the same
    token, so the renderer's paired address keeps working; the companion
    re-reads its own registry of collections and engines from disk. A
    companion that is running is left alone: this is recovery, not restart.
  */
  ipcMain.handle('kingfisher:companion-restart', async (event) => {
    if (event.sender !== state.window?.webContents) return { restarted: false, running: false };
    if (!state.companion) return { restarted: false, running: false };
    if (state.companion.running) return { restarted: false, running: true };
    log('companion', 'restart requested from Diagnostics');
    state.companionError = null;
    state.companionStarted = state.companion.start().then(
      () => {
        log('companion', 'restarted');
        return true;
      },
      (error) => {
        state.companionError = error instanceof Error ? error.message : String(error);
        log('companion', `did not restart: ${state.companionError}`);
        return false;
      },
    );
    const running = await state.companionStarted;
    return { restarted: running, running, error: state.companionError };
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
    /**
     * The build, not just the version: two `1.0.0`s from different commits
     * are different programs, and a support report has to say which.
     */
    build: {
      version: buildIdentity.version,
      number: buildIdentity.build,
      commit: buildIdentity.commit,
      channel: buildIdentity.channel,
      dirty: buildIdentity.dirty,
      label: buildIdentity.label,
    },
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
    Phase 37: the renderer confirms it has shown the
    "Kingfisher was updated to X.Y.Z" surface. The main process
    records the current version as acknowledged so the next launch
    starts with a clean slate. The renderer passes the version it
    has just shown; the main process falls back to the running
    app's version if the renderer omits it (which a future preload
    could be tempted to do).
  */
  ipcMain.handle('kingfisher:update-acknowledge', (_event, version) => {
    const v = typeof version === 'string' && version ? version : null;
    acknowledgeUpdate(v ?? undefined);
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
    const files = openableFromArgv(argv);
    log('launch', `a second instance was refused; ${files.length} document(s) handed over`);
    if (state.window) {
      if (state.window.isMinimized()) state.window.restore();
      state.window.focus();
    }
    void openPaths(files);
  });

  // macOS delivers a double-clicked document here, and can do so before
  // `ready`. `deliver` queues it until there is a window to hand it to.
  app.on('open-file', (event, file) => {
    event.preventDefault();
    log('document', `open-file from the system: ${path.basename(file)}`);
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
      `Kingfisher ${buildIdentity.label} · Electron ${process.versions.electron} · ` +
        `${process.platform}-${process.arch} ${os.release()} · packaged=${app.isPackaged}`,
    );
    configureChannel({
      name: buildIdentity.channel,
      build: buildIdentity.build,
      downloadUrl:
        buildIdentity.channel === 'preview'
          ? (buildIdentity.landing ??
            `${process.env.KINGFISHER_PUBLIC_REPOSITORY_URL || 'https://github.com/mardakurt/kingfisher'}/releases`)
          : null,
    });
    /*
      The About panel: the product name (not the package name), the marketing
      version, and the build number, commit and channel a support report needs.
    */
    app.setAboutPanelOptions({
      applicationName: PRODUCT_NAME,
      applicationVersion: buildIdentity.version,
      version: [
        buildIdentity.build === null ? null : `build ${buildIdentity.build}`,
        buildIdentity.commit ? buildIdentity.commit.slice(0, 7) : null,
        buildIdentity.channel,
      ]
        .filter(Boolean)
        .join(' · '),
      copyright: 'Copyright © 2026 Kingfisher.',
    });
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
    // Phase 37 (PART W): once the quit has been requested, refuse
    // any new install. The renderer may have already sent
    // `kingfisher-update:install` and is racing the shutdown.
    state.quitting = true;
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
