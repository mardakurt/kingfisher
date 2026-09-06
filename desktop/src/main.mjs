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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
import { Service, freePort } from './services.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';

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
  /** Documents that arrived before a window existed to receive them. */
  pending: [],
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

  const [webPort, companionPort] = await Promise.all([freePort(HOST), freePort(HOST)]);
  state.appUrl = `http://${HOST}:${webPort}`;
  state.companionUrl = `http://${HOST}:${companionPort}`;
  state.companionToken = newToken();

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
    Started together. The companion is not a prerequisite for the application —
    Kingfisher runs with it switched off, which is the whole web story — so
    serialising them would only make launch slower for no guarantee.
  */
  await Promise.all([state.web.start(), state.companion.start()]);
}

/**
 * Stop everything this run started, and say whether it had to be forced.
 *
 * Called from `will-quit`, which Electron holds open until it resolves. That
 * wait is the entire point: quitting before the companion has run its own
 * shutdown is how engines are orphaned.
 */
async function stopServices() {
  const results = await Promise.all([
    state.companion?.stop() ?? { stopped: true, escalated: false },
    state.web?.stop() ?? { stopped: true, escalated: false },
  ]);
  state.companion = null;
  state.web = null;
  return results;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d11',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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
      ],
    },
  });

  window.once('ready-to-show', () => {
    window.show();
    flushPending();
  });

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
  if (state.window && !state.window.webContents.isLoading()) {
    state.window.webContents.send('kingfisher:open-document', document);
    return true;
  }
  state.pending.push(document);
  return false;
}

function flushPending() {
  const queued = state.pending.splice(0);
  for (const document of queued)
    state.window?.webContents.send('kingfisher:open-document', document);
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
        onDiagnostics: () => state.window?.webContents.send('kingfisher:show-diagnostics'),
        appName: app.getName(),
      }),
    ),
  );
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
  ipcMain.handle('kingfisher:diagnostics', () => ({
    shell: {
      name: 'Electron',
      version: process.versions.electron,
      chrome: process.versions.chrome,
    },
    node: process.versions.node,
    packaged: app.isPackaged,
    web: { running: Boolean(state.web?.running), pid: state.web?.pid ?? null, url: state.appUrl },
    companion: {
      running: Boolean(state.companion?.running),
      pid: state.companion?.pid ?? null,
      url: state.companionUrl,
      log: state.companion?.running ? [] : (state.companion?.log.slice(-5) ?? []),
    },
  }));
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
    registerIpc();
    rebuildMenu();
    try {
      await startServices();
    } catch (error) {
      dialog.showErrorBox('Kingfisher could not start', String(error?.message ?? error));
      app.exit(1);
      return;
    }
    createWindow();
    void openPaths(openableFromArgv(process.argv));

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
    void stopServices().finally(() => app.exit(0));
  });

  // The Mac convention is that closing the window does not quit. Kingfisher
  // holds a companion and possibly a running search, so it follows it: the
  // application stays in the Dock and the services stay up.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
