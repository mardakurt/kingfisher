'use client';

/**
 * The seasons a player has opened, kept across sessions so the reader can
 * answer "when did this trend start?".
 *
 * One entry per named set the player has looked at. The URL is the key —
 * two sets with the same URL are the same season. The section hashes are
 * recorded so a later visit can answer "did this section change since you
 * last looked?" without re-reading every game.
 *
 * Deliberately small and append-only. There is no edit, no merge, no
 * delete. The store's job is the "First seen" line in `season.md`, not a
 * timeline; the player reads the URL and the timestamp, the reader does
 * not infer a trend.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface SeasonLogEntry {
  /** Canonical URL of the season (e.g. `/season?set=last90`). */
  readonly url: string;
  /** What the picker showed — "Last 90 days", "Club Open 2026", etc. */
  readonly label: string;
  /** Hashes of each section, in the order the reader renders them. */
  readonly sectionHashes: readonly string[];
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

interface SeasonLogState {
  readonly entries: readonly SeasonLogEntry[];
  /**
   * Record a visit. If the URL is new, a new entry is appended. If the URL
   * exists, the entry's `lastSeenAt` and `sectionHashes` are updated.
   */
  record(visit: {
    readonly url: string;
    readonly label: string;
    readonly sectionHashes: readonly string[];
    readonly at?: number;
  }): void;
  /** Find the first time a URL was visited, or null. */
  firstSeen(url: string): SeasonLogEntry | null;
}

const MAX_ENTRIES = 64;

export const useSeasonLog = create<SeasonLogState>()(
  persist(
    (set, get) => ({
      entries: [],
      record: ({ url, label, sectionHashes, at = Date.now() }) =>
        set((state) => {
          const existing = state.entries.find((entry) => entry.url === url);
          if (existing) {
            return {
              entries: state.entries.map((entry) =>
                entry.url === url
                  ? { ...entry, lastSeenAt: at, sectionHashes, label }
                  : entry,
              ),
            };
          }
          const entry: SeasonLogEntry = {
            url,
            label,
            sectionHashes,
            firstSeenAt: at,
            lastSeenAt: at,
          };
          // Newest last; cap at MAX_ENTRIES so a player who picks a new
          // set every day does not grow the store without bound.
          const next = [...state.entries, entry].slice(-MAX_ENTRIES);
          return { entries: next };
        }),
      firstSeen: (url) => get().entries.find((entry) => entry.url === url) ?? null,
    }),
    {
      name: 'kingfisher.season-log',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
