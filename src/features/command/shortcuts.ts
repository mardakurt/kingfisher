/**
 * Keyboard bindings.
 *
 * Declared as data so that the same table drives the handler, the shortcut
 * reference, the command palette and the rebinding screen. A shortcut that
 * exists only inside a `switch` is a shortcut nobody discovers — and, as
 * Phase 9 proved with `D`, a shortcut that can be documented for a whole phase
 * while doing nothing at all.
 *
 * `defaultBinding` is now the authority: `useGlobalHotkeys` resolves an event
 * to an action id through this table plus the user's overrides, rather than
 * matching keys itself. That is what makes rebinding possible without editing
 * the handler, and what makes a documented binding necessarily a real one.
 */

import type { Binding } from './bindings';

export type ShortcutGroup = 'Navigation' | 'Analysis' | 'Editing' | 'Interface';

export interface Shortcut {
  readonly id: string;
  readonly defaultBinding: Binding;
  readonly label: string;
  readonly group: ShortcutGroup;
  /**
   * Bindings the user must not take. `Escape` closes dialogs and is the way
   * out of focus mode; rebinding it is a way to lock yourself in.
   */
  readonly fixed?: boolean;
  /** Documentation-only rows: mouse gestures with no key to rebind. */
  readonly mouse?: boolean;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'back', defaultBinding: 'arrowleft', label: 'Previous move', group: 'Navigation' },
  { id: 'forward', defaultBinding: 'arrowright', label: 'Next move', group: 'Navigation' },
  {
    id: 'prev-variation',
    defaultBinding: 'arrowup',
    label: 'Previous variation',
    group: 'Navigation',
  },
  {
    id: 'next-variation',
    defaultBinding: 'arrowdown',
    label: 'Next variation',
    group: 'Navigation',
  },
  { id: 'start', defaultBinding: 'home', label: 'Start of game', group: 'Navigation' },
  { id: 'end', defaultBinding: 'end', label: 'End of line', group: 'Navigation' },

  { id: 'engine', defaultBinding: 'e', label: 'Start or stop the engine', group: 'Analysis' },
  { id: 'explorer', defaultBinding: 'd', label: 'Show the database explorer', group: 'Analysis' },
  { id: 'analysis', defaultBinding: 'a', label: 'Analyse this position', group: 'Analysis' },
  { id: 'model-games', defaultBinding: 'm', label: 'Show model games', group: 'Analysis' },
  {
    id: 'repertoire-tool',
    defaultBinding: 'r',
    label: 'Show repertoire decisions',
    group: 'Analysis',
  },
  {
    id: 'calculate',
    defaultBinding: 'shift+c',
    label: 'Calculate here, with evidence hidden',
    group: 'Analysis',
  },
  { id: 'flip', defaultBinding: 'f', label: 'Flip the board', group: 'Analysis' },

  { id: 'promote', defaultBinding: 'shift+arrowup', label: 'Move variation up', group: 'Editing' },
  {
    id: 'demote',
    defaultBinding: 'shift+arrowdown',
    label: 'Move variation down',
    group: 'Editing',
  },
  {
    id: 'promote-main',
    defaultBinding: 'shift+m',
    label: 'Promote to main line',
    group: 'Editing',
  },
  {
    id: 'delete',
    defaultBinding: 'delete',
    label: 'Delete move and everything after it',
    group: 'Editing',
  },
  { id: 'comment', defaultBinding: 'c', label: 'Edit the comment on this move', group: 'Editing' },
  {
    id: 'context-menu',
    defaultBinding: 'Right-click',
    label: 'Move actions in the notation window',
    group: 'Editing',
    mouse: true,
  },
  {
    id: 'nags',
    defaultBinding: '1 – 6',
    label: 'Annotate ! ? !! ?? !? ?!',
    group: 'Editing',
    mouse: true,
  },
  {
    id: 'clear-shapes',
    defaultBinding: 'x',
    label: 'Clear arrows and highlights',
    group: 'Editing',
  },
  { id: 'undo', defaultBinding: 'mod+z', label: 'Undo', group: 'Editing' },
  { id: 'redo', defaultBinding: 'shift+mod+z', label: 'Redo', group: 'Editing' },

  {
    id: 'save-to-study',
    defaultBinding: 'mod+s',
    label: 'Save this analysis to a study',
    group: 'Interface',
  },
  { id: 'palette', defaultBinding: 'mod+k', label: 'Command palette', group: 'Interface' },
  { id: 'shortcuts', defaultBinding: '?', label: 'Keyboard shortcuts', group: 'Interface' },
  { id: 'settings', defaultBinding: 'mod+,', label: 'Settings', group: 'Interface' },
  {
    id: 'focus-exit',
    defaultBinding: 'escape',
    label: 'Close dialogs and leave focus mode',
    group: 'Interface',
    fixed: true,
  },
];

/** Actions a user may rebind: real keys, not mouse gestures, not fixed. */
export const REBINDABLE_SHORTCUTS = SHORTCUTS.filter(
  (shortcut) => !shortcut.mouse && !shortcut.fixed,
);

export const shortcutById = (id: string): Shortcut | undefined =>
  SHORTCUTS.find((shortcut) => shortcut.id === id);

export const DEFAULT_BINDINGS: Readonly<Record<string, Binding>> = Object.fromEntries(
  REBINDABLE_SHORTCUTS.map((shortcut) => [shortcut.id, shortcut.defaultBinding]),
);

/** Board annotation is mouse-driven, but the modifiers deserve documenting. */
export const ANNOTATION_HINTS: readonly { keys: string; label: string }[] = [
  { keys: 'Right-drag', label: 'Draw a green arrow' },
  { keys: 'Right-click', label: 'Highlight a square' },
  { keys: '⇧ Right-drag', label: 'Red' },
  { keys: '⌥ Right-drag', label: 'Blue' },
  { keys: '⇧⌥ Right-drag', label: 'Yellow' },
];
