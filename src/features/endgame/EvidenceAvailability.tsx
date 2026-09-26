'use client';

/**
 * What can answer for the position on the Endgame board (Phase 86).
 *
 * The page said "Want tablebase lookups? Install Syzygy files", while every
 * position of seven pieces or fewer was already answered by lichess.org's
 * online tablebase — so a player believed they had no tablebase, and did not
 * know their positions were being sent to lichess.org. This states, for the
 * position on the board, which tablebase covers it (local files through the
 * companion first, then lichess.org online, and that the online one sends the
 * position), or that none can at this piece count, and which engine will
 * play and evaluate.
 */

import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { companionClient } from '@/companion/session';
import { usePreferences } from '@/stores/preferences-store';

const ONLINE_LIMIT = 7;

const subscribe = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};

export function EvidenceAvailability({ pieces }: { readonly pieces: number | null }) {
  const paired = usePreferences((state) => Boolean(state.companionUrl && state.companionToken));
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const local = useQuery({
    queryKey: ['tablebase-status', paired],
    enabled: paired,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const client = companionClient();
      if (!client) return null;
      return client.tablebaseStatus();
    },
  });
  const localMax = local.data?.canProbe ? local.data.maxPieces : 0;

  const tablebase =
    pieces === null
      ? 'No position on the board.'
      : localMax > 0 && pieces <= localMax
        ? `Tablebase: your local Syzygy files (up to ${localMax} pieces) answer this position, on this machine.`
        : pieces <= ONLINE_LIMIT
          ? online
            ? `Tablebase: lichess.org’s online tablebase answers positions of up to ${ONLINE_LIMIT} pieces; the position is sent to lichess.org.${
                localMax > 0 ? ` Your local files stop at ${localMax} pieces.` : ''
              }`
            : `Tablebase: offline. lichess.org’s online tablebase would answer this ${pieces}-piece position; ${
                localMax > 0
                  ? `your local files stop at ${localMax} pieces.`
                  : 'no local Syzygy files are set up.'
              }`
          : `Tablebase: none covers ${pieces} pieces — tablebases stop at ${ONLINE_LIMIT}. The engine alone answers here.`;

  return (
    <section
      className="shrink-0 border-b border-line-subtle px-3 py-2 text-[10.5px] leading-relaxed text-tertiary"
      aria-label="What can answer here"
      data-endgame-availability
    >
      <p className="text-[10px] font-semibold text-secondary">What can answer here</p>
      <p data-endgame-tablebase>{tablebase}</p>
      <p>
        Engine: Stockfish in this {paired ? 'browser, and the companion’s engines' : 'browser'} — it
        plays the other side in Play it out and evaluates in Engine.
      </p>
    </section>
  );
}
