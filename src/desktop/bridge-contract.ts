/**
 * Every capability the shell offers the application, and what reaches it.
 *
 * ## Why this file exists
 *
 * The commonest defect in this project's history is not a wrong answer. It is
 * a capability that was built, unit-tested, documented, and reachable from no
 * control. Phase 18 named the shape; Phase 19 hit it four times in one phase
 * and recommended a sweep; Phase 20 ran the sweep and found two more —
 * `chooseFile` and `chooseDirectory`, implemented in the main process, wired
 * through the preload, typed on the bridge, and called by nothing, while three
 * separate screens asked the user to type an absolute path by hand.
 *
 * A grep would have found that in a second. Nobody grepped, for nineteen
 * phases, because there was nowhere that said what the answer was supposed to
 * be. This is that place, and `bridge-contract.test.ts` is what checks it.
 *
 * ## What a row claims
 *
 * `caller` names the module that reaches the capability from the application,
 * relative to `src/`. When there is no such module the row must say why in
 * `noCallerBecause`, and the reason has to be a real one — the test checks the
 * `caller` claim against the source, so a row cannot drift into fiction, and
 * it fails on a method that has neither.
 *
 * A capability need not be a function. `windowChrome` is a property, and it is
 * covered here for the same reason the methods are: it is something the shell
 * offers, it can be read from nowhere, and nobody would notice.
 *
 * The reasons that are legitimate here are narrow, and there is exactly one
 * kind: the shell already reaches the same capability through its own native
 * menu, so a renderer-side call would be a second route to a place the user
 * can already get to. That is not dead capability; it is an unused duplicate,
 * and saying so is different from not having noticed.
 */

import type { DesktopBridge } from './bridge';

export interface BridgeContract {
  readonly method: keyof DesktopBridge;
  /** What it does, in the words a reviewer needs rather than the type. */
  readonly purpose: string;
  /** Module that calls it, relative to `src/`. Null only with a reason. */
  readonly caller: string | null;
  /** Why nothing calls it. Required when `caller` is null. */
  readonly noCallerBecause?: string;
}

export const BRIDGE_CONTRACTS: readonly BridgeContract[] = [
  {
    method: 'windowChrome',
    purpose: 'Where macOS draws the window buttons, so the application can leave the corner empty.',
    caller: 'app/layout.tsx',
  },
  {
    method: 'openPgn',
    purpose: 'Open the native PGN dialog and load what is chosen onto the board.',
    caller: null,
    noCallerBecause:
      'File → Open PGN in the shell menu already opens this dialog, and the chosen document ' +
      'arrives through onOpenDocument. A renderer-side call would be a second route to the same ' +
      'dialog; the menu is where a macOS user looks for it.',
  },
  {
    method: 'openDatabase',
    purpose: 'Open the native dialog for a SQLite collection and attach what is chosen.',
    caller: null,
    noCallerBecause:
      'File → Open Database in the shell menu opens this dialog, and the result arrives through ' +
      'onOpenDocument, which useDesktop.ts hands to the companion’s attach route.',
  },
  {
    method: 'chooseDirectory',
    purpose: 'Ask for a folder and return its path, for a setting that names one.',
    caller: 'components/ui/PathField.tsx',
  },
  {
    method: 'chooseFile',
    purpose: 'Ask for a file and return its path, for a setting that names one.',
    caller: 'components/ui/PathField.tsx',
  },
  {
    method: 'pathForFile',
    purpose: 'Turn a dropped File back into the path the user actually chose.',
    caller: 'desktop/useDesktop.ts',
  },
  {
    method: 'openPaths',
    purpose: 'Hand the shell paths to open, as though they had been double-clicked.',
    caller: 'desktop/useDesktop.ts',
  },
  {
    method: 'recentDocuments',
    purpose: 'The bounded list of documents this shell has opened.',
    caller: null,
    noCallerBecause:
      'File → Open Recent is built from the same list in the shell’s own menu, which is where ' +
      'macOS puts it and where the platform’s own conventions apply. Kingfisher’s Recent page is ' +
      'about authored work — studies, chapters, repertoires — not about files on disk.',
  },
  {
    method: 'diagnostics',
    purpose: 'The shell’s versions, and whether the two processes it owns are up.',
    caller: 'features/shell/SettingsDialog.tsx',
  },
  {
    method: 'onOpenDocument',
    purpose: 'Documents arriving from the Finder, a drop, or the File menu.',
    caller: 'desktop/useDesktop.ts',
  },
  {
    method: 'onShowDiagnostics',
    purpose: 'The shell’s Diagnostics menu item, asking for the panel that has them.',
    caller: 'desktop/useDesktop.ts',
  },
];
