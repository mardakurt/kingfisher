import { describe, expect, it } from 'vitest';

import {
  bindingFromEvent,
  conflictsWith,
  findConflicts,
  formatBinding,
  matchesBinding,
  parseBinding,
  resolveAction,
} from './bindings';

const event = (key: string, options: { shift?: boolean; meta?: boolean; ctrl?: boolean } = {}) => ({
  key,
  shiftKey: options.shift ?? false,
  metaKey: options.meta ?? false,
  ctrlKey: options.ctrl ?? false,
});

describe('parseBinding', () => {
  it('reads a bare key', () => {
    expect(parseBinding('f')).toEqual({ key: 'f', shift: false, meta: false });
  });

  it('reads modifiers in either order', () => {
    expect(parseBinding('shift+mod+z')).toEqual({ key: 'z', shift: true, meta: true });
    expect(parseBinding('mod+shift+z')).toEqual({ key: 'z', shift: true, meta: true });
  });

  it('refuses a modifier with no key', () => {
    expect(parseBinding('shift')).toBeNull();
    expect(parseBinding('')).toBeNull();
  });

  it('refuses a modifier it does not know, rather than ignoring it', () => {
    // Silently dropping `hyper` would store a binding that never fires.
    expect(parseBinding('hyper+k')).toBeNull();
  });
});

describe('bindingFromEvent', () => {
  it('records the platform modifier as one name', () => {
    expect(bindingFromEvent(event('k', { meta: true }))).toBe('mod+k');
    expect(bindingFromEvent(event('k', { ctrl: true }))).toBe('mod+k');
  });

  it('records shift on a letter, where it does not change the key', () => {
    expect(bindingFromEvent(event('C', { shift: true }))).toBe('shift+c');
  });

  /*
    On `?` the shift is how the character is typed at all, so recording it
    would store `shift+?`, which no event can ever match.
  */
  it('does not record shift on a key shift already produced', () => {
    expect(bindingFromEvent(event('?', { shift: true }))).toBe('?');
  });
});

describe('matchesBinding', () => {
  it('matches the event it was recorded from', () => {
    expect(matchesBinding('shift+c', event('C', { shift: true }))).toBe(true);
    expect(matchesBinding('mod+k', event('k', { meta: true }))).toBe(true);
  });

  it('distinguishes C from shift+C, which are different commands', () => {
    expect(matchesBinding('c', event('c'))).toBe(true);
    expect(matchesBinding('c', event('C', { shift: true }))).toBe(false);
    expect(matchesBinding('shift+c', event('c'))).toBe(false);
  });

  it('does not fire a plain key when the platform modifier is held', () => {
    // Otherwise ⌘F, the browser's find, would also flip the board.
    expect(matchesBinding('f', event('f', { meta: true }))).toBe(false);
  });

  it('matches named keys', () => {
    expect(matchesBinding('arrowleft', event('ArrowLeft'))).toBe(true);
  });
});

describe('conflicts', () => {
  it('reports a binding two actions claim', () => {
    const conflicts = findConflicts({ comment: 'c', calculate: 'c', flip: 'f' });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.binding).toBe('c');
    expect(conflicts[0]?.actions).toEqual(['comment', 'calculate']);
  });

  it('reports nothing when every binding is distinct', () => {
    expect(findConflicts({ comment: 'c', flip: 'f' })).toEqual([]);
  });

  it('ignores actions deliberately left unbound', () => {
    expect(findConflicts({ comment: '', flip: '' })).toEqual([]);
  });

  it('names who already holds a binding, so the warning can say so', () => {
    // "C is already assigned to Comment" needs the other action's id.
    expect(conflictsWith({ comment: 'c', flip: 'f' }, 'calculate', 'c')).toEqual(['comment']);
  });

  it('does not report an action conflicting with itself', () => {
    expect(conflictsWith({ comment: 'c' }, 'comment', 'c')).toEqual([]);
  });
});

describe('resolveAction', () => {
  it('routes an event to the action that holds its binding', () => {
    const bindings = { flip: 'f', comment: 'c', palette: 'mod+k' };
    expect(resolveAction(bindings, event('f'))).toBe('flip');
    expect(resolveAction(bindings, event('k', { meta: true }))).toBe('palette');
  });

  it('returns nothing for an unbound key rather than guessing', () => {
    expect(resolveAction({ flip: 'f' }, event('q'))).toBeNull();
  });

  it('reflects a rebind without the handler being edited', () => {
    // The point of the whole module: the table is authoritative.
    expect(resolveAction({ flip: 'q' }, event('q'))).toBe('flip');
    expect(resolveAction({ flip: 'q' }, event('f'))).toBeNull();
  });
});

describe('formatBinding', () => {
  it('renders what a human reads', () => {
    expect(formatBinding('shift+c')).toBe('⇧C');
    expect(formatBinding('mod+k')).toBe('⌘K');
    expect(formatBinding('arrowleft')).toBe('←');
    expect(formatBinding('mod+k', 'other')).toBe('Ctrl+K');
  });
});
