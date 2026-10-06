'use client';

/**
 * A collection's annotators, PGN sources, teams and recorded game titles.
 *
 * These tags are only in each game's PGN, so this is a walk of its own over
 * every game's headers (`GameCollection.tagKeys`), separate from the cheap
 * index above it: read when the collection is opened if it is small, and
 * when asked, with progress and a Stop, if it is not. Each name opens the
 * Library on exactly the games that carry it.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Tabs';
import { readTagIndex, type IndexName } from '@/database/collections/collection-index';
import { openCollection } from '@/database/collections/registry';
import type { CollectionFacts } from '@/database/collections/types';
import { plural } from '@/lib/plural';

/** Collections up to this size have their headers read when they are opened. */
const AUTOMATIC_LIMIT = 5_000;
const ROWS = 100;

type Tab = 'annotators' | 'sources' | 'teams' | 'titles';
const ONE: Readonly<Record<Tab, { readonly noun: string; readonly a: string }>> = {
  titles: { noun: 'recorded title', a: 'a recorded title' },
  annotators: { noun: 'annotator', a: 'an annotator' },
  sources: { noun: 'source', a: 'a source' },
  teams: { noun: 'team', a: 'a team' },
};
const PARAM: Readonly<Record<Tab, string>> = {
  titles: 'title',
  annotators: 'annotator',
  sources: 'source',
  teams: 'team',
};

export function CollectionTagsSection({ collection }: { readonly collection: CollectionFacts }) {
  const queryClient = useQueryClient();
  const [requested, setRequested] = useState(false);
  const [read, setRead] = useState(0);
  const [tab, setTab] = useState<Tab>('annotators');
  const [filter, setFilter] = useState('');

  const automatic = collection.games !== null && collection.games <= AUTOMATIC_LIMIT;
  const queryKey = ['collection-tags', collection.id, collection.games];
  const query = useQuery({
    queryKey,
    enabled: automatic || requested,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      setRead(0);
      const opened = await openCollection(collection.id);
      if (!opened?.tagKeys) throw new Error('This collection cannot read its games’ tags here.');
      return readTagIndex({ tagKeys: opened.tagKeys.bind(opened) }, { signal, onPage: setRead });
    },
  });
  const index = query.data ?? null;
  const needle = filter.trim().toLowerCase();
  const rows = useMemo(
    () => (index?.[tab] ?? []).filter((entry) => entry.name.toLowerCase().includes(needle)),
    [index, tab, needle],
  );
  const without = index
    ? {
        titles: index.withoutTitle,
        annotators: index.withoutAnnotator,
        sources: index.withoutSource,
        teams: index.withoutTeam,
      }[tab]
    : 0;
  const library = (entry: IndexName) =>
    `/games?${new URLSearchParams({ db: collection.id, [PARAM[tab]]: `"${entry.name}"` }).toString()}`;

  return (
    <section className="border-b border-line-subtle py-5" data-collection-tags>
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-tertiary">
          Annotators, sources, teams and game titles
        </h3>
        {query.fetchStatus === 'fetching' ? (
          <>
            <span className="text-2xs text-tertiary">
              Reading headers… {read.toLocaleString()}
              {collection.games ? ` of ${collection.games.toLocaleString()}` : ''} games
            </span>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                setRequested(false);
                void queryClient.cancelQueries({ queryKey });
              }}
            >
              Stop
            </Button>
          </>
        ) : !index ? (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => {
              setRequested(true);
              if (query.isError) void query.refetch();
            }}
            data-tags-read
          >
            Read every game’s headers
          </Button>
        ) : null}
      </div>
      {query.isError ? (
        <p className="mt-2 text-2xs text-caution" role="alert">
          {query.error instanceof Error ? query.error.message : String(query.error)}
        </p>
      ) : null}
      {!index && !automatic && query.fetchStatus !== 'fetching' ? (
        <p className="mt-2 text-2xs text-tertiary">
          These tags are in each game’s PGN, not in the index, so counting them reads the headers of
          every game — no moves. A collection this large is read when you ask.
        </p>
      ) : null}

      {index ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Segmented
              items={[
                { id: 'annotators', label: `Annotators (${index.annotators.length})` },
                { id: 'sources', label: `Sources (${index.sources.length})` },
                { id: 'teams', label: `Teams (${index.teams.length})` },
                { id: 'titles', label: `Game titles (${index.titles.length})` },
              ]}
              value={tab}
              onChange={(next) => setTab(next as Tab)}
            />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={`Filter ${tab}`}
              aria-label={`Filter ${tab}`}
              className="h-7 w-48 rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-2xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
            />
          </div>
          {rows.length ? (
            <ul
              className="mt-2 max-h-[320px] divide-y divide-line-subtle overflow-y-auto rounded-[var(--radius-control)] border border-line-subtle text-[11px]"
              data-tags-list={tab}
            >
              {rows.slice(0, ROWS).map((entry) => (
                <li key={entry.name} className="flex items-baseline gap-2 px-2 py-1.5">
                  {/* One-time metadata searches need a fresh Library mount. A soft
                      navigation may restore its previous cached workspace state. */}
                  <a
                    href={library(entry)}
                    className="min-w-0 flex-1 truncate text-primary hover:text-accent-ink"
                    data-tag-name={entry.name}
                  >
                    {entry.name}
                  </a>
                  <span className="shrink-0 tabular text-secondary">
                    {plural(entry.games, 'game')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-2xs text-tertiary">
              {needle ? 'None match.' : `No game here names ${ONE[tab].a}.`}
            </p>
          )}
          {without ? (
            <p className="mt-1 text-[10.5px] text-tertiary">
              {plural(without, 'game')} of {index.games.toLocaleString()}{' '}
              {without === 1 ? 'names' : 'name'} no {ONE[tab].noun}.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
