/**
 * The application's own commands, as the Mac menu names them.
 *
 * The menu bar is where a Mac user looks for what an application can do and
 * learns its shortcuts: ⌘T for a new tab, ⌘W to close one, ⌃Tab to move
 * between them, ⌃⌘S for the sidebar. Kingfisher's tabs arrived in Phase 83
 * with those commands in the palette only, and ⌘W — the role `close` —
 * closed the whole window.
 *
 * The shell does not implement any of them. A menu item sends the command's
 * id over `kingfisher:menu-command`, and the renderer runs the palette's own
 * command of that id (`src/features/command/useMenuCommands.ts`), so there is exactly one
 * implementation of "close this tab" and the menu is only another way to
 * reach it. `menu-commands.test.mjs` checks every id here against
 * the renderer's commands, so an id cannot drift into a dead menu item.
 */

/** The channel a menu command travels on, main → renderer. */
export const MENU_COMMAND_CHANNEL = 'kingfisher:menu-command';

export const MENU_COMMANDS = Object.freeze({
  newTab: 'tab-new',
  duplicateTab: 'tab-duplicate',
  closeTab: 'tab-close',
  nextTab: 'tab-next',
  previousTab: 'tab-previous',
  newAnalysis: 'new-analysis',
  importGame: 'import-pgn',
  palette: 'palette',
  toggleSidebar: 'sidebar-toggle',
  shortcuts: 'shortcuts',
  // The theme is the renderer's preference; the Appearance items ask for it.
  appearanceLight: 'appearance-light',
  appearanceDark: 'appearance-dark',
});

/**
 * The Go menu: the places a person goes most, by the sidebar's own names.
 * A subset, in the sidebar's order; every other section is one ⌘K away.
 */
export const GO_SECTIONS = Object.freeze([
  { label: 'Search', command: 'goto-search' },
  { label: 'Analysis', command: 'goto-analysis' },
  { label: 'Openings', command: 'goto-openings' },
  { label: 'Studies', command: 'goto-studies' },
  { label: 'Repertoire', command: 'goto-repertoire' },
  { label: 'Preparation', command: 'goto-preparation' },
  { label: 'Players', command: 'goto-players' },
  { label: 'Review', command: 'goto-review' },
  { label: 'Training', command: 'goto-training' },
  { label: 'Library', command: 'goto-games' },
  { label: 'Databases', command: 'goto-databases' },
]);
