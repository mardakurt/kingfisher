'use client';

/**
 * The local game database.
 *
 * Modelled on professional database software rather than a feed: a dense,
 * sortable table, filters that narrow rather than search-as-magic, and a row
 * that opens a game in the analysis workspace. Desktop can afford information
 * density; below 720px the same rows become two-line cards, because a
 * seven-column table at 320px is a table nobody can read.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Database, Filter, Import, Trash } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/Panel';
import {
  invalidateGames,
  useGameCount,
  useGames,
  useRepositoryMutation,
} from '@/features/persistence/queries';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/cn';
import { formatPgnDate, gameTitle } from '@/persistence/describe';
import { playerKey } from '@/persistence/schema/migrations';
import type { GameSearchQuery, GameSummary } from '@/persistence/types';
import { openingDisplay } from '@/theory/classify-games';

import { openStoredGame } from './open-game';
import type { GameResult } from '@/database/types';
import { useUi } from '@/stores/ui-store';
import { NavButton } from '@/features/shell/NavButton';
import {
  deleteResearchFilter,
  recentResearchFilters,
  rememberResearchFilter,
  rememberUsedFilters,
  savedResearchFilters,
  saveResearchFilter,
  type ResearchFilter,
} from './research-filters';

type SortField = NonNullable<GameSearchQuery['sortBy']>;

interface ColumnSpec {
  readonly id: SortField | 'result';
  readonly label: string;
  readonly sortable: boolean;
  readonly className: string;
}

const COLUMNS: readonly ColumnSpec[] = [
  { id: 'white', label: 'White', sortable: true, className: 'min-w-0' },
  { id: 'black', label: 'Black', sortable: true, className: 'min-w-0' },
  { id: 'result', label: 'Result', sortable: false, className: 'w-[62px] text-center' },
  { id: 'rating', label: 'Elo', sortable: true, className: 'w-[74px] text-right' },
  { id: 'date', label: 'Date', sortable: true, className: 'w-[92px]' },
  { id: 'opening', label: 'Opening', sortable: true, className: 'w-[30%] min-w-0' },
];

const RESULTS: readonly { id: GameResult | 'any'; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: '1-0', label: '1-0' },
  { id: '1/2-1/2', label: '½-½' },
  { id: '0-1', label: '0-1' },
];

const PAGE_SIZE = 100;

export function GamesWorkspace() {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const setImportOpen = useUi((state) => state.setImportOpen);
  const openAnalysisQueue = useUi((state) => state.openAnalysisQueue);
  const dense = useMediaQuery('(min-width: 720px)');

  const [text, setText] = useState('');
  const [player, setPlayer] = useState('');
  const [playerColor, setPlayerColor] = useState<'any' | 'w' | 'b'>('any');
  const [result, setResult] = useState<GameResult | 'any'>('any');
  const [minRating, setMinRating] = useState('');
  const [fromYear, setFromYear] = useState('');
  const [eco, setEco] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('importedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmation, setConfirmation] = useState<'selected' | 'all' | null>(null);
  const [page, setPage] = useState(0);
  const [savedFilters, setSavedFilters] = useState<readonly ResearchFilter[]>(savedResearchFilters);
  const [recentFilters, setRecentFilters] =
    useState<readonly ResearchFilter[]>(recentResearchFilters);

  const query = useMemo<GameSearchQuery>(
    () => ({
      ...(text.trim() ? { text: text.trim() } : {}),
      ...(player.trim() ? { player: player.trim() } : {}),
      ...(playerColor !== 'any' ? { playerColor } : {}),
      ...(result !== 'any' ? { result } : {}),
      ...(Number(minRating) > 0 ? { minRating: Number(minRating) } : {}),
      ...(Number(fromYear) > 0 ? { fromYear: Number(fromYear) } : {}),
      ...(eco.trim() ? { eco: eco.trim() } : {}),
      sortBy,
      sortDirection,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [text, player, playerColor, result, minRating, fromYear, eco, sortBy, sortDirection, page],
  );

  const games = useGames(query);
  const total = useGameCount();

  const deleteGames = useRepositoryMutation(
    (repositories, input: { ids: readonly string[] }) => repositories.games.deleteMany(input.ids),
    (client) => invalidateGames(client),
  );

  const clearAll = useRepositoryMutation<void, void>(
    (repositories) => repositories.games.clear(),
    (client) => invalidateGames(client),
  );

  const rows = games.data?.games ?? [];
  /*
    `total` is null when counting would have cost a full scan (ADR 0014), so
    the footer says what it knows: an exact count where there is one, and a
    range plus a working Next button where there is not.
  */
  const filtered = games.data?.total ?? null;
  const hasMore = games.data?.hasMore ?? false;
  const stored = total.data ?? 0;
  const pageCount = filtered === null ? null : Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const visibleFrom = rows.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const visibleTo = page * PAGE_SIZE + rows.length;
  const paged = page > 0 || hasMore;

  const sort = (field: SortField) => {
    setPage(0);
    if (field === sortBy) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(field);
    setSortDirection(
      field === 'white' || field === 'black' || field === 'opening' ? 'asc' : 'desc',
    );
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // The list holds summaries; the moves are fetched only when one is opened.
  const open = async (game: GameSummary, destination: '/analysis' | '/review' = '/analysis') => {
    try {
      await openStoredGame(game.id);
      router.push(destination);
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  };

  const filtersActive =
    Boolean(player || minRating || fromYear || eco) || playerColor !== 'any' || result !== 'any';

  /*
    Recent filters are recorded from what the user actually searched with, not
    only from re-applying a saved one — otherwise the list stays empty for the
    person it is meant to help. Debounced, because every keystroke changes the
    query and the point is the filter set, not the typing.
  */
  useEffect(() => {
    if (!filtersActive && !text.trim()) return undefined;
    const timer = window.setTimeout(() => {
      const { limit: _limit, offset: _offset, ...filters } = query;
      setRecentFilters(rememberUsedFilters(filters));
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [query, filtersActive, text]);

  const applyFilter = (filter: ResearchFilter) => {
    const values = filter.filters;
    setText(values.text ?? '');
    setPlayer(values.player ?? '');
    setPlayerColor(values.playerColor ?? 'any');
    setResult(values.result ?? 'any');
    setMinRating(values.minRating?.toString() ?? '');
    setFromYear(values.fromYear?.toString() ?? '');
    setEco(values.eco ?? '');
    setSortBy(values.sortBy ?? 'importedAt');
    setSortDirection(values.sortDirection ?? 'desc');
    setPage(0);
    setFiltersOpen(true);
    setRecentFilters(rememberResearchFilter(filter));
  };

  const saveCurrent = () => {
    const name = window.prompt('Name this database filter');
    if (!name?.trim()) return;
    const { limit: _limit, offset: _offset, ...filters } = query;
    setSavedFilters(saveResearchFilter(name, filters));
    notify({ tone: 'success', message: `Saved filter “${name.trim()}”.` });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="density-row flex h-10 shrink-0 items-center gap-1.5 border-b border-line-subtle bg-surface-1 px-2 sm:px-3">
        <NavButton />
        <Database className="h-4 w-4 shrink-0 text-accent" />
        <h1 className="shrink-0 text-xs font-semibold text-primary">Games</h1>
        <span className="hidden shrink-0 text-2xs text-tertiary tabular lg:inline">
          {stored.toLocaleString()} stored
        </span>

        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setPage(0);
          }}
          placeholder="Search players, events, openings…"
          aria-label="Search games"
          className="ml-1 h-7 min-w-0 flex-1 rounded-[4px] border border-line bg-surface-inset px-2 text-2xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
        />

        <IconButton
          label="Filters"
          active={filtersOpen || filtersActive}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <Filter />
        </IconButton>
        <Button variant="accent" icon={<Import />} onClick={() => setImportOpen(true)}>
          <span className="hidden xs:inline">Import</span>
        </Button>
        <Button onClick={() => openAnalysisQueue()}>Analysis queue</Button>
      </header>

      {filtersOpen && (
        <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-line-subtle bg-surface-1 px-2 py-2 sm:px-3">
          {savedFilters.length || recentFilters.length ? (
            <Field label="Saved / recent">
              <select
                aria-label="Saved and recent filters"
                className={FIELD}
                defaultValue=""
                onChange={(event) => {
                  const selectedFilter = [...savedFilters, ...recentFilters].find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (selectedFilter) applyFilter(selectedFilter);
                  event.currentTarget.value = '';
                }}
              >
                <option value="">Choose…</option>
                {savedFilters.length ? (
                  <optgroup label="Saved">
                    {savedFilters.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {recentFilters.length ? (
                  <optgroup label="Recent">
                    {recentFilters.map((entry) => (
                      <option key={`recent-${entry.id}`} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </Field>
          ) : null}
          <Field label="Player (exact name)">
            <input
              value={player}
              onChange={(event) => {
                setPlayer(event.target.value);
                setPage(0);
              }}
              className={FIELD}
              title="A whole name as it appears in the PGN; case and spacing are ignored. Use the search box above for partial names."
              placeholder="Carlsen, Magnus"
            />
          </Field>
          <Field label="Colour">
            <select
              value={playerColor}
              onChange={(event) => {
                setPlayerColor(event.target.value as 'any' | 'w' | 'b');
                setPage(0);
              }}
              className={FIELD}
            >
              <option value="any">Either</option>
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
          </Field>
          <Field label="Result">
            <select
              value={result}
              onChange={(event) => {
                setResult(event.target.value as GameResult | 'any');
                setPage(0);
              }}
              className={FIELD}
            >
              {RESULTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Min Elo">
            <input
              value={minRating}
              inputMode="numeric"
              onChange={(event) => {
                setMinRating(event.target.value.replace(/\D/g, ''));
                setPage(0);
              }}
              className={FIELD}
              placeholder="2400"
            />
          </Field>
          <Field label="From year">
            <input
              value={fromYear}
              inputMode="numeric"
              onChange={(event) => {
                setFromYear(event.target.value.replace(/\D/g, '').slice(0, 4));
                setPage(0);
              }}
              className={FIELD}
              placeholder="2015"
            />
          </Field>
          <Field label="ECO">
            <input
              value={eco}
              onChange={(event) => {
                setEco(event.target.value.toUpperCase().slice(0, 3));
                setPage(0);
              }}
              className={FIELD}
              placeholder="B90"
            />
          </Field>
          {filtersActive && (
            <Button
              onClick={() => {
                setPlayer('');
                setPlayerColor('any');
                setResult('any');
                setMinRating('');
                setFromYear('');
                setEco('');
                setPage(0);
              }}
            >
              Clear filters
            </Button>
          )}
          {player.trim() ? (
            /*
              The profile for whoever the list is currently filtered to. Offered
              here rather than as a per-row link because a dense table with a
              second control in every name cell is a table nobody can scan, and
              because "the player I am looking at" is exactly what this field
              already names.
            */
            <Button
              variant="subtle"
              onClick={() => router.push(`/player/${encodeURIComponent(playerKey(player))}`)}
            >
              Player profile
            </Button>
          ) : null}
          <Button onClick={saveCurrent}>Save filter</Button>
          {savedFilters.length ? (
            <Button
              onClick={() => {
                const selectedName = window.prompt('Exact saved filter name to delete');
                const target = savedFilters.find((entry) => entry.name === selectedName);
                if (target) setSavedFilters(deleteResearchFilter(target.id));
              }}
            >
              Manage saved
            </Button>
          ) : null}
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-2 px-2 py-1.5 sm:px-3">
          <span className="text-2xs text-secondary tabular">{selected.size} selected</span>
          <Button onClick={() => setSelected(new Set())}>Clear selection</Button>
          <Button variant="accent" onClick={() => openAnalysisQueue([...selected])}>
            Add to analysis queue
          </Button>
          {selected.size === 1 ? (
            /*
              One game, because Review is a walk through a single game's
              decisions. Offering it for a multi-game selection would promise
              something the workspace does not do.
            */
            <Button
              onClick={() => {
                const only = rows.find((row) => selected.has(row.id));
                if (only) void open(only, '/review');
              }}
            >
              Review this game
            </Button>
          ) : null}
          <Button
            variant="danger"
            icon={<Trash />}
            className="ml-auto"
            onClick={() => setConfirmation('selected')}
          >
            Delete selected
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {games.isError ? (
          <EmptyState
            title="Local storage is unavailable"
            description={
              games.error instanceof Error
                ? games.error.message
                : 'This browser refused access to its database.'
            }
          />
        ) : games.isPending ? (
          <p className="px-3 py-6 text-2xs text-tertiary">Reading the local database…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title={stored === 0 ? 'No games imported.' : 'No games match these filters.'}
            description={
              stored === 0
                ? 'Import a PGN collection to build your local database. Every game is indexed by position, so the explorer can tell you what you actually play.'
                : `${stored.toLocaleString()} games are stored; none of them match.`
            }
            action={
              stored === 0 ? (
                <Button variant="subtle" icon={<Import />} onClick={() => setImportOpen(true)}>
                  Import a PGN
                </Button>
              ) : null
            }
          />
        ) : dense ? (
          <table className="w-full border-collapse text-[11.5px]">
            <thead className="sticky top-0 z-10 bg-surface-1">
              <tr className="text-[10px] uppercase tracking-wide text-tertiary">
                <th className="w-8 px-2 py-1.5" scope="col">
                  <span className="sr-only">Select</span>
                </th>
                {COLUMNS.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={cn('px-2 py-1.5 text-left font-medium', column.className)}
                    aria-sort={
                      column.sortable && sortBy === column.id
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => sort(column.id as SortField)}
                        className="inline-flex items-center gap-1 uppercase transition-colors hover:text-secondary"
                      >
                        {column.label}
                        {sortBy === column.id && (
                          <span aria-hidden>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((game) => (
                <tr
                  key={game.id}
                  onDoubleClick={() => void open(game)}
                  className="border-t border-line-subtle transition-colors hover:bg-surface-2"
                >
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selected.has(game.id)}
                      onChange={() => toggle(game.id)}
                      aria-label={`Select ${gameTitle(game)}`}
                      className="accent-[var(--accent)]"
                    />
                  </td>
                  <td className="min-w-0 px-2 py-1">
                    <button
                      type="button"
                      onClick={() => void open(game)}
                      className="block w-full truncate text-left text-primary hover:underline"
                    >
                      {game.white}
                    </button>
                  </td>
                  <td className="min-w-0 px-2 py-1">
                    <button
                      type="button"
                      onClick={() => void open(game)}
                      className="block w-full truncate text-left text-primary hover:underline"
                    >
                      {game.black}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-center text-secondary tabular">{game.result}</td>
                  <td className="px-2 py-1 text-right text-tertiary tabular">
                    {game.whiteRating || game.blackRating
                      ? `${game.whiteRating ?? '—'}/${game.blackRating ?? '—'}`
                      : '—'}
                  </td>
                  <td className="px-2 py-1 text-tertiary tabular">{formatPgnDate(game.date)}</td>
                  <td className="min-w-0 px-2 py-1 text-secondary">
                    <OpeningCell game={game} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {rows.map((game) => (
              <li key={game.id} className="flex items-center gap-2 px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(game.id)}
                  onChange={() => toggle(game.id)}
                  aria-label={`Select ${gameTitle(game)}`}
                  className="shrink-0 accent-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => void open(game)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-primary">
                      {game.white} – {game.black}
                    </span>
                    <span className="shrink-0 text-2xs text-secondary tabular">{game.result}</span>
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-baseline gap-2 text-[10.5px] text-tertiary">
                    <span className="truncate">
                      {[openingDisplay(game).eco, openingDisplay(game).label ?? game.event]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="ml-auto shrink-0 tabular">{formatPgnDate(game.date)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-line-subtle bg-surface-1 px-2 text-[10.5px] text-tertiary sm:px-3">
        <span className="tabular">
          {filtered === null
            ? `${visibleFrom.toLocaleString()}–${visibleTo.toLocaleString()} of ${stored.toLocaleString()} games`
            : `${filtered.toLocaleString()} of ${stored.toLocaleString()} games`}
          {filtered !== null && filtered > PAGE_SIZE
            ? ` · ${visibleFrom.toLocaleString()}–${visibleTo.toLocaleString()}`
            : ''}
        </span>
        {paged && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <span className="px-1 tabular">
              {page + 1}
              {pageCount === null ? '' : `/${pageCount}`}
            </span>
            <Button size="sm" onClick={() => setPage((value) => value + 1)} disabled={!hasMore}>
              Next
            </Button>
          </div>
        )}
        {stored > 0 && (
          <Button
            variant="danger"
            size="sm"
            className={paged ? undefined : 'ml-auto'}
            onClick={() => setConfirmation('all')}
          >
            Clear database
          </Button>
        )}
      </footer>

      <ConfirmDialog
        open={confirmation === 'selected'}
        title={`Delete ${selected.size} game${selected.size === 1 ? '' : 's'}?`}
        description="The games and their position-index entries will be removed from this device. This cannot be undone."
        confirmLabel="Delete games"
        onCancel={() => setConfirmation(null)}
        onConfirm={async () => {
          await deleteGames.mutateAsync({ ids: [...selected] });
          setSelected(new Set());
          setPage(0);
          setConfirmation(null);
          notify({ tone: 'success', message: 'Games deleted.' });
        }}
      />

      <ConfirmDialog
        open={confirmation === 'all'}
        title="Delete every stored game?"
        description={`All ${stored.toLocaleString()} games and the whole position index will be removed from this device. Studies are not affected. This cannot be undone.`}
        confirmLabel="Delete everything"
        onCancel={() => setConfirmation(null)}
        onConfirm={async () => {
          await clearAll.mutateAsync();
          setSelected(new Set());
          setPage(0);
          setConfirmation(null);
          notify({ tone: 'success', message: 'The local game database is empty.' });
        }}
      />
    </div>
  );
}

/**
 * The opening column.
 *
 * Shows Kingfisher's own classification where it has one, and says so when the
 * file it came from disagreed. The declared tag is not hidden — it is in the
 * tooltip — because a mismatch is usually the imported tag naming a shallower
 * line than the game actually reached, and that is worth being able to check.
 */
function OpeningCell({ game }: { readonly game: GameSummary }) {
  const display = openingDisplay(game);
  if (display.source === 'none') {
    return <span className="text-tertiary/70">{game.event ?? ''}</span>;
  }
  const declared = [game.eco, game.opening].filter(Boolean).join(' ');
  return (
    <span
      className="flex min-w-0 items-baseline gap-1.5"
      title={
        display.conflict
          ? `Kingfisher: ${display.eco} ${display.label}. The file declared ${declared}.`
          : display.source === 'file'
            ? `Declared by the imported file. Kingfisher has not classified this game yet.`
            : `${display.eco} ${display.label}, classified by Kingfisher from the position.`
      }
    >
      {display.eco ? <span className="shrink-0 font-mono text-tertiary">{display.eco}</span> : null}
      <span className="truncate">{display.label ?? game.event ?? ''}</span>
      {display.conflict ? (
        <span
          aria-label="The imported file declares a different ECO code"
          className="shrink-0 text-caution"
        >
          *
        </span>
      ) : null}
      {display.source === 'file' ? (
        <span aria-hidden className="shrink-0 text-[9px] uppercase text-tertiary/60">
          file
        </span>
      ) : null}
    </span>
  );
}

const FIELD =
  'h-7 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-2xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60';

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex w-[104px] shrink-0 flex-col gap-1 text-[10px] uppercase tracking-wide text-tertiary">
    {label}
    {children}
  </label>
);
