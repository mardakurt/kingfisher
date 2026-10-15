'use client';

/**
 * An opening map, drawn: the blocks and the sentence that says what they
 * mean. Shared by the explorer, where the map is a source's games and the
 * shade is White's score, and the preparation report, where it is one
 * player's games and the shade is that player's score
 * (`src/database/opening-map.ts`, `src/preparation/opening-map.ts`).
 */

import type { ReactNode } from 'react';

import type { Fen } from '@/chess/types';
import { startingPly } from '@/chess/tree/tree';
import { moveNumberOfPly } from '@/chess/tree/types';
import { layoutOpeningMap, type OpeningMap, type OpeningMapNode } from '@/database/opening-map';
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
 * The block's shade. Two bands, never the grey in between: a block where the
 * named side scored half or better is light with dark text, the rest dark
 * with light text, and how far from even it is sets how light or dark. A
 * continuous scale put the most even moves in a mid-grey that neither text
 * colour could be read on.
 */
function shade(score: number): { background: string; color: string } {
  // Twelve points from even is already a clear edge, and few opening moves
  // score further from it; past that the shade stops changing.
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

export function OpeningMapView({
  map,
  label,
  denominator,
  verb,
  onSelectLine,
}: {
  readonly map: OpeningMap;
  /** The group's accessible name. */
  readonly label: string;
  /** What "at this position" counts, said in the key. */
  readonly denominator: ReactNode;
  /** What a click does, as the first word of each block's name. */
  readonly verb: 'Play' | 'Show';
  readonly onSelectLine: (node: OpeningMapNode) => void;
}) {
  const display = useSanDisplay();
  const blocks = layoutOpeningMap(map);
  const rows = blocks.reduce((most, block) => Math.max(most, block.row + 1), 0);

  return (
    <>
      <div
        className="relative w-full overflow-hidden rounded-[var(--radius-control)] bg-surface-2"
        style={{ height: rows * ROW_HEIGHT }}
        role="group"
        aria-label={label}
      >
        {blocks.map((block) => {
          const { node } = block;
          const line = lineText(map.fen, node);
          const description = `${line}: ${plural(node.games, 'game')}, ${Math.round(
            node.share * 100,
          )}% of ${node.ofGames.toLocaleString()} at this position; ${map.scoreFor} scored ${Math.round(
            node.score * 100,
          )}%`;
          return (
            <button
              key={node.line.join(' ')}
              type="button"
              onClick={() => onSelectLine(node)}
              aria-label={`${verb} ${description}`}
              title={description}
              data-opening-map-block={node.sanLine.join(' ')}
              className="absolute overflow-hidden border border-surface-1 px-1 text-left text-[11px] leading-[28px] font-medium whitespace-nowrap transition-[filter] hover:brightness-95 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              style={{
                left: `${block.x * 100}%`,
                width: `${block.width * 100}%`,
                top: block.row * ROW_HEIGHT,
                height: ROW_HEIGHT,
                ...shade(node.score),
              }}
            >
              {/* Too narrow to name is still there to click and to read aloud. */}
              {block.width >= 0.08 ? display(node.san) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-tertiary" data-opening-map-key>
        {map.totalGames.toLocaleString()} games in {map.source.name}. Width is each move’s share of{' '}
        {denominator}; shade is {map.scoreFor}’s score — lighter where {map.scoreFor} did better,
        darker where it went the other way. Moves under {Math.round(map.minShare * 100)}% are left
        out{map.omittedGames > 0 ? ` (${plural(map.omittedGames, 'game')} here)` : ''}.
      </p>
    </>
  );
}
