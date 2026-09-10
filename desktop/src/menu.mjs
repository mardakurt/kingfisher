/**
 * The application menu.
 *
 * Built as data from the state the shell holds, so that "Open Recent" is the
 * same list the renderer sees rather than a second one that drifts from it.
 * Exported as a template rather than installed here so it can be asserted on
 * without an Electron window: every item this file adds has to lead somewhere,
 * and `menu.test.mjs` is what checks that none of them is decorative.
 *
 * Phase 35: the macOS application menu now carries a *Check for Updates…*
 * item directly under the product name. The renderer, the command palette
 * and the Settings panel all dispatch into the same update service the menu
 * calls — there is exactly one implementation, and the menu is its primary
 * surface.
 */

const isMac = process.platform === 'darwin';

export function buildTemplate({
  recent = [],
  onOpenPgn = () => {},
  onOpenDatabase = () => {},
  onOpenRecent = () => {},
  onClearRecent = () => {},
  onCheckForUpdates = () => {},
  onOpenSettings = () => {},
  onOpenDocumentation = () => {},
  onReportIssue = () => {},
  onDiagnostics = () => {},
  appName = 'Kingfisher',
  platform = process.platform,
  updateStatus = { status: 'idle' },
} = {}) {
  const mac = platform === 'darwin';
  const recentItems = recent.map((entry) => ({
    label: entry.name,
    // `sublabel` is macOS-only and ignored elsewhere; it is what makes two
    // files with the same name distinguishable without printing a full path.
    sublabel: entry.kind === 'database' ? 'Database' : 'PGN',
    click: () => onOpenRecent(entry.path),
  }));

  const updateLabel = menuLabelForUpdate(updateStatus);
  const updateEnabled = menuEnabledForUpdate(updateStatus);

  return [
    ...(mac
      ? [
          {
            label: appName,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                // Phase 35: the macOS application menu's primary updater
                // entry. Lives directly under the product name, in the
                // slot a Mac user expects; the Settings panel and the
                // command palette are secondary surfaces that dispatch
                // into the same handler.
                label: updateLabel,
                enabled: updateEnabled,
                accelerator: 'CmdOrCtrl+Shift+U',
                click: () => onCheckForUpdates(),
              },
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'Cmd+,', click: () => onOpenSettings() },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open PGN…', accelerator: 'CmdOrCtrl+O', click: () => onOpenPgn() },
        {
          label: 'Open Database…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => onOpenDatabase(),
        },
        {
          label: 'Open Recent',
          submenu:
            recentItems.length > 0
              ? [
                  ...recentItems,
                  { type: 'separator' },
                  { label: 'Clear Menu', click: () => onClearRecent() },
                ]
              : [{ label: 'No Recent Documents', enabled: false }],
        },
        { type: 'separator' },
        ...(mac
          ? [
              { label: 'Check for Updates…', click: () => onCheckForUpdates() },
              { type: 'separator' },
              { role: 'close' },
            ]
          : [
              {
                label: updateLabel,
                enabled: updateEnabled,
                click: () => onCheckForUpdates(),
              },
              { type: 'separator' },
              { label: 'Diagnostics…', click: () => onDiagnostics() },
              { role: 'quit' },
            ]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: mac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Kingfisher on GitHub',
          click: () => onOpenDocumentation(),
        },
        {
          label: 'Report an Issue…',
          click: () => onReportIssue(),
        },
        { type: 'separator' },
        { label: 'Diagnostics…', click: () => onDiagnostics() },
      ],
    },
  ];
}

function menuLabelForUpdate(status) {
  if (!status) return 'Check for Updates…';
  switch (status.status) {
    case 'idle':
      return 'Check for Updates…';
    case 'checking':
      return 'Checking for Updates…';
    case 'up-to-date':
      return 'Kingfisher Is Up to Date…';
    case 'available':
      return 'An Update Is Available…';
    case 'downloading':
      return 'Downloading Update…';
    case 'downloaded':
      return 'Verifying Update…';
    case 'verifying':
      return 'Verifying Update…';
    case 'ready':
      return 'Update Ready to Install…';
    case 'waiting-for-save':
      return 'Finishing Saving Your Work…';
    case 'installing':
      return 'Installing Update…';
    case 'restarting':
      return 'Restarting…';
    case 'canceled':
      return 'Update Canceled…';
    case 'failed':
      return 'Update Failed…';
    case 'unable-to-check':
      return 'Check for Updates…';
    default:
      return 'Check for Updates…';
  }
}

function menuEnabledForUpdate(status) {
  if (!status) return true;
  /*
    While a check is in flight or a download/install is active, the
    menu is disabled — the user has already asked, the request is
    running, and a second click would only be a single-flight no-op.
    Phase 36 widens this: once the user has committed to the install
    (waiting-for-save, installing, restarting), the menu reflects
    that commitment rather than inviting a new one.
  */
  return ![
    'checking',
    'downloading',
    'downloaded',
    'verifying',
    'ready',
    'waiting-for-save',
    'installing',
    'restarting',
  ].includes(status.status);
}

// The *Settings…* entry uses a callback the main process passes in, the
// same way *Check for Updates…* and the document openers do. A click on
// the menu item runs the callback; the callback is responsible for telling
// the renderer to open its settings dialog. The shell does not need to
// know what the settings URL is or that the settings dialog exists at
// all — the application does.

export { isMac };
