'use client';

/**
 * The player library.
 *
 * Kingfisher had player *profiles* — one page per name in your own collection —
 * and no way to find a player you had never imported a game of. That is the
 * wrong way round for a reference tool: the point of installing an elite
 * database is being able to look somebody up in it.
 *
 * Two populations sit in one list, and the difference between them is visible
 * rather than smoothed over. Rows from a reference pack are counts of games
 * that exist. Rows from the historical roster are people, with whatever games
 * the installed sources happen to hold, which for anyone who stopped playing
 * before 2020 is none — and the row says so instead of showing an empty page.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Search } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { NavButton } from '@/features/shell/NavButton';
import { cn } from '@/lib/cn';
import { legendYears } from '@/reference/legends';
import {
  searchPlayers,
  usePlayerCatalog,
  type CatalogPlayer,
  type PlayerFilter,
} from '@/reference/players';
import { useReferenceSources } from '@/reference/use-references';

const FILTERS: readonly { readonly id: PlayerFilter; readonly label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'top-100', label: 'Top 100' },
  { id: 'top-500', label: 'Top 500' },
  { id: 'world-champion', label: 'World champions' },
  { id: 'women-champion', label: 'Women’s champions' },
  { id: 'legend', label: 'Historical' },
  { id: 'has-games', label: 'With games here' },
  /*
    Last, and named for what it is. These are people the roster knows and the
    installed sources have no games for; keeping them in the browse lists meant
    World champions opened with three profiles that had nothing behind them.
  */
  { id: 'historical-index', label: 'Historical index' },
];

/** Said above the list, so an empty-looking set explains itself. */
const FILTER_NOTE: Partial<Record<PlayerFilter, string>> = {
  'historical-index':
    'People the roster knows and the installed sources have no games for. Kingfisher’s reference packs begin in 2020; these entries are dates, titles and what they won, not a library of their games. Nothing here implies a game exists.',
  legend: 'Historical figures the installed sources do have games for.',
};

const EMPTY: readonly CatalogPlayer[] = [];

export function PlayersWorkspace() {
  const catalog = usePlayerCatalog();
  const references = useReferenceSources();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PlayerFilter>('all');
  const [selected, setSelected] = useState<readonly string[]>([]);

  // Stable across renders, so the memo below is not invalidated by a fresh
  // empty array every time this component draws.
  const players = useMemo(() => catalog.data ?? EMPTY, [catalog.data]);
  const results = useMemo(
    () => searchPlayers(players, { query, filter, limit: 300 }),
    [filter, players, query],
  );

  /** People the roster knows and the installed sources have no games for. */
  const indexOnly = useMemo(
    () => searchPlayers(players, { query: '', filter: 'historical-index', limit: 1000 }).length,
    [players],
  );

  const chosen = players.filter((player) => selected.includes(player.key));
  const installed = references.sources.filter((source) => source.installed);

  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((id) => id !== key) : [...current, key],
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line-subtle bg-surface-1 px-3 md:px-5">
        <NavButton />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-primary">Players</h1>
          <p className="hidden text-xs text-tertiary sm:block">
            {catalog.isPending
              ? 'Reading the installed reference sources…'
              : `${players.length.toLocaleString()} players from ${installed.length} installed ${
                  installed.length === 1 ? 'source' : 'sources'
                }, plus the historical roster.`}
          </p>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line-subtle bg-surface-1 px-3 py-2 md:px-5">
        <label className="relative flex min-w-[240px] flex-1 items-center">
          <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-tertiary" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search players — Carlsen, Tal, Ju Wenjun…"
            aria-label="Search players"
            className="h-9 w-full rounded-[5px] border border-line bg-surface-2 pl-8 pr-2.5 text-sm text-primary placeholder:text-tertiary focus:border-accent focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter players">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filter === entry.id}
              onClick={() => setFilter(entry.id)}
              className={cn(
                'h-8 rounded-[5px] border px-2.5 text-xs transition-colors',
                filter === entry.id
                  ? 'border-accent bg-accent-muted text-primary'
                  : 'border-line text-tertiary hover:border-line-strong hover:text-secondary',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {chosen.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line-subtle bg-surface-2 px-3 py-2 md:px-5">
          <span className="text-xs text-secondary">
            {chosen.length} selected: {chosen.map((player) => player.name).join(', ')}
          </span>
          <div className="ml-auto flex gap-1.5">
            <Button
              variant="subtle"
              onClick={() => setSelected([])}
              aria-label="Clear player selection"
            >
              Clear
            </Button>
            <Link
              href={`/games?players=${encodeURIComponent(chosen.map((p) => p.key).join('|'))}`}
              className="inline-flex h-8 items-center rounded-[5px] border border-line bg-surface-1 px-2.5 text-xs text-primary hover:border-line-strong"
            >
              Show games
            </Link>
            <Link
              href={`/preparation?opponents=${encodeURIComponent(chosen.map((p) => p.key).join('|'))}`}
              className="inline-flex h-8 items-center rounded-[5px] border border-line bg-surface-1 px-2.5 text-xs text-primary hover:border-line-strong"
            >
              Prepare against
            </Link>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {catalog.isPending ? (
          <p className="p-6 text-sm text-tertiary">Reading players…</p>
        ) : results.length === 0 ? (
          /*
            An empty browse set has two quite different causes, and saying
            which one is the difference between a dead end and a next step.
            With no reference pack installed the only people Kingfisher knows
            are the historical roster, and every one of them has no games — so
            the browse sets are correctly empty and the index is where they
            are.
          */
          <EmptyState
            title={query.trim().length > 0 ? 'No players match' : 'No players with games here'}
            description={
              query.trim().length > 0
                ? `Nothing in the installed sources or the historical roster matches “${query}”.`
                : indexOnly > 0
                  ? `Install a reference pack, or import games, to fill the player library. Kingfisher does know ${indexOnly} historical figures it has no games for — they are under Historical index.`
                  : 'Install a reference pack, or import games, to fill the player library.'
            }
            action={
              indexOnly > 0 && query.trim().length === 0 && filter !== 'historical-index' ? (
                <Button onClick={() => setFilter('historical-index')}>
                  Show the historical index
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {FILTER_NOTE[filter] && query.trim().length === 0 ? (
              <p
                className="border-b border-line-subtle bg-surface-2 px-3 py-2 text-xs leading-relaxed text-tertiary md:px-5"
                data-filter-note={filter}
              >
                {FILTER_NOTE[filter]}
              </p>
            ) : null}
            <ul
              className="divide-y divide-line-subtle"
              data-player-results
              data-player-filter={filter}
            >
              {results.map((player) => (
                <PlayerRow
                  key={player.key}
                  player={player}
                  selected={selected.includes(player.key)}
                  onToggle={() => toggle(player.key)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  selected,
  onToggle,
}: {
  readonly player: CatalogPlayer;
  readonly selected: boolean;
  readonly onToggle: () => void;
}) {
  const legend = player.legend;
  return (
    <li
      className={cn('flex items-center gap-3 px-3 py-2.5 md:px-5', selected && 'bg-accent-muted')}
      data-player-row={player.key}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Select ${player.name}`}
        className="h-3.5 w-3.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link
            href={`/player/${encodeURIComponent(player.key)}`}
            className="truncate text-sm font-medium text-primary hover:text-accent"
          >
            {player.name}
          </Link>
          {player.title ? (
            <span className="shrink-0 rounded-[3px] bg-surface-3 px-1 text-[10px] text-secondary">
              {player.title}
            </span>
          ) : null}
          {legend?.reign ? (
            <span className="shrink-0 text-[10px] text-accent">{legend.reign}</span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-tertiary">
          {legend ? `${legendYears(legend)} · ${legend.note}` : facts(player)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm text-primary tabular">{player.games.toLocaleString()}</div>
        <div className="text-[10px] text-tertiary">
          {player.games === 1 ? 'game here' : 'games here'}
        </div>
      </div>
    </li>
  );
}

function facts(player: CatalogPlayer): string {
  const parts: string[] = [];
  if (player.lastRating > 0) parts.push(`Latest ${player.lastRating}`);
  if (player.peakRating > 0 && player.peakRating !== player.lastRating) {
    parts.push(`highest recorded ${player.peakRating}`);
  }
  if (player.firstYear > 0) {
    parts.push(
      player.firstYear === player.lastYear
        ? `${player.firstYear}`
        : `${player.firstYear}–${player.lastYear}`,
    );
  }
  if (player.fideId) parts.push(`FIDE ${player.fideId}`);
  if (player.sources.length > 0) parts.push(player.sources.join(', '));
  return parts.join(' · ') || 'No games in the installed sources.';
}
