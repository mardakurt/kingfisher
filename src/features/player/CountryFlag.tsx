'use client';

/**
 * A player's country beside their name, as ChessBase's game lists show it.
 *
 * Read from the titled-player roster (Wikidata, CC0), which records a
 * country of *citizenship* — not the federation a player represents at the
 * board, and the title says so. A name the roster does not know, or knows
 * more than one way, gets no flag rather than a guessed one. The roster is a
 * file Kingfisher ships, so drawing a flag asks no one anything.
 */

import { useQuery } from '@tanstack/react-query';

import { flagOf, rosterIndex } from '@/reference/player-photo';
import { loadTitledRoster } from '@/reference/titled-players';

export function useRosterLookup() {
  return useQuery({
    queryKey: ['titled-roster-index'],
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async () => rosterIndex(await loadTitledRoster()),
  }).data;
}

export function CountryFlag({ name }: { readonly name: string }) {
  const lookup = useRosterLookup();
  const iso = lookup?.(name)?.citizenship ?? '';
  const flag = flagOf(iso);
  if (!flag) return null;
  return (
    <span
      className="mr-1 inline-block shrink-0 text-[0.95em] leading-none"
      title={`${iso}: country of citizenship, from Wikidata`}
      // Beside a name that is itself a control: the flag must not become part of
      // that control's accessible name.
      aria-hidden
      data-country-flag={iso}
    >
      {flag}
    </span>
  );
}
