'use client';

/**
 * Repertoire coverage against a chosen reference source.
 *
 * The existing local-coverage panel answers "what have opponents in my own
 * games done that I have not prepared for?". This one answers the same shape
 * of question against a reference source — Elite OTB, Recent Theory, High-
 * Rated Online — so a player can see the population they care about rather
 * than only the games that happen to be on disk.
 *
 * Coverage is position-keyed and therefore transposition-aware: a move order
 * that reaches the same canonical position is the same row, even when the
 * opponent plays it from three different openings. The panel never invents
 * a score; every figure is one the source's own Explorer result carries.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { useDatabaseProviders } from '@/database/use-database-providers';
import type { ExplorerQuery, ExplorerResult } from '@/database/types';
import { runBounded } from '@/lib/bounded-parallelism';
import { getRepositories } from '@/persistence/repositories';
import type { RepertoirePositionRecord } from '@/persistence/domain';
import { isActionable, topGaps, computeCoverage } from '@/repertoire/coverage';
import type { CoverageGap, CoverageReport } from '@/repertoire/coverage';
import { draftTrainingSet } from '@/training/data-generation';
import { useUi } from '@/stores/ui-store';

const SOURCES = [
  { id: 'kingfisher-elite-otb', label: 'Elite OTB' },
  { id: 'kingfisher-recent-theory', label: 'Recent Theory (2y)' },
  { id: 'kingfisher-recent-theory-narrow', label: 'Recent Theory (6m)' },
  { id: 'kingfisher-high-rated-online', label: 'High-Rated Online' },
] as const;

type SourceId = (typeof SOURCES)[number]['id'];

export function ReferenceCoveragePanel({
  positions,
}: {
  readonly positions: readonly RepertoirePositionRecord[];
}) {
  const providers = useDatabaseProviders();
  const [sourceId, setSourceId] = useState<SourceId>('kingfisher-elite-otb');
  const provider = useMemo(
    () => providers.find((entry) => entry.id === sourceId) ?? null,
    [providers, sourceId],
  );

  const reports = useReferenceCoverage(positions, provider as ReferenceProvider | null);

  if (positions.length === 0) {
    return (
      <section className="shrink-0 border-b border-line-subtle px-3 py-2 text-[10.5px] text-tertiary">
        Add positions to see what your repertoire misses.
      </section>
    );
  }

  return (
    <section className="shrink-0 border-b border-line-subtle">
      <div className="flex h-8 items-center gap-2 px-3">
        <h2 className="text-[10px] uppercase tracking-wide text-tertiary">
          Coverage against reference
        </h2>
        <select
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value as SourceId)}
          className="ml-auto h-6 rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10px] text-primary outline-none focus:border-accent/60"
        >
          {SOURCES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
      {!provider ? (
        <p className="border-t border-line-subtle px-3 py-2 text-[10.5px] text-tertiary">
          This reference is not installed.
        </p>
      ) : reports.pending ? (
        <CoverageProgress completed={reports.completed} total={reports.total} data={reports.data} />
      ) : (
        <ReferenceCoverageTable reports={reports.data} />
      )}
    </section>
  );
}

function CoverageProgress({
  completed,
  total,
  data,
}: {
  readonly completed: number;
  readonly total: number;
  readonly data: readonly CoverageReport[];
}) {
  const share = total > 0 ? Math.min(1, completed / total) : 0;
  return (
    <div data-coverage-progress>
      <div className="flex h-7 items-center gap-2 border-t border-line-subtle bg-surface-2/40 px-3 text-[10.5px]">
        <span className="text-tertiary">
          Checking coverage: <span className="text-primary tabular">{completed}</span>
          {' / '}
          <span className="text-tertiary tabular">{total}</span>
        </span>
        <div className="ml-2 h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full bg-accent transition-[width]"
            style={{ width: `${Math.round(share * 100)}%` }}
            aria-hidden
          />
        </div>
      </div>
      {data.length > 0 ? (
        <ReferenceCoverageTable reports={data} />
      ) : (
        <p className="border-t border-line-subtle px-3 py-2 text-[10.5px] text-tertiary">
          Starting…
        </p>
      )}
    </div>
  );
}

function ReferenceCoverageTable({ reports }: { readonly reports: readonly CoverageReport[] }) {
  const actionable = reports.filter(isActionable);
  const flatGaps: { gap: CoverageGap; fen: string }[] = [];
  for (const report of actionable) {
    for (const gap of topGaps(report, 3)) {
      flatGaps.push({ gap, fen: report.positionKey });
    }
  }
  flatGaps.sort((a, b) => b.gap.games - a.gap.games);
  const notify = useUi((state) => state.notify);
  const createTraining = useMutation({
    mutationFn: async () => {
      const drafts = draftTrainingSet(reports, reports[0]?.sourceName ?? 'Reference');
      if (drafts.length === 0) return { created: 0 };
      const repositories = await getRepositories();
      for (const draft of drafts) {
        await repositories.training.create({
          mode: draft.mode,
          positionKey: draft.positionKey,
          fen: draft.fen,
          sideToMove: draft.sideToMove,
          prompt: draft.prompt,
          solutionUci: [],
          solutionSan: [],
          candidatesUci: [],
          plans: [],
          tags: draft.tags,
          explanation: draft.explanation,
        });
      }
      return { created: drafts.length };
    },
    onSuccess: ({ created }) => {
      notify({
        tone: 'success',
        message:
          created > 0
            ? `Created ${created} training item${created === 1 ? '' : 's'}. Add a repertoire response for each.`
            : 'Nothing to train here yet.',
      });
    },
    onError: (error) => {
      notify({
        tone: 'error',
        message: 'The training set could not be created.',
        detail: error instanceof Error ? error.message : undefined,
      });
    },
  });
  if (flatGaps.length === 0) {
    return (
      <p className="border-t border-line-subtle px-3 py-2 text-[10.5px] text-tertiary">
        Every high-frequency reply in this source is in the repertoire.
      </p>
    );
  }
  return (
    <div className="border-t border-line-subtle">
      <ol className="max-h-32 overflow-y-auto">
        {flatGaps.map(({ gap, fen }, index) => (
          <li
            key={`${fen}:${gap.uci}:${index}`}
            className="flex items-center gap-2 px-3 py-1.5 text-[10.5px]"
          >
            <span className="font-medium text-primary">{gap.san}</span>
            <span className="text-tertiary">
              {gap.share ? `${(gap.share * 100).toFixed(1)}%` : '—'}
            </span>
            <span className="ml-auto text-[10px] text-tertiary tabular">
              {gap.games.toLocaleString()} games
            </span>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between border-t border-line-subtle bg-surface-2/40 px-3 py-2 text-[10.5px]">
        <span className="text-tertiary">
          {flatGaps.length} top gap{flatGaps.length === 1 ? '' : 's'}
        </span>
        <Button
          size="sm"
          variant="subtle"
          disabled={createTraining.isPending}
          onClick={() => createTraining.mutate()}
        >
          {createTraining.isPending ? 'Creating…' : 'Create training set'}
        </Button>
      </div>
    </div>
  );
}

/** Minimal shape the hook requires from the registry. */
export interface ReferenceProvider {
  readonly id: string;
  readonly explore: (query: ExplorerQuery) => Promise<ExplorerResult>;
}

function useReferenceCoverage(
  positions: readonly RepertoirePositionRecord[],
  provider: ReferenceProvider | null,
) {
  const [state, setState] = useState<{
    data: readonly CoverageReport[];
    pending: boolean;
    completed: number;
    total: number;
  }>({ data: [], pending: false, completed: 0, total: 0 });

  // Re-run when the source or the position count changes. The provider
  // object identity is the live registry's, so this is the right cache key
  // for "different source", "added positions", "removed positions".
  const providerId = provider?.id ?? null;
  const positionsLength = positions.length;

  useEffect(() => {
    if (!provider || positions.length === 0) {
      return;
    }
    /*
     * Phase 29 BJ-BL: replace the sequential "20 awaits" with
     * a bounded-concurrency pool. The provider's own
     * `explore` is the network boundary, so a concurrency of
     * 4 keeps the wire busy without ever starving the UI
     * thread on a phone. Cancellation goes through the
     * effect's own `cancelled` flag rather than the bounded
     * runner's signal — the in-flight `explore` call is not
     * interruptible in every provider, but no new ones are
     * started once the user moves on.
     *
     * Phase 30 PART X: render useful partial results
     * progressively. The panel updates the table as each
     * bounded worker completes, so a 100-position coverage
     * check that takes 12 s shows the first 20 in the first
     * 2 s, rather than appearing all at once. Order is
     * stable: each report is appended in the position's
     * original order, never sorted, so the table does not
     * jitter as new rows arrive.
     */
    let cancelled = false;
    const abort = new AbortController();
    // Mark the run as pending so the row can render a spinner.
    // The rule against setState in effects is real, but here
    // the effect is *itself* the run; the render that follows
    // its synchronous prefix is exactly what we want.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ data: [], pending: true, completed: 0, total: positions.length });
    const reports: CoverageReport[] = new Array(positions.length).fill(null) as CoverageReport[];
    let completed = 0;
    void runBounded({
      items: positions,
      concurrency: 4,
      signal: abort.signal,
      worker: (position, index) =>
        provider.explore({ fen: position.fen, limit: 10 }).then((result) => {
          if (cancelled) return null;
          // Compute coverage for this single position and
          // splice it into the in-order slot. The slot
          // itself may be `undefined` if a previous run's
          // effect was reused; guard accordingly.
          const newReports = computeCoverage(position, [
            { id: provider.id, name: provider.id, result },
          ]);
          // Take the first report (one position yields one
          // report). If `newReports` is empty (e.g. the
          // provider returned zero moves), the row stays
          // blank but the slot's progress is still
          // counted.
          reports[index] = newReports[0] as CoverageReport;
          completed += 1;
          if (!cancelled) {
            setState({
              data: [...reports].filter((report): report is CoverageReport => report !== undefined),
              pending: completed < positions.length,
              completed,
              total: positions.length,
            });
          }
        }),
    }).catch(() => {
      if (!cancelled)
        setState({
          data: reports.filter((r): r is CoverageReport => r !== undefined),
          pending: false,
          completed,
          total: positions.length,
        });
    });
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [providerId, positionsLength, provider, positions]);

  /*
    "Pending" is derived: while the effect is running for the current
    (provider, positions) pair, the panel renders progress. Once data
    arrives (or the request fails), the panel renders the result.
  */
  return state;
}
