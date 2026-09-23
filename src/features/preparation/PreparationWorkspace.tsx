'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { createTree } from '@/chess/tree/tree';
import type { Fen, San } from '@/chess/types';
import { Filter, Target } from '@/components/icons';
import { Popover, PopoverSection, Segmented } from '@/components/ui/Controls';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import type { GameRecord } from '@/persistence/types';
import { useTabTitle } from '@/features/tabs/WorkspaceTabStrip';
import {
  useProfile,
  useRepertoire,
  useRepertoires,
  useTrainingItems,
} from '@/features/persistence/queries';
import type { GameResult } from '@/database/types';
import { getRepositories } from '@/persistence/repositories';
import type { CatalogPlayer } from '@/reference/players';
import {
  buildOpeningTree,
  buildPlayerProfile,
  buildPreparationPriorities,
  compareWithRepertoire,
  type OpeningTree,
  type PlayerProfile,
} from '@/preparation';
import { buildDossier } from '@/preparation/dossier';
import { useAnalysis } from '@/stores/analysis-store';
import { useReferenceSources } from '@/reference/use-references';
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';

import { useSparringOpponent } from './sparring-store';
import { positionKey } from '@/chess/fen';
import { playerKey } from '@/persistence/schema/migrations';
import { Dialog } from '@/components/ui/Dialog';
import { useUi } from '@/stores/ui-store';
import type { RoundBrief } from '@/preparation/brief';

import { BriefDialog } from './BriefDialog';
import { GameDaySheet } from './GameDaySheet';
import { OpponentSearch, type OpponentChoice } from './OpponentSearch';
import { PreparationReport } from './PreparationReport';
import { collectOpponentGames, type OpponentGames, type OpponentQuery } from './opponent-games';
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

interface PreparationData extends OpponentGames {
  readonly profile: PlayerProfile;
  readonly tree: OpeningTree;
}

export function PreparationWorkspace({
  initialPlayer = '',
  initialSide = 'any',
  initialEco = '',
}: {
  readonly initialPlayer?: string;
  readonly initialSide?: 'any' | 'w' | 'b';
  readonly initialEco?: string;
}) {
  const router = useRouter();
  const openDocument = useAnalysis((state) => state.openDocument);
  const profile = useProfile();
  const repertoires = useRepertoires().data ?? [];
  const [player, setPlayer] = useState(initialPlayer);
  const [submitted, setSubmitted] = useState(initialPlayer);
  /** The catalog row behind the name, when it was chosen from the library. */
  const [chosen, setChosen] = useState<CatalogPlayer | null>(null);
  const [side, setSide] = useState<'any' | 'w' | 'b'>(initialSide);
  const [fromYear, setFromYear] = useState('');
  const [toYear, setToYear] = useState('');
  const [minRating, setMinRating] = useState('');
  const [eco, setEco] = useState(initialEco);
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

  const query = useMemo<OpponentQuery>(
    () => ({
      name: submitted,
      player: chosen,
      ...(side !== 'any' ? { side } : {}),
      ...(Number(fromYear) ? { fromYear: Number(fromYear) } : {}),
      ...(Number(toYear) ? { toYear: Number(toYear) } : {}),
      ...(Number(minRating) ? { minRating: Number(minRating) } : {}),
      ...(eco.trim() ? { eco: eco.trim() } : {}),
      ...(result !== 'any' ? { result } : {}),
      limit: Math.min(2000, Math.max(1, Number(recentN) || 200)),
    }),
    [submitted, chosen, side, fromYear, toYear, minRating, eco, result, recentN],
  );
  const references = useReferenceSources();
  const installedSources = references.sources
    .filter((source) => source.installed)
    .map((source) => source.id)
    .join(',');

  const preparation = useQuery<PreparationData>({
    queryKey: ['preparation', query, installedSources],
    enabled: Boolean(submitted),
    retry: false,
    queryFn: async () => {
      const found = await collectOpponentGames(query);
      return {
        ...found,
        profile: buildPlayerProfile(found.games, found.aliases),
        tree: buildOpeningTree(found.games, found.aliases, {
          ...(side !== 'any' ? { playerColor: side } : {}),
        }),
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

  /**
   * The round brief, printed.
   *
   * Assembled from what is already on this screen — the dossier, the
   * surprises, the gaps — plus the journal, and rendered as the same kind of
   * self-contained page a published study is, because it is read in a playing
   * hall. `docs/design/surprise-finder.md`, `src/preparation/brief.ts`.
   */
  const openBrief = async () => {
    if (!session) return;
    const repositories = await getRepositories();
    const journal = await repositories.journal.list();
    const { buildRoundBrief } = await import('@/preparation/brief');
    setBrief(
      buildRoundBrief({
        session,
        ...(preparation.data
          ? {
              dossier: buildDossier(submitted, preparation.data.games, {
                recentFromYear: new Date().getFullYear() - 2,
              }),
            }
          : {}),
        gaps: comparison.gaps,
        journal,
      }),
    );
  };

  const [brief, setBrief] = useState<RoundBrief | null>(null);

  /* The sparring partner plays from exactly the tree on screen. */
  const setSparringOpponent = useSparringOpponent((state) => state.setOpponent);
  useEffect(() => {
    const data = preparation.data;
    if (!submitted || !data) {
      setSparringOpponent(null);
      return;
    }
    setSparringOpponent({
      name: submitted,
      tree: data.tree,
      games: data.games.length,
      sources: data.sources.map((source) => ({ name: source.name, games: source.games })),
    });
    return () => setSparringOpponent(null);
  }, [preparation.data, setSparringOpponent, submitted]);

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
    if (created.opponent) search(created.opponent, null);
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

  const search = (name: string, chosenPlayer: CatalogPlayer | null) => {
    setPlayer(name);
    setSubmitted(name.trim());
    setChosen(chosenPlayer);
    setCurrentKey('');
    setHistory([]);
    setLine([]);
  };

  useTabTitle(submitted ? `Preparation against ${submitted}` : null);

  const openGame = (game: GameRecord) => {
    openDocument({
      tree: game.tree,
      document: {
        kind: 'untitled',
        title: `${game.white} – ${game.black}${game.year ? `, ${game.year}` : ''}`,
      },
      orientation: side === 'b' ? 'w' : 'b',
    });
    router.push('/analysis');
  };

  const report = !submitted ? (
    <PreparationWelcome
      favourites={profile.data?.favoritePlayers ?? []}
      hasAliases={(profile.data?.aliases.length ?? 0) > 0}
      onChoose={(name) => search(name, null)}
      onMine={() => search(profile.data?.aliases[0] ?? '', null)}
    />
  ) : preparation.isPending ? (
    <div className="flex flex-1 items-center justify-center text-xs text-tertiary">
      Reading {submitted}’s games from every source…
    </div>
  ) : preparation.isError ? (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState title="Preparation failed." description={preparation.error.message} />
    </div>
  ) : !preparation.data || preparation.data.profile.games === 0 || !node ? (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        title="No games found."
        description={`Neither your own games nor the installed reference sources hold a game under “${submitted}”. Check the spelling, pick a suggestion, or import games.`}
      />
    </div>
  ) : (
    <PreparationReport
      name={submitted}
      profile={preparation.data.profile}
      games={preparation.data.games}
      aliases={preparation.data.aliases}
      sources={preparation.data.sources}
      localTotal={preparation.data.localTotal}
      tree={preparation.data.tree}
      node={node}
      line={line}
      canGoBack={history.length > 0}
      orientation={side === 'b' ? 'w' : side === 'w' ? 'b' : 'w'}
      opponentColor={opponentColor}
      comparison={comparison}
      priorities={priorities}
      repertoire={repertoire.data?.positions ?? []}
      hasRepertoire={Boolean(effectiveRepertoireId)}
      repertoirePicker={
        matchingRepertoires.length > 1 ? (
          <select
            aria-label="Compare repertoire"
            value={effectiveRepertoireId ?? ''}
            onChange={(event) => setRepertoireId(event.target.value)}
            className="h-6 max-w-40 rounded-[6px] border border-line bg-surface-1 px-1.5 text-[11px] text-secondary"
          >
            {matchingRepertoires.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        ) : null
      }
      sheet={
        session ? (
          <div className="overflow-hidden rounded-[10px] border border-line-subtle">
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
          </div>
        ) : undefined
      }
      onSelectMove={(key, san) => {
        setHistory((items) => [...items, effectiveKey]);
        setCurrentKey(key);
        setLine((moves) => [...moves, san]);
      }}
      onBack={() => {
        const previous = history.at(-1);
        if (previous === undefined) return;
        setHistory((items) => items.slice(0, -1));
        setCurrentKey(previous);
        setLine((moves) => moves.slice(0, -1));
      }}
      onPrepare={(edge) => prepareReply(edge.resultingFen, `After ${submitted} plays ${edge.san}`)}
      onOpenPosition={() =>
        prepareReply(
          node.fen,
          line.length ? `Preparation · ${submitted}` : `Preparation · ${submitted}`,
        )
      }
      onOpenSurprise={(surprise) =>
        prepareReply(surprise.fen, `After ${submitted} plays ${surprise.san}`)
      }
      onOpenGame={openGame}
      {...(session
        ? {
            onAddToSheet: () =>
              void addToSheet(node.fen, line, `${node.games} games here in the selected set`),
          }
        : {})}
    />
  );
  return (
    <WorkspaceFrame
      workspace="preparation"
      title={submitted ? `Preparation against ${submitted}` : 'Preparation'}
      icon={<Target />}
      actions={
        <>
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
                const value = event.target.value;
                if (value) search(value, null);
              }}
              className="h-8 max-w-[18ch] rounded-[7px] border border-line bg-surface-1 px-1.5 text-xs text-primary"
            >
              <option value="">Favourites…</option>
              {profile.data?.favoritePlayers?.map((entry) => (
                <option key={entry.key} value={entry.name}>
                  {entry.name}
                </option>
              ))}
            </select>
          ) : null}
        </>
      }
      routeActions={[
        ...(submitted
          ? [
              {
                id: 'favourite',
                label: isFavorite ? 'Favourited' : 'Favourite',
                title: isFavorite
                  ? 'Remove from favourites'
                  : 'Keep this opponent one keystroke away',
                onClick: () => void toggleFavorite(),
              },
            ]
          : []),
        ...(session
          ? [
              {
                id: 'brief',
                label: 'Round brief…',
                shortLabel: 'Brief',
                title:
                  'One page for the round: what they play, the surprises, where your repertoire stops, and your own last lessons',
                onClick: () => void openBrief(),
              },
            ]
          : []),
        ...(profile.data?.aliases.length
          ? [
              {
                id: 'mine',
                label: 'My games',
                title: 'Report on your own games, using the aliases in Settings → Profile',
                onClick: () => search(profile.data?.aliases[0] ?? '', null),
              },
            ]
          : []),
      ]}
      banner={
        <>
          <PreparationToolbar
            player={player}
            setPlayer={setPlayer}
            onSearch={(choice) => search(choice.name, choice.player)}
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
          <SessionBar
            sessions={sessions}
            active={session}
            onSelect={setSessionId}
            onCreate={(input) => void createSession(input)}
            onOpenSheet={() => setSheetOpen(true)}
            sheetCount={session?.sheet.length ?? 0}
          />
        </>
      }
      takeover={report}
      position={{
        label: submitted ? `Preparation · ${submitted}` : 'Preparation',
        hasSession: session !== null,
        ...(session && node ? { onAddToPreparation: () => void addToSheet(node.fen, line) } : {}),
      }}
    >
      {brief && session ? (
        <BriefDialog brief={brief} orientation={session.myColor} onClose={() => setBrief(null)} />
      ) : null}
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
    </WorkspaceFrame>
  );
}

const YEAR_SPANS: readonly { id: string; label: string; years: number | null }[] = [
  { id: 'all', label: 'All years', years: null },
  { id: '1', label: 'Last 12 months', years: 1 },
  { id: '3', label: 'Last 3 years', years: 3 },
  { id: '5', label: 'Last 5 years', years: 5 },
  { id: '10', label: 'Last 10 years', years: 10 },
];

/**
 * The row under the header: who, when, which colour, and the finer filters.
 *
 * The span and the colour are the two choices made on every visit, so they
 * are one click each; the rest sit behind Filters, with the count of those
 * in force on the button so nothing narrows the report unseen.
 */
function PreparationToolbar(props: {
  readonly player: string;
  readonly setPlayer: (value: string) => void;
  readonly onSearch: (choice: OpponentChoice) => void;
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
  const thisYear = new Date().getFullYear();
  const span =
    props.toYear === ''
      ? (YEAR_SPANS.find((entry) =>
          entry.years === null
            ? props.fromYear === ''
            : props.fromYear === String(thisYear - entry.years + 1),
        )?.id ?? 'custom')
      : 'custom';
  const active = [
    props.minRating,
    props.eco,
    props.result !== 'any' ? props.result : '',
    props.recentN !== '200' ? props.recentN : '',
    span === 'custom' ? 'years' : '',
  ].filter(Boolean).length;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-2 sm:px-4"
      data-preparation-toolbar
    >
      <div className="flex min-w-[260px] max-w-[560px] flex-1">
        <OpponentSearch value={props.player} onChange={props.setPlayer} onSubmit={props.onSearch} />
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <select
          aria-label="Years"
          value={span}
          onChange={(event) => {
            const chosen = YEAR_SPANS.find((entry) => entry.id === event.target.value);
            if (!chosen) return;
            props.setToYear('');
            props.setFromYear(chosen.years === null ? '' : String(thisYear - chosen.years + 1));
          }}
          className="h-8 rounded-[7px] border border-line bg-surface-1 px-2 text-xs text-primary"
        >
          {YEAR_SPANS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
          {span === 'custom' ? <option value="custom">Custom years</option> : null}
        </select>
        <Segmented
          label="Opponent's colour"
          value={props.side === 'any' ? 'any' : props.side}
          onChange={(value) => props.setSide(value)}
          options={[
            { id: 'any', label: 'All' },
            { id: 'w', label: 'White', title: 'Games where the opponent had White' },
            { id: 'b', label: 'Black', title: 'Games where the opponent had Black' },
          ]}
        />
        <Popover
          align="end"
          width={300}
          label="Preparation filters"
          trigger={({ open, toggle, id }) => (
            <Button
              id={id}
              aria-expanded={open}
              aria-haspopup="dialog"
              active={open || active > 0}
              icon={<Filter />}
              onClick={toggle}
            >
              Filters{active ? ` ${active}` : ''}
            </Button>
          )}
        >
          <PopoverSection title="Years" hint="Leave either end open.">
            <div className="flex items-center gap-2">
              <input
                aria-label="From year"
                value={props.fromYear}
                onChange={(e) => props.setFromYear(digits(e.target.value, 4))}
                placeholder="From"
                className={FIELD}
              />
              <span className="text-tertiary">–</span>
              <input
                aria-label="To year"
                value={props.toYear}
                onChange={(e) => props.setToYear(digits(e.target.value, 4))}
                placeholder="To"
                className={FIELD}
              />
            </div>
          </PopoverSection>
          <PopoverSection
            title="Opponent rating"
            hint="Games where the opponent was rated at least this."
          >
            <input
              aria-label="Min Elo"
              value={props.minRating}
              onChange={(e) => props.setMinRating(digits(e.target.value, 4))}
              placeholder="2200"
              className={FIELD}
            />
          </PopoverSection>
          <PopoverSection title="Opening" hint="An ECO code or its first letters: B, B9, B90.">
            <input
              aria-label="ECO"
              value={props.eco}
              onChange={(e) => props.setEco(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="B90"
              className={FIELD}
            />
          </PopoverSection>
          <PopoverSection title="Result">
            <Segmented
              label="Result"
              size="sm"
              value={props.result}
              onChange={props.setResult}
              options={RESULTS.map((entry) => ({
                id: entry.id,
                label: entry.id === 'any' ? 'Any' : entry.label,
              }))}
            />
          </PopoverSection>
          <PopoverSection
            title="Most recent games"
            hint="The report reads at most this many, newest first."
          >
            <input
              aria-label="Recent N"
              value={props.recentN}
              onChange={(e) => props.setRecentN(digits(e.target.value, 4))}
              className={FIELD}
            />
          </PopoverSection>
        </Popover>
      </div>
    </div>
  );
}

/** Before anyone is chosen: what the page is for, and the names already at hand. */
function PreparationWelcome({
  favourites,
  hasAliases,
  onChoose,
  onMine,
}: {
  readonly favourites: readonly { readonly key: string; readonly name: string }[];
  readonly hasAliases: boolean;
  readonly onChoose: (name: string) => void;
  readonly onMine: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      <div className="max-w-[440px] text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-2 text-secondary">
          <Target className="h-6 w-6" />
        </span>
        <h2 className="mt-3 text-base font-semibold text-primary">Prepare for an opponent</h2>
        <p className="mt-1 text-xs leading-relaxed text-secondary">
          Search a name above. The report reads their games from every installed reference source
          and your own collections — what they open with, how they score, and where your repertoire
          has no answer yet.
        </p>
        {favourites.length || hasAliases ? (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {hasAliases ? (
              <Button variant="subtle" onClick={onMine}>
                My games
              </Button>
            ) : null}
            {favourites.slice(0, 8).map((entry) => (
              <Button key={entry.key} variant="subtle" onClick={() => onChoose(entry.name)}>
                {entry.name}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const FIELD =
  'h-7 w-full rounded-[6px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none placeholder:text-tertiary/60 focus:border-accent/60';
const digits = (value: string, length: number) => value.replace(/\D/g, '').slice(0, length);
