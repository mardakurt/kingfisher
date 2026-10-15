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

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { Fen, Uci } from '@/chess/types';
import { startingPly } from '@/chess/tree/tree';
import { moveNumberOfPly } from '@/chess/tree/types';
import { Button } from '@/components/ui/Button';
import { databaseProviderById } from '@/database/registry';
import {
  buildOpeningMap,
  layoutOpeningMap,
  OPENING_MAP_DEFAULTS,
  whiteScore,
  type OpeningMapNode,
} from '@/database/opening-map';
import type { ExplorerFilters, ExplorerResult } from '@/database/types';
import { useSanDisplay } from '@/features/movetree/use-san-display';
import { plural } from '@/lib/plural';

const ROW_HEIGHT = 30;

/**
 * A move's line from the map's root, numbered as a person reads it. Plain
 * SAN: this is the block's spoken name and tooltip, which are text.
 */
function lineText(root: Fen, node: OpeningMapNode): string {
  const first = startingPly(root);
  return node.sanLine
    .map((san, index) => {
      const ply = first + index + 1;
      if (ply % 2 === 1) return `${moveNumberOfPly(ply)}.${san}`;
      return index === 0 ? `${moveNumberOfPly(ply)}...${san}` : san;
    })
    .join(' ');
}

/**
 * The block's shade. Two bands, never the grey in between: a block where
 * White scored half or better is light with dark text, the rest dark with
 * light text, and how far from even it is sets how light or dark. A
 * continuous scale put the most even moves in a mid-grey that neither text
 * colour could be read on.
 */
function shade(score: number): { background: string; color: string } {
  // Twelve points from even is already a clear edge in master play, and few
  // opening moves score further from it; past that the shade stops changing.
  const margin = Math.min(1, Math.abs(score - 0.5) / 0.12);
  if (score >= 0.5) {
    const white = Math.round(100 - margin * 30);
    return {
      background: `color-mix(in oklab, var(--eval-white) ${white}%, var(--eval-black))`,
      color: 'var(--eval-black)',
    };
  }
  const white = Math.round(30 - margin * 30);
  return {
    background: `color-mix(in oklab, var(--eval-white) ${white}%, var(--eval-black))`,
    color: 'var(--eval-white)',
  };
}

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
  const display = useSanDisplay();
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

  const blocks = useMemo(() => (map.data ? layoutOpeningMap(map.data) : []), [map.data]);
  const rows = blocks.reduce((most, block) => Math.max(most, block.row + 1), 0);

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
          <div
            className="relative w-full overflow-hidden rounded-[var(--radius-control)] bg-surface-2"
            style={{ height: rows * ROW_HEIGHT }}
            role="group"
            aria-label={`Opening map of ${sourceName}`}
          >
            {blocks.map((block) => {
              const { node } = block;
              const score = whiteScore(node);
              const colours = shade(score);
              const line = lineText(map.data.fen, node);
              const percent = Math.round(score * 100);
              const label = `${line}: ${plural(node.games, 'game')}, ${Math.round(
                node.share * 100,
              )}% of ${node.ofGames.toLocaleString()} at this position; White scored ${percent}%`;
              return (
                <button
                  key={node.line.join(' ')}
                  type="button"
                  onClick={() => onPlayLine(node.line)}
                  aria-label={`Play ${label}`}
                  title={label}
                  data-opening-map-block={node.sanLine.join(' ')}
                  className="absolute overflow-hidden border border-surface-1 px-1 text-left text-[11px] leading-[28px] font-medium whitespace-nowrap transition-[filter] hover:brightness-95 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                  style={{
                    left: `${block.x * 100}%`,
                    width: `${block.width * 100}%`,
                    top: block.row * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                    ...colours,
                  }}
                >
                  {/* Too narrow to name is still there to click and to read aloud. */}
                  {block.width >= 0.08 ? display(node.san) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-tertiary" data-opening-map-key>
            {map.data.totalGames.toLocaleString()} games in {sourceName}. Width is each move’s share
            of the games at its position (by any move order); shade is White’s score — lighter where
            White did better, darker where Black did. Moves under{' '}
            {Math.round(map.data.minShare * 100)}% are left out
            {map.data.omittedGames > 0 ? ` (${plural(map.data.omittedGames, 'game')} here)` : ''}.
            Click a block to play its line.
          </p>
        </div>
      ) : null}
    </section>
  );
}
