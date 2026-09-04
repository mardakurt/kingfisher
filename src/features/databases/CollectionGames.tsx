'use client';

/**
 * The games in one collection, and what can be done to a selection of them.
 *
 * This is where "copy these games" becomes a real action rather than a
 * whole-collection one. Everything else in the transfer dialog works on a
 * collection or a filter; a player who wants four games out of a tournament
 * archive wants to tick four games.
 *
 * The filter is deliberately the same three fields the companion's own matcher
 * implements, and the count beside the list is exact. A database screen that
 * says "about 2,000" is a database screen nobody can act on — and, more to the
 * point, a delete-matching-filter button next to an approximate count is a way
 * to delete something you did not mean to.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Copy, Export, Trash } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { companionClient } from '@/companion/session';
import type { CollectionFacts } from '@/database/collections/types';
import { getRepositories } from '@/persistence/repositories';
import type { GameSearchResult } from '@/persistence/types';
import { openingDisplay } from '@/theory/classify-games';
import { useUi } from '@/stores/ui-store';

import type { TransferRequest } from './TransferDialog';

type DeleteScope = 'selected' | 'matching';

interface CollectionGamesProps {
  readonly collection: CollectionFacts;
  readonly onTransfer: (request: TransferRequest) => void;
  readonly onChanged: () => void;
}

export function CollectionGames({ collection, onTransfer, onChanged }: CollectionGamesProps) {
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const [player, setPlayer] = useState('');
  const [fromYear, setFromYear] = useState('');
  const [minRating, setMinRating] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState<DeleteScope | null>(null);
  const [busy, setBusy] = useState(false);

  const sqliteKey = collection.kind === 'sqlite' ? collection.id.slice('sqlite:'.length) : null;

  const filter = useMemo(
    () => ({
      ...(player.trim() ? { player: player.trim().toLocaleLowerCase('en-US') } : {}),
      ...(Number(fromYear) ? { fromYear: Number(fromYear) } : {}),
      ...(Number(minRating) ? { minRating: Number(minRating) } : {}),
    }),
    [fromYear, minRating, player],
  );
  const hasFilter = Object.keys(filter).length > 0;

  const games = useQuery<GameSearchResult>({
    queryKey: ['collection-games', collection.id, filter],
    retry: false,
    queryFn: async () => {
      const query = {
        ...filter,
        limit: 100,
        exactTotal: true,
        sortBy: 'date',
        sortDirection: 'desc',
      } as const;
      if (!sqliteKey) {
        const repositories = await getRepositories();
        return repositories.games.search(query);
      }
      const client = companionClient();
      if (!client) throw new Error('The companion is not connected.');
      return client.searchGames<GameSearchResult>(sqliteKey, query);
    },
  });

  const rows = games.data?.games ?? [];
  const total = games.data?.total ?? 0;

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (sqliteKey) {
        const client = companionClient();
        if (!client) throw new Error('The companion is not connected.');
        const result =
          confirm === 'selected'
            ? await client.deleteGames(sqliteKey, { fingerprints: [...selected] })
            : await client.deleteGames(sqliteKey, { query: filter });
        notify({
          tone: 'success',
          message: `${result.deleted.toLocaleString()} game${result.deleted === 1 ? '' : 's'} deleted.`,
          detail: result.integrity?.consistent
            ? 'Explorer aggregates passed the post-delete integrity check.'
            : 'The integrity check needs attention; use Rebuild aggregates.',
        });
      } else {
        const repositories = await getRepositories();
        const ids =
          confirm === 'selected'
            ? rows.filter((game) => selected.has(game.fingerprint)).map((game) => game.id)
            : (await repositories.games.search({ ...filter, limit: 100_000 })).games.map(
                (game) => game.id,
              );
        await repositories.games.deleteMany(ids);
        notify({
          tone: 'success',
          message: `${ids.length.toLocaleString()} game${ids.length === 1 ? '' : 's'} deleted.`,
        });
      }
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['collection-games', collection.id] });
      onChanged();
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The deletion failed.',
      });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const scopeLabel = selected.size
    ? `${selected.size} selected game${selected.size === 1 ? '' : 's'}`
    : hasFilter
      ? `${total.toLocaleString()} games matching the visible filter`
      : 'Every game in this collection';

  return (
    <section className="border-b border-line-subtle py-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">Games</h3>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Field label="Player" value={player} onChange={setPlayer} placeholder="Exact name" />
        <Field label="From year" value={fromYear} onChange={setFromYear} placeholder="2024" />
        <Field label="Minimum Elo" value={minRating} onChange={setMinRating} placeholder="2500" />
      </div>

      <div className="mt-3 max-h-56 overflow-auto rounded-[4px] border border-line-subtle">
        {rows.map((game) => {
          const opening = openingDisplay(game);
          return (
            <label
              key={game.id}
              className="flex items-center gap-2 border-b border-line-subtle px-2 py-1.5 text-xs last:border-0"
            >
              <input
                type="checkbox"
                checked={selected.has(game.fingerprint)}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(game.fingerprint);
                    else next.delete(game.fingerprint);
                    return next;
                  })
                }
              />
              <span className="min-w-0 flex-1 truncate text-secondary">
                {game.white} – {game.black}
              </span>
              <span className="w-28 shrink-0 truncate text-right text-[10px] text-tertiary">
                {opening.eco ?? ''} {opening.label ?? ''}
              </span>
              <span className="w-10 shrink-0 text-right text-tertiary tabular">
                {game.year ?? '—'}
              </span>
              <span className="w-12 shrink-0 text-right text-primary">{game.result}</span>
            </label>
          );
        })}
        {games.isPending ? <p className="p-3 text-xs text-tertiary">Loading games…</p> : null}
        {games.isError ? (
          <p className="p-3 text-xs text-negative">
            {games.error instanceof Error ? games.error.message : 'The games could not be read.'}
          </p>
        ) : null}
        {!games.isPending && rows.length === 0 ? (
          <p className="p-3 text-xs text-tertiary">No games match.</p>
        ) : null}
      </div>
      <p className="mt-1 text-[10px] text-tertiary">
        Showing up to 100 · exact match count {total.toLocaleString()}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          icon={<Copy />}
          disabled={selected.size === 0}
          onClick={() =>
            onTransfer({
              kind: 'copy',
              source: collection,
              fingerprints: [...selected],
              scopeLabel,
            })
          }
        >
          Copy selected to…
        </Button>
        <Button
          icon={<Export />}
          disabled={selected.size === 0}
          onClick={() =>
            onTransfer({
              kind: 'move',
              source: collection,
              fingerprints: [...selected],
              scopeLabel,
            })
          }
        >
          Move selected to…
        </Button>
        <Button
          icon={<Copy />}
          disabled={!hasFilter || total === 0}
          onClick={() =>
            onTransfer({
              kind: 'copy',
              source: collection,
              query: filter,
              scopeLabel: `${total.toLocaleString()} games matching the visible filter`,
            })
          }
        >
          Copy matching filter to…
        </Button>
        <Button
          variant="danger"
          icon={<Trash />}
          disabled={selected.size === 0}
          onClick={() => setConfirm('selected')}
        >
          Delete selected ({selected.size})
        </Button>
        <Button
          variant="danger"
          icon={<Trash />}
          disabled={!hasFilter || total === 0}
          onClick={() => setConfirm('matching')}
        >
          Delete matching filter
        </Button>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={sqliteKey ? 'Delete SQLite games?' : 'Delete these games?'}
        description={
          confirm === 'selected'
            ? `${selected.size.toLocaleString()} selected games will be removed in one transaction. This cannot be undone in Kingfisher.`
            : `${total.toLocaleString()} games matching the visible filter will be removed in one transaction. This cannot be undone in Kingfisher.`
        }
        confirmLabel={busy ? 'Deleting…' : 'Delete permanently'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
}) {
  return (
    <label className="text-[10px] text-tertiary">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
      />
    </label>
  );
}
