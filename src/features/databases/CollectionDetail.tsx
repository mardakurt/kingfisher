'use client';

/**
 * Everything about one collection, and everything you can do to it.
 *
 * Deliberately a single scrolling column of stated facts and named actions
 * rather than a grid of cards. A player opens this screen to answer a specific
 * question — how many games, is it indexed, is it the reference, where do I
 * copy it — and a dashboard makes every one of those questions a search.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Copy, Database, Export, Import, Pencil, Trash } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { companionClient } from '@/companion/session';
import type { CompanionAggregateIntegrity } from '@/companion/client';
import { openCollection, providerIdForCollection } from '@/database/collections/registry';
import type { CollectionFacts } from '@/database/collections/types';
import { getRepositories } from '@/persistence/repositories';
import { backfillStructures, type BackfillProgress } from '@/persistence/structure-backfill';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import {
  LocalClassificationTarget,
  SqliteClassificationTarget,
} from '@/theory/classification-targets';

import { ClassificationSection } from './ClassificationSection';
import { CollectionGames } from './CollectionGames';
import { formatBytes, StatusChip } from './CollectionList';
import { StorageSection } from './StorageSection';
import type { TransferRequest } from './TransferDialog';

interface CollectionDetailProps {
  readonly collection: CollectionFacts;
  readonly onTransfer: (request: TransferRequest) => void;
  readonly onChanged: () => void;
}

export function CollectionDetail({ collection, onTransfer, onChanged }: CollectionDetailProps) {
  const notify = useUi((state) => state.notify);
  const setImportOpen = useUi((state) => state.setImportOpen);
  const queryClient = useQueryClient();
  const prefs = usePreferences();
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState<'delete' | 'clear' | null>(null);
  const [backfill, setBackfill] = useState<BackfillProgress | null>(null);

  const sqliteKey = collection.kind === 'sqlite' ? collection.id.slice('sqlite:'.length) : null;

  const integrity = useQuery<CompanionAggregateIntegrity | { consistent: boolean; note: string }>({
    queryKey: ['collection-integrity', collection.id],
    enabled: false,
    retry: false,
    queryFn: async () => {
      if (!sqliteKey) {
        const repositories = await getRepositories();
        const { scanIntegrity } = await import('@/persistence/integrity');
        const report = await scanIntegrity(repositories.raw);
        return {
          consistent: report.issues.length === 0,
          note: report.issues.length === 0 ? 'No issues found.' : `${report.issues.length} issues.`,
        };
      }
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.databaseIntegrity(sqliteKey);
    },
  });

  const rename = useMutation({
    mutationFn: async (name: string) => {
      if (!sqliteKey) throw new Error("The browser's own collection cannot be renamed.");
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.renameDatabase(sqliteKey, name);
    },
    onSuccess: () => {
      notify({ tone: 'success', message: 'Collection renamed.' });
      onChanged();
    },
    onError: (error) =>
      notify({ tone: 'error', message: error instanceof Error ? error.message : 'Rename failed.' }),
    onSettled: () => setRenaming(false),
  });

  /**
   * Export every game as one PGN.
   *
   * Streamed page by page into an array of strings rather than assembled from
   * one enormous read: a five-hundred-thousand-game export is a large string
   * either way, but reading the collection in one gulp to build it would need
   * the whole thing resident twice.
   */
  const exportPgn = useMutation({
    mutationFn: async () => {
      const source = await openCollection(collection.id);
      if (!source) throw new Error('That collection is not available.');
      const parts: string[] = [];
      let after: string | null = null;
      for (;;) {
        const page: Awaited<ReturnType<typeof source.read>> = await source.read(null, after, 200);
        for (const game of page.games) parts.push(game.pgn.trim());
        if (page.nextAfter === null) break;
        after = page.nextAfter;
      }
      return { text: parts.join('\n\n'), games: parts.length };
    },
    onSuccess: ({ text, games }) => {
      const blob = new Blob([`${text}\n`], { type: 'application/x-chess-pgn' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${collection.name.replace(/[^\w. -]/g, '') || 'collection'}.pgn`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify({ tone: 'success', message: `Exported ${games.toLocaleString()} games as PGN.` });
    },
    onError: (error) =>
      notify({ tone: 'error', message: error instanceof Error ? error.message : 'Export failed.' }),
  });

  const destroy = useMutation({
    mutationFn: async (scope: 'delete' | 'clear') => {
      const client = companionClient();
      if (sqliteKey) {
        if (!client) throw new Error('The companion is not connected.');
        if (scope === 'delete') return client.deleteDatabase(sqliteKey);
        return client.clearDatabase(sqliteKey);
      }
      if (scope === 'delete') {
        throw new Error("The browser's own collection cannot be removed, only emptied.");
      }
      const repositories = await getRepositories();
      await repositories.games.clear();
      return { deleted: collection.games ?? 0 };
    },
    onSuccess: (_result, scope) => {
      notify({
        tone: 'success',
        message: scope === 'delete' ? 'Collection deleted.' : 'Collection emptied.',
      });
      onChanged();
    },
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That could not be done.',
      }),
    onSettled: () => setConfirming(null),
  });

  const indexStructures = async () => {
    const client = companionClient();
    if (!client || !sqliteKey) return;
    const controller = new AbortController();
    setBackfill({ stage: 'scanning', processed: 0, remaining: 0, unreadable: 0 });
    try {
      const result = await backfillStructures(client, sqliteKey, {
        signal: controller.signal,
        onProgress: setBackfill,
      });
      notify({
        tone: 'success',
        message: `Indexed ${result.processed.toLocaleString()} positions.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['collection-integrity', collection.id] });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Structure indexing failed.',
      });
    } finally {
      setBackfill(null);
    }
  };

  const isReference = collection.reference;

  return (
    <div className="mx-auto max-w-4xl p-5 md:p-8">
      <header className="flex flex-wrap items-start gap-4 border-b border-line-subtle pb-6">
        <Database className="h-10 w-10 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-primary">{collection.name}</h2>
          <p className="mt-1 text-sm text-secondary">
            {collection.kind === 'sqlite'
              ? 'SQLite collection, held by the companion.'
              : 'Stored in this browser and indexed by position.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusChip
              label={isReference ? 'Reference database' : 'Not the reference'}
              state={isReference ? 'good' : 'unknown'}
            />
            <StatusChip
              label={collection.kind === 'sqlite' ? 'SQLite' : 'IndexedDB'}
              state="unknown"
            />
          </div>
        </div>
        <Button
          variant={isReference ? 'subtle' : 'accent'}
          disabled={isReference}
          onClick={() => {
            prefs.set('explorerSourceId', providerIdForCollection(collection.id));
            notify({
              tone: 'success',
              message: `${collection.name} is now the explorer's default source.`,
            });
            onChanged();
          }}
        >
          {isReference ? 'Reference database' : 'Set as reference'}
        </Button>
      </header>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-line-subtle py-5 text-sm md:grid-cols-4">
        <Fact
          label="Games"
          value={collection.games === null ? 'unavailable' : collection.games.toLocaleString()}
        />
        <Fact
          label="Size"
          value={collection.bytes === null ? 'unavailable' : formatBytes(collection.bytes)}
          note={collection.kind === 'indexeddb' ? 'whole browser origin' : undefined}
        />
        <Fact
          label="Last modified"
          value={
            collection.modifiedAt === null
              ? 'not tracked'
              : new Date(collection.modifiedAt).toLocaleString()
          }
        />
        <Fact label="Location" value={collection.location} />
      </dl>

      <section className="border-b border-line-subtle py-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
          Move games
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon={<Copy />} onClick={() => onTransfer({ kind: 'copy', source: collection })}>
            Copy to…
          </Button>
          <Button
            icon={<Export />}
            onClick={() => onTransfer({ kind: 'move', source: collection })}
          >
            Move to…
          </Button>
          <Button
            icon={<Database />}
            onClick={() => onTransfer({ kind: 'merge', source: collection })}
          >
            Merge into…
          </Button>
          <Button icon={<Import />} onClick={() => setImportOpen(true)}>
            Import PGN
          </Button>
          <Button
            icon={<Export />}
            disabled={exportPgn.isPending || !collection.games}
            onClick={() => exportPgn.mutate()}
          >
            {exportPgn.isPending ? 'Exporting…' : 'Export PGN'}
          </Button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
          Copy leaves the source alone. Move copies first and removes from the source only what the
          destination confirms it holds. Merge shows the exact overlap before writing anything.
        </p>
      </section>

      <CollectionGames collection={collection} onTransfer={onTransfer} onChanged={onChanged} />

      <ClassificationSection
        cacheKey={collection.id}
        collectionName={collection.name}
        invalidate={[['collections'], ['games']]}
        target={async () => {
          if (sqliteKey) {
            const client = companionClient();
            if (!client) throw new Error('The companion is not connected.');
            return new SqliteClassificationTarget(client, sqliteKey);
          }
          const repositories = await getRepositories();
          return new LocalClassificationTarget(repositories.raw);
        }}
      />

      <StorageSection sqliteKey={sqliteKey} collectionName={collection.name} />

      <section className="border-b border-line-subtle py-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
              Indexes and integrity
            </h3>
            <p className="mt-1 text-xs text-tertiary">
              {integrityLine(integrity.data, integrity.isFetching, integrity.isError)}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            {sqliteKey ? (
              <Button disabled={backfill !== null} onClick={() => void indexStructures()}>
                {backfill ? 'Indexing…' : 'Index structures'}
              </Button>
            ) : null}
            <Button onClick={() => void integrity.refetch()}>
              {integrity.isFetching ? 'Checking…' : 'Run integrity check'}
            </Button>
          </div>
        </div>
        {backfill ? (
          <p className="mt-2 text-xs text-secondary tabular" role="status">
            {backfill.processed.toLocaleString()} indexed · {backfill.remaining.toLocaleString()} to
            go
          </p>
        ) : null}
      </section>

      <section className="py-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
          Collection
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon={<Pencil />} disabled={!sqliteKey} onClick={() => setRenaming(true)}>
            Rename
          </Button>
          <Button
            variant="danger"
            icon={<Trash />}
            disabled={!collection.games}
            onClick={() => setConfirming('clear')}
          >
            Empty collection
          </Button>
          {sqliteKey ? (
            <Button variant="danger" icon={<Trash />} onClick={() => setConfirming('delete')}>
              Delete collection
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-tertiary">
          {sqliteKey
            ? `Copy ${collection.location} before a large deletion if you want a recoverable backup.`
            : 'Studies, repertoires and training are not stored here and are never touched by these actions.'}
        </p>
      </section>

      <PromptDialog
        open={renaming}
        title="Rename collection"
        description="The display name only. The file on disk keeps the name it was created with."
        label="Name"
        initialValue={collection.name}
        confirmLabel="Rename"
        onCancel={() => setRenaming(false)}
        onSubmit={(value) => rename.mutate(value)}
      />

      <ConfirmDialog
        open={confirming !== null}
        // Names the kind, because deleting a SQLite collection removes a file
        // from disk and emptying the browser's own collection does not.
        title={
          confirming === 'delete'
            ? 'Delete this SQLite collection?'
            : sqliteKey
              ? 'Empty this SQLite collection?'
              : 'Empty this collection?'
        }
        description={
          confirming === 'delete'
            ? `The file ${collection.location} and every game in it will be permanently removed.`
            : `All ${(collection.games ?? 0).toLocaleString()} games will be removed. The collection itself remains.`
        }
        confirmLabel={destroy.isPending ? 'Working…' : 'Delete permanently'}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) destroy.mutate(confirming);
        }}
      />
    </div>
  );
}

function Fact({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-tertiary">{label}</dt>
      <dd className="mt-1 truncate text-sm text-primary tabular" title={value}>
        {value}
      </dd>
      {note ? <dd className="text-[10px] text-tertiary">{note}</dd> : null}
    </div>
  );
}

/**
 * The integrity line, which says "not checked" until it has been checked.
 *
 * An integrity panel that shows a green tick on load is worse than none: it
 * asserts something nobody verified, about the one property a user consults it
 * to be sure of.
 */
function integrityLine(
  data: CompanionAggregateIntegrity | { consistent: boolean; note: string } | undefined,
  fetching: boolean,
  failed: boolean,
): string {
  if (fetching) return 'Checking…';
  if (failed) return 'The integrity check could not be run.';
  if (!data) return 'Not checked in this session.';
  if ('note' in data) return `${data.consistent ? 'Healthy' : 'Needs attention'} — ${data.note}`;
  return `${data.consistent ? 'Aggregates agree with the source rows' : 'Aggregate mismatch — rebuild aggregates'} · ${data.positions.toLocaleString()} positions`;
}
