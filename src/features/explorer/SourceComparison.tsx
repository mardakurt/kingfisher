'use client';

/**
 * One position, several populations, side by side.
 *
 * The question this answers is the one a prepared player asks and Kingfisher
 * could not previously answer: is this line played the same way over the board
 * as it is online, and by the same people now as three years ago?
 *
 * Every design decision here follows from refusing to merge the populations.
 * There is no total column and no combined score. Each column is one source's
 * own answer, headed by that source's name and game count, and a source that
 * cannot answer says which kind of nothing it has — not installed, no games in
 * this position, or the move simply not played in it. Those are three
 * different facts and a reader is entitled to tell them apart.
 */

import { useState } from 'react';

import type { Fen } from '@/chess/types';
import { cn } from '@/lib/cn';
import type { ReferenceSource } from '@/reference/types';

import { compareSources, type SourceColumn } from './source-comparison';
import { useExplorerSources } from './useExplorer';
import { MyGamesOverlay } from './MyGamesOverlay';
import type { ExplorerFilters } from '@/database/types';

/** Enough columns to see a disagreement; more is a spreadsheet. */
const MAX_COLUMNS = 4;

const ABSENCE_TITLE: Record<string, string> = {
  loading: 'Still reading this source.',
  unavailable: 'This source could not answer.',
  'no-games': 'This source has no games in this position.',
  'not-played': 'Not played in this source’s games at this position.',
};

const ABSENCE_MARK: Record<string, string> = {
  loading: '…',
  unavailable: '—',
  'no-games': 'no games',
  'not-played': '0%',
};

export function SourceComparison({
  sources,
  fen,
  filters,
  whiteToMove,
  selected,
  onSelectedChange,
  onPlay,
}: {
  readonly sources: readonly ReferenceSource[];
  readonly fen: Fen;
  readonly filters: ExplorerFilters;
  readonly whiteToMove: boolean;
  readonly selected: readonly string[];
  readonly onSelectedChange: (ids: readonly string[]) => void;
  readonly onPlay: (san: string) => void;
}) {
  const [showScore, setShowScore] = useState(false);

  /*
    Only sources that can answer without being installed first. Offering a
    column that is guaranteed to be empty teaches the user that empty columns
    are normal, which is the opposite of the point.
  */
  const available = sources.filter((source) => source.installed);
  const ids = selected.filter((id) => available.some((source) => source.id === id));
  const queries = useExplorerSources(ids, fen, filters);

  /*
    Not memoised, deliberately. At most four columns of at most fifteen moves
    is a few hundred operations; a memo over a `useQueries` result would need
    the query statuses serialised into its dependency list, which is more code
    than the work it saves and one more thing to get subtly wrong.
  */
  const columns: readonly SourceColumn[] = ids.map((id, index) => {
    const query = queries[index];
    const source = available.find((entry) => entry.id === id);
    return {
      id,
      name: source?.name ?? id,
      result: query?.isPending ? undefined : (query?.data ?? null),
      ...(query?.error ? { error: String(query.error) } : {}),
    };
  });

  const comparison = compareSources(columns, whiteToMove);

  const toggle = (id: string) => {
    if (ids.includes(id)) onSelectedChange(ids.filter((entry) => entry !== id));
    else if (ids.length < MAX_COLUMNS) onSelectedChange([...ids, id]);
  };

  return (
    <section
      className="border-t border-line-subtle bg-surface-2/40 px-2.5 py-2"
      data-source-comparison
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="text-[10px] uppercase tracking-wide text-tertiary">Compare sources</h3>
        <span className="ml-auto text-[10px] text-tertiary">
          {ids.length}/{MAX_COLUMNS}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {available.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => toggle(source.id)}
            data-comparison-source={source.id}
            aria-pressed={ids.includes(source.id)}
            disabled={!ids.includes(source.id) && ids.length >= MAX_COLUMNS}
            className={cn(
              'rounded-[3px] border px-1.5 py-0.5 text-[10px]',
              ids.includes(source.id)
                ? 'border-accent/60 bg-accent/10 text-primary'
                : 'border-line text-tertiary hover:text-secondary disabled:opacity-40',
            )}
          >
            {source.name}
          </button>
        ))}
      </div>

      {ids.length < 2 ? (
        <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
          Choose two or more sources. Each answers for its own games; Kingfisher never combines them
          into one number.
        </p>
      ) : (
        <>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-[10.5px]" data-comparison-table>
              <thead>
                <tr className="text-left text-[9.5px] uppercase tracking-wide text-tertiary">
                  <th className="py-1 pr-2 font-medium">Move</th>
                  {comparison.columns.map((column) => (
                    <th
                      key={column.id}
                      className="px-1.5 py-1 text-right font-medium text-primary"
                      data-comparison-column={column.id}
                    >
                      <span className="block truncate">{column.name}</span>
                      <span className="block font-normal normal-case text-tertiary tabular">
                        {column.result === undefined
                          ? '…'
                          : column.result === null
                            ? 'unavailable'
                            : `${column.result.totalGames.toLocaleString()} games`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {comparison.rows.map((row) => (
                  <tr key={row.uci} data-comparison-row={row.san}>
                    <td className="py-1 pr-2">
                      <button
                        type="button"
                        onClick={() => onPlay(row.san)}
                        className="font-medium text-primary hover:text-accent"
                      >
                        {row.san}
                      </button>
                    </td>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.sourceId}
                        className="px-1.5 py-1 text-right tabular"
                        title={
                          cell.absence
                            ? ABSENCE_TITLE[cell.absence]
                            : `${cell.games?.toLocaleString()} games`
                        }
                      >
                        {cell.absence ? (
                          <span className="text-tertiary">{ABSENCE_MARK[cell.absence]}</span>
                        ) : showScore ? (
                          <span className="text-secondary">
                            {cell.score === null ? '—' : `${Math.round(cell.score * 100)}%`}
                          </span>
                        ) : (
                          <span className="text-secondary">
                            {((cell.share ?? 0) * 100).toFixed(1)}%
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowScore(!showScore)}
              className="rounded-[3px] border border-line px-1.5 py-0.5 text-[10px] text-tertiary hover:text-secondary"
            >
              {showScore ? 'Showing score' : 'Showing share'}
            </button>
            <p className="text-[10px] leading-relaxed text-tertiary">
              {showScore
                ? 'Score for the side to move, within each source’s own games.'
                : 'Share of each source’s own games at this position.'}{' '}
              Populations are never merged, and there is deliberately no combined column.
            </p>
          </div>
          {!comparison.answered ? (
            <p className="mt-1 text-[10px] text-tertiary">
              None of the chosen sources has games in this position. That is a fact about these
              populations, not about the move — the Theory Book still knows where you are.
            </p>
          ) : null}
        </>
      )}
      <MyGamesOverlay fen={fen} />
    </section>
  );
}
