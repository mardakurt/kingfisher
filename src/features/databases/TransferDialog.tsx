'use client';

/**
 * Copy to…, Move to…, Merge into…
 *
 * One dialog for three operations, because to the user they differ in one
 * sentence each and it would be strange for them to look like different
 * features. What differs underneath is only what happens after the write:
 * nothing for a copy, a verified deletion for a move, and a preview beforehand
 * for a merge.
 *
 * Three things this dialog insists on:
 *
 * - **It says what will happen before it happens.** A merge counts the exact
 *   overlap first. A move states plainly that the source games will be removed
 *   only once the destination confirms it holds them.
 * - **It never leaves you guessing afterwards.** Written, already-present,
 *   removed and unstorable are four different numbers and are reported as four.
 * - **It can be closed.** The work belongs to the job store, not to this
 *   component, so closing the dialog does not cancel anything.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { openCollection } from '@/database/collections/registry';
import type { CollectionFacts } from '@/database/collections/types';
import { copyGames, moveGames, previewMerge } from '@/database/collections/operations';
import type { GameSearchQuery } from '@/persistence/types';
import { useUi } from '@/stores/ui-store';

import {
  describeTransfer,
  transferWarning,
  useTransferJob,
  type TransferKind,
} from './transfer-job-store';

export interface TransferRequest {
  readonly kind: Exclude<TransferKind, 'dedupe'>;
  readonly source: CollectionFacts;
  /** Restrict to a filter, for "copy these search results". */
  readonly query?: GameSearchQuery | null;
  /** Restrict to a selection, for "copy the selected games". */
  readonly fingerprints?: readonly string[];
  /** What the restriction is, in the user's words. */
  readonly scopeLabel?: string;
}

interface TransferDialogProps {
  readonly request: TransferRequest | null;
  readonly collections: readonly CollectionFacts[];
  readonly onClose: () => void;
  readonly onChanged: () => void;
}

const TITLES: Record<TransferRequest['kind'], string> = {
  copy: 'Copy games to…',
  move: 'Move games to…',
  merge: 'Merge into…',
};

export function TransferDialog({ request, collections, onClose, onChanged }: TransferDialogProps) {
  const notify = useUi((state) => state.notify);
  const queryClient = useQueryClient();
  const run = useTransferJob((state) => state.run);
  const running = useTransferJob((state) => state.running);
  const progress = useTransferJob((state) => state.progress);
  const cancel = useTransferJob((state) => state.cancel);
  const [destinationId, setDestinationId] = useState('');
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  const candidates = collections.filter((entry) => entry.id !== request?.source.id);

  /*
    Reset during render rather than in an effect. The default destination is a
    function of which request the dialog was opened with, and computing it here
    means the first paint already has the right one selected instead of showing
    an empty select for a frame and then correcting itself.
  */
  const requestKey = request ? `${request.kind}:${request.source.id}` : null;
  if (requestKey !== openedFor) {
    setOpenedFor(requestKey);
    setDestinationId(candidates[0]?.id ?? '');
  }

  const destination = candidates.find((entry) => entry.id === destinationId) ?? null;

  /*
    The merge preview. Only for a merge, and only once a destination is chosen:
    it costs a full pass over the source, and running it speculatively for a
    copy — which does not need it — would make every dialog open feel slow.
  */
  const preview = useQuery({
    queryKey: ['merge-preview', request?.source.id, destinationId],
    enabled: request?.kind === 'merge' && Boolean(destination),
    retry: false,
    queryFn: async () => {
      const [source, target] = await Promise.all([
        openCollection(request!.source.id),
        openCollection(destinationId),
      ]);
      if (!source || !target) throw new Error('One of those collections is not available.');
      return previewMerge(source, target);
    },
  });

  const execute = async () => {
    if (!request || !destination) return;
    const label = `${request.source.name} → ${destination.name}`;
    const result = await run(
      request.kind === 'move' ? 'move' : 'copy',
      label,
      async (signal, onProgress) => {
        const [source, target] = await Promise.all([
          openCollection(request.source.id),
          openCollection(destination.id),
        ]);
        if (!source || !target) throw new Error('One of those collections is not available.');
        const options = {
          signal,
          onProgress,
          ...(request.query ? { query: request.query } : {}),
          ...(request.fingerprints ? { fingerprints: request.fingerprints } : {}),
        };
        return request.kind === 'move'
          ? moveGames(source, target, options)
          : copyGames(source, target, options);
      },
    );

    if (!result) {
      notify({ tone: 'info', message: 'Another database operation is already running.' });
      return;
    }
    const warning = transferWarning(result);
    notify({
      tone: warning ? 'error' : result.stage === 'cancelled' ? 'info' : 'success',
      message:
        result.stage === 'cancelled'
          ? `Stopped. ${describeTransfer({ ...result, kind: request.kind === 'move' ? 'move' : 'copy' })}.`
          : `${label}. ${describeTransfer({ ...result, kind: request.kind === 'move' ? 'move' : 'copy' })}.`,
      ...(warning ? { detail: warning } : {}),
    });
    await queryClient.invalidateQueries({ queryKey: ['collections'] });
    onChanged();
    if (!warning) onClose();
  };

  if (!request) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={TITLES[request.kind]}
      description={
        request.kind === 'move'
          ? 'Games are copied first. Nothing is removed from the source until the destination confirms it holds them.'
          : request.kind === 'merge'
            ? 'Every game in the source is copied into the destination. Games the destination already holds are counted, not duplicated.'
            : 'The source is not changed.'
      }
      width="w-[560px]"
      footer={
        <div className="flex w-full items-center gap-2">
          {progress ? (
            <span className="text-xs text-secondary tabular" role="status">
              {STAGE_TEXT[progress.stage] ?? progress.stage} · {progress.read.toLocaleString()} read
              · {progress.written.toLocaleString()} written
              {progress.removed > 0 ? ` · ${progress.removed.toLocaleString()} removed` : ''}
            </span>
          ) : null}
          <div className="ml-auto flex gap-2">
            {running ? (
              <Button onClick={cancel}>Stop</Button>
            ) : (
              <Button onClick={onClose}>Close</Button>
            )}
            <Button
              variant={request.kind === 'move' ? 'danger' : 'accent'}
              disabled={!destination || running}
              onClick={() => void execute()}
            >
              {running ? 'Working…' : ACTION_LABELS[request.kind]}
            </Button>
          </div>
        </div>
      }
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-tertiary">Source</dt>
        <dd className="text-primary">
          {request.source.name}
          <span className="ml-2 text-xs text-tertiary tabular">
            {request.source.games?.toLocaleString() ?? '—'} games
          </span>
        </dd>
        {request.scopeLabel ? (
          <>
            <dt className="text-tertiary">Selection</dt>
            <dd className="text-secondary">{request.scopeLabel}</dd>
          </>
        ) : null}
        <dt className="text-tertiary">Destination</dt>
        <dd>
          {candidates.length === 0 ? (
            <p className="text-xs text-caution">
              There is nowhere to put them. Create a second collection first — a SQLite collection
              needs the companion running.
            </p>
          ) : (
            <select
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
              aria-label="Destination collection"
              className="h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-sm text-primary outline-none focus:border-accent/60"
            >
              {candidates.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} · {entry.kind === 'sqlite' ? 'SQLite' : 'this browser'} ·{' '}
                  {entry.games?.toLocaleString() ?? '—'} games
                </option>
              ))}
            </select>
          )}
        </dd>
      </dl>

      {request.kind === 'merge' ? (
        <section className="mt-4 rounded-[4px] border border-line bg-surface-1 p-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
            What this merge would do
          </h3>
          {preview.isPending ? (
            <p className="mt-2 text-xs text-tertiary">Counting the overlap exactly…</p>
          ) : preview.isError ? (
            <p className="mt-2 text-xs text-negative">{preview.error.message}</p>
          ) : preview.data ? (
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
              <dt className="text-tertiary">Source games</dt>
              <dd className="text-right text-primary tabular">
                {preview.data.sourceGames.toLocaleString()}
              </dd>
              <dt className="text-tertiary">Already present</dt>
              <dd className="text-right text-secondary tabular">
                {preview.data.alreadyPresent.toLocaleString()}
              </dd>
              <dt className="font-medium text-secondary">New games</dt>
              <dd className="text-right font-medium text-primary tabular">
                {preview.data.newGames.toLocaleString()}
              </dd>
            </dl>
          ) : null}
          <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
            Counted by exact fingerprint. A game stored twice with different annotations is not
            counted as already present — use Find duplicates, where you decide which copy to keep.
          </p>
        </section>
      ) : null}

      {request.kind === 'move' ? (
        <p className="mt-4 rounded-[4px] border border-caution/40 bg-caution/10 p-3 text-xs leading-relaxed text-secondary">
          Games are removed from {request.source.name} one page at a time, and only after the
          destination has been asked whether it holds them. If it does not, they stay where they are
          and the result says so.
        </p>
      ) : null}
    </Dialog>
  );
}

const ACTION_LABELS: Record<TransferRequest['kind'], string> = {
  copy: 'Copy games',
  move: 'Move games',
  merge: 'Merge',
};

const STAGE_TEXT: Record<string, string> = {
  reading: 'Reading',
  writing: 'Writing',
  verifying: 'Verifying the destination',
  deleting: 'Removing from the source',
  complete: 'Complete',
  cancelled: 'Stopped',
};
