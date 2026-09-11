'use client';

/**
 * User preferences.
 *
 * The only store that is persisted. Everything here is a setting the user
 * chose, which means it must survive a reload and must never be derived from
 * anything else; analysis, engine runtime state and UI transients live
 * elsewhere precisely so that this file stays small and stable.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AnalysisLimit } from '@/engine/types';
import { DEFAULT_BOARD_PRIORITY, type BoardPriority } from '@/features/workspace/layout-model';
import type { SourcePreference } from '@/reference/types';
import type { EnginePresetId } from '@/engine/presets';
import { DEFAULT_PIECE_SET_ID, LEGACY_PIECE_SET_IDS } from '@/lib/board-options';
import type {
  AnimationSpeed,
  ArrowPaletteId,
  BoardThemeId,
  CoordinateStyle,
  PieceSetId,
} from '@/lib/board-options';

export type AppTheme = 'dark' | 'light';

export interface Preferences {
  theme: AppTheme;
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
  coordinateStyle: CoordinateStyle;
  animationSpeed: AnimationSpeed;
  arrowPalette: ArrowPaletteId;
  showEvaluationBar: boolean;
  /** The bar chart of stored evaluations under the board. */
  showEvaluationGraph: boolean;
  /**
   * Whether to draw the engine's best-move arrow on the board.
   *
   * On by default — a study tool that hides the engine's recommendation
   * from the board is one the user has to open the panel to use, which is
   * not the design. Off is a single toggle in Settings for the user who
   * wants the board to show only their own annotations.
   */
  showEngineArrows: boolean;
  /**
   * How much of a workspace the board is entitled to.
   *
   * A policy, not a pixel count — see `BOARD_PRIORITIES`. It sizes the chrome
   * around the board; the board takes what is left, which is why one setting
   * works on a laptop and on a 27-inch display.
   */
  boardPriority: BoardPriority;
  /** Analyse automatically whenever the position changes. */
  autoAnalyse: boolean;
  engineMultiPv: number;
  engineThreads: number;
  engineHashMb: number;
  engineLimit: AnalysisLimit;
  explorerSourceId: string;
  explorerMinRating: number | null;
  explorerSinceYear: number | null;
  /**
   * Which data sources are in use, and for what.
   *
   * Sparse: a source absent from this record is on, with every capability it
   * declares. Storing only what the user has changed is what lets a later
   * build add a source without every saved profile needing a migration to
   * mention it — and what makes "reset" mean something.
   */
  /**
   * Which half of the Openings route was last used.
   *
   * Persisted because a mode that resets on every reload is a mode the user
   * has to re-choose every time they come back to a line they were working on.
   */
  openingsMode: 'library' | 'explorer';
  /**
   * Show the prose explanation of the named variation, not only its name.
   *
   * On by default: a player who does not know what an English Attack is is
   * exactly the reader the explorer is failing today. A player who does know
   * turns it off once and it stays off.
   */
  showVariationBrief: boolean;
  sourceSettings: Record<string, SourcePreference>;
  /**
   * Source ids in the order the user prefers them, most trusted first.
   *
   * Only sources the user has explicitly ranked appear; everything else keeps
   * its declared order behind them. Priority never merges populations — it
   * decides which source a surface reaches for first when the user has not
   * named one, and the answer is always attributed to the source it came from.
   */
  sourcePriority: string[];
  /** Analysis preset the engine panel starts from. */
  enginePreset: EnginePresetId;
  /** Which engine the panel drives, and which one it compares against. */
  primaryEngineId: string;
  /**
   * Engines hidden from the selector.
   *
   * Stored as what is *hidden* rather than what is shown, so installing an
   * engine makes it available without a second step, and a build that adds an
   * engine does not need every saved profile to opt into it.
   */
  hiddenEngineIds: string[];
  secondaryEngineId: string;
  /**
   * The local companion, as pasted from the terminal that started it.
   *
   * The token is a session secret and lives in `localStorage` with the rest of
   * the preferences. That is the same exposure as anything else this
   * origin stores, and the companion only accepts it from loopback — but it is
   * why the companion mints a new one on every run rather than persisting it.
   */
  companionUrl: string;
  companionToken: string;
  /**
   * A personal Lichess API token for the opening explorer.
   *
   * Lichess requires authentication for explorer requests. Shipping a
   * developer credential would breach their terms and give every user one
   * shared rate limit, so each user supplies their own or uses a local source.
   */
  lichessToken: string;
  /** Persist the Lichess token across reloads; off keeps it in memory for this session only. */
  rememberLichessToken: boolean;
  /**
   * The Lichess account the stored token belongs to.
   *
   * Recorded when a sign-in completes so Settings can say *who* is connected
   * without spending a request — and without ever displaying the token, which
   * is the one thing about a credential a settings page must not do.
   */
  lichessUsername: string;
  /** Where the assistant sends evidence packets, if the user configured one. */
  assistantBaseUrl: string;
  assistantModel: string;
  assistantApiKey: string;
}

interface PreferencesActions {
  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void;
  toggleTheme(): void;
  reset(): void;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  boardTheme: 'walnut',
  pieceSet: DEFAULT_PIECE_SET_ID,
  coordinateStyle: 'inside',
  animationSpeed: 'normal',
  arrowPalette: 'standard',
  showEvaluationBar: true,
  showEvaluationGraph: true,
  showEngineArrows: true,
  autoAnalyse: false,
  engineMultiPv: 3,
  engineThreads: 1,
  engineHashMb: 64,
  engineLimit: { kind: 'infinite' },
  explorerSourceId: 'kingfisher-starter',
  explorerMinRating: null,
  explorerSinceYear: null,
  boardPriority: DEFAULT_BOARD_PRIORITY,
  hiddenEngineIds: [],
  openingsMode: 'library',
  showVariationBrief: true,
  sourceSettings: {},
  sourcePriority: [],
  enginePreset: 'standard',
  primaryEngineId: 'stockfish-wasm',
  secondaryEngineId: 'lc0',
  companionUrl: '',
  companionToken: '',
  lichessToken: '',
  rememberLichessToken: false,
  lichessUsername: '',
  assistantBaseUrl: '',
  assistantModel: '',
  assistantApiKey: '',
};

/**
 * How long a move animation lasts.
 *
 * Resolved here rather than in the board so that the reduced-motion check lives
 * with the preference it overrides. A user who has asked their operating system
 * for less motion gets none, whatever the stored value says.
 */
export function resolveAnimationMs(speed: AnimationSpeed): number {
  if (speed === 'off') return 0;
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    return 0;
  }
  return speed === 'fast' ? 70 : 130;
}

export const usePreferences = create<Preferences & PreferencesActions>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      set: (key, value) => set({ [key]: value } as Partial<Preferences>),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      reset: () => set({ ...DEFAULT_PREFERENCES }),
    }),
    {
      name: 'kingfisher.preferences',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      /**
       * Phase 3 replaced two booleans with named scales. Migrating rather than
       * resetting keeps a user who turned coordinates off from having them
       * reappear after an update.
       */
      migrate: (persisted, version) => {
        if (persisted === null || typeof persisted !== 'object') return persisted as Preferences;
        let state = persisted as Record<string, unknown>;

        if (version < 2) {
          const { showCoordinates, animateMoves, ...rest } = state;
          state = {
            ...rest,
            coordinateStyle: showCoordinates === false ? 'none' : 'inside',
            animationSpeed: animateMoves === false ? 'off' : 'normal',
            arrowPalette: 'standard',
            enginePreset: 'standard',
          };
        }

        /*
          Phase 4 replaced the hand-drawn geometry sets with licensed artwork.
          A stored id naming one of them still renders — the fallback registry
          keeps them — but leaving a user on it would mean they never see the
          reason the artwork was vendored. The id is moved forward once; anyone
          who prefers something else picks it again in Settings.
        */
        if (version < 3 && LEGACY_PIECE_SET_IDS.includes(state.pieceSet as PieceSetId)) {
          state = { ...state, pieceSet: DEFAULT_PIECE_SET_ID };
        }

        return state as unknown as Preferences;
      },
      partialize: ({ set: _set, toggleTheme: _toggle, reset: _reset, ...rest }) => ({
        ...rest,
        lichessToken: rest.rememberLichessToken ? rest.lichessToken : '',
      }),
    },
  ),
);
