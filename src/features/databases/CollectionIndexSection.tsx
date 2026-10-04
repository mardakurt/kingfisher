'use client';

/**
 * A collection's players and tournaments, counted (ChessBase's database
 * overview: Games, Players, Tournaments, each a list to browse).
 *
 * Read with the one cheap walk both stores serve — players, event, date and
 * result per game, no moves (`collection-index.ts`). A small collection is
 * read when it is opened; a large one when asked, with progress and a Stop,
 * because ten million games is ten million rows however cheap each one is.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Tabs';
import { readCollectionIndex } from '@/database/collections/collection-index';
import { openCollection } from '@/database/collections/registry';
import type { CollectionFacts } from '@/database/collections/types';
import { plural } from '@/lib/plural';

/** Collections up to this size are indexed as soon as they are opened. */
const AUTOMATIC_LIMIT = 50_000;
const ROWS = 100;

export function CollectionIndexSection({ collection }: { readonly collection: CollectionFacts }) {
  const queryClient = useQueryClient();
  const [requested, setRequested] = useState(false);
  const [read, setRead] = useState(0);
  const [tab, setTab] = useState<'players' | 'tournaments' | 'openings'>('players');
  const [filter, setFilter] = useState('');

  const automatic = collection.games !== null && collection.games <= AUTOMATIC_LIMIT;
  const queryKey = ['collection-index', collection.id, collection.games];
  const query = useQuery({
    queryKey,
    enabled: automatic || requested,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      setRead(0);
      const opened = await openCollection(collection.id);
      if (!opened) throw new Error('This collection is not available on this machine now.');
      return readCollectionIndex(opened, { signal, onPage: setRead });
    },
  });
  const stop = () => {
    setRequested(false);
    void queryClient.cancelQueries({ queryKey });
  };
  const state =
    query.data !== undefined
      ? ({ status: 'done', index: query.data } as const)
      : query.fetchStatus === 'fetching'
        ? ({ status: 'reading', read } as const)
        : query.isError
          ? ({
              status: 'failed',
              message: query.error instanceof Error ? query.error.message : String(query.error),
            } as const)
          : ({ status: 'idle' } as const);

  const library = (params: Record<string, string>) =>
    `/games?${new URLSearchParams({ db: collection.id, ...params }).toString()}`;

  const index = query.data ?? null;
  const needle = filter.trim().toLowerCase();
  const players = useMemo(
    () => (index?.players ?? []).filter((player) => player.name.toLowerCase().includes(needle)),
    [index, needle],
  );
  const tournaments = useMemo(
    () => (index?.tournaments ?? []).filter((event) => event.name.toLowerCase().includes(needle)),
    [index, needle],
  );
  const openings = useMemo(
    () => (index?.openings ?? []).filter((entry) => entry.name.toLowerCase().includes(needle)),
    [index, needle],
  );

  return (
    <section className="border-b border-line-subtle py-5" data-collection-index>
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-tertiary">Players and tournaments</h3>
        {state.status === 'reading' ? (
          <>
            <span className="text-2xs text-tertiary">
              Reading… {state.read.toLocaleString()}
              {collection.games ? ` of ${collection.games.toLocaleString()}` : ''} games
            </span>
            <Button size="sm" className="ml-auto" onClick={stop}>
              Stop
            </Button>
          </>
        ) : state.status !== 'done' ? (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => {
              setRequested(true);
              if (query.isError) void query.refetch();
            }}
            data-index-read
          >
            {collection.games
              ? `Read the index of ${plural(collection.games, 'game')}`
              : 'Read the index'}
          </Button>
        ) : null}
      </div>

      {state.status === 'failed' ? (
        <p className="mt-2 text-2xs text-caution" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === 'idle' && !automatic ? (
        <p className="mt-2 text-2xs text-tertiary">
          Counted from each game’s players, event, date and result — no moves are read. A collection
          this large is read when you ask.
        </p>
      ) : null}

      {index ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-index-tiles>
            <Tile label="Games" value={index.games} />
            <Tile label="Players" value={index.players.length} />
            <Tile label="Tournaments" value={index.tournaments.length} />
            <div className="rounded-[var(--radius-control)] border border-line-subtle bg-surface-2 px-3 py-2">
              <dt className="text-[10px] text-tertiary">Years</dt>
              <dd className="text-lg font-semibold tabular text-primary">
                {index.firstYear === null
                  ? '—'
                  : index.firstYear === index.lastYear
                    ? index.firstYear
                    : `${index.firstYear}–${index.lastYear}`}
              </dd>
            </div>
          </dl>
          <p className="mt-1.5 text-[10.5px] text-tertiary">
            Names are counted as the headers spell them; two spellings are two rows.
            {index.withoutEvent
              ? ` ${plural(index.withoutEvent, 'game')} ${index.withoutEvent === 1 ? 'names no event and is' : 'name no event and are'} in no tournament.`
              : ''}
            {index.undated
              ? ` ${plural(index.undated, 'game')} ${index.undated === 1 ? 'carries' : 'carry'} no year.`
              : ''}
          </p>

          {/*
            ChessBase's database page opens on its newest tournaments and its
            top games. Top games are the highest sum of both ratings, among
            games that record both; each row opens that game in the Library.
          */}
          <div className="mt-4 grid gap-5 @2xl:grid-cols-2" data-index-overview>
            <div>
              <h4 className="mb-1 text-[10.5px] font-semibold text-tertiary">Newest tournaments</h4>
              {index.tournaments.length ? (
                <ul className="divide-y divide-line-subtle text-[11px]">
                  {index.tournaments.slice(0, 5).map((event) => (
                    <li key={`${event.name}|${event.year ?? ''}`} className="flex gap-2 py-1">
                      <Link
                        href={library({
                          event: `"${event.name}"`,
                          ...(event.year === null
                            ? {}
                            : { from: `${event.year}-01-01`, to: `${event.year}-12-31` }),
                        })}
                        className="min-w-0 flex-1 truncate text-primary hover:text-accent-ink"
                      >
                        {event.name}
                      </Link>
                      <span className="shrink-0 tabular text-tertiary">
                        {event.lastDate?.replace(/\./g, '-').replace(/-\?\?/g, '') ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-tertiary">No game here names an event.</p>
              )}
            </div>
            <div>
              <h4
                className="mb-1 text-[10.5px] font-semibold text-tertiary"
                title="The highest sum of both players' ratings, among games that record both"
              >
                Top games
              </h4>
              {index.topGames.length ? (
                <ul className="divide-y divide-line-subtle text-[11px]" data-index-top-games>
                  {index.topGames.slice(0, 5).map((entry) => (
                    <li key={entry.id} className="flex gap-2 py-1">
                      <Link
                        href={library({ game: entry.id })}
                        className="min-w-0 flex-1 truncate text-primary hover:text-accent-ink"
                      >
                        {entry.white}{' '}
                        <span className="tabular text-tertiary">{entry.whiteRating}</span>
                        {' – '}
                        {entry.black}{' '}
                        <span className="tabular text-tertiary">{entry.blackRating}</span>
                      </Link>
                      <span className="shrink-0 tabular text-secondary">
                        {entry.result === '1/2-1/2' ? '½–½' : entry.result}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-tertiary">No game here records both ratings.</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Segmented
              items={[
                { id: 'players', label: `Players (${index.players.length.toLocaleString()})` },
                {
                  id: 'tournaments',
                  label: `Tournaments (${index.tournaments.length.toLocaleString()})`,
                },
                { id: 'openings', label: `Openings (${index.openings.length.toLocaleString()})` },
              ]}
              value={tab}
              onChange={(next) => setTab(next as 'players' | 'tournaments' | 'openings')}
            />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={`Filter ${tab}`}
              aria-label={`Filter ${tab}`}
              className="h-7 w-48 rounded-[var(--radius-control)] border border-line bg-surface-inset px-2 text-2xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
            />
          </div>

          <div className="mt-2 max-h-[420px] overflow-y-auto rounded-[var(--radius-control)] border border-line-subtle">
            {tab === 'players' ? (
              <table className="w-full border-collapse text-[11px]" data-index-players>
                <thead className="sticky top-0 bg-surface-1">
                  <tr className="border-b border-line-subtle text-left text-[10px] text-tertiary">
                    <th className="px-2 py-1.5 font-medium">Player</th>
                    <th className="px-2 py-1.5 text-right font-medium">Games</th>
                    <th className="px-2 py-1.5 text-right font-medium">+W =D −L</th>
                    <th className="px-2 py-1.5 text-right font-medium">Score</th>
                    <th className="px-2 py-1.5 text-right font-medium">Years</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {players.slice(0, ROWS).map((player) => (
                    <tr key={player.name}>
                      <td className="px-2 py-1.5">
                        <Link
                          href={library({ player: player.name })}
                          className="text-primary hover:text-accent-ink"
                        >
                          {player.name}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-secondary">
                        {player.games.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-tertiary">
                        +{player.wins} ={player.draws} −{player.losses}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-secondary">
                        {player.score === null ? '—' : `${player.score}%`}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-tertiary">
                        {player.firstYear === null
                          ? '—'
                          : player.firstYear === player.lastYear
                            ? player.firstYear
                            : `${player.firstYear}–${player.lastYear}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === 'openings' ? (
              <table className="w-full border-collapse text-[11px]" data-index-openings>
                <thead className="sticky top-0 bg-surface-1">
                  <tr className="border-b border-line-subtle text-left text-[10px] text-tertiary">
                    <th className="px-2 py-1.5 font-medium">Opening</th>
                    <th className="px-2 py-1.5 text-right font-medium">Games</th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      <abbr title="White wins, draws, Black wins" className="no-underline">
                        1-0 ½ 0-1
                      </abbr>
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">White scores</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {openings.slice(0, ROWS).map((entry) => (
                    <tr key={`${entry.byName ? 'n' : 'e'}|${entry.name}`}>
                      <td className="max-w-[320px] truncate px-2 py-1.5">
                        <Link
                          /*
                            A family, whole, in quotes — "Queen's Gambit" without
                            the Declined and Accepted games that contain its
                            words; a bare code by its ECO filter.
                          */
                          href={library(
                            entry.byName ? { opening: `"${entry.name}"` } : { eco: entry.name },
                          )}
                          className="text-primary hover:text-accent-ink"
                          data-index-opening={entry.name}
                        >
                          {entry.name}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-secondary">
                        {entry.games.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-tertiary">
                        {entry.white} / {entry.draws} / {entry.black}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-secondary">
                        {entry.whiteScore === null ? '—' : `${entry.whiteScore}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full border-collapse text-[11px]" data-index-tournaments>
                <thead className="sticky top-0 bg-surface-1">
                  <tr className="border-b border-line-subtle text-left text-[10px] text-tertiary">
                    <th className="px-2 py-1.5 font-medium">Tournament</th>
                    <th className="px-2 py-1.5 text-right font-medium">Year</th>
                    <th className="px-2 py-1.5 text-right font-medium">Games</th>
                    <th className="px-2 py-1.5 text-right font-medium">Players</th>
                    <th className="px-2 py-1.5 text-right font-medium">Last game</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {tournaments.slice(0, ROWS).map((event) => (
                    <tr key={`${event.name}|${event.year ?? ''}`}>
                      <td className="max-w-[320px] truncate px-2 py-1.5">
                        <Link
                          href={library({
                            /*
                              The edition, exactly: its whole name and its
                              year. `q` matched any game sharing words with it
                              — "Open 1" brought Opens 10 to 19 — and every
                              other year's edition.
                            */
                            event: `"${event.name}"`,
                            ...(event.year === null
                              ? {}
                              : { from: `${event.year}-01-01`, to: `${event.year}-12-31` }),
                          })}
                          className="text-primary hover:text-accent-ink"
                          title={`Open the Library on “${event.name}”. A game there opens its tournament table.`}
                        >
                          {event.name}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-tertiary">
                        {event.year ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-secondary">
                        {event.games.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-secondary">
                        {event.players.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular text-tertiary">
                        {event.lastDate?.replace(/\./g, '-').replace(/-\?\?/g, '') ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {(tab === 'players' ? players : tab === 'openings' ? openings : tournaments).length >
          ROWS ? (
            <p className="mt-1 text-[10.5px] text-tertiary">
              The first {ROWS} of{' '}
              {(tab === 'players'
                ? players
                : tab === 'openings'
                  ? openings
                  : tournaments
              ).length.toLocaleString()}{' '}
              are listed; filter to find the rest.
            </p>
          ) : null}
          {tab === 'openings' && index.withoutOpening ? (
            <p className="mt-1 text-[10.5px] text-tertiary">
              {plural(index.withoutOpening, 'game')}{' '}
              {index.withoutOpening === 1
                ? 'carries no opening name or ECO code and is in no family.'
                : 'carry no opening name or ECO code and are in no family.'}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Tile({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line-subtle bg-surface-2 px-3 py-2">
      <dt className="text-[10px] text-tertiary">{label}</dt>
      <dd className="text-lg font-semibold tabular text-primary">{value.toLocaleString()}</dd>
    </div>
  );
}
