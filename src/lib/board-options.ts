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

export type PieceSetId = 'staunton' | 'line' | 'classic' | 'tournament' | 'minimal' | 'contrast';

/** How much movement the user wants; `off` also satisfies reduced-motion. */
export type AnimationSpeed = 'off' | 'fast' | 'normal';

/** Where coordinate labels are drawn, if at all. */
export type CoordinateStyle = 'none' | 'inside' | 'outside';

/** Which four colours the annotation brushes use. */
export type ArrowPaletteId = 'standard' | 'colorblind';
