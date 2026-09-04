'use client';

/**
 * Everything you can do with the position on the board, in one list.
 *
 * The problem this solves is arithmetic. Kingfisher accumulated a dozen
 * position-level actions across nine phases, and each arrived where it was
 * built: "add to repertoire" in a document menu, "find model games" in a dock
 * tab, "search structure" inside a panel inside a tab. Every one is reachable
 * and no two are reachable the same way, so the cost of a professional
 * workflow is measured in *hunting* rather than in clicks.
 *
 * One definition, consumed by the board's context menu, the toolbar menu and
 * the command palette, means the answer to "how do I get from here to a
 * training item" is the same everywhere and can be learned once.
 *
 * Deliberately not permanent toolbar buttons. Twelve buttons on a board is how
 * a workspace stops looking like a chess application.
 */

import type { Fen } from '@/chess/types';
import type { MenuSection } from '@/components/ui/Menu';

export interface PositionActionContext {
  readonly fen: Fen;
  readonly positionKey: string;
  /** Where the action list is being shown, so a route can omit its own entry. */
  readonly route: string;
  /** True when a preparation session is active, which unlocks the sheet entry. */
  readonly hasSession?: boolean;
}

export interface PositionActionHandlers {
  readonly analyse: () => void;
  readonly explore: () => void;
  readonly calculate: () => void;
  readonly setup: () => void;
  readonly playFromHere: () => void;
  readonly report: () => void;
  readonly addToRepertoire: () => void;
  readonly saveToStudy: () => void;
  readonly createTraining: () => void;
  readonly findModelGames: () => void;
  readonly searchStructure: () => void;
  readonly addToPreparation?: () => void;
  readonly saveEndgame: () => void;
  readonly copyFen: () => void;
}

/**
 * The list, grouped by what the player is trying to do.
 *
 * Three sections, in the order a session actually moves: look at it, file it
 * somewhere, take it away. Shortcuts are shown where one exists, because a
 * menu is also how a keyboard-first user discovers the keys.
 */
export function positionActionSections(
  context: PositionActionContext,
  handlers: PositionActionHandlers,
): readonly MenuSection[] {
  const onRoute = (path: string) => context.route.startsWith(path);

  return [
    {
      id: 'examine',
      items: [
        ...(onRoute('/analysis')
          ? []
          : [
              {
                id: 'analyse',
                label: 'Analyse this position',
                shortcut: 'A',
                run: handlers.analyse,
              },
            ]),
        { id: 'explore', label: 'Explore in the database', shortcut: 'D', run: handlers.explore },
        { id: 'calculate', label: 'Calculate here', shortcut: '⇧C', run: handlers.calculate },
        { id: 'play-from-here', label: 'Play from this position', run: handlers.playFromHere },
        { id: 'report', label: 'Open Position Report', run: handlers.report },
        { id: 'setup', label: 'Set up position…', run: handlers.setup },
        {
          id: 'model-games',
          label: 'Find model games',
          shortcut: 'M',
          run: handlers.findModelGames,
        },
        { id: 'structure', label: 'Search this structure', run: handlers.searchStructure },
      ],
    },
    {
      id: 'file',
      items: [
        {
          id: 'repertoire',
          label: 'Add to repertoire…',
          shortcut: 'R',
          run: handlers.addToRepertoire,
        },
        { id: 'study', label: 'Save to study…', shortcut: '⌘S', run: handlers.saveToStudy },
        {
          id: 'preparation',
          label: 'Add to game-day sheet',
          disabled: !context.hasSession,
          run: () => handlers.addToPreparation?.(),
        },
        { id: 'endgame', label: 'Save to endgame library…', run: handlers.saveEndgame },
      ],
    },
    {
      id: 'take-away',
      items: [
        { id: 'training', label: 'Create training item…', run: handlers.createTraining },
        { id: 'fen', label: 'Copy FEN', run: handlers.copyFen },
      ],
    },
  ];
}

/**
 * The keys these actions advertise, and the ones they deliberately do not.
 *
 * Kept beside the list so the menu and the key handler cannot drift, and so a
 * collision is visible in one place rather than discovered by a user whose
 * comment editor stopped opening.
 *
 * Already claimed and untouched: `C` edits a comment, `D` shows the explorer,
 * `E` runs the engine, `F` flips, `X` clears shapes, `1`–`6` annotate. So
 * calculation takes `⇧C` rather than the `C` that would read more naturally —
 * a new feature does not get to evict an old binding people have learned.
 */
export const POSITION_SHORTCUTS: Readonly<Record<string, keyof PositionActionHandlers>> = {
  a: 'analyse',
  m: 'findModelGames',
  r: 'addToRepertoire',
};

/** Shift-modified keys, kept apart because the handler tests them separately. */
export const POSITION_SHIFT_SHORTCUTS: Readonly<Record<string, keyof PositionActionHandlers>> = {
  c: 'calculate',
};
