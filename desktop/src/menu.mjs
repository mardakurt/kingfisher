/**
 * The application menu.
 *
 * Built as data from the state the shell holds, so that "Open Recent" is the
 * same list the renderer sees rather than a second one that drifts from it.
 * Exported as a template rather than installed here so it can be asserted on
 * without an Electron window: every item this file adds has to lead somewhere,
 * and `menu.test.mjs` is what checks that none of them is decorative.
 */

const isMac = process.platform === 'darwin';

export function buildTemplate({
  recent = [],
  onOpenPgn = () => {},
  onOpenDatabase = () => {},
  onOpenRecent = () => {},
  onClearRecent = () => {},
  onDiagnostics = () => {},
  appName = 'Kingfisher',
  platform = process.platform,
} = {}) {
  const mac = platform === 'darwin';
  const recentItems = recent.map((entry) => ({
    label: entry.name,
    // `sublabel` is macOS-only and ignored elsewhere; it is what makes two
    // files with the same name distinguishable without printing a full path.
    sublabel: entry.kind === 'database' ? 'Database' : 'PGN',
    click: () => onOpenRecent(entry.path),
  }));

  return [
    ...(mac
      ? [
          {
            label: appName,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Diagnostics…', click: () => onDiagnostics() },
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
          ? [{ role: 'close' }]
          : [{ label: 'Diagnostics…', click: () => onDiagnostics() }, { role: 'quit' }]),
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
  ];
}

export { isMac };
