/**
 * Every menu item leads somewhere.
 *
 * Phase 19's rule about dead controls applies to the shell as much as to the
 * application, and a menu is the easiest place in a desktop app to add one
 * that does nothing. So this walks the whole template and requires that each
 * leaf is either a real Electron role or an item with a handler.
 */

import { describe, expect, it, vi } from 'vitest';

import { GO_SECTIONS, MENU_COMMANDS } from './menu-commands.mjs';
import { buildDockTemplate, buildTemplate } from './menu.mjs';

const leaves = (items, trail = []) =>
  items.flatMap((item) =>
    item.submenu ? leaves(item.submenu, [...trail, item.label]) : [{ ...item, trail }],
  );

describe('the application menu', () => {
  it('has no item that does nothing', () => {
    for (const item of leaves(buildTemplate({ platform: 'darwin' }))) {
      if (item.type === 'separator') continue;
      const wired =
        Boolean(item.role) || typeof item.click === 'function' || item.enabled === false;
      expect(wired, `${[...item.trail, item.label].join(' → ')} leads nowhere`).toBe(true);
    }
  });

  it('opens a PGN and a database from File, and calls the handler it was given', () => {
    const onOpenPgn = vi.fn();
    const onOpenDatabase = vi.fn();
    const file = buildTemplate({ platform: 'darwin', onOpenPgn, onOpenDatabase }).find(
      (item) => item.label === 'File',
    );
    const pgn = file.submenu.find((item) => item.label === 'Open PGN…');
    const database = file.submenu.find((item) => item.label === 'Open Database…');
    expect(pgn.accelerator).toBe('CmdOrCtrl+O');
    pgn.click();
    database.click();
    expect(onOpenPgn).toHaveBeenCalledOnce();
    expect(onOpenDatabase).toHaveBeenCalledOnce();
  });

  /*
    An empty "Open Recent" that looks clickable is the dead control this test
    exists to prevent; a disabled label is the honest version of nothing.
  */
  it('says there is nothing recent rather than offering an empty list', () => {
    const file = buildTemplate({ platform: 'darwin' }).find((item) => item.label === 'File');
    const recent = file.submenu.find((item) => item.label === 'Open Recent');
    expect(recent.submenu).toEqual([{ label: 'No Recent Documents', enabled: false }]);
  });

  it('opens a recent document by its own path', () => {
    const onOpenRecent = vi.fn();
    const file = buildTemplate({
      platform: 'darwin',
      onOpenRecent,
      recent: [
        { path: '/games/a.pgn', name: 'a.pgn', kind: 'pgn' },
        { path: '/db/b.sqlite', name: 'b.sqlite', kind: 'database' },
      ],
    }).find((item) => item.label === 'File');
    const recent = file.submenu.find((item) => item.label === 'Open Recent');
    expect(recent.submenu.map((item) => item.label)).toEqual([
      'a.pgn',
      'b.sqlite',
      undefined,
      'Clear Menu',
    ]);
    expect(recent.submenu[1].sublabel).toBe('Database');
    recent.submenu[0].click();
    expect(onOpenRecent).toHaveBeenCalledWith('/games/a.pgn');
  });

  /*
    Quit and Diagnostics live in the application menu on macOS and in File
    everywhere else. Losing one on the platform that does not have an
    application menu is the mistake this catches.
  */
  it('keeps Quit and Diagnostics reachable on every platform', () => {
    for (const platform of ['darwin', 'win32', 'linux']) {
      const items = leaves(buildTemplate({ platform }));
      const labels = items.map((item) => item.label ?? item.role ?? '');
      expect(
        items.some((item) => item.role === 'quit'),
        platform,
      ).toBe(true);
      expect(
        labels.some((label) => label === 'Diagnostics…'),
        platform,
      ).toBe(true);
    }
  });

  /*
    Phase 35: *Check for Updates…* is the primary updater surface. The
    owner explicitly asked for it to live directly in the Kingfisher
    application menu on macOS, and the menu is the only place this test
    stands between the next agent and a quiet "the menu looked tidier
    without it" regression. Removing the item must make the test fail.
  */
  it('keeps a "Check for Updates…" entry in the macOS application menu', () => {
    const root = buildTemplate({ platform: 'darwin' });
    const application = root[0];
    expect(application.label).toBe('Kingfisher');
    const updateItem = application.submenu.find(
      (entry) => typeof entry.label === 'string' && entry.label.startsWith('Check for Updates'),
    );
    expect(updateItem, 'macOS application menu must offer Check for Updates…').toBeDefined();
    expect(typeof updateItem.click).toBe('function');
  });

  it('disables the menu entry while an update is already in flight', () => {
    const onCheckForUpdates = vi.fn();
    const root = buildTemplate({
      platform: 'darwin',
      onCheckForUpdates,
      updateStatus: { status: 'checking' },
    });
    const updateItem = root[0].submenu.find(
      (entry) => typeof entry.label === 'string' && entry.label.startsWith('Checking for Updates'),
    );
    expect(updateItem.enabled).toBe(false);
    updateItem.click();
    // Click still routes to the handler — disabled is visual, not a
    // no-op, so a tester (or the keyboard menu accelerator) can still
    // reach the same code path.
    expect(onCheckForUpdates).toHaveBeenCalledOnce();
  });

  it('reaches the same handler from File on every platform', () => {
    const onCheckForUpdates = vi.fn();
    for (const platform of ['darwin', 'win32', 'linux']) {
      onCheckForUpdates.mockClear();
      const file = buildTemplate({ platform, onCheckForUpdates }).find(
        (entry) => entry.label === 'File',
      );
      const updateItem = file.submenu.find(
        (entry) => typeof entry.label === 'string' && entry.label.includes('Update'),
      );
      expect(updateItem, `${platform} File menu must offer an Update entry`).toBeDefined();
      expect(typeof updateItem.click).toBe('function');
      updateItem.click();
      expect(onCheckForUpdates).toHaveBeenCalledOnce();
    }
  });

  it('offers Developer Tools from a checkout and not from a packaged application', () => {
    const view = (packaged) =>
      buildTemplate({ platform: 'darwin', packaged })
        .find((item) => item.label === 'View')
        .submenu.map((item) => item.role);
    expect(view(false)).toContain('toggleDevTools');
    expect(view(true)).not.toContain('toggleDevTools');
    // Everything else in View is the same either way.
    expect(view(true)).toEqual(view(false).filter((role) => role !== 'toggleDevTools'));
  });

  it('names the application by its product name, never by the package name', () => {
    const template = buildTemplate({ platform: 'darwin', appName: 'Kingfisher' });
    const application = template[0];
    const labels = application.submenu.filter((item) => item.label).map((item) => item.label);
    expect(application.label).toBe('Kingfisher');
    expect(labels).toEqual(
      expect.arrayContaining(['About Kingfisher', 'Hide Kingfisher', 'Quit Kingfisher']),
    );
    expect(JSON.stringify(template)).not.toContain('kingfisher-desktop');
  });

  describe("the application's own commands (Phase 84)", () => {
    const find = (template, trail) =>
      trail.reduce((items, label, index) => {
        const item = items.find((candidate) => candidate.label === label);
        expect(item, trail.slice(0, index + 1).join(' → ')).toBeDefined();
        return index === trail.length - 1 ? item : item.submenu;
      }, template);

    it('closes a tab with ⌘W and the window with ⇧⌘W', () => {
      const onMenuCommand = vi.fn();
      const template = buildTemplate({ platform: 'darwin', onMenuCommand });
      const closeTab = find(template, ['File', 'Close Tab']);
      expect(closeTab.accelerator).toBe('Cmd+W');
      expect(closeTab.role).toBeUndefined();
      closeTab.click();
      expect(onMenuCommand).toHaveBeenCalledWith(MENU_COMMANDS.closeTab);
      const closeWindow = find(template, ['File', 'Close Window']);
      expect(closeWindow).toMatchObject({ role: 'close', accelerator: 'Shift+Cmd+W' });
      // No other item may claim ⌘W, or the window would still close first.
      const claims = leaves(template).filter((item) => item.accelerator === 'Cmd+W');
      expect(claims).toHaveLength(1);
    });

    it.each([
      [['File', 'New Tab'], 'CmdOrCtrl+T', MENU_COMMANDS.newTab],
      [['File', 'New Analysis'], 'CmdOrCtrl+N', MENU_COMMANDS.newAnalysis],
      [['File', 'Import Game or Position…'], 'Shift+CmdOrCtrl+I', MENU_COMMANDS.importGame],
      [['View', 'Toggle Sidebar'], 'Ctrl+Cmd+S', MENU_COMMANDS.toggleSidebar],
      [['Window', 'Show Next Tab'], 'Ctrl+Tab', MENU_COMMANDS.nextTab],
      [['Window', 'Show Previous Tab'], 'Ctrl+Shift+Tab', MENU_COMMANDS.previousTab],
    ])('%s is %s and runs the renderer command', (trail, accelerator, id) => {
      const onMenuCommand = vi.fn();
      const item = find(buildTemplate({ platform: 'darwin', onMenuCommand }), trail);
      expect(item.accelerator).toBe(accelerator);
      item.click();
      expect(onMenuCommand).toHaveBeenCalledWith(id);
    });

    it('shows ⌘K for the palette without taking the key from the page', () => {
      const palette = find(buildTemplate({ platform: 'darwin' }), ['View', 'Command Palette…']);
      expect(palette.accelerator).toBe('CmdOrCtrl+K');
      expect(palette.registerAccelerator).toBe(false);
    });

    it("keeps Safari's ⇧⌘[ and ⇧⌘] live without listing the commands twice", () => {
      const window = find(buildTemplate({ platform: 'darwin' }), ['Window']).submenu;
      const hidden = window.filter((item) => item.visible === false);
      expect(hidden.map((item) => item.accelerator)).toEqual(['Shift+Cmd+[', 'Shift+Cmd+]']);
      expect(hidden.every((item) => item.acceleratorWorksWhenHidden === true)).toBe(true);
    });

    it('checks the theme the renderer reported, and sets the one chosen', () => {
      const onSetAppearance = vi.fn();
      const appearance = find(
        buildTemplate({ platform: 'darwin', appearance: 'dark', onSetAppearance }),
        ['View', 'Appearance'],
      ).submenu;
      expect(appearance.map((item) => [item.label, item.type, item.checked])).toEqual([
        ['Light', 'radio', false],
        ['Dark', 'radio', true],
      ]);
      appearance[0].click();
      expect(onSetAppearance).toHaveBeenCalledWith('light');
    });

    it("goes back, forward and to the sidebar's main sections", () => {
      const onNavigate = vi.fn();
      const onMenuCommand = vi.fn();
      const go = find(buildTemplate({ platform: 'darwin', onNavigate, onMenuCommand }), [
        'Go',
      ]).submenu;
      go.find((item) => item.label === 'Back').click();
      go.find((item) => item.label === 'Forward').click();
      expect(onNavigate.mock.calls).toEqual([['back'], ['forward']]);
      for (const section of GO_SECTIONS) go.find((item) => item.label === section.label).click();
      expect(onMenuCommand.mock.calls.map(([id]) => id)).toEqual(GO_SECTIONS.map((s) => s.command));
    });
  });

  it("offers a new tab and a new analysis from the Dock, by the File menu's commands", () => {
    const onMenuCommand = vi.fn();
    const dock = buildDockTemplate({ onMenuCommand });
    expect(dock.map((item) => item.label)).toEqual(['New Tab', 'New Analysis']);
    for (const item of dock) item.click();
    expect(onMenuCommand.mock.calls).toEqual([[MENU_COMMANDS.newTab], [MENU_COMMANDS.newAnalysis]]);
  });
});
