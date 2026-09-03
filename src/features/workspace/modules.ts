/**
 * The workspace module catalogue.
 *
 * One table describing every module a workspace can show: its name, where it
 * lives by default, and which workspaces it belongs to. This used to be three
 * separate literals inside the tool dock — a label map, a route table and a
 * render switch — which is how `personal-results` came to be listed on a route
 * whose dock never rendered it.
 *
 * Availability is deliberately *stated* rather than silent. A tool that
 * disappears when it cannot help teaches the user that the application is
 * unreliable; a tool that says "available for positions with 7 pieces or
 * fewer" teaches them how it works.
 */

import type { WorkspaceRegion } from './layout-model';

export type WorkspaceToolId =
  | 'engine'
  | 'explorer'
  | 'database'
  | 'repertoire'
  | 'repertoire-health'
  | 'model-games'
  | 'personal-results'
  | 'features'
  | 'transpositions'
  | 'theory-radar'
  | 'calculation'
  | 'guess-the-move'
  | 'candidates'
  | 'tablebase'
  | 'companion'
  | 'document'
  | 'notes';

export interface WorkspaceModuleDescriptor {
  readonly id: WorkspaceToolId;
  readonly label: string;
  /** Where it sits until the user moves it. */
  readonly home: WorkspaceRegion;
  /**
   * Regions this module can be moved to.
   *
   * Not every module suits every region: the explorer is a tall list and is
   * unreadable in a 210px lower panel, so it is not offered there. Refusing
   * the move is kinder than allowing it and letting the user discover why.
   */
  readonly regions: readonly WorkspaceRegion[];
}

export const WORKSPACE_MODULES: Readonly<Record<WorkspaceToolId, WorkspaceModuleDescriptor>> = {
  engine: { id: 'engine', label: 'Engine', home: 'dock', regions: ['dock', 'lower'] },
  explorer: { id: 'explorer', label: 'Explorer', home: 'dock', regions: ['dock'] },
  database: { id: 'database', label: 'Database', home: 'dock', regions: ['dock'] },
  repertoire: { id: 'repertoire', label: 'Repertoire', home: 'dock', regions: ['dock'] },
  'repertoire-health': {
    id: 'repertoire-health',
    label: 'Position Health',
    home: 'dock',
    regions: ['dock'],
  },
  'model-games': { id: 'model-games', label: 'Model Games', home: 'dock', regions: ['dock'] },
  'personal-results': {
    id: 'personal-results',
    label: 'Personal Results',
    home: 'dock',
    regions: ['dock'],
  },
  features: { id: 'features', label: 'Features', home: 'dock', regions: ['dock', 'lower'] },
  transpositions: {
    id: 'transpositions',
    label: 'Transpositions',
    home: 'dock',
    regions: ['dock'],
  },
  'theory-radar': { id: 'theory-radar', label: 'Theory Radar', home: 'dock', regions: ['dock'] },
  calculation: { id: 'calculation', label: 'Calculation', home: 'dock', regions: ['dock'] },
  'guess-the-move': {
    id: 'guess-the-move',
    label: 'Guess the Move',
    home: 'dock',
    regions: ['dock'],
  },
  candidates: { id: 'candidates', label: 'Candidates', home: 'dock', regions: ['dock', 'lower'] },
  tablebase: { id: 'tablebase', label: 'Tablebase', home: 'dock', regions: ['dock', 'lower'] },
  companion: { id: 'companion', label: 'Companion', home: 'dock', regions: ['dock'] },
  document: { id: 'document', label: 'Context', home: 'dock', regions: ['dock'] },
  notes: { id: 'notes', label: 'Notes', home: 'dock', regions: ['dock', 'lower'] },
};

/**
 * The move tree is a module too, so that it can be moved out of the board
 * column.
 *
 * Its home is the lower panel rather than the board column, and that is a
 * load-bearing choice. A move tree fixed beneath the board *and* a lower panel
 * beneath that stacks two 210px blocks under the board: on a 1440x900 screen
 * it took the board from 490px to 277px, which is precisely the shrunken board
 * §58 forbids. Making the move tree the lower panel's default occupant means
 * the default layout is pixel-for-pixel what it always was, moving the engine
 * down puts it in a *tab* beside the move tree rather than below it, and
 * moving the move tree away gives its height back to the board.
 */
export const MOVE_TREE_MODULE = {
  id: 'move-tree' as const,
  label: 'Move Tree',
  home: 'lower' as WorkspaceRegion,
  regions: ['primary', 'dock', 'lower'] as readonly WorkspaceRegion[],
};

/**
 * Which modules each workspace offers, in the order their tabs appear.
 *
 * A workspace missing from this table falls back to Analysis, which is the
 * only sensible default: every route in Kingfisher has a board and a position,
 * so the analysis module set is always at least meaningful.
 */
export const WORKSPACE_TOOLS: Record<string, readonly WorkspaceToolId[]> = {
  analysis: [
    'engine',
    'explorer',
    'database',
    'repertoire',
    'repertoire-health',
    'transpositions',
    'theory-radar',
    'calculation',
    'candidates',
    'features',
    'tablebase',
    'companion',
    'notes',
  ],
  studies: [
    'document',
    'engine',
    'explorer',
    'database',
    'transpositions',
    'calculation',
    'features',
    'tablebase',
    'companion',
    'notes',
  ],
  repertoire: [
    'document',
    'repertoire-health',
    'explorer',
    'database',
    'transpositions',
    'theory-radar',
    'engine',
    'model-games',
    'features',
    'notes',
  ],
  openings: [
    'explorer',
    'database',
    'transpositions',
    'theory-radar',
    'engine',
    'repertoire',
    'repertoire-health',
    'model-games',
    'personal-results',
    'features',
  ],
  endgame: ['tablebase', 'engine', 'features', 'notes', 'explorer', 'database'],
  'opening-files': [
    'document',
    'explorer',
    'theory-radar',
    'repertoire',
    'repertoire-health',
    'transpositions',
    'model-games',
    'engine',
    'notes',
  ],
  'model-game': [
    'guess-the-move',
    'notes',
    'repertoire',
    'model-games',
    'features',
    'explorer',
    'database',
    'engine',
  ],
  games: [
    'engine',
    'explorer',
    'database',
    'repertoire',
    'calculation',
    'features',
    'tablebase',
    'notes',
  ],
  preparation: [
    'document',
    'engine',
    'explorer',
    'database',
    'theory-radar',
    'repertoire',
    'repertoire-health',
    'model-games',
    'features',
    'notes',
  ],
  training: ['document', 'engine', 'explorer', 'database', 'features', 'tablebase', 'notes'],
  review: [
    'document',
    'engine',
    'explorer',
    'database',
    'repertoire',
    'repertoire-health',
    'model-games',
    'features',
    'tablebase',
    'companion',
    'notes',
  ],
};

export const toolsForWorkspace = (workspace: string): readonly WorkspaceToolId[] =>
  WORKSPACE_TOOLS[workspace] ?? (WORKSPACE_TOOLS.analysis as readonly WorkspaceToolId[]);

/**
 * Why a module cannot help at the moment, if it cannot.
 *
 * `null` means usable. A string is shown in place of the panel body — the tab
 * stays visible and selectable either way, so a user who wonders where the
 * tablebase went finds it and is told, rather than finding nothing and
 * concluding the feature was removed.
 */
export interface ModuleAvailabilityInput {
  readonly pieceCount: number;
  readonly hasCompanion: boolean;
  readonly hasModelGames: boolean;
  readonly hasRepertoireEntry: boolean;
}

export function unavailableReason(
  tool: WorkspaceToolId,
  input: ModuleAvailabilityInput,
): string | null {
  if (tool === 'tablebase' && input.pieceCount > 7) {
    return `Available for positions with 7 pieces or fewer. This one has ${input.pieceCount}.`;
  }
  if (tool === 'companion' && !input.hasCompanion) {
    return 'The local companion is not connected. Connect it in Settings → Companion to use local engines and databases.';
  }
  if (tool === 'model-games' && !input.hasModelGames) {
    return 'No model games are linked to this position yet.';
  }
  if (tool === 'repertoire-health' && !input.hasRepertoireEntry) {
    return 'No repertoire decision covers this position, so there is no history to report.';
  }
  return null;
}
