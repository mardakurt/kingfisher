/**
 * The workspace composition model.
 *
 * Kingfisher is chess software, not an IDE. There is no pane tree, no floating
 * window and no arbitrary drop target here: a workspace has a fixed board, and
 * every other module lives in one of three named regions. That constraint is
 * the point. It keeps the board large (a draggable board is a board somebody
 * will accidentally shrink to a postage stamp), it keeps the number of
 * reachable layouts small enough to test, and it means a layout can be
 * described by a plain record that survives a schema change.
 *
 * Nothing in this file imports React or touches storage, so the rules that
 * decide what a layout means can be tested without a browser.
 */

import type { WorkspaceToolId } from './modules';

/** Where a module can live. The board is not a placement — it is the anchor. */
export type WorkspaceRegion = 'dock' | 'lower' | 'primary';

/** Everything that can be moved between regions. */
export type WorkspaceModuleId = WorkspaceToolId | 'move-tree';

/**
 * A single workspace's arrangement.
 *
 * `placement` is sparse on purpose: a module absent from it sits in its
 * declared home region. Storing only the differences from the default is what
 * lets a later phase add a module without every saved layout needing a
 * migration to mention it.
 */
export interface WorkspaceArrangement {
  readonly placement: Partial<Record<WorkspaceModuleId, WorkspaceRegion>>;
  /** Selected tab per region, when that region holds more than one module. */
  readonly active: Partial<Record<WorkspaceRegion, WorkspaceModuleId>>;
  /**
   * A width the user chose by dragging the dock's edge, or that a preset set.
   *
   * Absent means "whatever the board policy says", and absent is the normal
   * state. Storing the policy's own number here instead is what broke Board
   * priority: selecting a tool tab writes an arrangement, and an arrangement
   * carrying a concrete width pins that width for ever, so changing the policy
   * afterwards moved nothing. See `resolveArrangement`.
   */
  readonly dockWidth?: number;
  /** A height the user chose by dragging the notation panel. Same rule. */
  readonly lowerHeight?: number;
  readonly dockCollapsed: boolean;
}

/**
 * An arrangement with the policy applied, which is what a component renders.
 *
 * The distinction is the whole fix: `WorkspaceArrangement` is what was stored
 * — sparse, recording only decisions the user actually made — and this is what
 * that means on screen once the board policy has filled in the rest.
 */
export interface ResolvedArrangement extends WorkspaceArrangement {
  readonly dockWidth: number;
  readonly lowerHeight: number;
  /** Where the notation panel lives, policy included. */
  readonly moveTreeRegion: WorkspaceRegion;
}

export const DOCK_WIDTH_MIN = 300;
export const DOCK_WIDTH_MAX = 640;
export const LOWER_HEIGHT_MIN = 96;
export const LOWER_HEIGHT_MAX = 520;

/**
 * How much of the workspace the board is entitled to.
 *
 * A pixel setting would be the wrong control: the same number is a huge board
 * on a 27-inch display and an impossible one on a laptop. This is a *policy* —
 * how the fixed chrome around the board is sized — and the board takes
 * whatever is left, which is what makes one setting work at every width.
 *
 * The measurements that produced these numbers are in
 * `docs/performance/phase-13-out-of-the-box.md`. On a 1280x720 laptop the
 * board was 307px before this existed, because a 210px notation panel and 89px
 * of padding were taken out of a 640px column first.
 */
export type BoardPriority = 'balanced' | 'large' | 'maximum';

export interface BoardPriorityShape {
  readonly dockWidth: number;
  /** Notation panel height on a tall screen, and on a laptop-height one. */
  readonly lowerHeight: number;
  readonly shortLowerHeight: number;
  /**
   * The largest board this policy will draw.
   *
   * A cap exists at all because a board bigger than about a thousand pixels
   * stops being easier to read and starts being a thing you move your head to
   * look at. It is a policy limit, not a rendering one.
   */
  readonly maxBoard: number;
  /** True when the notation panel is folded into the dock rather than shown. */
  readonly moveTreeInDock: boolean;
}

export const BOARD_PRIORITIES: Readonly<Record<BoardPriority, BoardPriorityShape>> = {
  balanced: {
    dockWidth: 440,
    lowerHeight: 220,
    shortLowerHeight: 160,
    maxBoard: 780,
    moveTreeInDock: false,
  },
  large: {
    dockWidth: 380,
    lowerHeight: 170,
    shortLowerHeight: 120,
    maxBoard: 960,
    moveTreeInDock: false,
  },
  maximum: {
    dockWidth: 340,
    lowerHeight: 140,
    shortLowerHeight: 120,
    maxBoard: 1200,
    moveTreeInDock: true,
  },
};

export const DEFAULT_BOARD_PRIORITY: BoardPriority = 'large';

/**
 * The arrangement a workspace has before anybody rearranges it.
 *
 * Derived rather than constant, so changing the board policy changes what an
 * untouched workspace looks like without rewriting anyone's saved layout: a
 * stored arrangement still wins, because it is a thing the user did.
 */
export function defaultArrangement(): WorkspaceArrangement {
  return { placement: {}, active: {}, dockCollapsed: false };
}

/**
 * The shape of a workspace nobody has touched.
 *
 * It records no dimensions at all, which is what makes the board policy able
 * to keep governing it. A default that named its own numbers would be
 * indistinguishable, one write later, from a layout the user had built by
 * hand.
 */
export const DEFAULT_ARRANGEMENT: WorkspaceArrangement = defaultArrangement();

/**
 * Where the notation panel sits under a given policy.
 *
 * Maximum folds it into the dock, which is most of why Maximum is bigger than
 * Large: it removes a whole horizontal band from under the board rather than
 * merely making it shorter.
 */
export const policyMoveTreeHome = (priority: BoardPriority): WorkspaceRegion =>
  BOARD_PRIORITIES[priority].moveTreeInDock ? 'dock' : 'lower';

/**
 * Apply the board policy to a stored arrangement.
 *
 * Every dimension the user did not explicitly choose comes from the policy, so
 * changing Board priority in Settings moves the panels of every workspace
 * except the ones somebody deliberately sized. That is the contract the
 * setting's description claims, and before this existed it was not true of any
 * workspace whose tab had ever been clicked.
 */
export function resolveArrangement(
  arrangement: WorkspaceArrangement,
  priority: BoardPriority = DEFAULT_BOARD_PRIORITY,
  shortScreen = false,
): ResolvedArrangement {
  const shape = BOARD_PRIORITIES[priority];
  return {
    ...arrangement,
    dockWidth: arrangement.dockWidth ?? shape.dockWidth,
    lowerHeight:
      arrangement.lowerHeight ?? (shortScreen ? shape.shortLowerHeight : shape.lowerHeight),
    moveTreeRegion: arrangement.placement['move-tree'] ?? policyMoveTreeHome(priority),
  };
}

/**
 * The dimensions a policy can produce on its own.
 *
 * Used by the migration to tell a number the user chose from a number an
 * earlier build wrote down on their behalf. It is not a perfect test — a user
 * may have dragged the dock to exactly 380px — but it is the only evidence the
 * old format left, and the worst it can do is return a deliberate 380px dock
 * to following the policy.
 */
export const POLICY_DIMENSIONS: {
  readonly dockWidths: ReadonlySet<number>;
  readonly lowerHeights: ReadonlySet<number>;
} = {
  dockWidths: new Set(Object.values(BOARD_PRIORITIES).map((shape) => shape.dockWidth)),
  lowerHeights: new Set(
    Object.values(BOARD_PRIORITIES).flatMap((shape) => [shape.lowerHeight, shape.shortLowerHeight]),
  ),
};

export const clampDockWidth = (value: number): number =>
  Math.min(DOCK_WIDTH_MAX, Math.max(DOCK_WIDTH_MIN, Math.round(value)));

export const clampLowerHeight = (value: number): number =>
  Math.min(LOWER_HEIGHT_MAX, Math.max(LOWER_HEIGHT_MIN, Math.round(value)));

/**
 * Where a module sits, given an arrangement.
 *
 * `home` is the module's declared default. Reading through to it rather than
 * materialising every module into `placement` is what keeps a saved layout
 * meaningful after the module list grows.
 */
export function regionOf(
  arrangement: WorkspaceArrangement,
  module: WorkspaceModuleId,
  home: WorkspaceRegion,
): WorkspaceRegion {
  return arrangement.placement[module] ?? home;
}

/**
 * The modules in a region, in a stable order.
 *
 * Order follows the workspace's own module list rather than the order things
 * were dragged in. Tabs that reshuffle themselves because of what you moved
 * last week are tabs you have to re-read every time.
 */
export function modulesInRegion(
  arrangement: WorkspaceArrangement,
  available: readonly { readonly id: WorkspaceModuleId; readonly home: WorkspaceRegion }[],
  region: WorkspaceRegion,
): readonly WorkspaceModuleId[] {
  return available
    .filter((entry) => regionOf(arrangement, entry.id, entry.home) === region)
    .map((entry) => entry.id);
}

/**
 * The module a region should show.
 *
 * A stored selection that has since been moved elsewhere — or removed from
 * this workspace entirely — must not blank the region out. Falling back to the
 * first module present is why moving the active tool to the lower panel leaves
 * a usable dock rather than an empty column.
 */
export function activeInRegion(
  arrangement: WorkspaceArrangement,
  present: readonly WorkspaceModuleId[],
  region: WorkspaceRegion,
): WorkspaceModuleId | null {
  if (present.length === 0) return null;
  const stored = arrangement.active[region];
  if (stored && present.includes(stored)) return stored;
  return present[0] as WorkspaceModuleId;
}

const VALID_REGIONS: ReadonlySet<WorkspaceRegion> = new Set(['dock', 'lower', 'primary']);

/**
 * Turn whatever was in storage into a valid arrangement.
 *
 * Persisted layouts come from three untrustworthy places: a hand-edited
 * localStorage value, a future build's shape read by an older one, and a
 * `migrate` step that ran against data this build never wrote. All three look
 * the same from here — an unknown shape — so this reads only the fields it
 * knows, drops anything naming a module or region this build does not have,
 * and clamps every dimension. A layout that fails this can still boot; it
 * just boots as the default.
 */
export function sanitizeArrangement(
  value: unknown,
  validModules: ReadonlySet<WorkspaceModuleId>,
): WorkspaceArrangement {
  if (typeof value !== 'object' || value === null) return DEFAULT_ARRANGEMENT;
  const raw = value as Record<string, unknown>;

  const placement: Partial<Record<WorkspaceModuleId, WorkspaceRegion>> = {};
  if (typeof raw.placement === 'object' && raw.placement !== null) {
    for (const [module, region] of Object.entries(raw.placement as Record<string, unknown>)) {
      if (!validModules.has(module as WorkspaceModuleId)) continue;
      if (typeof region !== 'string' || !VALID_REGIONS.has(region as WorkspaceRegion)) continue;
      placement[module as WorkspaceModuleId] = region as WorkspaceRegion;
    }
  }

  const active: Partial<Record<WorkspaceRegion, WorkspaceModuleId>> = {};
  if (typeof raw.active === 'object' && raw.active !== null) {
    for (const [region, module] of Object.entries(raw.active as Record<string, unknown>)) {
      if (!VALID_REGIONS.has(region as WorkspaceRegion)) continue;
      if (typeof module !== 'string' || !validModules.has(module as WorkspaceModuleId)) continue;
      active[region as WorkspaceRegion] = module as WorkspaceModuleId;
    }
  }

  /*
    A dimension that is absent, or is not a number, stays absent: it means
    "follow the board policy", and inventing a number here would pin the
    workspace to today's policy for ever. Only a real stored number survives,
    and only after clamping.
  */
  return {
    placement,
    active,
    ...(Number.isFinite(raw.dockWidth)
      ? { dockWidth: clampDockWidth(raw.dockWidth as number) }
      : {}),
    ...(Number.isFinite(raw.lowerHeight)
      ? { lowerHeight: clampLowerHeight(raw.lowerHeight as number) }
      : {}),
    dockCollapsed: raw.dockCollapsed === true,
  };
}

/**
 * Move a module, keeping the arrangement coherent.
 *
 * Moving the module a region currently shows also selects it in its new home,
 * because the alternative is a move that appears to do nothing: the user drags
 * Engine to the lower panel, the lower panel goes on showing Notes, and the
 * engine seems to have vanished.
 */
export function moveModule(
  arrangement: WorkspaceArrangement,
  module: WorkspaceModuleId,
  region: WorkspaceRegion,
): WorkspaceArrangement {
  return {
    ...arrangement,
    placement: { ...arrangement.placement, [module]: region },
    active: { ...arrangement.active, [region]: module },
  };
}
