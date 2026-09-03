'use client';

/**
 * What months of decision records add up to.
 *
 * Two questions, both answerable by counting, both drillable:
 *
 *   How far do my estimates sit from the evidence?
 *   How often was the engine's eventual first choice on my list?
 *
 * Neither produces a score. "Engine top move was among my candidates: 61 of 84"
 * is a fact about two sets; "calculation strength: 73" is a number invented to
 * look like one. Every figure names its denominator and every bar opens the
 * positions behind it, which is the property that separates this from the
 * decorative analytics the product has refused since Phase 8.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Segmented } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/Panel';
import { getRepositories } from '@/persistence/repositories';
import { themeLabel, type DecisionRecord } from '@/persistence/domain';
import { cn } from '@/lib/cn';

import {
  candidateCoverage,
  evaluationCalibration,
  themesBehindLargestGaps,
  type JournalEntry,
} from './analytics';
import { PERIODS, periodStart } from './summary';

type View = 'calibration' | 'coverage' | 'clusters';

const VIEWS: readonly { id: View; label: string }[] = [
  { id: 'calibration', label: 'Calibration' },
  { id: 'coverage', label: 'Candidates' },
  { id: 'clusters', label: 'Clusters' },
];

export function JournalAnalytics({
  onOpenDecision,
}: {
  readonly onOpenDecision: (decision: DecisionRecord) => void;
}) {
  const [view, setView] = useState<View>('calibration');
  const [periodId, setPeriodId] = useState('90d');
  const [now] = useState(() => Date.now());
  const period = PERIODS.find((entry) => entry.id === periodId) ?? PERIODS[0]!;

  /**
   * Decisions paired with whatever engine evidence was later stored.
   *
   * Joined here rather than in the analytics module, because only the
   * application knows which evidence the user has actually accumulated —
   * keeping the join out of the pure module is what lets it be tested without
   * a database.
   */
  const entries = useQuery<readonly JournalEntry[]>({
    queryKey: ['review', 'journal-entries'],
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const repositories = await getRepositories();
      const decisions = await repositories.review.listDecisions(500);
      return Promise.all(
        decisions.map(async (decision) => {
          const evidence = await repositories.analysisQueue.evidenceForPosition(
            decision.positionKey,
          );
          // The deepest search is the one worth comparing against.
          const best = [...evidence].sort((a, b) => b.depth - a.depth)[0];
          return best ? { decision, evidence: best } : { decision };
        }),
      );
    },
  });

  const filter = useMemo(() => ({ from: periodStart(period, now), to: now + 1 }), [period, now]);
  const calibration = useMemo(
    () => evaluationCalibration(entries.data ?? [], filter),
    [entries.data, filter],
  );
  const coverage = useMemo(
    () => candidateCoverage(entries.data ?? [], filter),
    [entries.data, filter],
  );
  const clusters = useMemo(
    () => themesBehindLargestGaps(entries.data ?? [], { filter }),
    [entries.data, filter],
  );

  const open = (ids: readonly string[]) => {
    const first = (entries.data ?? []).find((entry) => ids.includes(entry.decision.id));
    if (first) onOpenDecision(first.decision);
  };

  if (entries.isPending) {
    return <p className="px-3 py-3 text-2xs text-tertiary">Reading the decision journal…</p>;
  }
  if ((entries.data?.length ?? 0) === 0) {
    return (
      <EmptyState
        title="No decisions recorded yet."
        description="Record what you think in Review or Calculation. These figures are counts of your own judgements, so they need some first."
      />
    );
  }

  return (
    <section className="px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented items={VIEWS} value={view} onChange={setView} />
        <label className="ml-auto text-[10px] text-tertiary">
          <span className="sr-only">Period</span>
          <select
            aria-label="Analytics period"
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value)}
            className="h-6 rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10.5px] text-primary"
          >
            {PERIODS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {view === 'calibration' ? (
        <div className="mt-3">
          {/* The denominator first. A distribution over nine positions is a
              distribution over nine positions. */}
          <p className="text-[10.5px] leading-relaxed text-tertiary tabular">
            {calibration.compared} of {calibration.total} decisions had both a numeric estimate and
            stored engine evidence.
          </p>
          {calibration.compared === 0 ? (
            <p className="mt-2 text-[10.5px] leading-relaxed text-tertiary">
              Give an estimate in pawns and run the engine on a reviewed position to compare them.
            </p>
          ) : (
            <>
              <ul className="mt-2 flex flex-col gap-1">
                {calibration.buckets.map((bucket) => (
                  <li key={bucket.id}>
                    <button
                      type="button"
                      disabled={bucket.count === 0}
                      onClick={() => open(bucket.decisionIds)}
                      className="flex w-full items-center gap-2 rounded-[4px] px-1 py-0.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <span className="w-[11ch] shrink-0 text-[10.5px] text-secondary">
                        {bucket.label}
                      </span>
                      <span className="h-1.5 min-w-0 flex-1 rounded-full bg-surface-3">
                        <span
                          className="block h-1.5 rounded-full bg-accent"
                          style={{
                            width: `${calibration.compared ? (bucket.count / calibration.compared) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <span className="w-[3ch] shrink-0 text-right text-[10.5px] text-primary tabular">
                        {bucket.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {calibration.meanSignedPawns !== undefined ? (
                <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
                  On average your estimates sat{' '}
                  <span className="text-secondary tabular">
                    {Math.abs(calibration.meanSignedPawns).toFixed(2)}
                  </span>{' '}
                  pawns {calibration.meanSignedPawns > 0 ? 'above' : 'below'} the evidence, from
                  White&apos;s point of view. A lean, not a verdict.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {view === 'coverage' ? (
        <div className="mt-3">
          <p className="text-[11px] leading-relaxed text-primary">
            Engine top move was among your candidates:{' '}
            <span className="tabular">
              {coverage.considered} of {coverage.compared}
            </span>
          </p>
          <div className="mt-1.5 flex gap-1">
            <button
              type="button"
              disabled={coverage.hitIds.length === 0}
              onClick={() => open(coverage.hitIds)}
              className="flex-1 rounded-[4px] border border-line-subtle px-2 py-1 text-left text-[10.5px] text-tertiary hover:border-accent/50 disabled:opacity-50"
            >
              On the list · <span className="tabular">{coverage.hitIds.length}</span>
            </button>
            <button
              type="button"
              disabled={coverage.missedIds.length === 0}
              onClick={() => open(coverage.missedIds)}
              className="flex-1 rounded-[4px] border border-line-subtle px-2 py-1 text-left text-[10.5px] text-tertiary hover:border-accent/50 disabled:opacity-50"
            >
              Not on the list · <span className="tabular">{coverage.missedIds.length}</span>
            </button>
          </div>
          {coverage.averageCandidates !== undefined ? (
            <p className="mt-2 text-[10px] text-tertiary tabular">
              {coverage.averageCandidates} candidates recorded on average ·{' '}
              {coverage.thinCandidateIds.length} decisions with fewer than two.
            </p>
          ) : null}
          {/* The caveat, printed rather than implied. */}
          <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
            A move you rejected deliberately counts here as a miss. This is a count of two sets, not
            a measure of how well you calculate.
          </p>
        </div>
      ) : null}

      {view === 'clusters' ? (
        <div className="mt-3">
          <p className="text-[10.5px] leading-relaxed text-tertiary">
            Themes on your {clusters.examined} largest gaps between estimate and evidence. These are
            tags you applied by hand — your own reading, counted back.
          </p>
          {clusters.themes.length === 0 ? (
            <p className="mt-2 text-[10.5px] text-tertiary">
              None of those decisions carry a theme yet.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-0.5">
              {clusters.themes.map((entry) => (
                <li key={entry.theme}>
                  <button
                    type="button"
                    onClick={() => open(entry.decisionIds)}
                    className={cn(
                      'flex w-full items-baseline gap-2 rounded-[4px] px-1 py-0.5 text-left',
                      'transition-colors hover:bg-surface-2',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-[11px] text-primary">
                      {themeLabel(entry.theme)}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-tertiary tabular">
                      {entry.count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
