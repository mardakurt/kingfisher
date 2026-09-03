'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { createTree } from '@/chess/tree/tree';
import type { Fen, San } from '@/chess/types';
import { Database, Search } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import {
  useProfile,
  useRepertoire,
  useRepertoires,
  useTrainingItems,
} from '@/features/persistence/queries';
import type { GameResult } from '@/database/types';
import { getRepositories } from '@/persistence/repositories';
import type { GameRecord, GameSearchQuery } from '@/persistence/types';
import {
  buildOpeningTree,
  buildPlayerProfile,
  buildPreparationPriorities,
  compareWithRepertoire,
  type OpeningTree,
  type PlayerProfile,
  type PreparationEdge,
  type PreparationPriority,
} from '@/preparation';
import { useAnalysis } from '@/stores/analysis-store';
import { NavButton } from '@/features/shell/NavButton';
import { CanonicalBoardSurface } from '@/features/workspace/CanonicalBoardSurface';
import { WorkspaceToolDock } from '@/features/workspace/WorkspaceToolDock';
import { positionKey } from '@/chess/fen';
import { playerKey } from '@/persistence/schema/migrations';
import { Dialog } from '@/components/ui/Dialog';
import { useUi } from '@/stores/ui-store';
import { DossierPanel } from './DossierPanel';
import { GameDaySheet } from './GameDaySheet';
import { SessionBar } from './SessionBar';
import { sheetToMarkdown, sheetToPgn, sheetToPrintableHtml } from './sheet-export';
import { invalidatePreparation, usePreparationSession, usePreparationSessions } from './queries';
import { useQueryClient } from '@tanstack/react-query';

const RESULTS: readonly { id: GameResult | 'any'; label: string }[] = [
  { id: 'any', label: 'Any result' },
  { id: '1-0', label: '1-0' },
  { id: '1/2-1/2', label: '½-½' },
  { id: '0-1', label: '0-1' },
];

interface PreparationData {
  readonly games: readonly GameRecord[];
  readonly profile: PlayerProfile;
  readonly tree: OpeningTree;
  /** Matching games in the database, where that was cheap to know. */
  readonly total: number | null;
}

export function PreparationWorkspace({ initialPlayer = '' }: { readonly initialPlayer?: string }) {
  const router = useRouter();
  const openDocument = useAnalysis((state) => state.openDocument);
  const profile = useProfile();
  const repertoires = useRepertoires().data ?? [];
  const [player, setPlayer] = useState(initialPlayer);
  const [submitted, setSubmitted] = useState(initialPlayer);
  const [side, setSide] = useState<'any' | 'w' | 'b'>('any');
  const [fromYear, setFromYear] = useState('');
  const [toYear, setToYear] = useState('');
  const [minRating, setMinRating] = useState('');
  const [eco, setEco] = useState('');
  const [result, setResult] = useState<GameResult | 'any'>('any');
  const [recentN, setRecentN] = useState('200');
  const [currentKey, setCurrentKey] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  /** The moves walked to reach the current node, so a card prints as a line. */
  const [line, setLine] = useState<San[]>([]);
  const [repertoireId, setRepertoireId] = useState('');
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sessions = usePreparationSessions().data ?? [];
  const session = usePreparationSession(sessionId).data ?? null;

  const query = useMemo<GameSearchQuery>(
    () => ({
      player: submitted,
      ...(side !== 'any' ? { playerColor: side } : {}),
      ...(Number(fromYear) ? { fromYear: Number(fromYear) } : {}),
      ...(Number(toYear) ? { toYear: Number(toYear) } : {}),
      ...(Number(minRating) ? { minRating: Number(minRating) } : {}),
      ...(eco.trim() ? { eco: eco.trim() } : {}),
      ...(result !== 'any' ? { result } : {}),
      sortBy: 'date',
      sortDirection: 'desc',
      limit: Math.min(1000, Math.max(1, Number(recentN) || 200)),
      // The report says "N of M games"; that M is worth one count.
      exactTotal: true,
    }),
    [submitted, side, fromYear, toYear, minRating, eco, result, recentN],
  );

  const preparation = useQuery<PreparationData>({
    queryKey: ['preparation', query],
    enabled: Boolean(submitted),
    retry: false,
    queryFn: async () => {
      const repositories = await getRepositories();
      const summaries = await repositories.games.search(query);
      const games = await repositories.games.getMany(summaries.games.map((game) => game.id));
      return {
        games,
        profile: buildPlayerProfile(games, [submitted]),
        tree: buildOpeningTree(games, [submitted], {
          ...(side !== 'any' ? { playerColor: side } : {}),
        }),
        total: summaries.total,
      };
    },
  });

  const effectiveKey = currentKey || preparation.data?.tree.rootKey || '';
  const node =
    preparation.data?.tree.nodes.get(effectiveKey) ??
    preparation.data?.tree.nodes.get(preparation.data.tree.rootKey);
  const matchingRepertoires = repertoires.filter((entry) =>
    side === 'w' ? entry.color === 'b' : side === 'b' ? entry.color === 'w' : true,
  );
  const effectiveRepertoireId = repertoireId || matchingRepertoires[0]?.id || null;
  const repertoire = useRepertoire(effectiveRepertoireId);
  const training = useTrainingItems();
  const modelGames = useQuery({
    queryKey: ['persistence', 'model-games', 'all'],
    queryFn: async () => (await getRepositories()).modelGames.list(),
    staleTime: 0,
    retry: false,
  });
  const comparison = compareWithRepertoire(node, repertoire.data?.positions ?? []);
  const priorities = buildPreparationPriorities(
    node,
    repertoire.data?.positions ?? [],
    modelGames.data ?? [],
    training.data ?? [],
  );
  /**
   * Which colour the *opponent* has.
   *
   * A session states the user's colour, which settles it. Without one, the
   * side filter is the only signal, and 'any' means the dossier has to pick
   * something — White, stated rather than silently assumed.
   */
  const opponentColor: 'w' | 'b' = session
    ? session.myColor === 'w'
      ? 'b'
      : 'w'
    : side === 'b'
      ? 'b'
      : 'w';

  const syncedPosition = useRef<string | null>(null);

  useEffect(() => {
    if (!node) return;
    const key = `${submitted}:${effectiveKey}`;
    if (syncedPosition.current === key) return;
    syncedPosition.current = key;
    openDocument({
      tree: createTree(node.fen, { Event: `Preparation · ${submitted}`, Result: '*' }),
      document: {
        kind: 'untitled',
        title: submitted ? `Preparation · ${submitted}` : 'Opponent preparation',
      },
      orientation: side === 'b' ? 'b' : 'w',
    });
  }, [effectiveKey, node, openDocument, side, submitted]);

  /**
   * Take an observed continuation to the board so a reply can be prepared.
   *
   * Preparation that only names a gap leaves the user to find the position
   * again by hand, which is where preparation sessions die. The gap and the
   * board where its answer is written are one click apart.
   */
  /**
   * Add the position on the board to the game-day sheet.
   *
   * The line is taken from the route walked through the opening tree, so the
   * card prints as a line rather than as a bare FEN — which is the difference
   * between a sheet that can be read away from the machine and one that
   * cannot.
   */
  const addToSheet = async (fen: Fen, line: readonly San[], why?: string) => {
    if (!session) return;
    try {
      const repositories = await getRepositories();
      await repositories.preparation.addSheetCard(session.id, session.revision, {
        positionKey: positionKey(fen),
        fen,
        line,
        ...(why ? { why } : {}),
        source: 'explorer',
      });
      invalidatePreparation(client);
      notify({ tone: 'success', message: 'Added to the game-day sheet.' });
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not add that position.',
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const isFavorite = (profile.data?.favoritePlayers ?? []).some(
    (entry) => entry.key === playerKey(submitted),
  );

  const toggleFavorite = async () => {
    if (!submitted.trim()) return;
    const repositories = await getRepositories();
    if (isFavorite) await repositories.profile.removeFavoritePlayer(playerKey(submitted));
    else await repositories.profile.addFavoritePlayer(submitted);
    void client.invalidateQueries({ queryKey: ['persistence', 'profile'] });
  };

  const createSession = async (
    input: Parameters<Awaited<ReturnType<typeof getRepositories>>['preparation']['create']>[0],
  ) => {
    const repositories = await getRepositories();
    const created = await repositories.preparation.create(input);
    invalidatePreparation(client);
    setSessionId(created.id);
    // The session names the opponent; searching for them is what comes next.
    if (created.opponent) {
      setPlayer(created.opponent);
      setSubmitted(created.opponent);
      setCurrentKey('');
      setHistory([]);
      setLine([]);
    }
  };

  /** Sheet edits, each retrying once against the stored revision. */
  const withSession = async (
    change: (
      repositories: Awaited<ReturnType<typeof getRepositories>>,
      current: NonNullable<typeof session>,
    ) => Promise<unknown>,
  ) => {
    if (!session) return;
    const repositories = await getRepositories();
    const attempt = async () => {
      const current = await repositories.preparation.get(session.id);
      if (!current) throw new Error('That preparation session no longer exists.');
      await change(repositories, current);
    };
    try {
      await attempt();
    } catch (error) {
      // A second panel of the same workspace legitimately races this one.
      // A genuine cross-tab conflict fails the retry too and surfaces below.
      if (error instanceof Error && error.name.startsWith('Stale')) {
        try {
          await attempt();
        } catch (retried) {
          notify({
            tone: 'error',
            message: 'Could not update the sheet.',
            detail: retried instanceof Error ? retried.message : undefined,
          });
        }
      } else {
        notify({
          tone: 'error',
          message: 'Could not update the sheet.',
          detail: error instanceof Error ? error.message : undefined,
        });
      }
    }
    invalidatePreparation(client);
  };

  const editCard = (
    cardId: string,
    change: Parameters<
      Awaited<ReturnType<typeof getRepositories>>['preparation']['updateSheetCard']
    >[3],
  ) =>
    withSession((repositories, current) =>
      repositories.preparation.updateSheetCard(current.id, current.revision, cardId, change),
    );

  const removeCard = (cardId: string) =>
    withSession((repositories, current) =>
      repositories.preparation.removeSheetCard(current.id, current.revision, cardId),
    );

  const moveCard = (cardId: string, toIndex: number) =>
    withSession((repositories, current) =>
      repositories.preparation.moveSheetCard(current.id, current.revision, cardId, toIndex),
    );

  /**
   * Open the sheet as a printable page.
   *
   * A new window rather than a download: the player almost always wants the
   * print dialog, and a file in Downloads is one more step at the moment they
   * have the least patience for one. The markdown and PGN forms are offered
   * from the same page as copyable text.
   */
  const printSheet = (current: NonNullable<typeof session>) => {
    const html = sheetToPrintableHtml(current);
    const target = window.open('', '_blank', 'noopener,noreferrer');
    if (!target) {
      notify({
        tone: 'error',
        message: 'The browser blocked the print window.',
        detail: 'Allow pop-ups for Kingfisher, or copy the sheet as Markdown instead.',
      });
      return;
    }
    target.document.write(html);
    target.document.close();
  };

  const copySheet = async (current: NonNullable<typeof session>, format: 'markdown' | 'pgn') => {
    const text = format === 'markdown' ? sheetToMarkdown(current) : sheetToPgn(current);
    try {
      await navigator.clipboard.writeText(text);
      notify({ tone: 'success', message: `Sheet copied as ${format}.` });
    } catch {
      notify({ tone: 'error', message: 'Could not reach the clipboard.' });
    }
  };

  const prepareReply = (fen: Fen, label: string) => {
    openDocument({
      tree: createTree(fen, { Event: label, Result: '*' }),
      document: { kind: 'untitled', title: label },
    });
    router.push('/analysis');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="density-row flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-1 px-2 sm:px-3">
        <NavButton />
        <Database className="h-4 w-4 text-accent" />
        <h1 className="text-xs font-semibold text-primary">Opponent preparation</h1>
        <form
          className="ml-1 flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(player.trim());
            setCurrentKey('');
            setHistory([]);
            setLine([]);
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1.5 left-2 h-3.5 w-3.5 text-tertiary" />
            <input
              value={player}
              onChange={(event) => setPlayer(event.target.value)}
              aria-label="Player name"
              placeholder="Exact player name…"
              className="h-7 w-full rounded-[4px] border border-line bg-surface-inset pr-2 pl-7 text-2xs text-primary outline-none placeholder:text-tertiary/70 focus:border-accent/60"
            />
          </div>
          <Button variant="accent" type="submit" disabled={!player.trim()}>
            Prepare
          </Button>
          {/*
            Favourites, where they get used. A coach preparing five students,
            or a player facing the same three opponents all season, should not
            retype a name they have typed forty times.
          */}
          {(profile.data?.favoritePlayers?.length ?? 0) > 0 ? (
            <select
              aria-label="Favourite players"
              value=""
              onChange={(event) => {
                const chosen = event.target.value;
                if (!chosen) return;
                setPlayer(chosen);
                setSubmitted(chosen);
                setCurrentKey('');
                setHistory([]);
                setLine([]);
              }}
              className="h-7 max-w-[18ch] rounded-[4px] border border-line bg-surface-inset px-1.5 text-2xs text-primary"
            >
              <option value="">Favourites…</option>
              {profile.data?.favoritePlayers?.map((entry) => (
                <option key={entry.key} value={entry.name}>
                  {entry.name}
                </option>
              ))}
            </select>
          ) : null}
          {submitted ? (
            <Button
              title={
                isFavorite ? 'Remove from favourites' : 'Keep this opponent one keystroke away'
              }
              onClick={() => void toggleFavorite()}
            >
              {isFavorite ? 'Favourited' : 'Favourite'}
            </Button>
          ) : null}
          {profile.data?.aliases.length ? (
            <Button
              title="Report on your own games, using the aliases in Settings → Profile"
              onClick={() => {
                const alias = profile.data?.aliases[0] ?? '';
                setPlayer(alias);
                setSubmitted(alias);
                setCurrentKey('');
                setHistory([]);
                setLine([]);
              }}
            >
              My games
            </Button>
          ) : null}
        </form>
      </header>

      <SessionBar
        sessions={sessions}
        active={session}
        onSelect={setSessionId}
        onCreate={(input) => void createSession(input)}
        onOpenSheet={() => setSheetOpen(true)}
        sheetCount={session?.sheet.length ?? 0}
      />

      <FilterBar
        side={side}
        setSide={setSide}
        fromYear={fromYear}
        setFromYear={setFromYear}
        toYear={toYear}
        setToYear={setToYear}
        minRating={minRating}
        setMinRating={setMinRating}
        eco={eco}
        setEco={setEco}
        result={result}
        setResult={setResult}
        recentN={recentN}
        setRecentN={setRecentN}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto wide:flex-row wide:overflow-hidden">
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 md:max-panes:grid-cols-[280px_minmax(360px,1fr)] wide:grid-cols-[280px_minmax(360px,1fr)]">
          <Panel className="min-h-[200px] border-b border-line-subtle md:min-h-0 md:border-r md:border-b-0">
            <PanelHeader>Player profile</PanelHeader>
            <PanelBody>
              {!submitted ? (
                <EmptyState
                  title="Search an opponent."
                  description="Names match by normalized case and whitespace only. Add aliases explicitly when needed."
                />
              ) : preparation.isPending ? (
                <p className="px-3 py-5 text-2xs text-tertiary">Building the local report…</p>
              ) : preparation.isError ? (
                <EmptyState title="Preparation failed." description={preparation.error.message} />
              ) : preparation.data?.profile.games === 0 ? (
                <EmptyState
                  title="No matching local games."
                  description="Check the exact spelling or import more games."
                />
              ) : (
                <ProfilePanel profile={preparation.data!.profile} total={preparation.data!.total} />
              )}
            </PanelBody>
          </Panel>

          <section className="flex min-h-[500px] min-w-0 flex-col px-3 py-3 sm:px-5 sm:py-4 md:min-h-0">
            {node ? (
              <>
                <CanonicalBoardSurface
                  mode="interactive"
                  className="min-h-0 flex-1"
                  showContext={false}
                />
                <div className="mx-auto mt-3 flex w-full max-w-[660px] items-center border-t border-line-subtle pt-2">
                  <Button
                    disabled={history.length === 0}
                    onClick={() => {
                      const previous = history.at(-1);
                      if (!previous) return;
                      setHistory((items) => items.slice(0, -1));
                      setCurrentKey(previous);
                      setLine((moves) => moves.slice(0, -1));
                    }}
                  >
                    Back
                  </Button>
                  <span className="ml-2 text-2xs text-tertiary tabular">
                    {node.games} observed games at this position
                  </span>
                  {session ? (
                    <Button
                      className="ml-auto"
                      onClick={() =>
                        void addToSheet(
                          node.fen,
                          line,
                          `${node.games} games here in the selected set`,
                        )
                      }
                    >
                      Add to sheet
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyState
                title="No opening tree yet."
                description="Run a player search to build one from local games."
              />
            )}
          </section>
        </div>
        {sheetOpen && session ? (
          <Dialog
            open
            title="Game-day sheet"
            description={`${session.title}${session.opponent ? ` · vs ${session.opponent}` : ''}`}
            width="w-[640px]"
            onClose={() => setSheetOpen(false)}
          >
            <div className="max-h-[70vh] overflow-y-auto">
              <GameDaySheet
                session={session}
                onOpen={(card) => {
                  openDocument({
                    tree: createTree(card.fen, { Event: session.title, Result: '*' }),
                    document: { kind: 'untitled', title: session.title },
                    orientation: session.myColor,
                  });
                  router.push('/analysis');
                }}
                onEdit={(cardId, change) => void editCard(cardId, change)}
                onRemove={(cardId) => void removeCard(cardId)}
                onMove={(cardId, toIndex) => void moveCard(cardId, toIndex)}
                onPrint={() => printSheet(session)}
              />
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line-subtle px-2.5 py-2">
                <span className="text-[10px] text-tertiary">Also copy as</span>
                <Button onClick={() => void copySheet(session, 'markdown')}>Markdown</Button>
                <Button onClick={() => void copySheet(session, 'pgn')}>PGN</Button>
              </div>
            </div>
          </Dialog>
        ) : null}

        <WorkspaceToolDock
          workspace="preparation"
          contextLabel="Opening tree"
          contextPanel={
            <Panel className="h-full">
              <PanelHeader
                actions={
                  matchingRepertoires.length ? (
                    <select
                      aria-label="Compare repertoire"
                      value={effectiveRepertoireId ?? ''}
                      onChange={(event) => setRepertoireId(event.target.value)}
                      className="h-6 max-w-40 rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10px] normal-case tracking-normal text-secondary"
                    >
                      {matchingRepertoires.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.title}
                        </option>
                      ))}
                    </select>
                  ) : null
                }
              >
                Opening tree
              </PanelHeader>
              <PanelBody>
                {node ? (
                  <MoveTable
                    node={node}
                    preparedKeys={new Set(comparison.prepared.map((edge) => edge.resultingKey))}
                    onSelect={(key, san) => {
                      setHistory((items) => [...items, effectiveKey]);
                      setCurrentKey(key);
                      if (san) setLine((moves) => [...moves, san]);
                    }}
                    onPrepare={(edge) =>
                      prepareReply(edge.resultingFen, `After ${submitted} plays ${edge.san}`)
                    }
                  />
                ) : null}
                {node && effectiveRepertoireId ? (
                  <section className="border-t border-line-subtle px-3 py-3">
                    <h2 className="text-[10px] uppercase tracking-wide text-tertiary">
                      Repertoire comparison
                    </h2>
                    <p className="mt-1 text-[11.5px] text-secondary">
                      {comparison.prepared.length} observed continuation
                      {comparison.prepared.length === 1 ? '' : 's'} prepared ·{' '}
                      {comparison.gaps.length} gap{comparison.gaps.length === 1 ? '' : 's'}
                    </p>
                    {comparison.gaps.slice(0, 5).map((edge) => (
                      <button
                        key={edge.uci}
                        type="button"
                        onClick={() =>
                          prepareReply(edge.resultingFen, `After ${submitted} plays ${edge.san}`)
                        }
                        className="mt-1 block w-full text-left text-2xs text-tertiary hover:text-accent"
                      >
                        {edge.san} · {edge.games} games · no prepared reply — prepare one
                      </button>
                    ))}
                  </section>
                ) : null}
                {submitted && preparation.data ? (
                  <DossierPanel
                    name={submitted}
                    games={preparation.data.games}
                    color={opponentColor}
                  />
                ) : null}
                {node ? (
                  <PriorityQueue
                    priorities={priorities}
                    onPrepare={(edge) =>
                      prepareReply(edge.resultingFen, `After ${submitted} plays ${edge.san}`)
                    }
                  />
                ) : null}
              </PanelBody>
            </Panel>
          }
        />
      </div>
    </div>
  );
}

function PriorityQueue({
  priorities,
  onPrepare,
}: {
  readonly priorities: readonly PreparationPriority[];
  readonly onPrepare: (edge: PreparationEdge) => void;
}) {
  return (
    <section className="border-t border-line-subtle px-3 py-3">
      <h2 className="text-[10px] uppercase tracking-wide text-tertiary">Preparation priorities</h2>
      <p className="mt-1 text-[10px] text-tertiary">
        Ordered by missing response, recent growth, then local frequency. No hidden score.
      </p>
      {priorities.slice(0, 8).map((priority) => (
        <article
          key={priority.edge.uci}
          className="mt-2 rounded-[4px] border border-line-subtle bg-surface-2 px-2 py-2"
        >
          <div className="flex items-center gap-2 text-2xs">
            <strong className="text-primary">{priority.edge.san}</strong>
            <span className="text-tertiary tabular">
              Local {priority.edge.frequency}% · recent {priority.edge.recentFrequency}%
            </span>
            <span className="ml-auto text-tertiary">
              {priority.prepared ? 'Prepared' : 'No response'}
            </span>
          </div>
          <p className="mt-1 text-[10.5px] text-secondary">{priority.reasons.join(' ')}</p>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-tertiary">
            <span>{priority.edge.games} opponent games</span>
            <span>{priority.modelGames} model games</span>
            <span>{priority.trainingItems} training</span>
            {priority.lastReviewedAt ? (
              <span>Reviewed {new Date(priority.lastReviewedAt).toLocaleDateString()}</span>
            ) : null}
            {!priority.prepared ? (
              <Button className="ml-auto" onClick={() => onPrepare(priority.edge)}>
                Add response
              </Button>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}

function FilterBar(props: {
  readonly side: 'any' | 'w' | 'b';
  readonly setSide: (value: 'any' | 'w' | 'b') => void;
  readonly fromYear: string;
  readonly setFromYear: (value: string) => void;
  readonly toYear: string;
  readonly setToYear: (value: string) => void;
  readonly minRating: string;
  readonly setMinRating: (value: string) => void;
  readonly eco: string;
  readonly setEco: (value: string) => void;
  readonly result: GameResult | 'any';
  readonly setResult: (value: GameResult | 'any') => void;
  readonly recentN: string;
  readonly setRecentN: (value: string) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-line-subtle bg-surface-1 px-2 py-2 sm:px-3">
      <Field label="Opponent side">
        <select
          value={props.side}
          onChange={(e) => props.setSide(e.target.value as 'any' | 'w' | 'b')}
          className={FIELD}
        >
          <option value="any">Either</option>
          <option value="w">White</option>
          <option value="b">Black</option>
        </select>
      </Field>
      <Field label="From">
        <input
          value={props.fromYear}
          onChange={(e) => props.setFromYear(digits(e.target.value, 4))}
          className={FIELD}
          placeholder="2015"
        />
      </Field>
      <Field label="To">
        <input
          value={props.toYear}
          onChange={(e) => props.setToYear(digits(e.target.value, 4))}
          className={FIELD}
          placeholder="2026"
        />
      </Field>
      <Field label="Min Elo">
        <input
          value={props.minRating}
          onChange={(e) => props.setMinRating(digits(e.target.value, 4))}
          className={FIELD}
          placeholder="2200"
        />
      </Field>
      <Field label="ECO">
        <input
          value={props.eco}
          onChange={(e) => props.setEco(e.target.value.toUpperCase().slice(0, 3))}
          className={FIELD}
          placeholder="B90"
        />
      </Field>
      <Field label="Result">
        <select
          value={props.result}
          onChange={(e) => props.setResult(e.target.value as GameResult | 'any')}
          className={FIELD}
        >
          {RESULTS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Recent N">
        <input
          value={props.recentN}
          onChange={(e) => props.setRecentN(digits(e.target.value, 4))}
          className={FIELD}
        />
      </Field>
    </div>
  );
}

function ProfilePanel({
  profile,
  total,
}: {
  readonly profile: PlayerProfile;
  readonly total: number | null;
}) {
  return (
    <div className="divide-y divide-line-subtle">
      <section className="px-3 py-3">
        <h2 className="text-sm font-medium text-primary">{profile.name}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-2xs">
          <dt className="text-tertiary">Games analysed</dt>
          <dd className="text-right text-secondary tabular">
            {profile.games}
            {total !== null && total > profile.games ? ` of ${total}` : ''}
          </dd>
          <dt className="text-tertiary">Average rating</dt>
          <dd className="text-right text-secondary tabular">{profile.averageRating ?? '—'}</dd>
          <dt className="text-tertiary">Date range</dt>
          <dd className="text-right text-secondary tabular">
            {profile.firstYear && profile.lastYear
              ? `${profile.firstYear}–${profile.lastYear}`
              : '—'}
          </dd>
          <dt className="text-tertiary">White / Black</dt>
          <dd className="text-right text-secondary tabular">
            {profile.asWhite} / {profile.asBlack}
          </dd>
          <dt className="text-tertiary">Score</dt>
          <dd className="text-right text-secondary tabular">{profile.score}%</dd>
        </dl>
      </section>
      <section className="px-3 py-3">
        <h3 className="text-[10px] uppercase tracking-wide text-tertiary">Common openings</h3>
        {profile.openings.slice(0, 10).map((opening) => (
          <div key={opening.name} className="mt-1.5 flex items-center gap-2 text-2xs">
            <span className="min-w-0 flex-1 truncate text-secondary">{opening.name}</span>
            <span className="text-tertiary tabular">{opening.games}</span>
            {opening.recentGames ? (
              <span className="text-tertiary tabular">recent {opening.recentGames}</span>
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}

function MoveTable({
  node,
  preparedKeys,
  onSelect,
  onPrepare,
}: {
  readonly node: NonNullable<OpeningTree['nodes'] extends ReadonlyMap<string, infer T> ? T : never>;
  readonly preparedKeys: ReadonlySet<string>;
  readonly onSelect: (key: string, san?: San) => void;
  readonly onPrepare: (edge: PreparationEdge) => void;
}) {
  return (
    /* Six columns in a 390px pane: the table scrolls inside itself rather than
       losing its last column or widening the document. */
    <div className="overflow-x-auto">
      <table className="w-full min-w-[340px] border-collapse text-[10.5px]">
        <thead>
          <tr className="border-b border-line-subtle text-left text-[9.5px] uppercase tracking-wide text-tertiary">
            <th className="px-3 py-1.5 font-medium">Move</th>
            <th className="px-2 py-1.5 text-right font-medium">Games</th>
            <th className="px-2 py-1.5 text-right font-medium">Freq</th>
            <th className="px-2 py-1.5 text-right font-medium">Score</th>
            <th className="px-2 py-1.5 text-right font-medium">Avg Elo</th>
            <th className="px-2 py-1.5 text-right font-medium">Last</th>
            <th className="px-3 py-1.5 font-medium">Reply</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {node.edges.map((edge) => (
            <tr key={edge.uci} className="text-secondary">
              <td className="px-3 py-1.5">
                <button
                  type="button"
                  className="font-medium text-primary hover:text-accent"
                  onClick={() => onSelect(edge.resultingKey, edge.san)}
                >
                  {edge.san}
                </button>
              </td>
              <td className="px-2 py-1.5 text-right tabular">{edge.games}</td>
              <td className="px-2 py-1.5 text-right tabular">{edge.frequency}%</td>
              <td className="px-2 py-1.5 text-right tabular">{edge.playerScore}%</td>
              <td className="px-2 py-1.5 text-right tabular">{edge.averageElo ?? '—'}</td>
              <td className="px-2 py-1.5 text-right tabular">{edge.lastPlayed ?? '—'}</td>
              <td className="px-3 py-1.5">
                {preparedKeys.has(edge.resultingKey) ? (
                  'Prepared'
                ) : (
                  <button
                    type="button"
                    className="text-tertiary hover:text-accent"
                    onClick={() => onPrepare(edge)}
                  >
                    Prepare
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Field = ({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) => (
  <label className="text-[10px] text-tertiary">
    {label}
    {children}
  </label>
);
const FIELD =
  'mt-0.5 block h-7 w-[92px] rounded-[4px] border border-line bg-surface-inset px-2 text-2xs text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60';
const digits = (value: string, length: number) => value.replace(/\D/g, '').slice(0, length);
