'use client';

/**
 * The tournament table for the event a game belongs to — ChessBase's
 * cross-table, from the games this database actually holds.
 *
 * The event is matched exactly (by the index's name key) and, when the game
 * is dated, within the same year: "Tata Steel Masters" names a different
 * tournament every January. The table itself says how many games it was
 * built from and whether that is a complete round robin; nothing here
 * fetches results from anywhere else.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { GameSummary } from '@/persistence/types';
import { nameKey } from '@/round/identity';
import { useUi } from '@/stores/ui-store';
import {
  buildCrosstable,
  crosstableCaveat,
  crosstableText,
  formatPoints,
  scoreGlyph,
} from '@/tournament/crosstable';

import { searchSource, type LibrarySource } from './library-source';

/** Enough for any closed tournament and most opens; the table says when it stopped. */
export const CROSSTABLE_GAME_LIMIT = 3000;
const PAGE = 500;

async function eventGames(
  source: LibrarySource,
  game: GameSummary,
): Promise<{ games: GameSummary[]; truncated: boolean }> {
  const event = game.event ?? '';
  const games: GameSummary[] = [];
  let offset = 0;
  for (;;) {
    const page = await searchSource(source, {
      event,
      ...(game.year ? { fromYear: game.year, toYear: game.year } : {}),
      sortBy: 'date',
      sortDirection: 'asc',
      limit: PAGE,
      offset,
    });
    for (const candidate of page.games) {
      if (nameKey(candidate.event) !== nameKey(event)) continue;
      if (game.year && candidate.year !== game.year) continue;
      games.push(candidate);
    }
    offset += page.games.length;
    if (!page.hasMore || page.games.length === 0) return { games, truncated: false };
    if (offset >= CROSSTABLE_GAME_LIMIT) return { games, truncated: true };
  }
}

export function CrosstableDialog({
  source,
  game,
  onClose,
  onOpenGame,
}: {
  readonly source: LibrarySource;
  readonly game: GameSummary;
  readonly onClose: () => void;
  readonly onOpenGame: (game: GameSummary) => void;
}) {
  const notify = useUi((state) => state.notify);
  const [view, setView] = useState<'table' | 'rounds'>('table');
  const query = useQuery({
    queryKey: ['library', 'crosstable', source.id, game.event ?? '', game.year ?? null],
    queryFn: () => eventGames(source, game),
  });
  const byId = useMemo(
    () => new Map((query.data?.games ?? []).map((entry) => [entry.id, entry])),
    [query.data],
  );
  const table = useMemo(
    () =>
      query.data
        ? buildCrosstable(
            query.data.games.map((entry) => ({
              id: entry.id,
              white: entry.white,
              black: entry.black,
              result: entry.result,
              ...(entry.round ? { round: entry.round } : {}),
              ...(entry.date ? { date: entry.date } : {}),
              ...(entry.whiteRating ? { whiteRating: entry.whiteRating } : {}),
              ...(entry.blackRating ? { blackRating: entry.blackRating } : {}),
            })),
          )
        : null,
    [query.data],
  );
  const title = [game.event, game.site, game.year].filter(Boolean).join(' · ');

  const copy = async () => {
    if (!table) return;
    try {
      await navigator.clipboard.writeText(crosstableText(table, title));
      notify({ tone: 'success', message: 'Tournament table copied as text.' });
    } catch {
      notify({ tone: 'error', message: 'The clipboard refused the table.' });
    }
  };

  const openGame = (id: string) => {
    const summary = byId.get(id);
    if (summary) onOpenGame(summary);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Tournament table"
      description={title}
      width="min(1100px, 96vw)"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button disabled={!table} onClick={() => void copy()} data-crosstable-copy>
            Copy as text
          </Button>
        </>
      }
    >
      <div className="space-y-3" data-crosstable>
        {query.isPending ? (
          <p className="text-sm text-tertiary">Reading the event’s games…</p>
        ) : query.isError ? (
          <p className="text-sm text-danger" role="alert">
            {query.error instanceof Error ? query.error.message : 'The games could not be read.'}
          </p>
        ) : table && table.players.length >= 2 ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className="rounded-full bg-surface-2 px-2 py-0.5 text-secondary"
                data-crosstable-format={table.format}
              >
                {table.format === 'round-robin'
                  ? table.cycles === 2
                    ? 'Double round robin'
                    : 'Round robin'
                  : 'Swiss / open'}
              </span>
              <span className="text-tertiary">
                {table.players.length} players · {table.games} games
                {table.averageRating ? ` · average rating ${table.averageRating}` : ''}
              </span>
              {table.rounds ? (
                <div className="ml-auto flex gap-1" role="tablist">
                  <Button
                    {...(view === 'table' ? { variant: 'accent' as const } : {})}
                    onClick={() => setView('table')}
                  >
                    Standings
                  </Button>
                  <Button
                    {...(view === 'rounds' ? { variant: 'accent' as const } : {})}
                    onClick={() => setView('rounds')}
                    data-crosstable-rounds
                  >
                    Progress by round
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="max-h-[60vh] overflow-auto rounded-[var(--radius-panel)] border border-line">
              {view === 'rounds' && table.rounds ? (
                <RoundsTable table={table} onOpen={openGame} />
              ) : table.format === 'round-robin' ? (
                <table className="w-full text-xs tabular" data-crosstable-grid>
                  <thead className="sticky top-0 bg-surface-1 text-tertiary">
                    <tr>
                      <th className="px-2 py-1 text-right">#</th>
                      <th className="px-2 py-1 text-left">Player</th>
                      <th className="px-2 py-1 text-right">Rating</th>
                      {table.players.map((player, i) => (
                        <th
                          key={player.index}
                          className="px-1 py-1 text-center"
                          title={player.name}
                        >
                          {i + 1}
                        </th>
                      ))}
                      <th className="px-2 py-1 text-right">Pts</th>
                      <th className="px-2 py-1 text-right" title="Sonneborn-Berger">
                        SB
                      </th>
                      <th className="px-2 py-1 text-right" title="FIDE performance">
                        Perf
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.players.map((player) => (
                      <tr
                        key={player.index}
                        className="border-t border-line-subtle"
                        data-crosstable-player={player.name}
                      >
                        <td className="px-2 py-1 text-right text-tertiary">{player.rank}</td>
                        <td className="max-w-[220px] truncate px-2 py-1 font-medium text-primary">
                          {player.name}
                        </td>
                        <td className="px-2 py-1 text-right text-secondary">
                          {player.rating ?? ''}
                        </td>
                        {table.players.map((other) => {
                          if (other.index === player.index)
                            return <td key={other.index} className="bg-surface-2" />;
                          const games = player.encounters.filter((e) => e.opponent === other.index);
                          return (
                            <td key={other.index} className="px-0.5 py-0.5 text-center">
                              {games.length === 0 ? (
                                <span className="text-tertiary">·</span>
                              ) : (
                                games.map((entry) => (
                                  <button
                                    key={entry.gameId}
                                    type="button"
                                    title={`${player.name} ${entry.color === 'w' ? 'with White' : 'with Black'} against ${other.name}${entry.round ? `, round ${entry.round}` : ''} — open the game`}
                                    onClick={() => openGame(entry.gameId)}
                                    className="rounded px-1 text-primary hover:bg-surface-2"
                                    data-crosstable-cell
                                  >
                                    {scoreGlyph(entry.score)}
                                  </button>
                                ))
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-right font-semibold text-primary">
                          {formatPoints(player.score)}
                        </td>
                        <td className="px-2 py-1 text-right text-secondary">
                          {player.sonnebornBerger.toFixed(2)}
                        </td>
                        <td
                          className="px-2 py-1 text-right text-secondary"
                          title={
                            player.performance
                              ? `Over ${player.performance.ratedGames} games against rated opponents`
                              : 'No rated opponents'
                          }
                        >
                          {player.performance?.rating ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs tabular" data-crosstable-swiss>
                  <thead className="sticky top-0 bg-surface-1 text-tertiary">
                    <tr>
                      <th className="px-2 py-1 text-right">#</th>
                      <th className="px-2 py-1 text-left">Player</th>
                      <th className="px-2 py-1 text-right">Rating</th>
                      <th className="px-2 py-1 text-right">Pts</th>
                      <th className="px-2 py-1 text-right">Games</th>
                      <th className="px-2 py-1 text-right">+ / = / −</th>
                      <th className="px-2 py-1 text-right">Buchholz</th>
                      <th className="px-2 py-1 text-right">SB</th>
                      <th className="px-2 py-1 text-right">Perf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.players.map((player) => (
                      <tr
                        key={player.index}
                        className="border-t border-line-subtle"
                        data-crosstable-player={player.name}
                      >
                        <td className="px-2 py-1 text-right text-tertiary">{player.rank}</td>
                        <td className="max-w-[260px] truncate px-2 py-1 font-medium text-primary">
                          {player.name}
                        </td>
                        <td className="px-2 py-1 text-right text-secondary">
                          {player.rating ?? ''}
                        </td>
                        <td className="px-2 py-1 text-right font-semibold text-primary">
                          {formatPoints(player.score)}
                        </td>
                        <td className="px-2 py-1 text-right text-secondary">{player.played}</td>
                        <td className="px-2 py-1 text-right text-secondary">
                          {player.wins} / {player.draws} / {player.losses}
                        </td>
                        <td className="px-2 py-1 text-right text-secondary">
                          {player.buchholz.toFixed(1)}
                        </td>
                        <td className="px-2 py-1 text-right text-secondary">
                          {player.sonnebornBerger.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right text-secondary">
                          {player.performance?.rating ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-[11.5px] text-tertiary" data-crosstable-caveat>
              {crosstableCaveat(table)}
              {query.data?.truncated
                ? ` Stopped reading at ${CROSSTABLE_GAME_LIMIT.toLocaleString()} games; the table is incomplete.`
                : ''}
            </p>
          </>
        ) : (
          <p className="text-sm text-secondary" data-crosstable-empty>
            This database holds {query.data?.games.length ?? 0} game
            {query.data?.games.length === 1 ? '' : 's'} from this event — not enough for a table.
          </p>
        )}
      </div>
    </Dialog>
  );
}

function RoundsTable({
  table,
  onOpen,
}: {
  readonly table: NonNullable<ReturnType<typeof buildCrosstable>>;
  readonly onOpen: (id: string) => void;
}) {
  const rounds = table.rounds ?? [];
  const rankOf = new Map(table.players.map((player) => [player.index, player.rank]));
  return (
    <table className="w-full text-xs tabular" data-crosstable-progress>
      <thead className="sticky top-0 bg-surface-1 text-tertiary">
        <tr>
          <th className="px-2 py-1 text-right">#</th>
          <th className="px-2 py-1 text-left">Player</th>
          {rounds.map((round) => (
            <th key={round} className="px-1 py-1 text-center">
              R{round}
            </th>
          ))}
          <th className="px-2 py-1 text-right">Pts</th>
        </tr>
      </thead>
      <tbody>
        {table.players.map((player) => {
          let running = 0;
          return (
            <tr key={player.index} className="border-t border-line-subtle">
              <td className="px-2 py-1 text-right text-tertiary">{player.rank}</td>
              <td className="max-w-[220px] truncate px-2 py-1 font-medium text-primary">
                {player.name}
              </td>
              {rounds.map((round) => {
                const entries = player.encounters.filter(
                  (entry) => entry.round?.split('.')[0] === round,
                );
                for (const entry of entries) running += entry.score ?? 0;
                return (
                  <td key={round} className="px-1 py-0.5 text-center">
                    {entries.map((entry) => (
                      <button
                        key={entry.gameId}
                        type="button"
                        onClick={() => onOpen(entry.gameId)}
                        title={`Against ${table.players.find((p) => p.index === entry.opponent)?.name ?? ''} with ${entry.color === 'w' ? 'White' : 'Black'} — running total ${formatPoints(running)}`}
                        className="rounded px-1 hover:bg-surface-2"
                      >
                        <span className="text-tertiary">{rankOf.get(entry.opponent)}</span>
                        <span className="text-[10px] text-tertiary">{entry.color}</span>
                        <span className="ml-0.5 text-primary">{scoreGlyph(entry.score)}</span>
                      </button>
                    ))}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-right font-semibold text-primary">
                {formatPoints(player.score)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
