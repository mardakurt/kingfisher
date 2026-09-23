'use client';

import { WorkspaceTabStrip } from '@/features/tabs/WorkspaceTabStrip';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { START_FEN } from '@/chess/fen';
import { formatScore } from '@/chess/evaluation';
import { Button } from '@/components/ui/Button';
import { MiniBoard } from '@/features/board/MiniBoard';
import { NavButton } from '@/features/shell/NavButton';
import { useProfile } from '@/features/persistence/queries';
import { openStoredGame } from '@/features/games/open-game';
import { openPositionHit } from '@/features/search/open-hit';
import { databaseProviders, subscribeDatabaseProviders } from '@/database/registry';
import type { ChessDatabaseProvider } from '@/database/types';
import { getRepositories } from '@/persistence/repositories';
import {
  positionHitLabel,
  searchByPosition,
  type PositionHit,
} from '@/persistence/position-search';
import { positionIdentity, type PositionIdentity } from '@/position/knowledge';
import { formatThink } from '@/round/clock';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import {
  positionStructureQuery,
  readPositionEvidence,
  readPositionGames,
} from '@/stores/position-page-reader';

const NO_PROVIDERS: readonly ChessDatabaseProvider[] = [];
const serverProviders = () => NO_PROVIDERS;
const rowClass =
  'block w-full rounded-md border border-line-subtle bg-surface-1 p-3 text-left text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent';
const sectionClass = 'min-w-0 rounded-lg border border-line-subtle bg-surface-1 p-4';
const headingClass = 'mb-2 text-sm font-semibold text-primary';

export function PositionWorkspace() {
  const params = useSearchParams();
  const currentFen = useAnalysis((state) => state.tree.nodes[state.currentId]?.fen ?? START_FEN);
  const requested = params.get('fen') ?? currentFen;
  const identity = useMemo(() => positionIdentity(requested), [requested]);
  const theme = usePreferences((state) => state.boardTheme);
  const pieceSet = usePreferences((state) => state.pieceSet);
  const orientation = useAnalysis((state) => state.orientation);
  const notify = useUi((state) => state.notify);
  const client = useQueryClient();
  const providers = useSyncExternalStore(
    subscribeDatabaseProviders,
    databaseProviders,
    serverProviders,
  );
  const profile = useProfile();

  return (
    <div className="flex h-full min-h-0 flex-col" data-workspace-frame="position">
      <header className="flex shrink-0 items-center gap-3 border-b border-line-subtle px-3 py-3">
        <NavButton />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold text-primary">Position page</h1>
          <p className="text-xs text-secondary">Your work and the evidence, in one place.</p>
        </div>
        <Button onClick={() => void client.invalidateQueries({ queryKey: ['position-page'] })}>
          Refresh
        </Button>
      </header>
      <WorkspaceTabStrip />
      {!identity ? (
        <div className="p-6" role="alert">
          This position cannot be read. Open the page from a board, or supply a valid standard-chess
          FEN.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mx-auto grid max-w-[1500px] min-w-0 gap-5 lg:grid-cols-[minmax(260px,380px)_minmax(0,1fr)]">
            <aside className="min-w-0 self-start lg:sticky lg:top-0">
              <MiniBoard
                fen={identity.fen}
                orientation={orientation}
                theme={theme}
                pieceSet={pieceSet}
                testId="position-page"
              />
              <p className="mt-2 text-sm text-primary">
                {identity.fen.split(' ')[1] === 'w' ? 'White' : 'Black'} to play
              </p>
              <p className="mt-1 text-xs leading-relaxed text-secondary">
                A read-only position. Your analysis tree stays where you left it.
              </p>
              <code className="mt-3 block break-all text-xs text-tertiary" data-position-key>
                {identity.key}
              </code>
              <Button
                className="mt-3"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(identity.fen)
                    .then(() => notify({ tone: 'success', message: 'FEN copied.' }))
                    .catch(() =>
                      notify({ tone: 'error', message: 'The clipboard refused the FEN.' }),
                    )
                }
              >
                Copy FEN
              </Button>
            </aside>
            <div className="min-w-0 space-y-5">
              <section className={sectionClass}>
                <h2 className={headingClass}>Games from this position</h2>
                {profile.isPending ? (
                  <p role="status">Reading your profile…</p>
                ) : profile.isError ? (
                  <Failure error={profile.error} />
                ) : (
                  <PositionGames identity={identity} aliases={profile.data?.aliases ?? []} />
                )}
              </section>
              <OwnWork identity={identity} />
              <section className={sectionClass}>
                <h2 className={headingClass}>Reference populations</h2>
                <p className="mb-3 text-xs text-secondary">
                  Each source answers for itself. Counts are never combined. Online sources are
                  queried only when you ask.
                </p>
                <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                  {providers
                    .filter(
                      (provider) => provider.id !== 'local' && provider.id !== 'lichess-player',
                    )
                    .map((provider) => (
                      <ReferenceColumn key={provider.id} identity={identity} provider={provider} />
                    ))}
                </div>
                {providers.length === 0 ? (
                  <p className="text-sm text-secondary">No reference sources are registered.</p>
                ) : null}
              </section>
              <EngineEvidence identity={identity} />
              <StructureGames identity={identity} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Failure({ error }: { readonly error: unknown }) {
  return (
    <p role="alert" className="text-sm text-negative">
      {error instanceof Error ? error.message : String(error)}{' '}
      <span className="text-secondary">Other sections remain available.</span>
    </p>
  );
}

function PositionGames({
  identity,
  aliases,
}: {
  readonly identity: PositionIdentity;
  readonly aliases: readonly string[];
}) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const games = useQuery({
    queryKey: ['position-page', identity.key, 'games', aliases],
    queryFn: async () => readPositionGames(await getRepositories(), identity, aliases),
    retry: false,
  });
  const count = useQuery({
    queryKey: ['position-page', identity.key, 'game-count'],
    queryFn: async () => (await getRepositories()).games.countAtPosition(identity.key),
    retry: false,
  });
  const [onlyMine, setOnlyMine] = useState(false);
  const rows = (games.data ?? []).filter((row) => !onlyMine || row.facts.ownColor !== null);
  return (
    <>
      <p className="mb-2 text-xs text-secondary">
        Local main-line continuations, most recent first; up to 100 indexed positions.{' '}
        {count.data !== undefined ? `${count.data} distinct games indexed here.` : ''} Final
        positions without a continuation are not in this index.
      </p>
      {count.isError ? <Failure error={count.error} /> : null}
      {aliases.length ? (
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(event) => setOnlyMine(event.target.checked)}
          />
          Only my games in these results (exact profile aliases)
        </label>
      ) : (
        <p className="mb-3 text-xs text-secondary">
          These are local games, not necessarily yours. Add your exact player spellings in Profile
          to identify your games.
        </p>
      )}
      {games.isPending ? (
        <p role="status">Reading games…</p>
      ) : games.isError ? (
        <Failure error={games.error} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-secondary">No matching games in these results.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ game, facts }) => (
            <li key={game.id}>
              <button
                type="button"
                className={rowClass}
                onClick={() =>
                  void openStoredGame(game.id, { ply: facts.ply })
                    .then(() => router.push('/analysis'))
                    .catch((error: unknown) =>
                      notify({
                        tone: 'error',
                        message:
                          error instanceof Error ? error.message : 'This game could not be opened.',
                      }),
                    )
                }
              >
                <span className="block font-medium text-primary">
                  {game.white} – {game.black} · {facts.result}
                </span>
                <span className="mt-1 block text-xs text-secondary">
                  {[
                    game.event,
                    game.date,
                    game.site,
                    facts.ownColor
                      ? `You played ${facts.ownColor === 'w' ? 'White' : 'Black'}`
                      : 'No unique profile match',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="mt-1 block text-xs text-secondary">
                  Next: {facts.nextMove ?? 'no continuation'} ·{' '}
                  {facts.elapsedSeconds === null
                    ? 'Elapsed time not recorded'
                    : `Recorded elapsed ${formatThink(facts.elapsedSeconds)}`}{' '}
                  ·{' '}
                  {facts.remainingAfter === null
                    ? 'Clock not recorded'
                    : `Clock after this move ${formatThink(facts.remainingAfter)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function OwnWork({ identity }: { readonly identity: PositionIdentity }) {
  const search = useQuery({
    queryKey: ['position-page', identity.key, 'work'],
    queryFn: async () => searchByPosition(await getRepositories(), identity.fen, 5000),
    retry: false,
  });
  const exact = (search.data?.hits ?? []).filter((hit) => hit.kind !== 'game');
  return (
    <section className={sectionClass}>
      <h2 className={headingClass}>Your work</h2>
      {search.isPending ? (
        <p role="status">Finding studies, hand-ins and decisions…</p>
      ) : search.isError ? (
        <Failure error={search.error} />
      ) : (
        <>
          <p className="mb-3 text-xs text-secondary">
            Exact position, including study sidelines. At most 5,000 work matches are shown.
          </p>
          <WorkHits hits={exact} />
          <h3 className="mb-2 mt-4 text-sm font-semibold text-primary">Same pawns in your work</h3>
          <p className="mb-2 text-xs text-secondary">
            The same pawn skeleton with different piece positions; not an exact-position match.
          </p>
          <WorkHits hits={search.data?.structure ?? []} />
        </>
      )}
    </section>
  );
}

function WorkHits({ hits }: { readonly hits: readonly PositionHit[] }) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  if (hits.length === 0) return <p className="text-sm text-secondary">No matching work found.</p>;
  return (
    <ul className="space-y-2">
      {hits.map((hit) => (
        <li key={hit.id}>
          <button
            type="button"
            className={rowClass}
            onClick={() =>
              void openPositionHit(hit, (href) => router.push(href)).catch((error: unknown) =>
                notify({
                  tone: 'error',
                  message:
                    error instanceof Error ? error.message : 'This work could not be opened.',
                }),
              )
            }
          >
            <span className="block text-xs text-tertiary">{positionHitLabel(hit.kind)}</span>
            <span className="block font-medium text-primary">{hit.title}</span>
            {hit.subtitle ? (
              <span className="mt-1 block text-xs text-secondary">{hit.subtitle}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReferenceColumn({
  identity,
  provider,
}: {
  readonly identity: PositionIdentity;
  readonly provider: ChessDatabaseProvider;
}) {
  const [requested, setRequested] = useState(false);
  const enabled = provider.capabilities.offline || requested;
  const query = useQuery({
    queryKey: ['position-page', identity.key, 'reference', provider.id, provider.cacheVersion],
    queryFn: ({ signal }) => provider.explore({ fen: identity.fen }, signal),
    enabled,
    retry: false,
  });
  return (
    <section
      className="min-w-0 rounded-md border border-line-subtle p-3"
      data-position-source={provider.id}
    >
      <h3 className="text-sm font-medium text-primary">{provider.name}</h3>
      <p className="my-2 text-xs text-secondary">{provider.description}</p>
      {!enabled ? (
        <Button onClick={() => setRequested(true)}>Query {provider.name}</Button>
      ) : query.isPending ? (
        <p role="status" className="text-xs">
          Reading this source…
        </p>
      ) : query.isError ? (
        <Failure error={query.error} />
      ) : query.data ? (
        <>
          <p className="text-sm text-primary">
            {query.data.totalGames} games · {query.data.source.name}
          </p>
          <p className="my-1 text-xs text-secondary">
            White wins {query.data.white} · Draws {query.data.draws} · Black wins {query.data.black}
          </p>
          {query.data.truncated ? (
            <p className="text-xs text-caution">This source capped its answer.</p>
          ) : null}
          {query.data.totalGames === 0 ? (
            <p className="text-xs text-secondary">
              This source has no indexed continuation here. That does not establish that the
              position was never played.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs">
              {query.data.moves.map((move) => (
                <li key={move.uci} className="flex justify-between gap-3">
                  <span className="font-medium text-primary">{move.san}</span>
                  <span className="text-secondary">
                    {move.games} / {query.data!.totalGames} games
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

function EngineEvidence({ identity }: { readonly identity: PositionIdentity }) {
  const evidence = useQuery({
    queryKey: ['position-page', identity.key, 'engine'],
    queryFn: async () => readPositionEvidence(await getRepositories(), identity.key),
    retry: false,
  });
  return (
    <section className={sectionClass}>
      <h2 className={headingClass}>Stored engine evidence</h2>
      <p className="mb-3 text-xs text-secondary">
        Scores are from White’s point of view. These are recorded searches; opening this page starts
        no engine.
      </p>
      {evidence.isPending ? (
        <p role="status">Reading stored evidence…</p>
      ) : evidence.isError ? (
        <Failure error={evidence.error} />
      ) : evidence.data ? (
        <>
          <h3 className="mb-2 text-sm font-medium">Pinned lines</h3>
          {!evidence.data.pinned.ok ? (
            <Failure error={evidence.data.pinned.message} />
          ) : evidence.data.pinned.value.length === 0 ? (
            <p className="text-sm text-secondary">No pinned evidence at this position.</p>
          ) : (
            <ul className="space-y-2">
              {evidence.data.pinned.value.map((line) => (
                <li key={line.id} className="rounded-md border border-line-subtle p-3 text-sm">
                  <p>
                    {line.engineName} {line.engineVersion ?? ''} · depth {line.depth} ·{' '}
                    {formatScore(line.score)}
                  </p>
                  <p className="mt-1 break-words text-xs text-secondary">
                    {line.pvSan.length ? line.pvSan.join(' ') : line.pvUci.join(' ')}
                  </p>
                  <p className="mt-1 text-xs text-tertiary">
                    {new Date(line.createdAt).toLocaleString()} · {line.nodes} nodes · {line.timeMs}{' '}
                    ms
                  </p>
                  {line.note ? <p className="mt-1 text-sm">{line.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-2 mt-4 text-sm font-medium">Queued searches</h3>
          {!evidence.data.queued.ok ? (
            <Failure error={evidence.data.queued.message} />
          ) : evidence.data.queued.value.length === 0 ? (
            <p className="text-sm text-secondary">No queued evidence at this position.</p>
          ) : (
            <ul className="space-y-2">
              {evidence.data.queued.value.map((line) => (
                <li key={line.id} className="rounded-md border border-line-subtle p-3 text-sm">
                  <p>
                    {line.engineName} · depth {line.depth} · {formatScore(line.score)}
                  </p>
                  <p className="mt-1 break-words text-xs text-secondary">
                    UCI: {line.pv.join(' ')}
                  </p>
                  <p className="mt-1 text-xs text-tertiary">
                    {new Date(line.analysedAt).toLocaleString()} · {line.nodes} nodes ·{' '}
                    {line.timeMs} ms · job {line.jobId}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

function StructureGames({ identity }: { readonly identity: PositionIdentity }) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const matches = useQuery({
    queryKey: ['position-page', identity.key, 'structure-games'],
    queryFn: async () =>
      (await getRepositories()).games.searchStructures(
        positionStructureQuery(identity, 'pawn-skeleton'),
      ),
    retry: false,
  });
  const rows = (matches.data ?? []).filter((row) => !row.exactPosition);
  return (
    <section className={sectionClass}>
      <h2 className={headingClass}>Same pawns in local games</h2>
      <p className="mb-3 text-xs text-secondary">
        Different positions with the same pawn skeleton, among the first 100 indexed matches. These
        are local main lines, not a merged reference population.
      </p>
      {matches.isPending ? (
        <p role="status">Finding structures…</p>
      ) : matches.isError ? (
        <Failure error={matches.error} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-secondary">
          No different position in these results has the same pawns.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.position.id}>
              <button
                type="button"
                className={rowClass}
                onClick={() =>
                  void openStoredGame(row.game.id, { ply: Math.max(0, row.position.ply - 1) })
                    .then(() => router.push('/analysis'))
                    .catch((error: unknown) =>
                      notify({
                        tone: 'error',
                        message:
                          error instanceof Error ? error.message : 'This game could not be opened.',
                      }),
                    )
                }
              >
                <span className="block text-primary">
                  {row.game.white} – {row.game.black} · {row.game.result}
                </span>
                <span className="mt-1 block text-xs text-secondary">
                  {row.game.event} · before {row.position.moveSan}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
