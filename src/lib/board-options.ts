/**
 * Stable identifiers shared by preferences and the board feature.
 *
 * Keeping these string contracts below both layers prevents the preferences
 * store from depending upward on React feature modules.
 */
export type BoardThemeId = 'slate' | 'walnut' | 'ink' | 'sage';

export type PieceSetId = 'staunton' | 'line';
