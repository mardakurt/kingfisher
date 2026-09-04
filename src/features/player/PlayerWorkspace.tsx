'use client';

/**
 * The player profile.
 *
 * Flagged in Phase 9, skipped in Phase 11, and the row of the gap analysis
 * where ChessBase and ChessMonitor were plainly ahead. What they have that
 * Kingfisher did not is a single page that answers "who is this, what do they
 * play, and what happens in their games".
 *
 * Two rules run through every section. **Every figure has its denominator next
 * to it** — 41 of 118 games, not 35% — because a percentage over eleven games
 * and a percentage over eleven hundred are different kinds of fact and a reader
 * cannot tell them apart otherwise. And **nothing here is an adjective**: the
 * tendencies section reports rules and counts, and the word "aggressive" does
 * not appear in this application.
 *
 * Every opening row is one click from the board. That is the point of a
 * profile: not to admire the numbers but to get from "they play the Najdorf"
 * to the position, with the filters already right.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Board, Pin, Target } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { openStoredGame } from '@/features/games/open-game';
import { NavButton } from '@/features/shell/NavButton';
import { cn } from '@/lib/cn';
import { formatPgnDate, gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import type { PreparationSessionRecord } from '@/persistence/domain';
import {
  PERIODS,
  resolvePeriod,
  scorePercent,
  type OpeningCount,
  type PlayerPeriod,
  type ScoreLine,
} from '@/player/aggregate';
import { useUi } from '@/stores/ui-store';

import { PlayerIdentityPanel } from './PlayerIdentityPanel';
import { TendencyPanel } from './TendencyPanel';
import { usePlayerAggregate, usePlayerIdentity, usePlayerTendencies } from './usePlayer';

type Section = 'overview' | 'openings' | 'opponents' | 'tendencies' | 'games' | 'identity';

const SECTIONS: readonly { readonly id: Section; readonly label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'openings', label: 'Openings' },
  { id: 'opponents', label: 'Opponents' },
  { id: 'tendencies', label: 'Tendencies' },
  { id: 'games', label: 'Recent games' },
  { id: 'identity', label: 'Identity' },
];

export function PlayerWorkspace({ playerId }: { readonly playerId: string }) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>('overview');
  const [period, setPeriod] = useState<PlayerPeriod>(PERIODS[0] as PlayerPeriod);
  const [preparing, setPreparing] = useState<'w' | 'b' | null>(null);

  const identity = usePlayerIdentity(playerId);
  const data = usePlayerAggregate(identity.data, period);
  const tendencies = usePlayerTendencies(identity.data, data.data?.games);
  const resolved = resolvePeriod(period);

  const sessions = useQuery<readonly PreparationSessionRecord[]>({
    queryKey: ['player-preparation', playerId],
    enabled: Boolean(identity.data),
    retry: false,
    queryFn: async () =>
      (await getRepositories()).preparation.forOpponent(identity.data?.name ?? playerId),
  });

  const favorite = useMutation({
    mutationFn: async (value: boolean) => {
      const repositories = await getRepositories();
      await repositories.playerIdentities.upsert({ name: identity.data?.name ?? playerId });
      return repositories.playerIdentities.setFavorite(playerId, value);
    },
    onSuccess: (record) => {
      notify({
        tone: 'success',
        message: record.favorite
          ? `${record.name} added to favourites.`
          : 'Removed from favourites.',
      });
      void queryClient.invalidateQueries({ queryKey: ['player-identity', playerId] });
    },
  });

  /**
   * Create a preparation session against this player, and go to it.
   *
   * The one-click transition §21 asks for. The session records who the opponent
   * is and which colour *the user* will have, which is the opposite of the
   * colour they are preparing against — stated here rather than left for the
   * user to invert in their head at the wrong moment.
   */
  const prepare = useMutation({
    mutationFn: async ({ title, opponentColor }: { title: string; opponentColor: 'w' | 'b' }) => {
      const repositories = await getRepositories();
      return repositories.preparation.create({
        title,
        opponent: identity.data?.name ?? playerId,
        myColor: opponentColor === 'w' ? 'b' : 'w',
      });
    },
    onSuccess: (session) => {
      notify({ tone: 'success', message: `Preparation session “${session.title}” created.` });
      router.push(`/preparation?session=${encodeURIComponent(session.id)}`);
    },
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The session could not be created.',
      }),
    onSettled: () => setPreparing(null),
  });

  const aggregate = data.data?.aggregate;
  /*
    A stored identity's name wins, because the user chose it. Otherwise the
    spelling the games actually use, and only then the normalized key — which
    is a lookup value, not a name anybody writes.
  */
  const name = identity.data?.stored
    ? identity.data.name
    : (aggregate?.displayName ?? identity.data?.name ?? playerId);

  /** Open the position at which an opening was recognised, on the board. */
  const openOnBoard = async (id: string, ply?: number) => {
    try {
      await openStoredGame(id, ply === undefined ? {} : { ply });
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-line-subtle bg-surface-1 px-3 md:px-5">
        <NavButton />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-primary">{name}</h1>
          <p className="hidden text-xs text-tertiary sm:block">
            {aggregate
              ? `${aggregate.games.toLocaleString()} games in this collection${
                  aggregate.firstYear ? `, ${aggregate.firstYear}–${aggregate.lastYear}` : ''
                }`
              : 'Reading this player’s games…'}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-tertiary">
            Period
            <select
              value={period.id}
              onChange={(event) =>
                setPeriod(
                  PERIODS.find((entry) => entry.id === event.target.value) ??
                    (PERIODS[0] as PlayerPeriod),
                )
              }
              className="h-7 rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
            >
              {PERIODS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            icon={<Pin />}
            active={identity.data?.favorite}
            onClick={() => favorite.mutate(!identity.data?.favorite)}
          >
            {identity.data?.favorite ? 'Favourite' : 'Add to favourites'}
          </Button>
          <Button variant="subtle" icon={<Target />} onClick={() => setPreparing('w')}>
            Prepare against White
          </Button>
          <Button variant="accent" icon={<Target />} onClick={() => setPreparing('b')}>
            Prepare against Black
          </Button>
        </div>
      </header>

      <nav
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-line-subtle bg-surface-1 px-3 py-1.5"
        aria-label="Player sections"
      >
        {SECTIONS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setSection(entry.id)}
            aria-current={section === entry.id}
            className={cn(
              'shrink-0 rounded-[4px] px-2.5 py-1.5 text-xs transition-colors',
              section === entry.id
                ? 'bg-accent-muted font-medium text-primary'
                : 'text-secondary hover:bg-surface-2 hover:text-primary',
            )}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto">
        {data.isPending ? (
          <p className="p-6 text-sm text-tertiary">Reading this player’s games…</p>
        ) : !aggregate || aggregate.games === 0 ? (
          <EmptyState
            title="No games for this player"
            description={`Nothing in the local collection is under “${name}”${
              resolved.fromYear ? ` in ${period.label.toLowerCase()}` : ''
            }. Import games, or link another spelling of the name under Identity.`}
          />
        ) : (
          <div className="mx-auto max-w-5xl p-5 md:p-8">
            {/*
              The scope line, on every section rather than only the first. A
              figure read after switching tabs is read without the header in
              view, and "41 of 118" means nothing if the 118 is off screen.
            */}
            <p className="mb-5 text-xs text-tertiary">
              Observed in {aggregate.games.toLocaleString()} stored game
              {aggregate.games === 1 ? '' : 's'}
              {resolved.fromYear ? ` from ${resolved.fromYear} onwards` : ''}
              {data.data?.capped ? ' · the walk stopped at a safety cap, so there may be more' : ''}
              .
            </p>

            {section === 'overview' ? (
              <OverviewSection
                games={aggregate.games}
                overall={aggregate.overall}
                asWhite={aggregate.asWhite}
                asBlack={aggregate.asBlack}
                firstYear={aggregate.firstYear}
                lastYear={aggregate.lastYear}
                minRating={aggregate.minRating}
                maxRating={aggregate.maxRating}
                averageRating={aggregate.averageRating}
                ratedGames={aggregate.ratedGames}
                unclassified={aggregate.unclassified}
                averagePlies={tendencies.data?.averagePlies ?? null}
                sampled={tendencies.data?.examined ?? 0}
                topWhite={aggregate.openingsAsWhite.slice(0, 3)}
                topBlack={aggregate.openingsAsBlack.slice(0, 3)}
                topOpponents={aggregate.opponents.slice(0, 5)}
                sessions={sessions.data ?? []}
                onOpenSession={(id) =>
                  router.push(`/preparation?session=${encodeURIComponent(id)}`)
                }
              />
            ) : null}

            {section === 'openings' ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <OpeningTable
                  title="As White"
                  line={aggregate.asWhite}
                  openings={aggregate.openingsAsWhite}
                  onOpen={(opening) => void openOnBoard(opening.exampleGameId, opening.examplePly)}
                />
                <OpeningTable
                  title="As Black"
                  line={aggregate.asBlack}
                  openings={aggregate.openingsAsBlack}
                  onOpen={(opening) => void openOnBoard(opening.exampleGameId, opening.examplePly)}
                />
              </div>
            ) : null}

            {section === 'opponents' ? (
              <section>
                <h2 className="text-sm font-semibold text-primary">Opponents</h2>
                <p className="mt-1 text-xs text-tertiary">
                  {aggregate.opponents.length.toLocaleString()} distinct opponents in these games.
                </p>
                <table className="mt-3 w-full text-xs">
                  <thead className="border-b border-line-subtle text-left text-[10px] uppercase tracking-wide text-tertiary">
                    <tr>
                      <th className="py-1.5">Opponent</th>
                      <th className="py-1.5 text-right">Games</th>
                      <th className="py-1.5 text-right">Score</th>
                      <th className="py-1.5 text-right">Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregate.opponents.map((opponent) => (
                      <tr key={opponent.key} className="border-b border-line-subtle last:border-0">
                        <td className="py-1.5">
                          <button
                            type="button"
                            className="text-left text-primary hover:text-accent"
                            onClick={() =>
                              router.push(`/player/${encodeURIComponent(opponent.key)}`)
                            }
                          >
                            {opponent.name}
                          </button>
                        </td>
                        <td className="py-1.5 text-right text-secondary tabular">
                          {opponent.games}
                        </td>
                        <td className="py-1.5 text-right text-secondary tabular">
                          {opponent.points} / {opponent.games}
                        </td>
                        <td className="py-1.5 text-right text-tertiary tabular">
                          {opponent.lastYear ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            {section === 'tendencies' ? (
              <TendencyPanel report={tendencies.data} pending={tendencies.isPending} />
            ) : null}

            {section === 'games' ? (
              <section>
                <h2 className="text-sm font-semibold text-primary">Most recent games</h2>
                <ul className="mt-3 divide-y divide-line-subtle">
                  {aggregate.recent.map((game) => (
                    <li key={game.id}>
                      <button
                        type="button"
                        className="w-full py-2 text-left"
                        onClick={() => void openOnBoard(game.id)}
                      >
                        <span className="block truncate text-sm text-primary">
                          {gameTitle(game)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-tertiary">
                          {[formatPgnDate(game.date), game.result, game.classification?.eco]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {section === 'identity' ? (
              <PlayerIdentityPanel
                playerId={playerId}
                identity={identity.data}
                onChanged={() => {
                  void queryClient.invalidateQueries({ queryKey: ['player-identity', playerId] });
                  void queryClient.invalidateQueries({ queryKey: ['player-aggregate'] });
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      <PromptDialog
        open={preparing !== null}
        title={`Prepare against ${name} as ${preparing === 'w' ? 'White' : 'Black'}`}
        description={`A preparation session opens with ${name} as the opponent, and you as ${
          preparing === 'w' ? 'Black' : 'White'
        }.`}
        label="Session title"
        initialValue={`${name} — ${preparing === 'w' ? 'their White' : 'their Black'}`}
        confirmLabel="Create session"
        onCancel={() => setPreparing(null)}
        onSubmit={(title) => {
          if (preparing) prepare.mutate({ title, opponentColor: preparing });
        }}
      />
    </div>
  );
}

function OverviewSection(props: {
  readonly games: number;
  readonly overall: ScoreLine;
  readonly asWhite: ScoreLine;
  readonly asBlack: ScoreLine;
  readonly firstYear?: number;
  readonly lastYear?: number;
  readonly minRating?: number;
  readonly maxRating?: number;
  readonly averageRating?: number;
  readonly ratedGames: number;
  readonly unclassified: number;
  readonly averagePlies: number | null;
  readonly sampled: number;
  readonly topWhite: readonly OpeningCount[];
  readonly topBlack: readonly OpeningCount[];
  readonly topOpponents: readonly { key: string; name: string; games: number }[];
  readonly sessions: readonly PreparationSessionRecord[];
  readonly onOpenSession: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <section>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <Fact label="Games" value={props.games.toLocaleString()} />
          <Fact
            label="Date range"
            value={
              props.firstYear === undefined
                ? 'not recorded'
                : `${props.firstYear}–${props.lastYear}`
            }
          />
          <Fact
            label="Rating"
            value={
              props.averageRating === undefined
                ? 'not recorded'
                : `${props.minRating}–${props.maxRating}`
            }
            note={
              props.averageRating === undefined
                ? undefined
                : `avg ${props.averageRating} over ${props.ratedGames} rated games`
            }
          />
          <Fact
            label="Average length"
            value={
              props.averagePlies === null
                ? 'measuring…'
                : `${(props.averagePlies / 2).toFixed(1)} moves`
            }
            note={props.sampled > 0 ? `over ${props.sampled} games read` : undefined}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-primary">Results</h2>
        <div className="mt-3 space-y-2">
          <ScoreRow label="Overall" line={props.overall} />
          <ScoreRow label="As White" line={props.asWhite} />
          <ScoreRow label="As Black" line={props.asBlack} />
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold text-primary">Most common openings</h2>
          <MiniList
            title="As White"
            rows={props.topWhite.map((entry) => ({
              key: entry.key,
              label: `${entry.eco} ${entry.label}`,
              value: `${entry.games}`,
            }))}
          />
          <MiniList
            title="As Black"
            rows={props.topBlack.map((entry) => ({
              key: entry.key,
              label: `${entry.eco} ${entry.label}`,
              value: `${entry.games}`,
            }))}
          />
          {props.unclassified > 0 ? (
            <p className="mt-2 text-[10px] text-tertiary">
              {props.unclassified} game{props.unclassified === 1 ? '' : 's'} carry no opening at all
              — unnamed rather than unclassified. Run Classify games on the collection.
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-primary">Most frequent opponents</h2>
          <MiniList
            rows={props.topOpponents.map((entry) => ({
              key: entry.key,
              label: entry.name,
              value: `${entry.games}`,
            }))}
          />
          <h2 className="mt-6 text-sm font-semibold text-primary">Preparation</h2>
          {props.sessions.length === 0 ? (
            <p className="mt-2 text-xs text-tertiary">
              No preparation sessions against this player yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {props.sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    className="text-xs text-primary hover:text-accent"
                    onClick={() => props.onOpenSession(session.id)}
                  >
                    {session.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function OpeningTable({
  title,
  line,
  openings,
  onOpen,
}: {
  readonly title: string;
  readonly line: ScoreLine;
  readonly openings: readonly OpeningCount[];
  readonly onOpen: (opening: OpeningCount) => void;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
      <p className="mt-1 text-xs text-tertiary tabular">
        {line.games} games · {line.wins}/{line.draws}/{line.losses} W-D-L
      </p>
      {openings.length === 0 ? (
        <p className="mt-3 text-xs text-tertiary">No classified games with this colour.</p>
      ) : (
        <table className="mt-3 w-full text-xs">
          <thead className="border-b border-line-subtle text-left text-[10px] uppercase tracking-wide text-tertiary">
            <tr>
              <th className="py-1.5">Opening</th>
              <th className="py-1.5 text-right" title="Games in the whole selected period">
                All
              </th>
              <th className="py-1.5 text-right" title="Games in the last three years">
                Recent
              </th>
              <th className="py-1.5 text-right">Score</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {openings.map((opening) => (
              <tr key={opening.key} className="border-b border-line-subtle last:border-0">
                <td className="min-w-0 py-1.5">
                  <span className="mr-1.5 font-mono text-tertiary">{opening.eco}</span>
                  <span className="text-primary">{opening.label}</span>
                </td>
                <td className="py-1.5 text-right text-secondary tabular">{opening.games}</td>
                <td className="py-1.5 text-right text-secondary tabular">{opening.recentGames}</td>
                <td className="py-1.5 text-right text-secondary tabular">
                  {opening.points} / {opening.games}
                </td>
                <td className="py-1.5 pl-2 text-right">
                  {/*
                    §61: from any opening in a profile, one action reaches the
                    exact position. The profile already knows a game that got
                    there and the ply it was recognised at, so nothing has to
                    be rebuilt.
                  */}
                  <Button
                    size="sm"
                    icon={<Board />}
                    title={`Open the position after move ${Math.ceil(opening.examplePly / 2)} of their most recent game in this line`}
                    onClick={() => onOpen(opening)}
                  >
                    Board
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ScoreRow({ label, line }: { readonly label: string; readonly line: ScoreLine }) {
  const percent = scorePercent(line);
  return (
    <div className="flex items-baseline gap-3 text-xs">
      <span className="w-20 shrink-0 text-tertiary">{label}</span>
      <span className="tabular text-primary">
        {line.points} / {line.wins + line.draws + line.losses}
      </span>
      <span className="tabular text-secondary">
        {line.wins}W {line.draws}D {line.losses}L
        {line.unknown > 0 ? ` · ${line.unknown} unfinished` : ''}
      </span>
      <span className="ml-auto tabular text-tertiary">
        {percent === null ? 'no decided games' : `${percent.toFixed(1)}%`}
      </span>
    </div>
  );
}

function MiniList({
  title,
  rows,
}: {
  readonly title?: string;
  readonly rows: readonly { key: string; label: string; value: string }[];
}) {
  return (
    <div className="mt-3">
      {title ? (
        <h3 className="text-[10px] uppercase tracking-wide text-tertiary">{title}</h3>
      ) : null}
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-tertiary">None.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {rows.map((row) => (
            <li key={row.key} className="flex items-baseline gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-secondary">{row.label}</span>
              <span className="shrink-0 tabular text-tertiary">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-tertiary">{label}</p>
      <p className="mt-1 text-sm text-primary tabular">{value}</p>
      {note ? <p className="text-[10px] text-tertiary">{note}</p> : null}
    </div>
  );
}
