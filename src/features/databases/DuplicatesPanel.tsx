'use client';

/**
 * Games held more than once, across the collections the user selected.
 *
 * The distinction this panel exists to make: **exact** duplicates are the same
 * bytes and can be removed on request, and **differently annotated** copies are
 * the same game with different notes on it and cannot. The second kind is shown
 * with the difference stated and no destructive action offered at all, because
 * there is no correct automatic answer to which of somebody's two sets of notes
 * survives.
 *
 * Neither kind is ever cleaned up in the background. A duplicate search is
 * something a person runs, looks at, and decides about.
 */

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { openCollections } from '@/database/collections/registry';
import {
  findDuplicates,
  removeExactDuplicates,
  type DuplicateGroup,
  type DuplicateMember,
  type DuplicateSearchResult,
} from '@/database/collections/operations';
import type { CollectionFacts } from '@/database/collections/types';
import { cn } from '@/lib/cn';
import { useUi } from '@/stores/ui-store';

interface DuplicatesPanelProps {
  readonly selected: readonly CollectionFacts[];
  readonly onChanged: () => void;
}

export function DuplicatesPanel({ selected, onChanged }: DuplicatesPanelProps) {
  const notify = useUi((state) => state.notify);
  const [result, setResult] = useState<DuplicateSearchResult | null>(null);
  const [scanned, setScanned] = useState(0);
  const [pending, setPending] = useState<{ group: DuplicateGroup; keep: DuplicateMember } | null>(
    null,
  );
  const abort = useRef<AbortController | null>(null);

  const search = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      abort.current = controller;
      setScanned(0);
      const collections = await openCollections(selected.map((entry) => entry.id));
      return findDuplicates(collections, {
        signal: controller.signal,
        onProgress: setScanned,
      });
    },
    onSuccess: setResult,
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The duplicate search failed.',
      }),
    onSettled: () => {
      abort.current = null;
    },
  });

  const remove = useMutation({
    mutationFn: async ({ group, keep }: { group: DuplicateGroup; keep: DuplicateMember }) => {
      const collections = await openCollections(selected.map((entry) => entry.id));
      const byId = new Map(collections.map((collection) => [collection.ref.id, collection]));
      return removeExactDuplicates(group, keep, byId);
    },
    onSuccess: (removed, { group }) => {
      notify({
        tone: 'success',
        message: `${removed.toLocaleString()} duplicate copy removed. The copy in ${
          pending?.keep.collectionName ?? 'the chosen collection'
        } was kept.`,
      });
      setResult((current) =>
        current
          ? { ...current, groups: current.groups.filter((entry) => entry.key !== group.key) }
          : current,
      );
      onChanged();
    },
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Removing the duplicates failed.',
      }),
    onSettled: () => setPending(null),
  });

  const exact = result?.groups.filter((group) => group.kind === 'exact') ?? [];
  const annotated = result?.groups.filter((group) => group.kind === 'annotations-differ') ?? [];

  return (
    <section className="p-5 md:p-8">
      <header className="flex flex-wrap items-start gap-3 border-b border-line-subtle pb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-primary">Duplicate games</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-tertiary">
            Searching {selected.length} collection{selected.length === 1 ? '' : 's'}:{' '}
            {selected.map((entry) => entry.name).join(', ')}. A collection cannot hold the same game
            twice, so everything found here is a game held in more than one of them.
          </p>
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          {search.isPending ? (
            <Button onClick={() => abort.current?.abort()}>Stop</Button>
          ) : (
            <Button
              variant="accent"
              disabled={selected.length === 0}
              onClick={() => search.mutate()}
            >
              Find duplicates
            </Button>
          )}
        </div>
      </header>

      {search.isPending ? (
        <p className="mt-4 text-xs text-secondary tabular" role="status">
          Scanning… {scanned.toLocaleString()} games read
        </p>
      ) : null}

      {result ? (
        <p className="mt-4 text-xs text-secondary tabular" role="status">
          {result.scanned.toLocaleString()} games examined · {exact.length} exact duplicate group
          {exact.length === 1 ? '' : 's'} · {annotated.length} with differing annotations
          {result.partial ? ' · stopped early, so there may be more' : ''}
        </p>
      ) : null}

      {exact.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
            Exact duplicates
          </h3>
          <p className="mt-1 text-xs text-tertiary">
            Identical down to the movetext and every comment. Keeping one loses nothing.
          </p>
          <ul className="mt-3 space-y-2">
            {exact.map((group) => (
              <GroupRow
                key={group.key}
                group={group}
                onKeep={(keep) => setPending({ group, keep })}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {annotated.length > 0 ? (
        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-caution">
            Duplicate game, different local annotations
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-tertiary">
            The same players, date, event, round and result, but the stored text differs — comments,
            variations or evaluations are not the same in every copy. Kingfisher will not choose
            between them. Open the copies, decide which analysis you want to keep, and delete the
            other from its own collection.
          </p>
          <ul className="mt-3 space-y-2">
            {annotated.map((group) => (
              <GroupRow key={group.key} group={group} />
            ))}
          </ul>
        </section>
      ) : null}

      {result && result.groups.length === 0 ? (
        <p className="mt-6 text-sm text-secondary">
          No game appears in more than one of these collections.
        </p>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title="Remove the other copies?"
        description={
          pending
            ? `${pending.group.members.length - 1} identical cop${
                pending.group.members.length - 1 === 1 ? 'y' : 'ies'
              } will be deleted. The copy in ${pending.keep.collectionName} is kept. ` +
              'Every copy is byte-identical, so nothing is lost — but this cannot be undone in Kingfisher.'
            : ''
        }
        confirmLabel={remove.isPending ? 'Removing…' : 'Remove duplicates'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) remove.mutate(pending);
        }}
      />
    </section>
  );
}

function GroupRow({
  group,
  onKeep,
}: {
  readonly group: DuplicateGroup;
  readonly onKeep?: (keep: DuplicateMember) => void;
}) {
  const first = group.members[0];
  if (!first) return null;
  return (
    <li
      className={cn(
        'rounded-[4px] border p-3',
        group.kind === 'exact' ? 'border-line bg-surface-1' : 'border-caution/40 bg-caution/5',
      )}
    >
      <p className="text-sm text-primary">
        {first.white} – {first.black}
        <span className="ml-2 text-xs text-tertiary">
          {[first.event, first.round ? `round ${first.round}` : null, first.date]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="ml-2 text-xs text-secondary tabular">{first.result}</span>
      </p>
      <ul className="mt-2 space-y-1">
        {group.members.map((member) => (
          <li
            key={`${member.collectionId}:${member.id}`}
            className="flex items-center gap-2 text-xs"
          >
            <span className="min-w-0 flex-1 truncate text-secondary">{member.collectionName}</span>
            <span className="shrink-0 font-mono text-[10px] text-tertiary">
              {member.fingerprint.slice(0, 8)}
            </span>
            {onKeep ? (
              <Button size="sm" onClick={() => onKeep(member)}>
                Keep this one
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </li>
  );
}
