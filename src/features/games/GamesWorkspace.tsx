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

import { useMemo, useState } from 'react';
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
import { getRepositories } from '@/persistence/repositories';
import type { GameSearchQuery, GameSummary } from '@/persistence/types';
import type { GameResult } from '@/database/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

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

export function GamesWorkspace() {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const setImportOpen = useUi((state) => state.setImportOpen);
  const openDocument = useAnalysis((state) => state.openDocument);
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
      limit: 500,
    }),
    [text, player, playerColor, result, minRating, fromYear, eco, sortBy, sortDirection],
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
  const filtered = games.data?.total ?? 0;
  const stored = total.data ?? 0;

  const sort = (field: SortField) => {
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

  const open = async (game: GameSummary) => {
    /*
      A database game opens as source material, not as the user's own document.
      Editing it will not write back over the imported record: autosave treats
      anything that is not a study chapter as a draft, and "Save to study" is
      how an analysis of a game becomes the user's.
    */
    // The list holds summaries; the moves are fetched only when one is opened.
    try {
      const repositories = await getRepositories();
      const full = await repositories.games.get(game.id);
      if (!full) {
        notify({ tone: 'error', message: 'That game is no longer in the database.' });
        return;
      }
      openDocument({
        tree: full.tree,
        document: { kind: 'database-game', title: gameTitle(full), gameId: full.id },
      });
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  };

  const filtersActive =
    Boolean(player || minRating || fromYear || eco) || playerColor !== 'any' || result !== 'any';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-1.5 border-b border-line-subtle bg-surface-1 px-2 sm:px-3">
        <Database className="h-4 w-4 shrink-0 text-accent" />
        <h1 className="shrink-0 text-xs font-semibold text-primary">Games</h1>
        <span className="hidden shrink-0 text-2xs text-tertiary tabular lg:inline">
          {stored.toLocaleString()} stored
        </span>

        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
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
          <span className="hidden min-[430px]:inline">Import</span>
        </Button>
      </header>

      {filtersOpen && (
        <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-line-subtle bg-surface-1 px-2 py-2 sm:px-3">
          <Field label="Player">
            <input
              value={player}
              onChange={(event) => setPlayer(event.target.value)}
              className={FIELD}
              placeholder="Carlsen"
            />
          </Field>
          <Field label="Colour">
            <select
              value={playerColor}
              onChange={(event) => setPlayerColor(event.target.value as 'any' | 'w' | 'b')}
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
              onChange={(event) => setResult(event.target.value as GameResult | 'any')}
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
              onChange={(event) => setMinRating(event.target.value.replace(/\D/g, ''))}
              className={FIELD}
              placeholder="2400"
            />
          </Field>
          <Field label="From year">
            <input
              value={fromYear}
              inputMode="numeric"
              onChange={(event) => setFromYear(event.target.value.replace(/\D/g, '').slice(0, 4))}
              className={FIELD}
              placeholder="2015"
            />
          </Field>
          <Field label="ECO">
            <input
              value={eco}
              onChange={(event) => setEco(event.target.value.toUpperCase().slice(0, 3))}
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
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-2 px-2 py-1.5 sm:px-3">
          <span className="text-2xs text-secondary tabular">{selected.size} selected</span>
          <Button onClick={() => setSelected(new Set())}>Clear selection</Button>
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
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      {game.eco && (
                        <span className="shrink-0 font-mono text-tertiary">{game.eco}</span>
                      )}
                      <span className="truncate">{game.opening ?? game.event ?? ''}</span>
                    </span>
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
                      {[game.eco, game.opening ?? game.event].filter(Boolean).join(' · ')}
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
          {filtered.toLocaleString()} of {stored.toLocaleString()} games
          {rows.length < filtered && ` · showing ${rows.length.toLocaleString()}`}
        </span>
        {stored > 0 && (
          <Button
            variant="danger"
            size="sm"
            className="ml-auto"
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
          setConfirmation(null);
          notify({ tone: 'success', message: 'The local game database is empty.' });
        }}
      />
    </div>
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
