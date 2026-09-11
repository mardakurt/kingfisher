'use client';

/**
 * Personal games overlay for the explorer comparison view.
 *
 * The Compare Sources panel shows what several reference populations think
 * about the position. Before Phase 43 the personal answer — the player's own
 * games at this position — was never put beside them; the only place it
 * surfaced was a single count in the "in your work" panel, which is the
 * right answer to a different question ("how much of your work touches
 * here", not "how do you play this position").
 *
 * This component is the personal answer in the comparison's own vocabulary:
 * one row per move the player has actually played, the same frequency and
 * result fields the reference columns carry, and a provenance line that
 * makes clear where the number came from. It deliberately never appears in
 * the same table as the reference sources — those are populations of other
 * people's games and merging the two would be the comparison's whole
 * "populations are never merged" rule, broken.
 */

import { useQuery } from '@tanstack/react-query';

import type { Fen } from '@/chess/types';
import { getRepositories } from '@/persistence/repositories';
import type { ExplorerResult } from '@/database/types';

export interface MyGamesOverlayProps {
  readonly fen: Fen;
  /** Show the panel even when there are no personal games; default hides it. */
  readonly forceShow?: boolean;
}

export function MyGamesOverlay({ fen, forceShow = false }: MyGamesOverlayProps) {
  /*
    The query key is the FEN only — personal games do not depend on the
    source-side filter set the reference explorer uses, and a filter change
    must not invalidate a result that did not use it.
  */
  const query = useQuery<ExplorerResult | null>({
    queryKey: ['my-games-overlay', fen],
    queryFn: async () => {
      const repositories = await getRepositories();
      return repositories.games.explore(fen, {}, 8);
    },
    // Personal games are local data; they can be cached across navigation
    // for a comfortable window without leaking into "no recent games".
    gcTime: 5 * 60_000,
    staleTime: 60_000,
  });

  const result = query.data;
  const total = result?.totalGames ?? 0;
  const moves = result?.moves ?? [];

  if (!forceShow && total === 0 && !query.isPending) return null;

  return (
    <section
      className="border-t border-line-subtle bg-surface-2/40 px-2.5 py-2"
      data-my-games-overlay
      data-personal-games={total}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-wide text-tertiary">My games</h3>
        <span className="text-[10px] tabular text-tertiary">
          {query.isPending ? '…' : `${total.toLocaleString()} games`}
        </span>
      </div>
      {total === 0 && !query.isPending ? (
        <p className="mt-1 text-[10px] leading-relaxed text-tertiary">
          This position has not appeared in any game you have imported yet.
        </p>
      ) : (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full border-collapse text-[10.5px]" data-my-games-table>
            <thead>
              <tr className="text-left text-[9.5px] uppercase tracking-wide text-tertiary">
                <th className="py-1 pr-2 font-medium">Move</th>
                <th className="px-1.5 py-1 text-right font-medium">N</th>
                <th className="px-1.5 py-1 text-right font-medium">Frequency</th>
                <th className="px-1.5 py-1 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {moves.map((move) => {
                const share = total > 0 ? move.games / total : 0;
                const whiteScore = move.games > 0 ? (move.white + move.draws / 2) / move.games : 0;
                return (
                  <tr key={move.uci} data-my-games-row={move.san}>
                    <td className="py-1 pr-2 font-medium text-primary">{move.san}</td>
                    <td className="px-1.5 py-1 text-right tabular text-secondary">
                      {move.games.toLocaleString()}
                    </td>
                    <td className="px-1.5 py-1 text-right tabular text-secondary">
                      {(share * 100).toFixed(1)}%
                    </td>
                    <td className="px-1.5 py-1 text-right tabular text-secondary">
                      {move.games > 0 ? `${Math.round(whiteScore * 100)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-1 text-[10px] leading-relaxed text-tertiary">
        Personal games live only in your local database. They never leave this device and are never
        combined with the reference sources above.
      </p>
    </section>
  );
}
