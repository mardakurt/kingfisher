'use client';

/**
 * Rating classes and years, under the explorer's move table.
 *
 * ChessBase for Mac's "which move scores best at your rating": pick a rating
 * class and the order of the moves changes. A pack cannot filter its move
 * counts by rating, so this reads the pack's position histories instead —
 * the games of each band that reached the position after each move — and
 * says so in the section's own words (`src/reference/rating-classes.ts`).
 * Only an installed pack that carries histories is asked; a source that can
 * really filter by rating has the Min Elo filter for that.
 */

import { useSanDisplay } from '@/features/movetree/use-san-display';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import { Position } from '@/chess/position';
import type { Fen } from '@/chess/types';
import type { DatabaseMove } from '@/database/types';
import { Segmented } from '@/components/ui/Tabs';
import type { PackReader } from '@/reference/reader';
import {
  bandLabel,
  fashionOf,
  FASHION_MIN_YEAR_GAMES,
  movesInBand,
  positionByBand,
  type BandRow,
  type ChildHistory,
  type Fashion,
} from '@/reference/rating-classes';
import { plural } from '@/lib/plural';

/** How many of the most-played moves are re-read; each is one history lookup. */
const CHILD_LIMIT = 8;

const SERIES_COLOURS = [
  'var(--shape-green)',
  'var(--shape-blue)',
  'var(--shape-yellow)',
  'var(--shape-red)',
];

export function RatingClassesSection({
  reader,
  sourceName,
  fen,
  moves,
  onPlay,
}: {
  readonly reader: PackReader;
  readonly sourceName: string;
  readonly fen: Fen;
  readonly moves: readonly DatabaseMove[];
  readonly onPlay: (move: DatabaseMove) => void;
}) {
  const display = useSanDisplay();
  const bands = useMemo(
    () => [...(reader.manifest.history?.bands ?? [])].sort((a, b) => a - b),
    [reader],
  );
  const [band, setBand] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const top = useMemo(() => moves.slice(0, CHILD_LIMIT), [moves]);
  const histories = useQuery({
    queryKey: [
      'rating-classes',
      reader.manifest.id,
      reader.manifest.version,
      positionKey(fen),
      top.map((move) => move.uci).join(' '),
    ],
    enabled: open && bands.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const position = Position.fromTrustedFen(fen);
      const here = await reader.history(positionKey(fen));
      const children: ChildHistory[] = [];
      for (const move of top) {
        const played = position.playUci(move.uci);
        const history = played.ok ? await reader.history(positionKey(played.value.after)) : null;
        children.push({ uci: move.uci, san: move.san, history });
      }
      return { here, children };
    },
  });

  if (bands.length === 0) return null;
  const data = histories.data;
  /*
    Only the classes that have games here are offered. The starter pack is
    elite broadcast play and holds nothing below 2200, and a chip that always
    opens an empty table is a question with no answer.
  */
  const here = data?.here ?? null;
  const offered = here ? bands.filter((lower) => (here.byBand.get(lower)?.games ?? 0) > 0) : bands;
  const empty = here ? bands.filter((lower) => !offered.includes(lower)) : [];
  const chosen = band !== null && offered.includes(band) ? band : (offered.at(-1) ?? 0);
  const byBand = data && offered.length > 0 ? movesInBand(data.children, chosen) : null;

  return (
    <section className="border-t border-line-subtle" data-rating-classes>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <h3 className="text-[10px] font-semibold text-tertiary">By rating class and year</h3>
        <span className="ml-auto text-[10px] text-tertiary">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <div className="space-y-3 px-2.5 pb-3">
          <div className="space-y-1">
            <Segmented
              items={offered.map((lower) => ({
                id: String(lower),
                label: bandLabel(bands, lower),
              }))}
              value={String(chosen)}
              onChange={(id) => setBand(Number(id))}
            />
            <p className="text-[10px] leading-snug text-tertiary">
              Games in {sourceName} filed by the lower rating the game states,{' '}
              {bandLabel(bands, chosen)}. A game that states one rating is filed by that rating; the
              class is not a claim that both players were in it. These games reached the position
              after each move, by any move order, so a transposition counts here and not in the
              table above.
              {empty.length > 0
                ? ` No games here rated ${empty.map((lower) => bandLabel(bands, lower)).join(', ')}.`
                : ''}
            </p>
          </div>

          {histories.isPending ? (
            <p className="text-2xs text-tertiary">Reading the rating history…</p>
          ) : histories.isError ? (
            <p className="text-2xs text-caution">
              The rating history could not be read.{' '}
              {histories.error instanceof Error ? histories.error.message : ''}
            </p>
          ) : data && !byBand ? (
            <p className="text-2xs text-tertiary">
              {sourceName} keeps no rated history for this position.
            </p>
          ) : byBand ? (
            <>
              <table className="w-full border-collapse text-[10.5px]" data-rating-class-moves>
                <thead>
                  <tr className="border-b border-line-subtle text-left text-[9.5px] text-tertiary">
                    <th className="py-1 pr-1.5 font-medium">Move</th>
                    <th className="px-1.5 py-1 text-right font-medium">Games</th>
                    <th className="px-1.5 py-1 text-right font-medium">Share</th>
                    <th className="px-1.5 py-1 text-right font-medium">White / draws / Black</th>
                    <th className="py-1 pl-1.5 text-right font-medium">White</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {byBand.rows.map((row) => {
                    const move = top.find((entry) => entry.uci === row.uci);
                    return (
                      <tr key={row.uci} data-rating-class-row={row.san}>
                        <td className="py-1 pr-1.5">
                          <button
                            type="button"
                            className="font-medium text-primary hover:text-accent-ink"
                            onClick={() => move && onPlay(move)}
                          >
                            {display(row.san)}
                          </button>
                        </td>
                        <td className="px-1.5 py-1 text-right text-secondary tabular">
                          {row.games.toLocaleString()}
                        </td>
                        <td className="px-1.5 py-1 text-right text-secondary tabular">
                          {row.games ? `${row.share}%` : '—'}
                        </td>
                        <td className="px-1.5 py-1">
                          <TallyBar white={row.white} draws={row.draws} black={row.black} />
                        </td>
                        <td className="py-1 pl-1.5 text-right text-secondary tabular">
                          {row.score === null ? '—' : `${row.score}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-tertiary">
                {byBand.games.toLocaleString()} games in this class across these moves.
                {byBand.withoutHistory.length > 0
                  ? ` No history kept after ${byBand.withoutHistory.join(', ')}.`
                  : ''}
                {moves.length > top.length
                  ? ` The ${plural(top.length, 'most-played move')} are read; the rest are not.`
                  : ''}
              </p>

              {data?.here ? <PositionBands rows={positionByBand(data.here, bands)} /> : null}
              {data ? <FashionChart fashion={fashionOf(data.children)} /> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TallyBar({
  white,
  draws,
  black,
}: {
  readonly white: number;
  readonly draws: number;
  readonly black: number;
}) {
  const total = white + draws + black;
  if (total === 0) return <span className="block text-right text-tertiary">—</span>;
  const pct = (value: number) => Math.round((value / total) * 100);
  const label = `White won ${white.toLocaleString()}, drawn ${draws.toLocaleString()}, Black won ${black.toLocaleString()}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="ml-auto flex h-3.5 w-full max-w-[150px] overflow-hidden rounded-[3px] border border-line text-[8.5px] leading-[13px] tabular"
    >
      <span
        className="overflow-hidden bg-[var(--eval-white)] text-center text-[#222]"
        style={{ width: `${(white / total) * 100}%` }}
      >
        {pct(white) >= 18 ? `${pct(white)}%` : ''}
      </span>
      <span
        className="overflow-hidden bg-line-strong text-center text-primary"
        style={{ width: `${(draws / total) * 100}%` }}
      >
        {pct(draws) >= 18 ? `${pct(draws)}%` : ''}
      </span>
      <span
        className="overflow-hidden bg-[var(--eval-black)] text-center text-[#eee]"
        style={{ width: `${(black / total) * 100}%` }}
      >
        {pct(black) >= 18 ? `${pct(black)}%` : ''}
      </span>
    </span>
  );
}

function PositionBands({ rows }: { readonly rows: readonly BandRow[] }) {
  return (
    <div data-rating-class-position>
      <h4 className="mb-1 text-[10px] font-semibold text-tertiary">
        This position across rating classes
      </h4>
      <table className="w-full border-collapse text-[10.5px]">
        <tbody className="divide-y divide-line-subtle">
          {rows.map((row) => (
            <tr key={row.band}>
              <td className="py-1 pr-1.5 text-secondary tabular">{row.label}</td>
              <td className="px-1.5 py-1">
                <TallyBar white={row.white} draws={row.draws} black={row.black} />
              </td>
              <td className="px-1.5 py-1 text-right text-secondary tabular">
                {row.score === null ? '—' : `${row.score}%`}
              </td>
              <td className="py-1 pl-1.5 text-right text-tertiary tabular">
                {row.games.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const W = 320;
const H = 120;
const PAD = { left: 28, right: 44, top: 8, bottom: 18 };

function FashionChart({ fashion }: { readonly fashion: Fashion }) {
  const { years, series } = fashion;
  if (years.length < 2 || series.length === 0) {
    return (
      <p className="text-[10px] text-tertiary">
        Not enough dated games here to draw how the choice has shifted (a year needs{' '}
        {FASHION_MIN_YEAR_GAMES} games across these moves).
      </p>
    );
  }
  const first = years[0] as number;
  const last = years.at(-1) as number;
  const x = (year: number) =>
    PAD.left + ((year - first) / Math.max(1, last - first)) * (W - PAD.left - PAD.right);
  const y = (share: number) => PAD.top + (1 - share / 100) * (H - PAD.top - PAD.bottom);
  /*
    End labels, spread so two moves ending at a similar share do not print
    over each other: top to bottom, each at least one line below the last.
  */
  const labelYs = new Map<string, number>();
  let previous = Number.NEGATIVE_INFINITY;
  for (const line of [...series].sort(
    (a, b) => (b.points.at(-1)?.share ?? 0) - (a.points.at(-1)?.share ?? 0),
  )) {
    const wanted = y(line.points.at(-1)?.share ?? 0) + 3;
    const placed = Math.max(wanted, previous + 9);
    labelYs.set(line.uci, placed);
    previous = placed;
  }
  // Pushed past the axis: lift them all, keeping the spacing.
  const overflow = previous - (H - PAD.bottom + 2);
  if (overflow > 0) for (const [uci, value] of labelYs) labelYs.set(uci, value - overflow);
  const description = series
    .map(
      (line) =>
        `${line.san}: ${line.points.map((point) => `${point.year} ${point.share}%`).join(', ')}`,
    )
    .join('; ');
  return (
    <div data-rating-class-fashion data-explorer-year-trend>
      <h4 className="mb-1 text-[10px] font-semibold text-tertiary">
        How the choice has shifted, year by year
      </h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={description}>
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--border-subtle)"
            />
            <text
              x={PAD.left - 4}
              y={y(tick) + 3}
              textAnchor="end"
              fontSize="8"
              fill="var(--text-tertiary)"
            >
              {tick}%
            </text>
          </g>
        ))}
        {[first, last].map((year) => (
          <text
            key={year}
            x={x(year)}
            y={H - 4}
            textAnchor="middle"
            fontSize="8"
            fill="var(--text-tertiary)"
          >
            {year}
          </text>
        ))}
        {series.map((line, index) => {
          const colour = SERIES_COLOURS[index % SERIES_COLOURS.length];
          const labelY = labelYs.get(line.uci) ?? 0;
          const end = line.points.at(-1);
          return (
            <g key={line.uci}>
              <polyline
                fill="none"
                stroke={colour}
                strokeWidth="1.75"
                points={line.points.map((point) => `${x(point.year)},${y(point.share)}`).join(' ')}
              />
              {line.points.map((point) => (
                <circle key={point.year} cx={x(point.year)} cy={y(point.share)} r="2" fill={colour}>
                  <title>{`${line.san} ${point.year}: ${point.share}% (${point.games.toLocaleString()} games)`}</title>
                </circle>
              ))}
              {end ? (
                <text x={x(end.year) + 5} y={labelY} fontSize="8.5" fill={colour}>
                  {line.san} {Math.round(end.share)}%
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] text-tertiary">
        Each move’s share of the games that reached one of these positions that year, unsmoothed.
        {fashion.thinYears > 0
          ? ` ${plural(fashion.thinYears, 'year')} with fewer than ${FASHION_MIN_YEAR_GAMES} games left out.`
          : ''}
      </p>
    </div>
  );
}
