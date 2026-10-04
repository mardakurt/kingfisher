'use client';

/**
 * The Library over several databases at once — ChessBase's "Databases 1 of 5".
 *
 * The search is the one the Databases page already runs across ticked
 * collections (`federatedSearch`): the same header filters, a page from each
 * source, and every row naming the database it came from. Sources are never
 * merged; a game held in two databases is listed twice, because "it is in
 * both" is the answer. What the Library adds is reach — it is where a person
 * searches — and opening: a game from a companion database opens on the
 * board like one from My games.
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Database } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { federatedSearch } from '@/database/collections/federated';
import { openCollections } from '@/database/collections/registry';
import type { CollectionFacts } from '@/database/collections/types';
import { formatPgnDate } from '@/persistence/describe';
import type { GameSearchQuery } from '@/persistence/types';
import { useResearchHistory } from '@/stores/research-history-store';
import { useUi } from '@/stores/ui-store';

import { librarySource, openSourceGame } from './library-source';

/** Games read from each database; one large archive cannot crowd out the rest. */
export const PER_DATABASE = 100;

export function DatabasesPicker({
  collections,
  current,
  also,
  onChange,
}: {
  /** The browser's own collection and every companion database. */
  readonly collections: readonly CollectionFacts[];
  /** The database the Library reads now, which is always searched. */
  readonly current: string;
  readonly also: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !panel.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  if (collections.length < 2) return null;
  const chosen = new Set([current, ...also]);
  return (
    <div className="relative" ref={panel}>
      <Button
        aria-expanded={open}
        active={also.length > 0}
        icon={<Database />}
        onClick={() => setOpen(!open)}
        data-library-databases
      >
        {chosen.size} of {collections.length} databases
      </Button>
      {open ? (
        <div
          role="group"
          aria-label="Databases to search"
          className="absolute top-9 left-0 z-30 w-64 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-2 shadow-[var(--shadow-popover)]"
        >
          {collections.map((entry) => (
            <label
              key={entry.id}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-xs hover:bg-surface-2"
            >
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={chosen.has(entry.id)}
                disabled={entry.id === current}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...also, entry.id]
                      : also.filter((id) => id !== entry.id),
                  )
                }
              />
              <span className="min-w-0 flex-1 truncate text-primary">{entry.name}</span>
              <span className="shrink-0 text-[10.5px] text-tertiary tabular">
                {entry.games === null ? '' : entry.games.toLocaleString()}
              </span>
            </label>
          ))}
          <p className="px-2 pt-1 text-[10.5px] text-tertiary">
            The database in the menu is always searched. Reference packs are searched by player in
            the menu, one at a time.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function LibraryAcross({
  ids,
  names,
  query,
  label,
}: {
  readonly ids: readonly string[];
  readonly names: ReadonlyMap<string, string>;
  /** The Library's header filters, without paging. */
  readonly query: GameSearchQuery;
  /** What the search was, for the way back from an opened game. */
  readonly label: string;
}) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const result = useQuery({
    queryKey: ['library-across', ids, query],
    retry: false,
    queryFn: async ({ signal }) => {
      const collections = await openCollections(ids);
      return federatedSearch(collections, query, {
        signal,
        perSource: PER_DATABASE,
        ...(query.sortBy ? { sortBy: query.sortBy } : {}),
        ...(query.sortDirection ? { sortDirection: query.sortDirection } : {}),
      });
    },
  });

  if (result.isPending)
    return <p className="p-4 text-xs text-tertiary">Searching {ids.length} databases…</p>;
  if (result.isError) {
    return (
      <EmptyState
        title="The databases could not be searched."
        description={result.error instanceof Error ? result.error.message : String(result.error)}
      />
    );
  }
  const { hits, bySource, failures, truncated } = result.data;
  return (
    <div data-library-across>
      <p
        className="border-b border-line-subtle px-4 py-2 text-[11px] text-tertiary"
        data-library-across-summary
      >
        {bySource
          .map((entry) => `${entry.games.toLocaleString()} from ${entry.source.name}`)
          .join(' · ')}
        {truncated
          ? ` — the first ${PER_DATABASE} matching games of each database are listed; narrow the filters for the rest.`
          : ''}
        {failures.map(
          (failure) => ` · ${failure.source.name} could not be searched: ${failure.message}`,
        )}
      </p>
      {hits.length === 0 ? (
        <EmptyState
          title="No games match."
          description="Loosen the filters, or choose other databases."
        />
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-line-subtle text-left text-[11px] text-tertiary">
              <th className="px-3 py-1.5 font-medium">White</th>
              <th className="px-2 py-1.5 font-medium">Black</th>
              <th className="px-2 py-1.5 font-medium">Result</th>
              <th className="px-2 py-1.5 font-medium">Event</th>
              <th className="px-2 py-1.5 font-medium">Date</th>
              <th className="px-3 py-1.5 font-medium">Database</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {hits.map((hit, index) => (
              <tr
                key={`${hit.source.id}:${hit.game.fingerprint}:${index}`}
                tabIndex={0}
                className="cursor-pointer hover:bg-surface-2 focus:bg-accent-muted"
                onDoubleClick={() => void openHit(hit)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void openHit(hit);
                }}
                data-across-row={hit.source.id}
              >
                <td className="max-w-[200px] truncate px-3 py-1.5 text-primary">
                  {hit.game.white}
                </td>
                <td className="max-w-[200px] truncate px-2 py-1.5 text-primary">
                  {hit.game.black}
                </td>
                <td className="px-2 py-1.5 tabular text-secondary">
                  {hit.game.result === '1/2-1/2' ? '½–½' : hit.game.result}
                </td>
                <td className="max-w-[220px] truncate px-2 py-1.5 text-secondary">
                  {hit.game.event ?? ''}
                </td>
                <td className="px-2 py-1.5 tabular text-tertiary">
                  {formatPgnDate(hit.game.date)}
                </td>
                {/* Provenance, never merged away. */}
                <td className="max-w-[160px] truncate px-3 py-1.5 text-accent-ink">
                  {names.get(hit.source.id) ?? hit.source.name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  async function openHit(hit: (typeof hits)[number]) {
    try {
      if (!(await openSourceGame(librarySource(hit.source.id, hit.source.name), hit.game))) return;
      useResearchHistory.getState().push({
        href: `${window.location.pathname}${window.location.search}`,
        label,
      });
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  }
}
