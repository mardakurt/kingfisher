/**
 * Workspace layout presets.
 *
 * Each one is an opinion about what a particular kind of session needs on
 * screen, not a random selection of panels. The set is deliberately short:
 * a preset list long enough to need scrolling is a list nobody reads, and the
 * user can save their own arrangement under any name they like anyway.
 */

import { DEFAULT_ARRANGEMENT, type WorkspaceArrangement } from './layout-model';
import type { WorkspaceToolId } from './modules';

export type WorkspacePreset =
  | 'analysis'
  | 'opening-research'
  | 'study'
  | 'preparation'
  | 'calculation'
  | 'review'
  | 'endgame'
  | 'minimal';

export const WORKSPACE_PRESETS: readonly {
  readonly id: WorkspacePreset;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Board, move tree and the engine beside them.',
  },
  {
    id: 'opening-research',
    label: 'Opening Research',
    description: 'A wide dock for the explorer, with theory and transpositions a tab away.',
  },
  {
    id: 'study',
    label: 'Study',
    description: 'Notes in the dock and the move tree under the board.',
  },
  {
    id: 'preparation',
    label: 'Preparation',
    description: 'Opponent databases and model games at hand.',
  },
  {
    id: 'calculation',
    label: 'Calculation',
    description: 'The board as large as it will go, with evidence one tab away.',
  },
  { id: 'review', label: 'Review', description: 'Your own decisions, with the engine on tap.' },
  {
    id: 'endgame',
    label: 'Endgame',
    description: 'The tablebase in the lower panel, under a full-height board.',
  },
  { id: 'minimal', label: 'Minimal', description: 'Board and move tree. Nothing else.' },
];

/**
 * Presets place modules; they do not decide which modules a workspace has.
 *
 * A placement naming a module the current workspace does not offer is simply
 * never read — which is what allows one Endgame preset to be applied on a
 * route with no tablebase without special-casing it here.
 */
export const PRESET_ARRANGEMENTS: Record<WorkspacePreset, WorkspaceArrangement> = {
  analysis: { ...DEFAULT_ARRANGEMENT, dockWidth: 420, active: { dock: 'engine' } },
  'opening-research': {
    ...DEFAULT_ARRANGEMENT,
    dockWidth: 520,
    active: { dock: 'explorer' },
  },
  study: {
    ...DEFAULT_ARRANGEMENT,
    dockWidth: 440,
    lowerHeight: 240,
    active: { dock: 'notes' },
  },
  preparation: {
    ...DEFAULT_ARRANGEMENT,
    dockWidth: 480,
    active: { dock: 'database' },
  },
  calculation: {
    ...DEFAULT_ARRANGEMENT,
    dockWidth: 340,
    active: { dock: 'calculation' },
  },
  review: { ...DEFAULT_ARRANGEMENT, dockWidth: 440, active: { dock: 'document' } },
  endgame: {
    ...DEFAULT_ARRANGEMENT,
    placement: { tablebase: 'lower' },
    lowerHeight: 260,
    active: { dock: 'engine', lower: 'tablebase' },
  },
  minimal: { ...DEFAULT_ARRANGEMENT, dockCollapsed: true, active: { dock: 'engine' } },
};

/**
 * The tools that stay visible in the tab strip until the user says otherwise.
 *
 * Three, because the point of pinning is that the important tools are not
 * behind a menu — and a "pinned" list containing everything is just the
 * overflowing tab strip §26 asks us to stop shipping.
 */
export const DEFAULT_PINNED_TOOLS: readonly WorkspaceToolId[] = ['engine', 'explorer', 'notes'];
