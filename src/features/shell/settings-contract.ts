/**
 * What every user-visible setting is supposed to do, and who does it.
 *
 * Kingfisher has thirty-three preferences across fourteen surfaces, which is
 * more than anybody can hold in their head — and Phase 17 opened with a
 * reported bug where a setting persisted correctly, had two runtime consumers,
 * and still changed nothing a user could see. "It is wired up" turned out not
 * to be the same claim as "it works", so this table states both separately:
 *
 *   `control`  the module that writes the preference
 *   `consumer` the module where the value becomes a visible difference
 *   `effect`   what that difference is, in words a person could check
 *
 * `settings-contract.test.ts` checks the first two against the source. It
 * cannot check the third — only a browser can — so `effect` is written to be
 * the thing an end-to-end test asserts, and the ones that have such a test name
 * it in `verifiedBy`.
 *
 * This is deliberately not a second registry. `SETTINGS_INDEX` already answers
 * "what can the user search for"; this answers "what does it do", and the test
 * holds the two in agreement.
 */

import type { Preferences } from '@/stores/preferences-store';

export type SettingSurface =
  /** A row in the Settings dialog. */
  | 'settings'
  /** Controlled from the workspace itself; Settings does not own it. */
  | 'in-place';

export interface SettingContract {
  readonly key: keyof Preferences;
  readonly label: string;
  /** Where the user changes it. */
  readonly surface: SettingSurface;
  /** Module that writes the preference, relative to `src/`. */
  readonly control: string;
  /**
   * Module where the value becomes a visible difference, relative to `src/`.
   *
   * One module, not every module that mentions the key: the point is to name
   * the place a reviewer should look to answer "and then what happens?".
   */
  readonly consumer: string;
  /** What changes, stated so that it could be checked by hand or by a test. */
  readonly effect: string;
  /** The entry in `SETTINGS_INDEX`, when the setting is searchable there. */
  readonly indexedAs: string | null;
  /** Whether the change takes effect without a reload or a restart. */
  readonly previewable: boolean;
  /**
   * Why no browser test asserts this setting's effect.
   *
   * Absent means there is one, or there must be — `e2e/settings.spec.ts` fails
   * when a setting with no reason has no runtime assertion. Present means the
   * effect needs infrastructure a browser test cannot stand up: a companion
   * process, somebody's Lichess token, an assistant endpoint. Stating the
   * reason is the point; "previewable" was doing double duty for "takes effect
   * immediately" and "you can see it", which are different claims.
   */
  readonly notBrowserCheckable?: string;
  /** An end-to-end test that asserts the effect, if one exists. */
  readonly verifiedBy?: string;
}

export const SETTING_CONTRACTS: readonly SettingContract[] = [
  {
    key: 'theme',
    label: 'Application theme',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'app/providers.tsx',
    effect: 'The document carries data-theme, and every surface repaints light or dark.',
    indexedAs: 'theme',
    previewable: true,
    verifiedBy: 'e2e/appearance.spec.ts',
  },
  {
    key: 'boardTheme',
    label: 'Board theme',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/board/Chessboard.tsx',
    effect: 'The squares change colour.',
    indexedAs: 'board-theme',
    previewable: true,
    verifiedBy: 'e2e/appearance.spec.ts',
  },
  {
    key: 'pieceSet',
    label: 'Piece set',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/board/piece-sets/index.tsx',
    effect: 'The pieces are drawn from a different set of files, at that set’s calibrated scale.',
    indexedAs: 'piece-set',
    previewable: true,
    verifiedBy: 'e2e/piece-proportions.spec.ts',
  },
  {
    key: 'coordinateStyle',
    label: 'Coordinates',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/workspace/CanonicalBoardSurface.tsx',
    effect: 'File and rank labels move into the squares, into gutters, or stop being drawn.',
    indexedAs: 'coordinates',
    previewable: true,
    verifiedBy: 'e2e/appearance.spec.ts',
  },
  {
    key: 'animationSpeed',
    label: 'Move animation',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'stores/preferences-store.ts',
    effect: 'resolveAnimationMs returns a different duration, and Off also honours reduced motion.',
    indexedAs: 'animation',
    previewable: true,
    notBrowserCheckable:
      'A timing assertion on an animation is the flakiest test there is; the value that reaches the board is asserted instead.',
  },
  {
    key: 'arrowPalette',
    label: 'Arrow colours',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'app/providers.tsx',
    effect: 'The four annotation brush colours change on the document root.',
    indexedAs: 'arrow-palette',
    previewable: true,
  },
  {
    key: 'showEvaluationBar',
    label: 'Evaluation bar',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/workspace/CanonicalBoardSurface.tsx',
    effect: 'The bar beside the board appears or goes, and the board reclaims its 34px.',
    indexedAs: 'evaluation-bar',
    previewable: true,
  },
  {
    key: 'showEvaluationGraph',
    label: 'Evaluation graph',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/workspace/CanonicalBoardSurface.tsx',
    effect: 'The bar chart under the board appears or goes.',
    indexedAs: 'evaluation-graph',
    previewable: true,
  },
  {
    key: 'showEngineArrows',
    label: 'Engine best-move arrows',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/board/engine-arrows.ts',
    effect:
      "The engine's recommended move is drawn on the board; with two engines, both recommendations appear as distinguishable arrows (blue solid, orange dashed).",
    indexedAs: 'engine-arrows',
    previewable: true,
  },
  {
    key: 'boardPriority',
    label: 'Board priority',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/workspace/use-arrangement.ts',
    effect:
      'The dock narrows, the notation panel shortens or folds into the dock, and the board grows into the space.',
    indexedAs: 'board-priority',
    previewable: true,
    verifiedBy: 'e2e/board-size.spec.ts',
  },
  {
    key: 'autoAnalyse',
    label: 'Analyse automatically',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/analysis/AnalysisWorkspace.tsx',
    effect: 'A new position starts a search without the user pressing anything.',
    indexedAs: null,
    previewable: true,
  },
  {
    key: 'engineMultiPv',
    label: 'Lines',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/engine/EnginePanel.tsx',
    effect: 'The engine is sent a different MultiPV, and the panel lists that many lines.',
    indexedAs: 'engine-multipv',
    previewable: true,
  },
  {
    key: 'engineThreads',
    label: 'Threads',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/engine/EnginePanel.tsx',
    effect: 'The engine is configured with that thread count on its next search.',
    indexedAs: 'engine-threads',
    previewable: false,
    notBrowserCheckable: 'Sent to the engine on its next search; not visible in the page.',
  },
  {
    key: 'engineHashMb',
    label: 'Hash',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/engine/EnginePanel.tsx',
    effect: 'The engine is configured with that hash size on its next search.',
    indexedAs: 'engine-hash',
    previewable: false,
    notBrowserCheckable: 'Sent to the engine on its next search; not visible in the page.',
  },
  {
    key: 'engineLimit',
    label: 'Search limit',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/engine/EnginePanel.tsx',
    effect: 'A search stops at that depth, node count or time instead of running on.',
    indexedAs: null,
    previewable: true,
    notBrowserCheckable: 'When a search stops is a timing assertion against a live engine.',
  },
  {
    key: 'enginePreset',
    label: 'Analysis preset',
    surface: 'settings',
    control: 'features/engine/EnginePanel.tsx',
    consumer: 'engine/presets.ts',
    effect: 'Lines, threads, hash and limit are set together to that preset’s values.',
    indexedAs: null,
    previewable: true,
  },
  {
    key: 'primaryEngineId',
    label: 'Engine',
    surface: 'in-place',
    control: 'features/engine/EngineComparison.tsx',
    consumer: 'engine/use-engines.ts',
    effect: 'The panel drives a different engine process.',
    indexedAs: 'engine-choice',
    previewable: true,
  },
  {
    key: 'secondaryEngineId',
    label: 'Comparison engine',
    surface: 'in-place',
    control: 'features/engine/EngineComparison.tsx',
    consumer: 'engine/use-engines.ts',
    effect: 'The comparison column is driven by a different engine process.',
    indexedAs: 'engine-choice',
    previewable: true,
    notBrowserCheckable: 'Needs a second engine process running through the companion.',
  },
  {
    key: 'hiddenEngineIds',
    label: 'Hidden engines',
    surface: 'in-place',
    control: 'features/engine/EngineManager.tsx',
    consumer: 'engine/use-engines.ts',
    effect: 'The hidden engines stop appearing in every engine selector.',
    indexedAs: 'managed-engines',
    previewable: true,
  },
  {
    key: 'explorerSourceId',
    label: 'Explorer source',
    surface: 'in-place',
    control: 'features/explorer/ExplorerPanel.tsx',
    consumer: 'features/explorer/ExplorerPanel.tsx',
    effect: 'The explorer queries a different population, and labels its numbers with it.',
    indexedAs: 'explorer-source',
    previewable: true,
  },
  {
    key: 'explorerMinRating',
    label: 'Explorer rating floor',
    surface: 'in-place',
    control: 'features/explorer/ExplorerPanel.tsx',
    consumer: 'features/explorer/ExplorerPanel.tsx',
    effect: 'Games below the floor leave the counts, where the source supports the filter.',
    indexedAs: null,
    previewable: true,
  },
  {
    key: 'explorerSinceYear',
    label: 'Explorer earliest year',
    surface: 'in-place',
    control: 'features/explorer/ExplorerPanel.tsx',
    consumer: 'features/explorer/ExplorerPanel.tsx',
    effect: 'Games before the year leave the counts, where the source supports the filter.',
    indexedAs: null,
    previewable: true,
  },
  {
    key: 'sourceSettings',
    label: 'Reference sources',
    surface: 'settings',
    control: 'reference/sources.ts',
    consumer: 'reference/sources.ts',
    effect: 'A disabled source stops being queried and stops answering anywhere.',
    indexedAs: 'reference-sources',
    previewable: true,
    verifiedBy: 'e2e/reference-sources.spec.ts',
  },
  {
    key: 'sourcePriority',
    label: 'Source priority',
    surface: 'settings',
    control: 'reference/sources.ts',
    consumer: 'reference/sources.ts',
    effect:
      'A surface that has not been told which source to use reaches for a different one first.',
    indexedAs: 'reference-sources',
    previewable: true,
    notBrowserCheckable:
      'Changes which source an unspecified surface reaches for first; no single visible surface asserts it.',
  },
  {
    key: 'openingsMode',
    label: 'Openings mode',
    surface: 'in-place',
    control: 'features/openings/OpeningsWorkspace.tsx',
    consumer: 'features/openings/OpeningsWorkspace.tsx',
    effect: 'The Openings route returns to the half the user was last working in.',
    indexedAs: null,
    previewable: true,
  },
  {
    key: 'showVariationBrief',
    label: 'Variation brief',
    surface: 'in-place',
    control: 'features/openings/VariationBriefPanel.tsx',
    consumer: 'features/openings/VariationBriefPanel.tsx',
    effect: 'The prose explanation of the named variation is shown or hidden.',
    indexedAs: null,
    previewable: true,
    verifiedBy: 'e2e/variation-brief.spec.ts',
  },
  {
    key: 'companionUrl',
    label: 'Companion address',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'companion/useCompanion.ts',
    effect: 'Companion requests go to that address.',
    indexedAs: 'companion',
    previewable: true,
    notBrowserCheckable: 'Needs a companion process at a known address.',
  },
  {
    key: 'companionToken',
    label: 'Companion token',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'companion/useCompanion.ts',
    effect: 'Companion requests carry that token, and are rejected without it.',
    indexedAs: 'companion',
    previewable: true,
    notBrowserCheckable: 'Needs a companion process to accept or reject the token.',
  },
  {
    key: 'lichessToken',
    label: 'Lichess token',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'database/providers/lichess-auth.ts',
    effect: 'Lichess requests are authenticated, so the Lichess explorer answers at all.',
    indexedAs: 'lichess-token',
    previewable: true,
    notBrowserCheckable:
      'Needs a real Lichess token, which requires a consent step no agent can give.',
  },
  {
    key: 'rememberLichessToken',
    label: 'Remember Lichess token',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/shell/LichessCallback.tsx',
    effect: 'The token survives a reload, or is dropped when the tab closes.',
    indexedAs: 'lichess-token',
    previewable: false,
    notBrowserCheckable: 'Covered by the store test; the effect is what reaches storage.',
  },
  {
    key: 'lichessUsername',
    label: 'Lichess account',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/shell/SettingsDialog.tsx',
    effect: 'Settings says which account is connected, without displaying the token.',
    indexedAs: 'linked-accounts',
    previewable: true,
  },
  {
    key: 'assistantBaseUrl',
    label: 'Assistant endpoint',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/assistant/CompanionPanel.tsx',
    effect: 'Evidence packets are sent to that endpoint.',
    indexedAs: null,
    previewable: true,
    notBrowserCheckable: 'Needs an assistant endpoint to receive the request.',
  },
  {
    key: 'assistantModel',
    label: 'Assistant model',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/assistant/CompanionPanel.tsx',
    effect: 'The request names that model.',
    indexedAs: null,
    previewable: true,
    notBrowserCheckable: 'Needs an assistant endpoint to receive the request.',
  },
  {
    key: 'assistantApiKey',
    label: 'Assistant key',
    surface: 'settings',
    control: 'features/shell/SettingsDialog.tsx',
    consumer: 'features/assistant/CompanionPanel.tsx',
    effect: 'The request is authenticated, and fails without it.',
    indexedAs: null,
    previewable: true,
    notBrowserCheckable: 'Needs an assistant endpoint to accept or reject the key.',
  },
];

/**
 * Entries in `SETTINGS_INDEX` that are not preferences.
 *
 * They are real settings — a user changes them and something happens — but
 * they live in another store or are an action rather than a stored value, so
 * `SETTING_CONTRACTS` cannot claim them. Listed so the test can tell "not a
 * preference" from "a preference somebody forgot".
 */
export const NON_PREFERENCE_SETTINGS: Readonly<Record<string, string>> = {
  compact: 'workspace-layout-store: chrome density',
  'layout-preset': 'workspace-layout-store: panel arrangement',
  'pinned-tools': 'workspace-layout-store: tools kept in the tab strip',
  'opening-books': 'book store: installed Polyglot books',
  aliases: 'command store: user-defined command aliases',
  shortcuts: 'command bindings: keyboard map',
  'account-sync': 'an action, not a stored value',
  backup: 'an action, not a stored value',
  'settings-transfer': 'an action, not a stored value',
  integrity: 'an action, not a stored value',
  /*
    Phase 39 (PART J): the entry points to the GitHub issue
    templates and the in-product Copy support information button.
    It is a navigation target rather than a stored preference,
    which is why it lives here and not in SETTING_CONTRACTS.
  */
  'help-and-feedback': 'a navigation target, not a stored value',
};
