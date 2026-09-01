/**
 * Stable identifiers shared by preferences and the board feature.
 *
 * Keeping these string contracts below both layers prevents the preferences
 * store from depending upward on React feature modules.
 *
 * These strings are persisted in user preferences, so an id may be added but
 * never renamed or removed: doing so would silently reset the appearance of
 * every existing installation. The four Phase 1 ids are therefore kept exactly
 * as they were, even where a later name reads better.
 */
export type BoardThemeId =
  'slate' | 'walnut' | 'ink' | 'sage' | 'green' | 'blue' | 'sand' | 'contrast';

export type PieceSetId =
  /* Vendored artwork; see THIRD_PARTY_ASSETS.md. */
  | 'cburnett'
  | 'merida'
  | 'chessnut'
  | 'fantasy'
  | 'spatial'
  /*
    Phase 1–3 drew its pieces from hand-written geometry. They were never good
    enough to sit beside real Staunton artwork, so they no longer appear in the
    picker — but the ids stay resolvable, because a stored preference naming one
    must not leave a user with an empty board. See `LEGACY_PIECE_SETS`.
  */
  | 'staunton'
  | 'line'
  | 'classic'
  | 'tournament'
  | 'minimal'
  | 'contrast';

/** How much movement the user wants; `off` also satisfies reduced-motion. */
export type AnimationSpeed = 'off' | 'fast' | 'normal';

/** Where coordinate labels are drawn, if at all. */
export type CoordinateStyle = 'none' | 'inside' | 'outside';

/** Which four colours the annotation brushes use. */
export type ArrowPaletteId = 'standard' | 'colorblind';

/** The set new installations start with. */
export const DEFAULT_PIECE_SET_ID: PieceSetId = 'cburnett';

/**
 * Ids that no longer appear in the picker.
 *
 * Declared here rather than in the registry so the preferences store can
 * migrate away from them without importing React feature code.
 */
export const LEGACY_PIECE_SET_IDS: readonly PieceSetId[] = [
  'staunton',
  'line',
  'classic',
  'tournament',
  'minimal',
  'contrast',
];
