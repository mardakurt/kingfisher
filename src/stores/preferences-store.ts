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
import type { BoardThemeId, PieceSetId } from '@/lib/board-options';

export type AppTheme = 'dark' | 'light';

export interface Preferences {
  theme: AppTheme;
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
  showCoordinates: boolean;
  animateMoves: boolean;
  showEvaluationBar: boolean;
  /** Analyse automatically whenever the position changes. */
  autoAnalyse: boolean;
  engineMultiPv: number;
  engineThreads: number;
  engineHashMb: number;
  engineLimit: AnalysisLimit;
  explorerSourceId: string;
  explorerMinRating: number | null;
  explorerSinceYear: number | null;
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
  showCoordinates: true,
  animateMoves: true,
  showEvaluationBar: true,
  autoAnalyse: false,
  engineMultiPv: 3,
  engineThreads: 1,
  engineHashMb: 64,
  engineLimit: { kind: 'infinite' },
  explorerSourceId: 'lichess-masters',
  explorerMinRating: null,
  explorerSinceYear: null,
};

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
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ set: _set, toggleTheme: _toggle, reset: _reset, ...rest }) => rest,
    },
  ),
);
