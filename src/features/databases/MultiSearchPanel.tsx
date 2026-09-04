'use client';

/**
 * One query across several collections, with every row still naming its source.
 *
 * The ChessBase-class workflow this closes: a player who keeps a reference
 * archive, a tournament folder and their own games wants to ask one question of
 * all three. Kingfisher could search each of them and none of them together.
 *
 * Two rules from the federated layer show up directly in this UI. Sources are
 * never merged — every row prints where it came from, and a game held in two
 * collections appears twice, because "it is in both" is the useful answer. And
 * a filter is only rendered when every selected source can honour it, so a
 * result set is never quietly wider than the filters suggest.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Search } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { federatedSearch, supportedFilters } from '@/database/collections/federated';
import { openStoredGame } from '@/features/games/open-game';
import type { FederatedResult } from '@/database/collections/federated';
import { openCollections } from '@/database/collections/registry';
import type { CollectionFacts } from '@/database/collections/types';
import { formatPgnDate } from '@/persistence/describe';
import type { GameSearchQuery } from '@/persistence/types';
import { openingDisplay } from '@/theory/classify-games';
import { useUi } from '@/stores/ui-store';

interface MultiSearchPanelProps {
  readonly selected: readonly CollectionFacts[];
  readonly onCreateFromResults: (query: GameSearchQuery, sourceId: string, label: string) => void;
}

export function MultiSearchPanel({ selected, onCreateFromResults }: MultiSearchPanelProps) {
  const notify = useUi((state) => state.notify);
  const router = useRouter();
  const [player, setPlayer] = useState('');
  const [text, setText] = useState('');
  const [eco, setEco] = useState('');
  const [fromYear, setFromYear] = useState('');
  const [minRating, setMinRating] = useState('');
  const [result, setResult] = useState<FederatedResult | null>(null);

  /*
    Asked rather than assumed. Both current stores answer the whole vocabulary,
    so today every field renders — but the day a source that cannot do text
    search joins a set, the field disappears instead of being ignored.
  */
  const [fields, setFields] = useState<readonly string[]>(Object.keys(FIELD_LABELS));

  const query: GameSearchQuery = {
    ...(player.trim() ? { player: player.trim().toLowerCase() } : {}),
    ...(text.trim() ? { text: text.trim() } : {}),
    ...(eco.trim() ? { eco: eco.trim() } : {}),
    ...(Number(fromYear) ? { fromYear: Number(fromYear) } : {}),
    ...(Number(minRating) ? { minRating: Number(minRating) } : {}),
  };
  const described = describeQuery(query);

  const search = useMutation({
    mutationFn: async () => {
      const collections = await openCollections(selected.map((entry) => entry.id));
      setFields(supportedFilters(collections));
      return federatedSearch(collections, query, { perSource: 50 });
    },
    onSuccess: (value) => {
      setResult(value);
      for (const failure of value.failures) {
        notify({
          tone: 'error',
          message: `${failure.source.name} could not be searched.`,
          detail: failure.message,
        });
      }
    },
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The search failed.',
      }),
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line-subtle p-5 md:px-8">
        <h2 className="text-lg font-semibold text-primary">
          Search {selected.length} collection{selected.length === 1 ? '' : 's'}
        </h2>
        <p className="mt-1 text-xs text-tertiary">
          {selected.map((entry) => entry.name).join(' · ')}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {fields.includes('player') ? (
            <SearchField
              label="Player"
              value={player}
              onChange={setPlayer}
              placeholder="Carlsen, Magnus"
              wide
            />
          ) : null}
          {fields.includes('text') ? (
            <SearchField
              label="Text"
              value={text}
              onChange={setText}
              placeholder="Event, site, opening"
              wide
            />
          ) : null}
          {fields.includes('eco') ? (
            <SearchField label="ECO" value={eco} onChange={setEco} placeholder="B90" />
          ) : null}
          {fields.includes('fromYear') ? (
            <SearchField
              label="From year"
              value={fromYear}
              onChange={setFromYear}
              placeholder="2020"
            />
          ) : null}
          {fields.includes('minRating') ? (
            <SearchField
              label="Min Elo"
              value={minRating}
              onChange={setMinRating}
              placeholder="2600"
            />
          ) : null}
          <div className="flex items-end gap-2">
            <Button
              variant="accent"
              icon={<Search />}
              disabled={selected.length === 0 || search.isPending}
              onClick={() => search.mutate()}
            >
              {search.isPending ? 'Searching…' : 'Search all'}
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {result === null ? (
          <p className="p-6 text-sm text-tertiary">
            Enter a filter and search. Results keep the name of the collection they came from; a
            game held in two collections appears once for each.
          </p>
        ) : result.hits.length === 0 ? (
          <p className="p-6 text-sm text-tertiary">
            Nothing matched in {result.bySource.length} searched collection
            {result.bySource.length === 1 ? '' : 's'}.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-line-subtle px-5 py-2 md:px-8">
              <p className="text-xs text-secondary tabular">
                {result.hits.length.toLocaleString()} result
                {result.hits.length === 1 ? '' : 's'} ·{' '}
                {result.bySource
                  .map((entry) => `${entry.games.toLocaleString()} from ${entry.source.name}`)
                  .join(' · ')}
                {result.truncated ? ' · more available' : ''}
              </p>
              {selected.length === 1 && described ? (
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={() => onCreateFromResults(query, selected[0]!.id, described)}
                >
                  Create collection from these results
                </Button>
              ) : null}
            </div>
            <ul className="divide-y divide-line-subtle">
              {result.hits.map((hit, index) => {
                const opening = openingDisplay(hit.game);
                return (
                  <li
                    key={`${hit.source.id}:${hit.game.fingerprint}:${index}`}
                    className="flex items-baseline gap-3 px-5 py-2 md:px-8"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        /*
                          Only the browser's own collection can hand a game
                          straight to the board today. Saying so is better than
                          a button that does nothing: the game is real and the
                          user is told exactly where it is.
                        */
                        if (hit.source.kind !== 'indexeddb') {
                          notify({
                            tone: 'info',
                            message: `That game is in ${hit.source.name}. Copy it to your own collection to open it on the board.`,
                          });
                          return;
                        }
                        void openStoredGame(hit.game.id)
                          .then(() => router.push('/analysis'))
                          .catch((error: unknown) =>
                            notify({
                              tone: 'error',
                              message:
                                error instanceof Error
                                  ? error.message
                                  : 'That game could not be opened.',
                            }),
                          );
                      }}
                    >
                      <span className="block truncate text-sm text-primary">
                        {hit.game.white} – {hit.game.black}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-tertiary">
                        {[hit.game.event, formatPgnDate(hit.game.date), opening.eco, opening.label]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                    <span className="shrink-0 text-xs text-secondary tabular">
                      {hit.game.result}
                    </span>
                    {/*
                      Provenance, never merged away. This is the column that
                      makes a federated result different from a bigger list.
                    */}
                    <span className="w-32 shrink-0 truncate text-right text-[11px] text-accent">
                      {hit.source.name}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

const FIELD_LABELS: Record<string, string> = {
  player: 'Player',
  text: 'Text',
  eco: 'ECO',
  fromYear: 'From year',
  minRating: 'Min Elo',
};

function SearchField({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly wide?: boolean;
}) {
  return (
    <label
      className={`flex shrink-0 flex-col gap-1 text-[10px] uppercase tracking-wide text-tertiary ${
        wide ? 'w-48' : 'w-24'
      }`}
    >
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
      />
    </label>
  );
}

/** The filter in the user's own words, for naming a collection made from it. */
export function describeQuery(query: GameSearchQuery): string {
  const parts: string[] = [];
  if (query.player) parts.push(query.player);
  if (query.text) parts.push(`“${query.text}”`);
  if (query.eco) parts.push(query.eco);
  if (query.fromYear) parts.push(`from ${query.fromYear}`);
  if (query.minRating) parts.push(`${query.minRating}+`);
  if (query.result) parts.push(query.result);
  return parts.join(' ');
}
