'use client';

/**
 * The position index: what shape it is in, and the two jobs that improve it.
 *
 * This section exists because both of the things it exposes were built,
 * measured, documented — and unreachable. Phase 18 shipped a compact position
 * index that made a real collection 42.9% smaller and could only be started
 * from a script; Phase 19 added a claim index worth a hundredfold on claim
 * search and would have done the same. A maintenance job a person cannot start
 * is a maintenance job nobody runs.
 *
 * Two rules it follows, both learned from the integrity panel beside it:
 *
 *  - It states what *is*, and asks before doing anything. Compaction rewrites
 *    the table holding most of a collection's bytes, so the preflight numbers
 *    are shown before the button means anything.
 *  - It says "not indexed" plainly rather than showing a neutral chip. A claim
 *    search on an unindexed collection still returns the right games; it is
 *    just slow, and the difference is worth a sentence rather than silence.
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { companionClient } from '@/companion/session';
import type { CollectionSchemaStatus, MaintenanceJob } from '@/companion/client';
import { useUi } from '@/stores/ui-store';

import { formatBytes, StatusChip } from './CollectionList';

const number = (value: number) => value.toLocaleString('en-GB');

export function StorageSection({
  sqliteKey,
  collectionName,
}: {
  readonly sqliteKey: string | null;
  readonly collectionName: string;
}) {
  const notify = useUi((state) => state.notify);
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<'compact' | null>(null);

  const schema = useQuery<CollectionSchemaStatus | null>({
    queryKey: ['collection-schema', sqliteKey],
    enabled: sqliteKey !== null,
    retry: false,
    staleTime: 10_000,
    queryFn: async () => {
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.schemaStatus(sqliteKey!);
    },
  });

  /*
    The running job, polled while one is running and not otherwise.

    `refetchInterval` returns false once the job leaves `running`, so a
    finished job stops the poll rather than leaving a timer behind for as long
    as the page is open — the sort of thing the soak test counts.
  */
  const job = useQuery<MaintenanceJob | null>({
    queryKey: ['collection-maintenance', sqliteKey],
    enabled: sqliteKey !== null,
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 700 : false),
    queryFn: async () => {
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.maintenanceStatus(sqliteKey!);
    },
  });

  const running = job.data?.status === 'running';
  const finished = job.data?.status;

  // When a job finishes, everything that read the collection is now stale.
  useEffect(() => {
    if (finished === 'completed') {
      void queryClient.invalidateQueries({ queryKey: ['collection-schema', sqliteKey] });
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
    }
  }, [finished, queryClient, sqliteKey]);

  const start = useMutation({
    mutationFn: async (operation: 'compact' | 'claim-index') => {
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return operation === 'compact'
        ? client.startCompaction(sqliteKey!)
        : client.startClaimIndex(sqliteKey!);
    },
    onSuccess: () => void job.refetch(),
    onError: (error) =>
      notify({
        tone: 'error',
        message: 'That maintenance job could not be started.',
        detail: error instanceof Error ? error.message : undefined,
      }),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.cancelMaintenance(sqliteKey!);
    },
    onSuccess: () => void job.refetch(),
  });

  const preflight = useMutation({
    mutationFn: async () => {
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.compactionPreflight(sqliteKey!);
    },
    onSuccess: () => setConfirming('compact'),
    onError: (error) =>
      notify({
        tone: 'error',
        message: 'The compaction preflight failed.',
        detail: error instanceof Error ? error.message : undefined,
      }),
  });

  /*
    The browser's own collection has neither of these. Saying so is better than
    a section that appears and does nothing, and better than one that is absent
    and leaves the reader wondering where compaction went.
  */
  if (!sqliteKey) {
    return (
      <section className="border-b border-line-subtle py-5" data-testid="storage-section">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
          Position index
        </h3>
        <p className="mt-1 text-xs text-tertiary">
          Compaction and the claim index apply to SQLite collections held by the companion. This
          collection lives in the browser, which stores positions differently.
        </p>
      </section>
    );
  }

  const compact = schema.data?.compact === true || schema.data?.version === 2;
  const claims = schema.data?.claimIndex;
  const bytes = (value: unknown) => (typeof value === 'number' ? formatBytes(value) : null);

  return (
    <section className="border-b border-line-subtle py-5" data-testid="storage-section">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
            Position index
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusChip
              label={compact ? 'Compact schema' : 'Original schema'}
              state={compact ? 'good' : 'unknown'}
            />
            <StatusChip
              label={
                !claims?.applicable
                  ? 'Claim index needs the compact schema'
                  : claims.ready
                    ? 'Claim search indexed'
                    : 'Claim search scans'
              }
              state={claims?.ready ? 'good' : 'unknown'}
            />
          </div>
          <p className="mt-2 text-xs text-tertiary">
            {schema.isLoading
              ? 'Reading the collection…'
              : schema.isError
                ? 'The companion could not describe this collection.'
                : describe(compact, claims)}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap gap-2">
          {!compact ? (
            <Button disabled={running || preflight.isPending} onClick={() => preflight.mutate()}>
              {preflight.isPending ? 'Checking…' : 'Compact this collection'}
            </Button>
          ) : null}
          {claims?.applicable && !claims.ready ? (
            <Button
              disabled={running || start.isPending}
              onClick={() => start.mutate('claim-index')}
            >
              Build claim index
            </Button>
          ) : null}
          {running ? (
            <Button variant="danger" onClick={() => cancel.mutate()}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      {job.data && job.data.status !== 'completed' ? (
        <p className="mt-3 text-xs text-secondary tabular" role="status">
          {job.data.status === 'running'
            ? `${label(job.data.operation)}: ${job.data.phase}${
                job.data.progress === null ? '' : ` · ${job.data.progress}%`
              }`
            : job.data.status === 'cancelled'
              ? `${label(job.data.operation)} was cancelled. Nothing was lost; running it again resumes.`
              : `${label(job.data.operation)} failed. ${job.data.error ?? ''}`}
        </p>
      ) : null}
      {job.data?.status === 'completed' ? (
        <p className="mt-3 text-xs text-secondary tabular" role="status">
          {label(job.data.operation)} finished.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming === 'compact'}
        title={`Compact ${collectionName}?`}
        description={compactionWarning(preflight.data, bytes)}
        confirmLabel="Compact"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          start.mutate('compact');
        }}
      />
    </section>
  );
}

const label = (operation: MaintenanceJob['operation']) =>
  operation === 'compact'
    ? 'Compaction'
    : operation === 'claim-index'
      ? 'The claim index'
      : 'The integrity check';

/** What the current state means for the person reading it. */
function describe(
  compact: boolean,
  claims: { ready: boolean; applicable: boolean; sets: number; indexed: number } | undefined,
): string {
  const storage = compact
    ? 'Positions are stored compactly.'
    : 'Positions are stored in the original schema; compacting made a real 150,119-game collection 42.9% smaller.';
  if (!claims?.applicable) return storage;
  if (claims.ready) {
    return `${storage} Claim searches use the index over ${number(claims.sets)} claim sets.`;
  }
  return (
    `${storage} Claim searches scan every claim set, which is correct and slow. ` +
    `Building the index covers ${number(claims.sets)} claim sets` +
    (claims.indexed > 0 ? `; ${number(claims.indexed)} are already done.` : '.')
  );
}

function compactionWarning(
  preflight: Record<string, unknown> | undefined,
  bytes: (value: unknown) => string | null,
): string {
  if (!preflight) return 'Checking what this would cost…';
  if (preflight.sufficient !== true) {
    return (
      'There is not enough free disk to do this safely. Compaction needs the collection’s own ' +
      `size again while it runs${bytes(preflight.required) ? ` — about ${bytes(preflight.required)}` : ''}.`
    );
  }
  const from = bytes(preflight.bytes);
  const free = bytes(preflight.free);
  return (
    'The position index is rewritten and the old columns are dropped. Nothing is removed until ' +
    'the new rows are verified, and an interrupted run resumes rather than restarting.' +
    (from ? ` The collection is ${from} now` : '') +
    (free ? `, with ${free} free.` : '.')
  );
}
