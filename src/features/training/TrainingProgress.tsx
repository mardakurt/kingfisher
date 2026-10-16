'use client';

/**
 * Training progress, under the queue: what the review log says.
 *
 * Eight rolling weeks of reviews as bars (the right ones filled), the past
 * seven days in words with their count, and what falls due over the next
 * week. Counts only (`src/training/progress.ts`); the reader decides what
 * they mean. The query sits under `['persistence', 'training']`, so a review
 * refreshes it with everything else on the page.
 */

import { useQuery } from '@tanstack/react-query';

import { plural } from '@/lib/plural';
import type { ScheduleState } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { correctShare, trainingProgress } from '@/training/progress';

const DAY_NAMES = ['Today', 'Tomorrow'];

export function TrainingProgress({
  schedules,
  now,
}: {
  readonly schedules: readonly ScheduleState[];
  readonly now: number;
}) {
  const reviews = useQuery({
    queryKey: ['persistence', 'training', 'reviews'],
    queryFn: async () => (await getRepositories()).training.allReviews(),
    staleTime: 0,
    retry: false,
  });
  if (!reviews.data) return null;
  const progress = trainingProgress(reviews.data, schedules, now);
  const lastWeek = progress.weeks.at(-1)!;
  const tallest = Math.max(1, ...progress.weeks.map((week) => week.reviews));
  const upcoming = progress.forecast.reduce((sum, count) => sum + count, 0);

  return (
    <section
      aria-label="Training progress"
      className="shrink-0 border-t border-line-subtle px-3 py-2.5 text-[11px]"
      data-training-progress
    >
      <h3 className="text-[10px] font-semibold text-tertiary">Progress</h3>
      {progress.totalReviews === 0 ? (
        <p className="mt-1 text-tertiary">
          No reviews yet. Each answer you check is counted here, by week.
        </p>
      ) : (
        <>
          <p className="mt-1 text-secondary" data-training-progress-week>
            Past 7 days: {plural(lastWeek.reviews, 'review')}
            {lastWeek.reviews > 0 ? `, ${correctShare(lastWeek.correct, lastWeek.reviews)}` : ''}.
          </p>
          <ol
            className="mt-2 flex h-10 items-end gap-1"
            aria-label="Reviews in each of the past eight weeks, oldest first"
          >
            {progress.weeks.map((week, index) => {
              const back = progress.weeks.length - 1 - index;
              const when =
                back === 0
                  ? 'Past 7 days'
                  : back === 1
                    ? 'The week before'
                    : `${back} weeks before`;
              const label = `${when}: ${plural(week.reviews, 'review')}, ${week.correct} right`;
              return (
                <li
                  key={week.from}
                  title={label}
                  aria-label={label}
                  className="relative flex-1 rounded-[2px] bg-surface-3"
                  style={{ height: `${Math.max(6, (week.reviews / tallest) * 100)}%` }}
                >
                  {week.reviews > 0 ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 rounded-[2px] bg-accent"
                      style={{ height: `${(week.correct / week.reviews) * 100}%` }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="mt-1 text-[10px] text-tertiary">
            Bar height is reviews a week; the filled part is the right ones.{' '}
            {plural(progress.totalReviews, 'review')} in all,{' '}
            {correctShare(progress.totalCorrect, progress.totalReviews)}.
          </p>
        </>
      )}
      {upcoming > 0 ? (
        <p className="mt-1.5 text-tertiary" data-training-progress-due>
          Coming due:{' '}
          {progress.forecast
            .map((count, day) =>
              count > 0 ? `${DAY_NAMES[day] ?? `in ${day} days`} ${count}` : null,
            )
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
    </section>
  );
}
