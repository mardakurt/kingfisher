'use client';

/**
 * The opening map, under the explorer's move table.
 *
 * Three plies of the chosen source at once, as nested blocks: a move's width
 * is its share of the games at its position, its shade is how White scored
 * after it — light where White did well, dark where Black did, the board's
 * own evaluation colours. A click plays the whole line on the board.
 *
 * It is the explorer's question asked about every drawn branch
 * (`src/database/opening-map.ts`), so it is one named source with its own
 * counts, and it asks only on request: about thirty positions for three plies.
 * A source on this machine answers that in a moment. A remote one would be
 * asked thirty times for one picture, which is not a fair use of somebody
 * else's service — so the map is offered only for local sources, and says why
 * otherwise.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { Fen, Uci } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { buildOpeningMap, OPENING_MAP_DEFAULTS } from '@/database/opening-map';
import { databaseProviderById } from '@/database/registry';
import type { ExplorerFilters, ExplorerResult } from '@/database/types';

import { OpeningMapView } from './OpeningMapView';

export function OpeningMapSection({
  sourceId,
  sourceName,
  local,
  fen,
  filters,
  onPlayLine,
}: {
  readonly sourceId: string;
  readonly sourceName: string;
  /** The source answers from this machine. */
  readonly local: boolean;
  readonly fen: Fen;
  readonly filters: ExplorerFilters;
  readonly onPlayLine: (line: readonly Uci[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const version = databaseProviderById(sourceId)?.cacheVersion ?? 'live';

  const map = useQuery({
    enabled: open && local,
    queryKey: ['opening-map', sourceId, version, fen, filters],
    staleTime: 60_000,
    retry: false,
    queryFn: ({ signal }) =>
      buildOpeningMap({
        fen,
        signal,
        // The explorer's own cache, under the explorer's own keys: a position
        // the table has already shown is not asked for again, and one the map
        // reads is there when the person clicks into it.
        explore: (at) =>
          client.fetchQuery<ExplorerResult>({
            queryKey: ['explorer', sourceId, version, at, filters],
            queryFn: ({ signal: inner }) => {
              const provider = databaseProviderById(sourceId);
              if (!provider) throw new Error(`Unknown database: ${sourceId}`);
              return provider.explore({ fen: at, filters, limit: 15 }, inner);
            },
            staleTime: 60_000,
          }),
      }),
  });

  return (
    <section className="border-t border-line-subtle" aria-label="Opening map" data-opening-map>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <h3 className="text-[10px] font-semibold text-tertiary">Opening map</h3>
        <span className="min-w-0 flex-1 truncate text-[10px] text-tertiary">
          The next {OPENING_MAP_DEFAULTS.depth} moves in {sourceName}, at a glance
        </span>
        <Button size="sm" variant="subtle" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide map' : 'Show map'}
        </Button>
      </div>

      {open && !local ? (
        <p className="px-2.5 pb-2.5 text-[11px] text-secondary" data-opening-map-remote>
          The map asks a source about every branch it draws — about thirty positions — so it is
          offered for sources on this machine. Choose an installed reference or one of your own
          databases to draw it.
        </p>
      ) : null}

      {open && local && map.isPending ? (
        <p className="px-2.5 pb-2.5 text-[11px] text-tertiary" role="status">
          Reading the branches in {sourceName}…
        </p>
      ) : null}

      {open && local && map.isError ? (
        <p className="px-2.5 pb-2.5 text-[11px] text-negative" role="alert">
          {sourceName} could not be read for the map. The table above is unaffected.
        </p>
      ) : null}

      {open && local && map.data && map.data.totalGames === 0 ? (
        <p className="px-2.5 pb-2.5 text-[11px] text-tertiary">
          {sourceName} has no games at this position, so there is nothing to map.
        </p>
      ) : null}

      {open && local && map.data && map.data.totalGames > 0 ? (
        <div className="px-2.5 pb-2.5">
          <OpeningMapView
            map={map.data}
            label={`Opening map of ${sourceName}`}
            denominator="the games at its position (by any move order)"
            verb="Play"
            onSelectLine={(node) => onPlayLine(node.line)}
          />
          <p className="mt-1 text-[10px] text-tertiary">Click a block to play its line.</p>
        </div>
      ) : null}
    </section>
  );
}
