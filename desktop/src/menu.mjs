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

import { GO_SECTIONS, MENU_COMMANDS } from './menu-commands.mjs';

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
  /**
   * A packaged application does not offer Developer Tools in its menu: a
   * chess workstation's users have no use for them, and the documentation
   * had said "dev only" while every packaged build shipped the item.
   */
  packaged = false,
  /**
   * Phase 84: the application's own commands (tabs, the sidebar, the
   * palette, the Go menu), sent to the renderer by id. See menu-commands.mjs.
   */
  onMenuCommand = () => {},
  /** Back and forward through the window's own history. */
  onNavigate = () => {},
  /** The theme the renderer last reported, for the Appearance radio items. */
  appearance = 'light',
  onSetAppearance = () => {},
} = {}) {
  const mac = platform === 'darwin';
  const command = (id) => () => onMenuCommand(id);
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
              /*
                The role items name the application after `app.name`, which
                is the package name — `kingfisher-desktop` — and cannot be
                changed without moving the profile directory that is derived
                from it (`~/Library/Application Support/kingfisher-desktop/`),
                which would strand every user's work. So the three items that
                name the application are labelled here with the product name.
                Every packaged build from Phase 19 to Phase 45 read "About
                kingfisher-desktop", "Hide kingfisher-desktop" and "Quit
                kingfisher-desktop"; the menu walk photographed it.
              */
              { role: 'about', label: `About ${appName}` },
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
              { role: 'hide', label: `Hide ${appName}` },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit', label: `Quit ${appName}` },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: command(MENU_COMMANDS.newTab) },
        {
          label: 'New Analysis',
          accelerator: 'CmdOrCtrl+N',
          click: command(MENU_COMMANDS.newAnalysis),
        },
        { type: 'separator' },
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
        {
          label: 'Import Game or Position…',
          accelerator: 'Shift+CmdOrCtrl+I',
          click: command(MENU_COMMANDS.importGame),
        },
        { type: 'separator' },
        ...(mac
          ? [
              { label: 'Check for Updates…', click: () => onCheckForUpdates() },
              { type: 'separator' },
              /*
                ⌘W closes the tab, as in every Mac application with tabs;
                the window is ⇧⌘W. Before Phase 84 ⌘W was the `close`
                role and took the window, and every tab, with it. The last
                tab stays: the renderer's command keeps one tab open.
              */
              { label: 'Close Tab', accelerator: 'Cmd+W', click: command(MENU_COMMANDS.closeTab) },
              { role: 'close', label: 'Close Window', accelerator: 'Shift+Cmd+W' },
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
        {
          label: 'Toggle Sidebar',
          accelerator: mac ? 'Ctrl+Cmd+S' : 'Ctrl+Shift+S',
          click: command(MENU_COMMANDS.toggleSidebar),
        },
        /*
          ⌘K is the renderer's own binding, and a person can rebind it in
          Settings. The menu shows it and does not take it
          (`registerAccelerator: false`), so the key still reaches the page
          and a rebinding is not overruled by the menu.
        */
        {
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+K',
          registerAccelerator: false,
          click: command(MENU_COMMANDS.palette),
        },
        { label: 'Keyboard Shortcuts', click: command(MENU_COMMANDS.shortcuts) },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: [
            {
              label: 'Light',
              type: 'radio',
              checked: appearance !== 'dark',
              click: () => onSetAppearance('light'),
            },
            {
              label: 'Dark',
              type: 'radio',
              checked: appearance === 'dark',
              click: () => onSetAppearance('dark'),
            },
          ],
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(packaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Go',
      submenu: [
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => onNavigate('back') },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => onNavigate('forward') },
        { type: 'separator' },
        ...GO_SECTIONS.map((section) => ({
          label: section.label,
          click: command(section.command),
        })),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(mac ? [{ role: 'zoom' }] : []),
        { type: 'separator' },
        {
          label: 'Show Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: command(MENU_COMMANDS.previousTab),
        },
        { label: 'Show Next Tab', accelerator: 'Ctrl+Tab', click: command(MENU_COMMANDS.nextTab) },
        /*
          Safari's second pair, ⇧⌘[ and ⇧⌘]. Hidden so the menu lists each
          command once; `acceleratorWorksWhenHidden` keeps the keys live.
        */
        ...(mac
          ? [
              {
                label: 'Show Previous Tab',
                accelerator: 'Shift+Cmd+[',
                visible: false,
                acceleratorWorksWhenHidden: true,
                click: command(MENU_COMMANDS.previousTab),
              },
              {
                label: 'Show Next Tab',
                accelerator: 'Shift+Cmd+]',
                visible: false,
                acceleratorWorksWhenHidden: true,
                click: command(MENU_COMMANDS.nextTab),
              },
            ]
          : []),
        { label: 'Duplicate Tab', click: command(MENU_COMMANDS.duplicateTab) },
        { type: 'separator' },
        ...(mac ? [{ role: 'front' }] : [{ role: 'close' }]),
      ],
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

/**
 * The Dock menu (macOS): the two things a person starts from the Dock with
 * the window elsewhere — a new tab and a new analysis — by the same commands
 * as the File menu. The window comes forward to show them.
 */
export function buildDockTemplate({ onMenuCommand = () => {} } = {}) {
  return [
    { label: 'New Tab', click: () => onMenuCommand(MENU_COMMANDS.newTab) },
    { label: 'New Analysis', click: () => onMenuCommand(MENU_COMMANDS.newAnalysis) },
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
