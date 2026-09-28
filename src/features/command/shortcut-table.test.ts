/**
 * Every binding in the table is a binding that does something.
 *
 * Phase 9 documented `D` as "show the database explorer" for a whole phase
 * while it set a field nothing read. `bindings.ts` was written to make that
 * class of defect impossible — the handler resolves an event through the same
 * table the reference dialog renders — but only if every row in the table is
 * actually reached. A row with no `case` is documented, rebindable, shown in
 * ⌘? and does nothing, which is precisely the fault the table exists to
 * prevent, and nothing else in the suite would have noticed.
 *
 * This reads the handler's source rather than duplicating its logic, because
 * duplicating it would be a second implementation to keep in step — and a test
 * that passes because it agrees with a stale copy is worse than no test. The
 * table is the contract; the source is the implementation; this asserts the
 * second covers the first.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { REBINDABLE_SHORTCUTS, SHORTCUTS } from './shortcuts';

const handler = readFileSync(path.resolve(__dirname, 'useGlobalHotkeys.ts'), 'utf8');

/** The action ids the `switch` in the handler actually has a case for. */
const handled = new Set(
  [...handler.matchAll(/^\s*case '([a-z0-9-]+)':/gm)].map((match) => match[1] as string),
);

describe('the shortcut table and the handler agree', () => {
  it.each(REBINDABLE_SHORTCUTS.map((shortcut) => [shortcut.id, shortcut.label] as const))(
    '%s (%s) is handled, not just documented',
    (id) => {
      expect(handled.has(id), `no case for '${id}' in useGlobalHotkeys`).toBe(true);
    },
  );

  it('binds no key to two actions', () => {
    // `findConflicts` reports these for the settings screen; this is the same
    // fact asserted where a default can introduce one.
    const seen = new Map<string, string[]>();
    for (const shortcut of REBINDABLE_SHORTCUTS) {
      const list = seen.get(shortcut.defaultBinding) ?? [];
      list.push(shortcut.id);
      seen.set(shortcut.defaultBinding, list);
    }
    const clashes = [...seen.entries()].filter(([, ids]) => ids.length > 1);
    expect(clashes, JSON.stringify(clashes)).toEqual([]);
  });

  it('gives every new window-level key a label a person can read', () => {
    // The tab keys are the ones asked for by name, so they are the ones that
    // must be findable in ⌘? and in the rebinding screen.
    const tabs = SHORTCUTS.filter((shortcut) => shortcut.group === 'Tabs');
    expect(tabs.map((shortcut) => shortcut.id).sort()).toEqual([
      'tab-close',
      'tab-duplicate',
      'tab-new',
      'tab-next',
      'tab-previous',
    ]);
    for (const tab of tabs) {
      expect(tab.label, tab.id).toMatch(/tab/i);
      expect(tab.defaultBinding.startsWith('mod+'), tab.id).toBe(true);
    }
  });
});
