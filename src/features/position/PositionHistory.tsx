'use client';

/**
 * "History in your collections" on the position page (Phase 84).
 *
 * The first game, the latest, how many games a year, and who plays it — read
 * from the dated games Kingfisher holds (`src/position/history.ts`). The
 * section names its population every time it speaks: your collections, with
 * the count read and the count undated, and a sentence on why the reference
 * packs are not in it.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { openStoredGame } from '@/features/games/open-game';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import { playerKey } from '@/persistence/schema/migrations';
import type { GameSummary } from '@/persistence/types';
import { positionHistory, type YearCount } from '@/position/history';
import type { PositionIdentity } from '@/position/knowledge';
import { useUi } from '@/stores/ui-store';

const percent = (points: number, of: number) => `${Math.round((points / of) * 100)}%`;

export function PositionHistorySection({
  identity,
  className,
  headingClass,
}: {
  readonly identity: PositionIdentity;
  readonly className: string;
  readonly headingClass: string;
}) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const history = useQuery({
    queryKey: ['position-page', identity.key, 'history'],
    queryFn: async () => {
      const { games, total } = await (
        await getRepositories()
      ).games.summariesAtPosition(identity.key);
      return { total, history: positionHistory<GameSummary>(games) };
    },
    retry: false,
  });

  const open = (game: GameSummary) =>
    void openStoredGame(game.id)
      .then(() => router.push('/analysis'))
      .catch((error: unknown) =>
        notify({
          tone: 'error',
          message: 'That game could not be opened.',
          detail: error instanceof Error ? error.message : String(error),
        }),
      );

  return (
    <section className={className} data-position-history>
      <h2 className={headingClass}>History in your collections</h2>
      <p className="mb-3 text-xs text-secondary">
        From the games stored in this browser that pass through this position. The reference packs
        keep one count per position and no dates, so they cannot say when a position was played.
      </p>
      {history.isPending ? (
        <p role="status" className="text-sm text-secondary">
          Reading the games…
        </p>
      ) : history.isError ? (
        <p role="alert" className="text-sm text-negative">
          {history.error instanceof Error ? history.error.message : String(history.error)}
        </p>
      ) : history.data.total === 0 ? (
        <p className="text-sm text-secondary">No stored game passes through this position.</p>
      ) : (
        <HistoryBody total={history.data.total} history={history.data.history} onOpen={open} />
      )}
    </section>
  );
}

function HistoryBody({
  total,
  history,
  onOpen,
}: {
  readonly total: number;
  readonly history: ReturnType<typeof positionHistory<GameSummary>>;
  readonly onOpen: (game: GameSummary) => void;
}) {
  const span = history.byYear.length
    ? `${history.byYear[0]!.year}–${history.byYear.at(-1)!.year}`
    : null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-primary tabular" data-history-summary>
        {total.toLocaleString()} {total === 1 ? 'game' : 'games'}
        {history.games < total ? ` (${history.games.toLocaleString()} read)` : ''}
        {span ? `, ${span}` : ''}
        {history.undated ? ` · ${history.undated.toLocaleString()} undated` : ''}
      </p>

      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
        {history.first ? (
          <>
            <dt className="text-secondary">First played</dt>
            <dd className="min-w-0">
              <button
                type="button"
                className="truncate text-left text-accent hover:underline"
                onClick={() => onOpen(history.first!)}
                data-history-first
              >
                {gameTitle(history.first)} · {history.first.result}
              </button>
            </dd>
          </>
        ) : null}
        {history.latest && history.latest.id !== history.first?.id ? (
          <>
            <dt className="text-secondary">Most recent</dt>
            <dd className="min-w-0">
              <button
                type="button"
                className="truncate text-left text-accent hover:underline"
                onClick={() => onOpen(history.latest!)}
              >
                {gameTitle(history.latest)} · {history.latest.result}
              </button>
            </dd>
          </>
        ) : null}
      </dl>

      {history.byYear.length > 1 ? <YearChart years={history.byYear} /> : null}

      {history.players.length ? (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-secondary">Played by</h3>
          <ul className="grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2" data-history-players>
            {history.players.map((player) => (
              <li key={player.name} className="flex min-w-0 items-baseline gap-2">
                <Link
                  href={`/player/${encodeURIComponent(playerKey(player.name))}`}
                  className="truncate text-primary hover:text-accent hover:underline"
                >
                  {player.name}
                </Link>
                <span className="ml-auto shrink-0 text-xs text-tertiary tabular">
                  {player.games} ({player.asWhite} White, {player.asBlack} Black)
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Games per year as bars, with the same numbers as a table for anyone who wants them. */
function YearChart({ years }: { readonly years: readonly YearCount[] }) {
  const most = Math.max(...years.map((year) => year.games), 1);
  const width = Math.max(years.length * 10, 120);
  return (
    <figure className="min-w-0" data-history-years>
      <figcaption className="mb-1 flex justify-between text-[11px] text-tertiary tabular">
        <span>Games per year</span>
        <span>most in one year: {most}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} 48`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Games per year from ${years[0]!.year} to ${years.at(-1)!.year}`}
        className="block h-16 w-full rounded-[6px] bg-surface-inset"
      >
        {years.map((year, index) => {
          const height = (year.games / most) * 44;
          const slot = width / years.length;
          return (
            <rect
              key={year.year}
              x={index * slot + slot * 0.15}
              y={48 - height}
              width={slot * 0.7}
              height={height}
              className="fill-accent"
              opacity={0.75}
            >
              <title>
                {year.year}: {year.games} {year.games === 1 ? 'game' : 'games'}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-0.5 flex justify-between text-[11px] text-tertiary tabular">
        <span>{years[0]!.year}</span>
        <span>{years.at(-1)!.year}</span>
      </div>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-secondary">Year by year</summary>
        <table className="mt-1 w-full max-w-md text-left tabular">
          <thead>
            <tr className="text-tertiary">
              <th className="font-medium">Year</th>
              <th className="font-medium">Games</th>
              <th className="font-medium">White scored</th>
            </tr>
          </thead>
          <tbody>
            {years
              .filter((year) => year.games > 0)
              .map((year) => (
                <tr key={year.year}>
                  <td>{year.year}</td>
                  <td>{year.games}</td>
                  <td>
                    {year.decided
                      ? `${percent(year.whitePoints, year.decided)} of ${year.decided}`
                      : '—'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
