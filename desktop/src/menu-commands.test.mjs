/**
 * Every command the Mac menu sends is one the renderer runs.
 *
 * The menu names the application's commands by id and the renderer looks the
 * id up (`src/features/command/useMenuCommands.ts`). An id that matches
 * nothing is a menu item that does nothing — the dead control the menu test
 * exists to prevent, one process removed. The renderer's commands are built
 * inside a React hook, so this reads its source, the way the bridge contract
 * checks its callers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GO_SECTIONS, MENU_COMMAND_CHANNEL, MENU_COMMANDS } from './menu-commands.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(HERE, relative), 'utf8');

const paletteSource = read('../../src/features/command/useCommands.ts');
const menuSource = read('../../src/features/command/useMenuCommands.ts');
const navigationSource = read('../../src/features/shell/navigation.ts');

const paletteIds = new Set([...paletteSource.matchAll(/\bid: '([a-z0-9-]+)'/g)].map((m) => m[1]));
const interfaceIds = new Set(
  [...menuSource.matchAll(/^\s+'?([a-z-]+)'?: \(\) =>/gm)].map((m) => m[1]),
);
/** The sidebar's sections, id and label, as navigation.ts declares them. */
const sections = [...navigationSource.matchAll(/id: '([a-z-]+)',\s*label: '([^']+)'/g)].map(
  (m) => ({ id: m[1], label: m[2] }),
);

describe('the menu’s commands', () => {
  it('reads the renderer’s commands at all', () => {
    // Guards the regular expressions: an empty set would pass everything below.
    expect(paletteIds.has('tab-new')).toBe(true);
    expect(interfaceIds.has('palette')).toBe(true);
    expect(sections.find((s) => s.id === 'games')?.label).toBe('Library');
  });

  it.each(Object.entries(MENU_COMMANDS))('%s (%s) is a command the renderer runs', (_name, id) => {
    expect(paletteIds.has(id) || interfaceIds.has(id), id).toBe(true);
  });

  it.each(GO_SECTIONS)('Go → $label opens that sidebar section', ({ label, command }) => {
    // The palette's navigation commands are `goto-<section id>`, one per section.
    expect(paletteSource).toContain('id: `goto-${section.id}`');
    const section = sections.find((candidate) => `goto-${candidate.id}` === command);
    expect(section, command).toBeDefined();
    expect(section.label).toBe(label);
  });

  it('travels on the channel the preload listens on', () => {
    const preload = read('preload.cjs');
    expect(preload).toContain(`on('${MENU_COMMAND_CHANNEL}'`);
    expect(preload).toContain("ipcRenderer.send('kingfisher:appearance'");
    expect(read('main.mjs')).toContain("ipcMain.on('kingfisher:appearance'");
  });
});
