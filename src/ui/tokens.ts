/**
 * Kingfisher's compact workstation measurements.
 *
 * CSS consumes the same names in `globals.css`; this typed catalogue exists so
 * layout code, documentation and regression tests can share one vocabulary.
 * Route components should compose these primitives instead of inventing a new
 * radius or control height for each screen.
 */
export const UI_TOKENS = {
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24 },
  radius: { control: 4, panel: 6, board: 3 },
  icon: { compact: 16, standard: 20, navigation: 21, feature: 24, display: 32 },
  control: { compact: 28, standard: 36, navigation: 42 },
  sidebar: { collapsed: 72, expanded: 228 },
  panelHeader: { comfortable: 36, compact: 32 },
  motion: { quick: 90, standard: 140, deliberate: 180 },
} as const;

export type UiTokenGroup = keyof typeof UI_TOKENS;

export const UI_TOKEN_CSS_NAMES = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--radius-control',
  '--radius-panel',
  '--radius-board',
  '--icon-compact',
  '--icon-standard',
  '--icon-navigation',
  '--control-compact',
  '--control-standard',
  '--control-navigation',
  '--sidebar-collapsed',
  '--sidebar-expanded',
  '--panel-header',
  '--focus-ring',
  '--motion-quick',
  '--motion-standard',
  '--motion-deliberate',
] as const;
