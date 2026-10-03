'use client';

/**
 * The player's recorded rating over time, and their performance by year
 * (`src/player/rating-history.ts`). A line of the ratings the games were
 * stored with — not a rating list — and a table beside it that carries the
 * same facts as text.
 */

import { useMemo, useState } from 'react';

import { formatPoints } from '@/tournament/crosstable';
import type { RatingHistory as History } from '@/player/rating-history';

const W = 640;
const H = 180;
const PAD = { left: 40, right: 12, top: 10, bottom: 22 };

export function RatingHistory({ history }: { readonly history: History }) {
  const [hover, setHover] = useState<number | null>(null);
  const { points } = history;
  const scale = useMemo(() => {
    if (points.length === 0) return null;
    const low = Math.min(...points.map((p) => p.rating));
    const high = Math.max(...points.map((p) => p.rating));
    const step = high - low > 400 ? 200 : high - low > 150 ? 100 : 50;
    const min = Math.floor((low - 1) / step) * step;
    const max = Math.ceil((high + 1) / step) * step;
    const x = (i: number) =>
      PAD.left + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - PAD.left - PAD.right);
    const y = (r: number) => PAD.top + (1 - (r - min) / (max - min)) * (H - PAD.top - PAD.bottom);
    const ticks: number[] = [];
    for (let t = min; t <= max; t += step) ticks.push(t);
    return { x, y, ticks };
  }, [points]);

  return (
    <section className="mt-6" data-rating-history>
      <h2 className="mb-1 text-sm font-semibold text-primary">Rating history</h2>
      <p className="mb-2 text-[11px] text-tertiary">
        The rating each game was stored with, median per month — the organisers’ figures, not a
        rating list.
        {history.unplotted
          ? ` ${history.unplotted} game${history.unplotted === 1 ? '' : 's'} without a month or a rating not plotted.`
          : ''}
      </p>
      {scale && points.length > 0 ? (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Recorded rating from ${points[0]!.month} to ${points.at(-1)!.month}`}
            onMouseLeave={() => setHover(null)}
          >
            {scale.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={scale.y(t)}
                  y2={scale.y(t)}
                  stroke="var(--line-subtle, #ddd)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 6}
                  y={scale.y(t) + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--text-tertiary, #888)"
                >
                  {t}
                </text>
              </g>
            ))}
            <text x={PAD.left} y={H - 6} fontSize={10} fill="var(--text-tertiary, #888)">
              {points[0]!.month}
            </text>
            <text
              x={W - PAD.right}
              y={H - 6}
              fontSize={10}
              textAnchor="end"
              fill="var(--text-tertiary, #888)"
            >
              {points.at(-1)!.month}
            </text>
            <polyline
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              points={points.map((p, i) => `${scale.x(i)},${scale.y(p.rating)}`).join(' ')}
            />
            {points.map((p, i) => (
              <g key={p.month} onMouseEnter={() => setHover(i)}>
                <circle
                  cx={scale.x(i)}
                  cy={scale.y(p.rating)}
                  r={hover === i ? 4.5 : 2.5}
                  fill="var(--accent)"
                  stroke="var(--surface-0, #fff)"
                  strokeWidth={hover === i ? 2 : 0}
                />
                {/* A hit target wider than the mark. */}
                <rect
                  x={scale.x(i) - Math.max(4, (W - PAD.left - PAD.right) / points.length / 2)}
                  y={PAD.top}
                  width={Math.max(8, (W - PAD.left - PAD.right) / points.length)}
                  height={H - PAD.top - PAD.bottom}
                  fill="transparent"
                  data-rating-point={p.month}
                />
              </g>
            ))}
          </svg>
          {hover !== null ? (
            <div
              className="pointer-events-none absolute top-0 rounded border border-line bg-surface-1 px-2 py-1 text-[11px] text-primary shadow"
              style={{ left: `${(scale.x(hover) / W) * 100}%`, transform: 'translateX(-50%)' }}
              data-rating-tooltip
            >
              <span className="font-semibold tabular">{points[hover]!.rating}</span>{' '}
              <span className="text-tertiary">
                {points[hover]!.month} · {points[hover]!.games} game
                {points[hover]!.games === 1 ? '' : 's'}
                {points[hover]!.low !== points[hover]!.high
                  ? ` · ${points[hover]!.low}–${points[hover]!.high}`
                  : ''}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-secondary">
          No game here records both a month and this player’s rating.
        </p>
      )}
      {history.years.length > 0 ? (
        <table className="mt-3 w-full max-w-lg text-xs tabular" data-rating-years>
          <thead className="text-tertiary">
            <tr>
              <th className="py-1 text-left font-normal">Year</th>
              <th className="py-1 text-right font-normal">Rated games</th>
              <th className="py-1 text-right font-normal">Score</th>
              <th className="py-1 text-right font-normal">Avg opponent</th>
              <th className="py-1 text-right font-normal" title="FIDE table 8.1.1">
                Performance
              </th>
            </tr>
          </thead>
          <tbody>
            {history.years.map((year) => (
              <tr key={year.year} className="border-t border-line-subtle">
                <td className="py-1 text-primary">{year.year}</td>
                <td className="py-1 text-right text-secondary">{year.games}</td>
                <td className="py-1 text-right text-secondary">
                  {formatPoints(year.score * year.games)} ({Math.round(year.score * 100)}%)
                </td>
                <td className="py-1 text-right text-secondary">{year.averageOpponent}</td>
                <td className="py-1 text-right font-medium text-primary">{year.performance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
