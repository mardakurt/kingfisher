'use client';

/**
 * What has changed here recently.
 *
 * Three queries against the *same source the explorer is showing*, with
 * different date filters, put side by side. Querying a different database
 * would compare two collections and call it a trend, so the source comes from
 * the caller rather than being chosen here.
 *
 * The panel's job beyond the table is to keep the claim honest. Every label it
 * prints is a complete sentence that names the database, the thin-sample
 * warning is prominent rather than a footnote, and there is nowhere for the
 * word "novelty" to appear because the module underneath has no such member.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { moveIntent } from '@/chess/moves';
import { Position } from '@/chess/position';
import type { Fen } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { databaseProviderById } from '@/database/registry';
import { providerRetry } from '@/database/retry';
import type { ExplorerResult } from '@/database/types';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { buildRadar, type RadarRow } from '@/theory/radar';
import { cn } from '@/lib/cn';

export function TheoryRadarPanel({
  sourceId,
  fen: overrideFen,
}: {
  readonly sourceId: string;
  readonly fen?: Fen;
}) {
  const { node } = useAnalysisPosition();
  const fen = overrideFen ?? node.fen;
  const play = useAnalysis((state) => state.play);
  const notify = useUi((state) => state.notify);
  const currentYear = new Date().getFullYear();

  /*
    A radar row is a UCI string from a database, so it is checked against the
    rules before it reaches the tree — a provider that reports a move which is
    not legal here must produce a message, never a corrupted game.
  */
  const playMove = (uci: string) => {
    const legal = Position.fromTrustedFen(fen).playUci(uci);
    if (!legal.ok) {
      notify({ tone: 'error', message: `${uci} is not legal in this position.` });
      return;
    }
    const played = play(moveIntent(legal.value));
    if (!played.ok) notify({ tone: 'error', message: played.error.message });
  };
  const provider = databaseProviderById(sourceId);

  /*
    One query, three requests. Keeping them together means the three windows
    are always from the same moment and the same source; three separate hooks
    could legitimately show a twelve-month figure fetched before an import and
    an all-time figure fetched after it.
  */
  const windows = useQuery<{
    allTime: ExplorerResult;
    threeYear: ExplorerResult;
    twelveMonth: ExplorerResult;
  }>({
    queryKey: ['theory-radar', sourceId, provider?.cacheVersion ?? 'live', fen, currentYear],
    enabled: Boolean(provider),
    retry: providerRetry,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      if (!provider) throw new Error(`Unknown database: ${sourceId}`);
      const [allTime, threeYear, twelveMonth] = await Promise.all([
        provider.explore({ fen, limit: 20 }, signal),
        provider.explore({ fen, filters: { sinceYear: currentYear - 2 }, limit: 20 }, signal),
        provider.explore({ fen, filters: { sinceYear: currentYear }, limit: 20 }, signal),
      ]);
      return { allTime, threeYear, twelveMonth };
    },
  });

  const radar = useMemo(
    () =>
      windows.data
        ? buildRadar(windows.data.allTime, windows.data.threeYear, windows.data.twelveMonth, {
            currentYear,
          })
        : null,
    [windows.data, currentYear],
  );

  return (
    <>
      <PanelHeader>
        Theory radar
        <span className="normal-case tracking-normal text-tertiary">
          {provider?.name ?? sourceId}
        </span>
      </PanelHeader>
      <PanelBody className="px-3 py-3">
        {windows.isPending ? (
          <p className="text-2xs text-tertiary">Comparing three date windows…</p>
        ) : windows.isError ? (
          <p className="text-2xs text-negative">{(windows.error as Error).message}</p>
        ) : !radar || radar.rows.length === 0 ? (
          <EmptyState
            title="Nothing has moved here."
            description={`No move's share of ${provider?.name ?? 'this database'} changed enough between all time, three years and twelve months to be worth reporting.`}
          />
        ) : (
          <>
            <p className="text-[10px] leading-relaxed text-tertiary tabular">
              {radar.windows.allTime.toLocaleString()} games all time ·{' '}
              {radar.windows.threeYear.toLocaleString()} since {currentYear - 2} ·{' '}
              {radar.windows.twelveMonth.toLocaleString()} since {currentYear}
            </p>
            {radar.thin ? (
              <p className="mt-1.5 rounded-[4px] bg-surface-2 px-2 py-1.5 text-[10px] leading-relaxed text-caution">
                Too few games for these shares to mean much. Read the counts.
              </p>
            ) : null}

            <table className="mt-2 w-full text-[10.5px] tabular">
              <thead>
                <tr className="text-[9.5px] uppercase tracking-wide text-tertiary">
                  <th className="pb-1 text-left font-medium">Move</th>
                  <th className="pb-1 text-right font-medium">All</th>
                  <th className="pb-1 text-right font-medium">3y</th>
                  <th className="pb-1 text-right font-medium">12m</th>
                  <th className="pb-1 text-right font-medium">Shift</th>
                </tr>
              </thead>
              <tbody>
                {radar.rows.map((row) => (
                  <Row key={row.uci} row={row} onPlay={() => playMove(row.uci)} />
                ))}
              </tbody>
            </table>

            {/*
              The labels, spelled out under the table rather than as icons in
              it. Each one is a complete sentence that names the database, so
              a screenshot of this panel cannot be read as a stronger claim
              than the evidence supports.
            */}
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {radar.rows
                .filter((row) => row.labels.length > 0)
                .map((row) => (
                  <li key={`${row.uci}-labels`} className="text-[10px] leading-relaxed">
                    <span className="font-mono text-primary">{row.san}</span>{' '}
                    <span className="text-tertiary">{row.labels[0]!.text}</span>
                  </li>
                ))}
            </ul>

            <p className="mt-2.5 text-[9.5px] leading-relaxed text-tertiary">
              Shares are of this database only. Kingfisher does not know what has been published
              elsewhere and never calls a move a novelty.
            </p>
          </>
        )}
      </PanelBody>
    </>
  );
}

function Row({ row, onPlay }: { readonly row: RadarRow; readonly onPlay: () => void }) {
  return (
    <tr className="border-t border-line-subtle">
      <td className="py-1 pr-2">
        <Button variant="ghost" onClick={onPlay} className="font-mono">
          {row.san}
        </Button>
      </td>
      <td className="py-1 text-right text-tertiary">{row.allTime.frequency}%</td>
      <td className="py-1 text-right text-tertiary">{row.threeYear.frequency}%</td>
      <td className="py-1 text-right text-secondary">{row.twelveMonth.frequency}%</td>
      <td
        className={cn(
          'py-1 text-right',
          row.shift > 0 ? 'text-positive' : row.shift < 0 ? 'text-negative' : 'text-tertiary',
        )}
      >
        {row.shift > 0 ? '+' : ''}
        {row.shift}
      </td>
    </tr>
  );
}
