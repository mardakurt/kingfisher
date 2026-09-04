import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REBINDABLE_SHORTCUTS, SHORTCUTS } from '@/features/command/shortcuts';
import { WORKSPACE_MODULES, type WorkspaceToolId } from '@/features/workspace/modules';
import { STORE_NAMES } from '@/persistence/schema/migrations';
import { DEFAULT_PREFERENCES } from '@/stores/preferences-store';

import { SETTINGS_INDEX } from './settings-index';

/**
 * Configuration that is written but never read.
 *
 * Every phase of this project has found at least one: a preference the settings
 * panel wrote and nothing consulted, a workspace tool in a catalogue whose dock
 * never rendered it, a shortcut in the help dialog with no handler behind it.
 * They are all one bug — two lists that are supposed to agree, kept in
 * different files, drifting — and none of them shows up in a behavioural test,
 * because the behaviour that is missing is the behaviour nobody wrote.
 *
 * So these are structural tests and they read the source. That is unusual, and
 * it is the point: the relationship being asserted is between declarations, and
 * a test that exercised the feature could only catch the cases somebody had
 * already noticed enough to write one for.
 *
 * A failure here is not always "delete it". Sometimes it is "wire it up"; the
 * messages say which where they can.
 */

const SRC = path.join(process.cwd(), 'src');

function sourceFiles(): readonly { path: string; text: string }[] {
  const files: { path: string; text: string }[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      files.push({ path: path.relative(SRC, full), text: readFileSync(full, 'utf8') });
    }
  };
  walk(SRC);
  return files;
}

const FILES = sourceFiles();
const read = (relative: string) =>
  FILES.find((file) => file.path === relative.split('/').join(path.sep))?.text ?? '';

/** Files that may mention a name without that counting as using it. */
const isDeclarationSite = (file: { path: string }) =>
  file.path.includes('preferences-store') ||
  file.path.includes('settings-index') ||
  file.path.includes('settings-transfer') ||
  file.path.endsWith('.test.ts') ||
  file.path.endsWith('.test.tsx');

describe('every preference has a consumer', () => {
  /*
    A preference counts as read when some file outside the store, the settings
    index and the transfer helper mentions its key. Deliberately generous: the
    target is a key nothing anywhere refers to, which is the shape every dead
    setting this project has found has had.
  */
  it.each(Object.keys(DEFAULT_PREFERENCES))('%s is read somewhere', (key) => {
    const users = FILES.filter((file) => !isDeclarationSite(file) && file.text.includes(key));
    expect(
      users.length,
      `The preference "${key}" is stored and never read. Either wire it up, or remove it from ` +
        'DEFAULT_PREFERENCES, the settings panel and the settings index.',
    ).toBeGreaterThan(0);
  });

  it('sends the settings search only to sections that exist', () => {
    const dialog = read('features/shell/SettingsDialog.tsx');
    for (const section of new Set(SETTINGS_INDEX.map((entry) => entry.section))) {
      expect(
        dialog.includes(`'${section}'`),
        `The settings index sends people to the "${section}" section, which SettingsDialog does ` +
          'not define. The search box would jump to nothing.',
      ).toBe(true);
    }
  });
});

describe('every workspace tool has a renderer', () => {
  const renderer = read('features/workspace/ToolContent.tsx');

  it.each(Object.keys(WORKSPACE_MODULES))('%s is rendered', (id) => {
    /*
      `notes` is the fallback the renderer returns when nothing else matches,
      so it has no branch of its own — the one tool allowed not to appear in a
      comparison.
    */
    if (id === 'notes') {
      expect(renderer).toContain('NotesPanel');
      return;
    }
    expect(
      renderer.includes(`tool === '${id}'`),
      `The tool "${id}" is in the catalogue, so the dock offers it, and ToolContent has no ` +
        'branch for it. Selecting it would silently render the notes panel.',
    ).toBe(true);
  });

  it('renders no tool that is not in the catalogue', () => {
    for (const match of renderer.matchAll(/tool === '([a-z-]+)'/g)) {
      const id = match[1] as WorkspaceToolId;
      expect(
        Object.hasOwn(WORKSPACE_MODULES, id),
        `ToolContent renders "${id}", which is not in WORKSPACE_MODULES, so no dock can ever ` +
          'select it. Add it to the catalogue or delete the branch.',
      ).toBe(true);
    }
  });

  it('starts every module in a region it is allowed to be in', () => {
    for (const tool of Object.values(WORKSPACE_MODULES)) {
      expect(tool.regions.length, `"${tool.id}" may live nowhere.`).toBeGreaterThan(0);
      expect(tool.regions, `"${tool.id}" starts somewhere it may not be.`).toContain(tool.home);
    }
  });
});

describe('every documented shortcut maps to an action', () => {
  const hotkeys = read('features/command/useGlobalHotkeys.ts');

  it.each(REBINDABLE_SHORTCUTS.map((shortcut) => shortcut.id))('%s has a handler', (id) => {
    expect(
      hotkeys.includes(`case '${id}'`),
      `The shortcuts dialog documents "${id}" and useGlobalHotkeys has no case for it. A key ` +
        'printed in help that does nothing is worse than one that is not printed.',
    ).toBe(true);
  });

  /*
    Mouse gestures and Escape are documented but are not global hotkeys: the
    first are handled where the gesture happens, the second by whichever dialog
    is open. They still have to exist, so each names the implementation that
    proves it — an excuse that cannot go stale silently.
  */
  const IMPLEMENTED_ELSEWHERE: Readonly<Record<string, string>> = {
    'context-menu': 'onContextMenu',
    nags: 'toggleNag',
    'focus-exit': "=== 'Escape'",
  };

  it.each(SHORTCUTS.filter((entry) => entry.mouse || entry.fixed).map((entry) => entry.id))(
    '%s is implemented where its gesture happens',
    (id) => {
      const marker = IMPLEMENTED_ELSEWHERE[id];
      expect(
        marker,
        `"${id}" is documented as a gesture or a fixed key and this audit does not know where ` +
          'it is implemented. Name the implementation so a future removal is caught here.',
      ).toBeTruthy();
      expect(
        FILES.some((file) => file.text.includes(marker as string)),
        `The shortcuts dialog documents "${id}" and nothing in src/ implements it.`,
      ).toBe(true);
    },
  );

  it('handles no shortcut it does not document', () => {
    const documented = new Set(SHORTCUTS.map((shortcut) => shortcut.id));
    for (const match of hotkeys.matchAll(/case '([a-z-]+)':/g)) {
      expect(
        documented.has(match[1] as string),
        `useGlobalHotkeys handles "${match[1]}", which the shortcuts dialog does not list. An ` +
          'undocumented key is a key nobody finds.',
      ).toBe(true);
    }
  });

  it('gives every shortcut a group, a label and a binding', () => {
    for (const shortcut of SHORTCUTS) {
      // "Undo" is four characters and is a perfectly good label.
      expect(shortcut.label.length, `"${shortcut.id}" has no label.`).toBeGreaterThan(2);
      expect(shortcut.defaultBinding.length, `"${shortcut.id}" has no binding.`).toBeGreaterThan(0);
      expect(shortcut.group, `"${shortcut.id}" has no group.`).toBeTruthy();
    }
  });

  it('binds no two rebindable shortcuts to the same key by default', () => {
    const seen = new Map<string, string>();
    for (const shortcut of REBINDABLE_SHORTCUTS) {
      const key = shortcut.defaultBinding.toLowerCase();
      const owner = seen.get(key);
      expect(
        owner,
        `"${shortcut.id}" and "${owner}" both default to ${key}; one of them can never fire.`,
      ).toBeUndefined();
      seen.set(key, shortcut.id);
    }
  });
});

describe('every store has a consumer', () => {
  it.each(Object.values(STORE_NAMES))('%s is read or written outside the schema', (store) => {
    const users = FILES.filter(
      (file) =>
        !file.path.includes(path.join('schema', 'migrations')) &&
        !file.path.endsWith('.test.ts') &&
        file.text.includes(`STORE_NAMES.${store}`),
    );
    expect(
      users.length,
      `The "${store}" store is created by a migration and nothing uses it. A store nobody reads ` +
        'is schema somebody has to keep migrating for no reason.',
    ).toBeGreaterThan(0);
  });
});

describe('the settings index describes settings that exist', () => {
  const surfaces =
    read('features/shell/SettingsDialog.tsx') + read('features/shell/TablebaseSettings.tsx');

  it.each(SETTINGS_INDEX.map((entry) => entry.id))('%s is a real control', (id) => {
    const entry = SETTINGS_INDEX.find((candidate) => candidate.id === id);
    const asPreference = Object.keys(DEFAULT_PREFERENCES).some(
      (key) => key.toLowerCase() === id.replaceAll('-', '').toLowerCase(),
    );
    const mentioned = surfaces.includes(id) || surfaces.includes(entry?.label ?? ' ');
    /*
      Two keywords rather than one. The dialog is two thousand lines of JSX and
      exact-label matching would be a spelling test rather than a wiring test —
      but an entry whose subject has been removed will not leave two of its own
      keywords behind in the settings surfaces.
    */
    const keywordHits = (entry?.keywords ?? []).filter((word) =>
      surfaces.toLowerCase().includes(word.toLowerCase()),
    ).length;

    expect(
      asPreference || mentioned || keywordHits >= 2,
      `The settings index lists "${id}" (${entry?.label}), and neither the settings dialog nor ` +
        'the preferences carry anything resembling it. Search would send somebody to a section ' +
        'that does not contain it.',
    ).toBe(true);
  });
});
