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
import type { EnginePresetId } from '@/engine/presets';
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
  /** Analyse automatically whenever the position changes. */
  autoAnalyse: boolean;
  engineMultiPv: number;
  engineThreads: number;
  engineHashMb: number;
  engineLimit: AnalysisLimit;
  explorerSourceId: string;
  explorerMinRating: number | null;
  explorerSinceYear: number | null;
  /** Analysis preset the engine panel starts from. */
  enginePreset: EnginePresetId;
}

interface PreferencesActions {
  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void;
  toggleTheme(): void;
  reset(): void;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  boardTheme: 'slate',
  pieceSet: 'staunton',
  coordinateStyle: 'inside',
  animationSpeed: 'normal',
  arrowPalette: 'standard',
  showEvaluationBar: true,
  showEvaluationGraph: true,
  autoAnalyse: false,
  engineMultiPv: 3,
  engineThreads: 1,
  engineHashMb: 64,
  engineLimit: { kind: 'infinite' },
  explorerSourceId: 'lichess-masters',
  explorerMinRating: null,
  explorerSinceYear: null,
  enginePreset: 'standard',
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
      version: 2,
      storage: createJSONStorage(() => localStorage),
      /**
       * Phase 3 replaced two booleans with named scales. Migrating rather than
       * resetting keeps a user who turned coordinates off from having them
       * reappear after an update.
       */
      migrate: (persisted, version) => {
        if (version >= 2 || persisted === null || typeof persisted !== 'object') {
          return persisted as Preferences;
        }
        const old = persisted as Record<string, unknown>;
        const { showCoordinates, animateMoves, ...rest } = old;
        return {
          ...rest,
          coordinateStyle: showCoordinates === false ? 'none' : 'inside',
          animationSpeed: animateMoves === false ? 'off' : 'normal',
          arrowPalette: 'standard',
          enginePreset: 'standard',
        } as unknown as Preferences;
      },
      partialize: ({ set: _set, toggleTheme: _toggle, reset: _reset, ...rest }) => rest,
    },
  ),
);
