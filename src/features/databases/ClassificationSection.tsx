'use client';

/**
 * Classifying the openings of a collection that was imported without them.
 *
 * The same control for both stores. Games imported since Phase 12 are already
 * classified as they land, so what this exists for is the archive somebody has
 * been building for a year — and for that, the important properties are the
 * ones the structure backfill established: it says how much is left before it
 * starts, it can be stopped, and stopping keeps everything already written.
 */

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { useUi } from '@/stores/ui-store';
import {
  backfillClassification,
  type ClassificationBackfillProgress,
  type ClassificationTarget,
} from '@/theory/classify-games';
import { loadOpeningIndex } from '@/theory/openings';

interface ClassificationSectionProps {
  /** Built lazily: opening the database is not this component's job on mount. */
  readonly target: () => Promise<ClassificationTarget>;
  /** Query keys to refresh once games have changed. */
  readonly invalidate?: readonly (readonly unknown[])[];
  readonly collectionName: string;
  /** Distinguishes one collection's pending count from another's in the cache. */
  readonly cacheKey: string;
}

export function ClassificationSection({
  target,
  invalidate = [],
  collectionName,
  cacheKey,
}: ClassificationSectionProps) {
  const notify = useUi((state) => state.notify);
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<ClassificationBackfillProgress | null>(null);
  const abort = useRef<AbortController | null>(null);

  /*
    How much there is to do, read before the user commits to anything. A button
    that says "Classify games" without saying whether that means four games or
    four hundred thousand is a button nobody presses twice.
  */
  const status = useQuery({
    queryKey: ['classification-pending', cacheKey],
    retry: false,
    queryFn: async () => {
      const index = await loadOpeningIndex();
      return { entries: index.entries, pending: await (await target()).remaining(index.digest) };
    },
  });
  const pending = status.data?.pending ?? null;
  const entries = status.data?.entries ?? null;
  const refreshPending = () =>
    queryClient.invalidateQueries({ queryKey: ['classification-pending', cacheKey] });

  const run = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setProgress({ stage: 'scanning', processed: 0, named: 0, remaining: pending ?? 0 });
    try {
      const result = await backfillClassification(await target(), {
        signal: controller.signal,
        onProgress: setProgress,
      });
      notify({
        tone: result.stage === 'cancelled' ? 'info' : 'success',
        message:
          result.stage === 'cancelled'
            ? `Classification stopped. ${result.processed.toLocaleString()} games were classified and kept.`
            : `Classified ${result.processed.toLocaleString()} games in ${collectionName}.`,
        detail:
          result.processed > result.named
            ? `${(result.processed - result.named).toLocaleString()} reached no position in the opening table and are recorded as unclassified.`
            : undefined,
      });
      for (const queryKey of invalidate) await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Classification failed.',
      });
    } finally {
      abort.current = null;
      setProgress(null);
      void refreshPending();
    }
  };

  const running = progress !== null;

  return (
    <section className="border-b border-line-subtle py-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
            Opening classification
          </h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-tertiary">
            {pending === null
              ? status.isError
                ? 'The number of unclassified games could not be read.'
                : 'Reading how many games still need classifying…'
              : pending === 0
                ? 'Every game in this collection has been classified by Kingfisher.'
                : `${pending.toLocaleString()} game${pending === 1 ? '' : 's'} have not been classified. Imported ECO tags are kept either way.`}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          {running ? (
            <Button onClick={() => abort.current?.abort()}>Stop classifying</Button>
          ) : (
            <Button onClick={() => void run()} disabled={pending === 0}>
              Classify games
            </Button>
          )}
        </div>
      </div>
      {progress ? (
        <p className="mt-2 text-xs text-secondary tabular" role="status">
          {progress.stage === 'scanning' ? 'Counting unclassified games…' : 'Classifying…'}{' '}
          {progress.processed.toLocaleString()} done · {progress.named.toLocaleString()} named ·{' '}
          {progress.remaining.toLocaleString()} to go
        </p>
      ) : null}
      {entries !== null ? (
        <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
          {entries.toLocaleString()} named positions, from the CC0 dataset in{' '}
          <code>data/openings/</code>. A game is classified by the deepest of them it reaches, so
          two move orders arriving at one position get one answer.
        </p>
      ) : null}
    </section>
  );
}
