/**
 * Every menu item leads somewhere.
 *
 * Phase 19's rule about dead controls applies to the shell as much as to the
 * application, and a menu is the easiest place in a desktop app to add one
 * that does nothing. So this walks the whole template and requires that each
 * leaf is either a real Electron role or an item with a handler.
 */

import { describe, expect, it, vi } from 'vitest';

import { buildTemplate } from './menu.mjs';

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
      const labels = leaves(buildTemplate({ platform })).map(
        (item) => item.label ?? item.role ?? '',
      );
      expect(
        labels.some((label) => label === 'quit'),
        platform,
      ).toBe(true);
      expect(
        labels.some((label) => label === 'Diagnostics…'),
        platform,
      ).toBe(true);
    }
  });
});
