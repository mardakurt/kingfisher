'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companionClient } from '@/companion/session';

export function CollectionSourceLedger({ collectionId }: { readonly collectionId: string }) {
  const queryClient = useQueryClient();
  const [rollback, setRollback] = useState<string | null>(null);
  const updates = useQuery({
    queryKey: ['collection-updates', collectionId],
    enabled: collectionId.startsWith('sqlite:'),
    retry: false,
    queryFn: async () => {
      const client = companionClient();
      if (!client) throw new Error('Companion unavailable.');
      return (await client.collectionUpdates(collectionId.slice(7))).updates;
    },
  });
  const sources = useQuery({
    queryKey: ['collection-sources', collectionId],
    queryFn: async () => {
      const client = companionClient();
      if (!client) throw new Error('Connect the companion to read the source ledger.');
      return (await client.collectionSources(collectionId.slice('sqlite:'.length))).sources;
    },
    enabled: collectionId.startsWith('sqlite:'),
    retry: false,
  });
  if (!collectionId.startsWith('sqlite:')) return null;
  return (
    <section className="mt-4 text-xs" aria-label="Collection source ledger">
      <h3>Source and annotation ledger</h3>
      <p>
        Collection key for incremental imports: <code>{collectionId.slice('sqlite:'.length)}</code>
      </p>
      {sources.isPending ? (
        <p>Reading sources…</p>
      ) : sources.isError ? (
        <p role="alert">{sources.error.message}</p>
      ) : sources.data?.length ? (
        <ul className="space-y-2">
          {sources.data.map((source, index) => (
            <li key={`${source.importedAt}:${index}`} className="border-t border-line p-2">
              <p>
                {source.file} · {source.games.toLocaleString()} new games ·{' '}
                {new Date(source.importedAt).toISOString()}
                {source.stopped ? ' · partial import' : ''}
              </p>
              <p>Licence: {source.licence ?? 'Not supplied; redistribution rights are unknown.'}</p>
              <p className="break-words text-secondary">
                {source.note ?? 'No checksum or annotation coverage recorded.'}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No source metadata was recorded for this collection.</p>
      )}
      {updates.data?.map((update) => (
        <div key={update.id} className="mt-2 border-t border-line p-2">
          <p>
            Update {update.metadata.file} · {update.status} ·{' '}
            {update.retainedGames.toLocaleString()} retained new games
          </p>
          {update.retainedGames > 0 ? (
            <Button size="sm" onClick={() => setRollback(update.id)}>
              Roll back this update…
            </Button>
          ) : null}
        </div>
      ))}
      {updates.error ? <p role="alert">{updates.error.message}</p> : null}
      <ConfirmDialog
        open={rollback !== null}
        title="Roll back this database update?"
        description="Removes only game records first inserted by this update. Earlier records and duplicate games remain. This does not change study chapters or repertoire decisions. Rollback cannot restore those removed games; reimport their source archive to add them again."
        confirmLabel="Roll back update"
        onCancel={() => setRollback(null)}
        onConfirm={async () => {
          if (!rollback) return;
          const client = companionClient();
          if (!client) throw new Error('Companion unavailable.');
          await client.rollbackUpdate(collectionId.slice(7), rollback);
          setRollback(null);
          await queryClient.invalidateQueries({ queryKey: ['collection-updates', collectionId] });
          await queryClient.invalidateQueries({ queryKey: ['collection-games', collectionId] });
          await queryClient.invalidateQueries({ queryKey: ['collection-integrity', collectionId] });
          await queryClient.invalidateQueries({ queryKey: ['collections'] });
          await queryClient.invalidateQueries({ queryKey: ['companion'] });
          await queryClient.invalidateQueries({ queryKey: ['explorer'] });
        }}
      />
      <p className="text-tertiary">
        Coverage describes accepted archive games, including duplicates. Comments, variations or
        symbols do not prove expert authorship; computer evaluations are reported separately. Old
        imports have unknown coverage.
      </p>
    </section>
  );
}
