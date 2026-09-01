/**
 * Keyboard bindings.
 *
 * Declared as data so that the same table drives the handler, the shortcut
 * reference and the command palette. A shortcut that exists only inside a
 * `switch` is a shortcut nobody discovers.
 */

export interface Shortcut {
  readonly id: string;
  readonly keys: string;
  readonly label: string;
  readonly group: 'Navigation' | 'Analysis' | 'Editing' | 'Interface';
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'back', keys: '←', label: 'Previous move', group: 'Navigation' },
  { id: 'forward', keys: '→', label: 'Next move', group: 'Navigation' },
  { id: 'prev-variation', keys: '↑', label: 'Previous variation', group: 'Navigation' },
  { id: 'next-variation', keys: '↓', label: 'Next variation', group: 'Navigation' },
  { id: 'start', keys: 'Home', label: 'Start of game', group: 'Navigation' },
  { id: 'end', keys: 'End', label: 'End of line', group: 'Navigation' },

  { id: 'engine', keys: 'E', label: 'Start or stop the engine', group: 'Analysis' },
  { id: 'explorer', keys: 'D', label: 'Show the database explorer', group: 'Analysis' },
  { id: 'flip', keys: 'F', label: 'Flip the board', group: 'Analysis' },

  { id: 'promote', keys: '⇧P', label: 'Move variation up', group: 'Editing' },
  {
    id: 'move-variation',
    keys: '⇧↑ ⇧↓',
    label: 'Reorder variation among its siblings',
    group: 'Editing',
  },
  { id: 'promote-main', keys: '⇧M', label: 'Promote to main line', group: 'Editing' },
  { id: 'delete', keys: 'Delete', label: 'Delete move and everything after it', group: 'Editing' },
  { id: 'comment', keys: 'C', label: 'Edit the comment on this move', group: 'Editing' },
  {
    id: 'context-menu',
    keys: 'Right-click',
    label: 'Move actions in the notation window',
    group: 'Editing',
  },
  { id: 'nags', keys: '1 – 6', label: 'Annotate ! ? !! ?? !? ?!', group: 'Editing' },
  { id: 'clear-shapes', keys: 'X', label: 'Clear arrows and highlights', group: 'Editing' },
  { id: 'undo', keys: '⌘Z', label: 'Undo', group: 'Editing' },
  { id: 'redo', keys: '⇧⌘Z', label: 'Redo', group: 'Editing' },

  { id: 'save-to-study', keys: '⌘S', label: 'Save this analysis to a study', group: 'Interface' },
  { id: 'palette', keys: '⌘K', label: 'Command palette', group: 'Interface' },
  { id: 'shortcuts', keys: '?', label: 'Keyboard shortcuts', group: 'Interface' },
  { id: 'settings', keys: '⌘,', label: 'Settings', group: 'Interface' },
];

/** Board annotation is mouse-driven, but the modifiers deserve documenting. */
export const ANNOTATION_HINTS: readonly { keys: string; label: string }[] = [
  { keys: 'Right-drag', label: 'Draw a green arrow' },
  { keys: 'Right-click', label: 'Highlight a square' },
  { keys: '⇧ Right-drag', label: 'Red' },
  { keys: '⌥ Right-drag', label: 'Blue' },
  { keys: '⇧⌥ Right-drag', label: 'Yellow' },
];
