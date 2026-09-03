'use client';

/**
 * What the review history adds up to, and the way into each number.
 *
 * Every figure is the size of a set you can open. That is the rule that keeps
 * this from becoming a dashboard: a count nobody can drill into is decoration,
 * and decoration is how a study tool starts lying to its user about progress.
 *
 * There is deliberately no single number describing the player. No accuracy,
 * no estimated rating, no trend arrow through four data points.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import {
  invalidateReview,
  invalidateTraining,
  useTrainingItems,
} from '@/features/persistence/queries';
import { getRepositories } from '@/persistence/repositories';
import type { ReviewItemRecord } from '@/persistence/domain';
import { themeLabel } from '@/persistence/domain';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

import { useDecisions, useReviewItems, useTrainingSets } from './queries';
import {
  PERIODS,
  countThemes,
  improvementReport,
  itemsWithTheme,
  periodStart,
  themeTrends,
} from './summary';

export function ImprovementSummary({
  onOpenItem,
}: {
  readonly onOpenItem: (item: ReviewItemRecord) => void;
}) {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const all = useReviewItems();
  const decisions = useDecisions();
  const sets = useTrainingSets();
  const training = useTrainingItems();
  const [periodId, setPeriodId] = useState('30d');
  const [theme, setTheme] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const period = PERIODS.find((entry) => entry.id === periodId) ?? PERIODS[0]!;
  const from = periodStart(period, now);

  const report = useMemo(
    () =>
      improvementReport({
        reviewItems: all.data ?? [],
        decisions: decisions.data ?? [],
        trainingItems: training.data ?? [],
        from,
        to: now + 1,
      }),
    [all.data, decisions.data, from, now, training.data],
  );

  const trends = useMemo(
    () =>
      themeTrends(
        (all.data ?? [])
          .filter((item) => item.status === 'reviewed' || item.status === 'converted')
          .map((item) => ({ themes: item.themes, at: item.reviewedAt ?? item.createdAt })),
        [
          { from: now - 30 * 86_400_000, to: now + 1 },
          { from: now - 60 * 86_400_000, to: now - 30 * 86_400_000 },
        ],
      ),
    [all.data, now],
  );

  const drilled = theme ? itemsWithTheme(all.data ?? [], theme, from) : [];

  const createSet = async () => {
    if (!theme) return;
    try {
      const repositories = await getRepositories();
      const name = `${themeLabel(theme)} · review`;
      const existing = (sets.data ?? []).find((entry) => entry.name === name);
      if (existing) {
        notify({ tone: 'info', message: `“${name}” already exists.` });
        return;
      }
      await repositories.trainingSets.create({
        name,
        kind: 'dynamic',
        query: { themes: [theme] },
      });
      invalidateReview(client);
      invalidateTraining(client);
      notify({
        tone: 'success',
        message: `Training set “${name}” created.`,
        detail: 'It collects every training item carrying this theme, now and later.',
      });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The set could not be created.',
      });
    }
  };

  const reviewedCount = report.figures.find((figure) => figure.id === 'positions-reviewed')?.value;

  return (
    <Panel className="h-full border-0">
      <PanelHeader>Improvement</PanelHeader>
      <div className="shrink-0 border-b border-line-subtle px-2 py-1.5">
        <Segmented
          items={PERIODS.map((entry) => ({ id: entry.id, label: entry.label }))}
          value={periodId}
          onChange={setPeriodId}
        />
      </div>
      <PanelBody className="space-y-4 overflow-y-auto">
        <section>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            {report.figures.map((figure) => (
              <div key={figure.id} className="rounded-[4px] border border-line-subtle p-2">
                <dt className="text-[10px] leading-tight text-tertiary">{figure.label}</dt>
                <dd className="mt-0.5 text-lg leading-none text-primary tabular">{figure.value}</dd>
                {figure.detail ? (
                  <dd className="mt-1 text-[9.5px] leading-snug text-tertiary">{figure.detail}</dd>
                ) : null}
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-line-subtle pt-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            Themes you assigned
          </h3>
          {report.themes.length === 0 ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-tertiary">
              Nothing tagged in this period. Reviewing a position and saying what it was about is
              what fills this in.
            </p>
          ) : (
            <>
              <p className="mt-1 text-[10px] text-tertiary">
                A position tagged twice counts against both themes, so these add up to more than the{' '}
                {reviewedCount ?? 0} positions reviewed.
              </p>
              <ul className="mt-2 space-y-1">
                {report.themes.map((entry) => (
                  <li key={entry.theme}>
                    <button
                      type="button"
                      onClick={() => setTheme(theme === entry.theme ? null : entry.theme)}
                      aria-pressed={theme === entry.theme}
                      className={cn(
                        'flex w-full items-baseline gap-2 rounded-[4px] px-2 py-1 text-left text-xs transition-colors',
                        theme === entry.theme
                          ? 'bg-accent-muted text-primary'
                          : 'text-secondary hover:bg-surface-2 hover:text-primary',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                      <span className="text-tertiary tabular">{entry.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {theme ? (
          <section className="border-t border-line-subtle pt-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                {themeLabel(theme)} · {drilled.length}
              </h3>
              <Button variant="ghost" className="ml-auto" onClick={() => void createSet()}>
                Create training set
              </Button>
            </div>
            {drilled.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-tertiary">
                No reviewed positions with this theme in this period.
              </p>
            ) : (
              <ol className="mt-1.5 divide-y divide-line-subtle">
                {drilled.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onOpenItem(item)}
                      className="block w-full py-1.5 text-left"
                    >
                      <span className="block truncate text-[11px] text-primary">
                        {item.gameLabel ?? 'Position'}
                        {item.ply ? (
                          <span className="text-tertiary"> · move {Math.ceil(item.ply / 2)}</span>
                        ) : null}
                      </span>
                      {item.reason ? (
                        <span className="block truncate text-[10px] text-tertiary">
                          {item.reason}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : null}

        {trends.length > 0 ? (
          <section className="border-t border-line-subtle pt-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              Last 30 days vs the 30 before
            </h3>
            <table className="mt-1.5 w-full text-[11px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-tertiary">
                  <th className="py-1 text-left font-medium">Theme</th>
                  <th className="py-1 text-right font-medium">Recent</th>
                  <th className="py-1 text-right font-medium">Before</th>
                </tr>
              </thead>
              <tbody>
                {trends.slice(0, 8).map((trend) => (
                  <tr key={trend.theme} className="border-t border-line-subtle">
                    <td className="py-1 text-secondary">{trend.label}</td>
                    <td className="py-1 text-right text-primary tabular">{trend.counts[0]}</td>
                    <td className="py-1 text-right text-tertiary tabular">{trend.counts[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-[10px] leading-relaxed text-tertiary">
              Two counts, not a direction. A handful of reviewed positions cannot support a claim
              about whether something is improving.
            </p>
          </section>
        ) : null}

        {(all.data ?? []).length === 0 ? (
          <EmptyState
            title="No review history yet."
            description="Review a position with self-analysis on, tag what it was about, and this becomes a record of your own patterns."
          />
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/** Themes across the whole history, for the training-set dialog. */
export function useAllThemes() {
  const items = useReviewItems();
  return useMemo(
    () => countThemes((items.data ?? []).filter((item) => item.themes.length > 0)),
    [items.data],
  );
}
