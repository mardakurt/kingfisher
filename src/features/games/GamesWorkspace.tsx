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

import { DatabasesPicker, LibraryAcross } from './LibraryAcross';
import { useResearchHistory } from '@/stores/research-history-store';
import { CountryFlag } from '@/features/player/CountryFlag';
import { PlayerPortrait } from '@/features/player/PlayerPortrait';
import { siteLabel } from '@/features/movetree/GameHeaderCard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listCollections } from '@/database/collections/registry';

import { mainlinePath } from '@/chess/tree/tree';

import {
  Board,
  ChevronLeft,
  ChevronRight,
  Close,
  Database,
  Filter,
  Import,
  Library as LibraryIcon,
  Players,
  SkipEnd,
  SkipStart,
  Trash,
} from '@/components/icons';
import { FilterChip, PopoverSection, SearchField, Segmented } from '@/components/ui/Controls';
import { PageHeader } from '@/features/shell/PageHeader';
import { SheetBoard } from '@/features/preparation/SheetBoard';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PromptDialog } from '@/components/ui/PromptDialog';
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
import type { GameId, GameSearchQuery, GameSummary } from '@/persistence/types';
import { openingDisplay } from '@/theory/classify-games';

import {
  librarySource,
  LOCAL_SOURCE,
  openSourceGame,
  queryForSource,
  searchSource,
  sourceTree,
  type LibrarySource,
} from './library-source';
import { BatchDepartureDialog } from './BatchDepartureDialog';
import { CrosstableDialog } from './CrosstableDialog';
import { mergeSelectedGames } from './merge-selected';
import { openInNewTab } from '@/features/tabs/tab-actions';
import { useAnalysis } from '@/stores/analysis-store';
import { useReferenceSources } from '@/reference/use-references';
import { openStoredGame } from './open-game';
import { namesAPlayer, referenceCoverage } from './reference-library';
import { packReader } from '@/reference/manager';
import {
  compileMoves,
  EMPTY_HEADER,
  EMPTY_MOVES,
  FIELD,
  foundAtLabel,
  headerMaskActive,
  headerMaskFrom,
  headerMaskQuery,
  HeaderMaskFields,
  MoveMaskFields,
  useDeepSearch,
  type HeaderMask,
  type MoveMask,
} from './SearchMask';
import type { GameResult } from '@/database/types';
import { useUi } from '@/stores/ui-store';
import {
  recentResearchFilters,
  rememberResearchFilter,
  rememberUsedFilters,
  type ResearchFilter,
} from './research-filters';
import { SAVED_QUERIES_KEY, SavedQueries, saveQuery } from './SavedQueries';
import { filtersFromQuery, queryFromFilters, type GameQuery } from '@/database/query/ast';

type SortField = NonNullable<GameSearchQuery['sortBy']>;

interface ColumnSpec {
  readonly id: string;
  readonly label: string;
  readonly sortable: boolean;
  /** The sort a sortable column applies, when it is not its own id. */
  readonly sort?: SortField;
  readonly className: string;
}

const COLUMNS: readonly ColumnSpec[] = [
  { id: 'white', label: 'White', sortable: true, className: 'w-[19%]' },
  {
    id: 'white-elo',
    label: 'Elo W',
    sortable: true,
    sort: 'rating',
    className: 'w-[64px] text-right',
  },
  { id: 'black', label: 'Black', sortable: true, className: 'w-[19%]' },
  { id: 'black-elo', label: 'Elo B', sortable: false, className: 'w-[64px] text-right' },
  { id: 'result', label: 'Result', sortable: false, className: 'w-[58px] text-center' },
  { id: 'opening', label: 'Opening', sortable: true, className: 'w-[24%]' },
  { id: 'event', label: 'Event', sortable: false, className: 'w-[16%]' },
  { id: 'date', label: 'Date', sortable: true, className: 'w-[96px]' },
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
  const [sourceId, setSourceId] = useState<string>(LOCAL_SOURCE.id);
  const [player, setPlayer] = useState('');
  const [opponent, setOpponent] = useState('');
  const [playerColor, setPlayerColor] = useState<'any' | 'w' | 'b'>('any');
  const [result, setResult] = useState<GameResult | 'any'>('any');
  const [minRating, setMinRating] = useState('');
  const [header, setHeader] = useState<HeaderMask>(EMPTY_HEADER);
  const [moves, setMoves] = useState<MoveMask>(EMPTY_MOVES);
  const searchFromAddress = useRef(false);
  /** Databases searched besides the one in the menu (`?also=`), ChessBase's "Databases 2 of 5". */
  const [also, setAlso] = useState<readonly string[]>([]);
  const [movePage, setMovePage] = useState(0);
  const deep = useDeepSearch();
  const [eco, setEco] = useState('');
  /** An opening family from a database's index (`?opening="…"`); no field of its own. */
  const [opening, setOpening] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('importedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [queryToSave, setQueryToSave] = useState<{ query: GameQuery; source: string } | null>(null);
  const closeFilters = () => {
    setFiltersOpen(false);
    document.getElementById('library-filters-trigger')?.focus();
  };
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmation, setConfirmation] = useState<'selected' | 'all' | null>(null);
  /** The games whose departures are being found (Phase 85), in the list's order. */
  const [departureIds, setDepartureIds] = useState<readonly GameId[] | null>(null);
  const [page, setPage] = useState(0);
  /** The row whose game the preview shows. */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [tournamentOf, setTournamentOf] = useState<GameSummary | null>(null);
  /** The row to bring into view once, after a return restored the preview. */
  const restoreScrollTo = useRef<string | null>(null);
  const wide = useMediaQuery('(min-width: 1024px)');
  const [recentFilters, setRecentFilters] =
    useState<readonly ResearchFilter[]>(recentResearchFilters);

  /*
    The search and the player live in the address as well, so a workspace tab
    that is left and entered again — or a reload — comes back to the same
    list. Read once after mount (the server cannot know the address's query
    without opting the page out of static rendering), written back quietly.
  */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const who = params.get('player');
    const against = params.get('opponent');
    const db = params.get('db');
    /*
      A tournament opened from a database's index: its whole name in quotes
      and its year as a date range (`?event="…"&from=…&to=…`), so the list is
      that edition and nothing that merely shares words with it.
    */
    const event = params.get('event');
    const openingParam = params.get('opening');
    const alsoParam = params.get('also');
    /*
      An annotator, source or team from a database's index. These are read
      from each game's PGN by the move search, so the address fills its
      fields and starts it once, then leaves the address: kept there, a
      reload would quietly run a search of every game again.
    */
    const metadata = {
      title: params.get('title') ?? '',
      annotator: params.get('annotator') ?? '',
      source: params.get('source') ?? '',
      team: params.get('team') ?? '',
    };
    const from = params.get('from');
    const to = params.get('to');
    const pageNumber = Number(params.get('page'));
    const game = params.get('game');
    // The address is outside React and unknown to the server render, so it is
    // read once here; setting state from it is the synchronisation itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q) setText(q);
    if (db) setSourceId(db);
    if (who) setPlayer(who);
    if (against) setOpponent(against);
    if (openingParam) setOpening(openingParam);
    if (alsoParam) setAlso(alsoParam.split(',').filter(Boolean));
    if (metadata.annotator || metadata.source || metadata.team || metadata.title) {
      setMoves({ ...EMPTY_MOVES, ...metadata });
      searchFromAddress.current = true;
      for (const key of ['annotator', 'source', 'team', 'title']) params.delete(key);
      const rest = params.toString();
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${rest ? `?${rest}` : ''}`,
      );
    }
    if (event || from || to)
      setHeader({ ...EMPTY_HEADER, event: event ?? '', fromDate: from ?? '', toDate: to ?? '' });
    /*
      Phase 87: the page and the previewed game as well. Back from a game
      opened on page 2 came to page 1, scrolled to the top, nothing selected
      — the place in the list was lost at exactly the moment a player returns
      to it for the next game.
    */
    if (Number.isInteger(pageNumber) && pageNumber > 1) setPage(pageNumber - 1);
    if (game) {
      setPreviewId(game);
      restoreScrollTo.current = game;
    }
  }, []);
  /** The search on screen, written into a set of address parameters. */
  const withSearch = (params: URLSearchParams): URLSearchParams => {
    const set = (key: string, value: string) =>
      value ? params.set(key, value) : params.delete(key);
    set('q', text.trim());
    set('player', player.trim());
    set('opponent', opponent.trim());
    set('db', sourceId !== LOCAL_SOURCE.id ? sourceId : '');
    set('event', header.event.trim());
    set('opening', opening.trim());
    set('also', also.join(','));
    set('from', header.fromDate);
    set('to', header.toDate);
    return params;
  };
  /**
   * This list's address now, not after the typing debounce: a game opened
   * within 400 ms of typing recorded a way back without the search in it.
   */
  const addressNow = (): string => {
    const params = withSearch(new URLSearchParams(window.location.search));
    if (page > 0) params.set('page', String(page + 1));
    else params.delete('page');
    if (previewId) params.set('game', previewId);
    else params.delete('game');
    const search = params.toString();
    return `${window.location.pathname}${search ? `?${search}` : ''}`;
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const search = withSearch(new URLSearchParams(window.location.search)).toString();
      const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
      if (next !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(window.history.state, '', next);
      }
    }, 400);
    return () => window.clearTimeout(timer);
    // withSearch reads exactly these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    text,
    player,
    opponent,
    sourceId,
    header.event,
    header.fromDate,
    header.toDate,
    opening,
    also,
  ]);
  /*
    The page and the previewed game go into the address at once, not after
    the typing debounce: a click on a row and a double-click to open it come
    well inside 400ms, and the debounce was cancelled by the navigation.
  */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (page > 0) params.set('page', String(page + 1));
    else params.delete('page');
    if (previewId) params.set('game', previewId);
    else params.delete('game');
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [page, previewId]);

  /*
    Phase 84: the database the list shows. My games is the browser's own; a
    companion database is read through the companion with the same query, and
    what it cannot filter by is said, not silently ignored (library-source.ts).
  */
  const collections = useQuery({
    queryKey: ['collections', 'library'],
    retry: false,
    queryFn: () => listCollections(),
  });
  /*
    1.4.4: an installed reference pack is a database the Library can search,
    by player, as ChessBase searches Mega Database (reference-library.ts).
  */
  const references = useReferenceSources();
  const referencePacks = references.sources.filter(
    (entry) => entry.installed && entry.state === 'ready' && entry.capabilities.includes('games'),
  );
  const sourceFacts = collections.data?.find((entry) => entry.id === sourceId);
  const referenceFacts = referencePacks.find((entry) => `reference:${entry.id}` === sourceId);
  const source: LibrarySource =
    sourceId === LOCAL_SOURCE.id
      ? LOCAL_SOURCE
      : librarySource(sourceId, sourceFacts?.name ?? referenceFacts?.name);
  const local = source.kind === 'local';

  const query = useMemo<GameSearchQuery>(
    () => ({
      ...(text.trim() ? { text: text.trim() } : {}),
      ...(player.trim() ? { player: player.trim() } : {}),
      ...(playerColor !== 'any' ? { playerColor } : {}),
      ...(opponent.trim() ? { opponent: opponent.trim() } : {}),
      ...(result !== 'any' ? { result } : {}),
      ...(Number(minRating) > 0 ? { minRating: Number(minRating) } : {}),
      ...headerMaskQuery(header, minRating),
      ...(eco.trim() ? { eco: eco.trim() } : {}),
      ...(opening.trim() ? { opening: opening.trim() } : {}),
      sortBy,
      sortDirection,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [
      text,
      player,
      playerColor,
      opponent,
      result,
      minRating,
      header,
      eco,
      opening,
      sortBy,
      sortDirection,
      page,
    ],
  );

  const compiledMoves = useMemo(() => compileMoves(moves), [moves]);
  // Several databases: the one in the menu and the others ticked beside it.
  const across =
    source.kind === 'reference' || also.length === 0
      ? []
      : [source.id, ...also.filter((id) => id !== source.id)];
  // The header half of the query, without paging: what a move search reads.
  const headerOnly = useMemo(() => {
    const { limit: _limit, offset: _offset, ...rest } = query;
    return rest;
  }, [query]);
  /*
    A move search answers the filters it was started with. Changing any of
    them makes its rows an answer to a different question, so they go rather
    than stay on screen looking current.
  */
  const searchKey = JSON.stringify([source.id, headerOnly, moves]);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
  const stale = answeredKey !== searchKey;
  const stopDeep = deep.stop;
  // A search still reading for filters that have since changed is stopped.
  useEffect(() => {
    if (stale) stopDeep();
  }, [stale, stopDeep]);
  const startMoveSearch = () => {
    setAnsweredKey(searchKey);
    setMovePage(0);
    void deep.start(headerOnly, compiledMoves.query, source);
  };
  // The search an index row asked for, once its fields are in place.
  useEffect(() => {
    if (!searchFromAddress.current) return;
    if (!moves.annotator && !moves.source && !moves.team && !moves.title) return;
    searchFromAddress.current = false;
    // The request came from the address, outside React; starting it is the sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startMoveSearch();
    // Once, when the address's fields have arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves]);

  const localGames = useGames(query, local);
  const sourceGames = useQuery({
    queryKey: ['library', 'source', source.id, query],
    // A pack restored from the address is asked once it is loaded, not before.
    enabled: !local && (source.kind !== 'reference' || referenceFacts !== undefined),
    retry: false,
    queryFn: ({ signal }) => searchSource(source, query, signal),
  });
  const games = local ? localGames : sourceGames;
  const dropped = queryForSource(query, source).dropped;
  const total = useGameCount();

  const deleteGames = useRepositoryMutation(
    (repositories, input: { ids: readonly string[] }) => repositories.games.deleteMany(input.ids),
    (client) => invalidateGames(client),
  );

  const clearAll = useRepositoryMutation<void, void>(
    (repositories) => repositories.games.clear(),
    (client) => invalidateGames(client),
  );

  const moveState = stale ? null : deep.state;
  const moveRows = useMemo(() => moveState?.matches ?? [], [moveState]);
  const foundAt = useMemo(
    () => new Map(moveRows.map((match) => [match.game.id, match.hit.ply])),
    [moveRows],
  );
  const rows = moveState
    ? moveRows.slice(movePage * PAGE_SIZE, (movePage + 1) * PAGE_SIZE).map((match) => match.game)
    : (games.data?.games ?? []);
  /*
    `total` is null when counting would have cost a full scan (ADR 0014), so
    the footer says what it knows: an exact count where there is one, and a
    range plus a working Next button where there is not.
  */
  const filtered = games.data?.total ?? null;
  const hasMore = games.data?.hasMore ?? false;
  const stored = local
    ? (total.data ?? 0)
    : (sourceFacts?.games ??
      referenceFacts?.openableCount ??
      referenceFacts?.gameCount ??
      games.data?.total ??
      0);
  // A reference pack lists games only for someone named (reference-library.ts).
  const needsPlayer = source.kind === 'reference' && !namesAPlayer(query);
  const coverage = useQuery({
    queryKey: [
      'library',
      'reference-coverage',
      source.id,
      query.player,
      query.opponent,
      query.text,
    ],
    enabled: source.kind === 'reference' && !needsPlayer && referenceFacts !== undefined,
    retry: false,
    queryFn: async () => {
      const reader = source.kind === 'reference' ? packReader(source.packId) : undefined;
      return reader ? referenceCoverage(reader, query) : [];
    },
  });
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
  const open = async (
    game: GameSummary,
    destination: '/analysis' | '/review' = '/analysis',
    at?: number,
  ) => {
    try {
      /*
        The move the preview was stepped to, when it was (Phase 87: the board
        opened at move one after the player had found the moment they wanted);
        otherwise a move-search row opens at the moment it was found.
      */
      const ply = at ?? foundAt.get(game.id);
      if (local) {
        if (!(await openStoredGame(game.id, ply === undefined ? {} : { ply }))) return;
      } else {
        if (!(await openSourceGame(source, game, ply === undefined ? {} : { ply }))) return;
      }
      /*
        "← Back to the Library", as ChessBase heads an opened game with
        "‹ Library": the address holds the search, the page and the previewed
        game, so going back is this exact list, with this game selected.
      */
      useResearchHistory.getState().push({
        href: addressNow(),
        label: text.trim() ? `the Library: “${text.trim()}”` : `the Library: ${source.name}`,
      });
      router.push(destination);
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  };

  const filtersActive =
    Boolean(player || opponent || minRating || eco || opening) ||
    playerColor !== 'any' ||
    result !== 'any' ||
    headerMaskActive(header);

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
    setOpponent(values.opponent ?? '');
    setPlayerColor(values.playerColor ?? 'any');
    setResult(values.result ?? 'any');
    setMinRating(values.minRating?.toString() ?? '');
    setHeader(headerMaskFrom(values));
    setEco(values.eco ?? '');
    setSortBy(values.sortBy ?? 'importedAt');
    setSortDirection(values.sortDirection ?? 'desc');
    setPage(0);
    setFiltersOpen(true);
    setRecentFilters(rememberResearchFilter(filter));
  };

  /*
    Phase 86: the whole question — header filters and the move mask — as one
    query, in a store every backup carries. The saved filters before it kept
    only the header half, in localStorage, which no backup read.
  */
  const queryClient = useQueryClient();
  const saveCurrent = () => {
    if (
      compiledMoves.errors.material ||
      compiledMoves.errors.route ||
      compiledMoves.errors.position
    ) {
      notify({ tone: 'error', message: 'Correct the move filters before saving the query.' });
      return;
    }
    setQueryToSave({
      query: queryFromFilters(headerOnly, compiledMoves.query),
      source: local ? 'local' : source.id,
    });
  };

  const applyQuery = (saved: GameQuery) => {
    const fields = filtersFromQuery(saved);
    if (!fields) return;
    applyFilter({
      id: 'saved-query',
      name: 'Saved query',
      source: 'local-collection',
      filters: fields.header,
      usedAt: Date.now(),
    });
    setMoves({
      material: fields.moves.material?.text ?? '',
      materialColour: fields.moves.material?.colour ?? 'either',
      theme: fields.moves.theme ?? '',
      route: fields.moves.route?.text ?? '',
      routeColour: fields.moves.route?.colour ?? 'either',
      comment: fields.moves.comment ?? '',
      title: fields.moves.metadata?.title ?? '',
      annotator: fields.moves.metadata?.annotator ?? '',
      source: fields.moves.metadata?.source ?? '',
      team: fields.moves.metadata?.team ?? '',
      position: fields.moves.position ?? '',
      annotations: fields.moves.annotations ?? 'any',
    });
  };

  const clearFilters = () => {
    setPlayer('');
    setOpponent('');
    setPlayerColor('any');
    setResult('any');
    setMinRating('');
    setOpening('');
    setHeader(EMPTY_HEADER);
    setMoves(EMPTY_MOVES);
    setEco('');
    setPage(0);
  };

  /*
    Every filter in force, named and removable in one row under the search —
    so nothing narrows the list unseen, and taking one away is one click.
  */
  const chips: { id: string; name: string; value: string; remove: () => void }[] = [
    ...(player.trim()
      ? [{ id: 'player', name: 'Player', value: player.trim(), remove: () => setPlayer('') }]
      : []),
    ...(opponent.trim()
      ? [
          {
            id: 'opponent',
            name: 'Opponent',
            value: opponent.trim(),
            remove: () => setOpponent(''),
          },
        ]
      : []),
    ...(playerColor !== 'any'
      ? [
          {
            id: 'colour',
            name: 'Colour',
            value: playerColor === 'w' ? 'White' : 'Black',
            remove: () => setPlayerColor('any'),
          },
        ]
      : []),
    ...(result !== 'any'
      ? [
          {
            id: 'result',
            name: 'Result',
            value: RESULTS.find((entry) => entry.id === result)?.label ?? result,
            remove: () => setResult('any'),
          },
        ]
      : []),
    ...(minRating
      ? [{ id: 'elo', name: 'Min Elo', value: minRating, remove: () => setMinRating('') }]
      : []),
    ...(eco.trim() ? [{ id: 'eco', name: 'ECO', value: eco, remove: () => setEco('') }] : []),
    ...(opening.trim()
      ? [{ id: 'opening', name: 'Opening', value: opening, remove: () => setOpening('') }]
      : []),
    ...(header.event.trim()
      ? [
          {
            id: 'event',
            name: 'Event',
            value: header.event.trim(),
            remove: () => setHeader({ ...header, event: '' }),
          },
        ]
      : []),
    ...(header.site.trim()
      ? [
          {
            id: 'site',
            name: 'Site',
            value: header.site.trim(),
            remove: () => setHeader({ ...header, site: '' }),
          },
        ]
      : []),
    ...(header.fromDate || header.toDate
      ? [
          {
            id: 'dates',
            name: 'Dates',
            value: `${header.fromDate || '…'} – ${header.toDate || '…'}`,
            remove: () => setHeader({ ...header, fromDate: '', toDate: '' }),
          },
        ]
      : []),
    ...(header.maxRating
      ? [
          {
            id: 'max-elo',
            name: 'Max Elo',
            value: header.maxRating,
            remove: () => setHeader({ ...header, maxRating: '' }),
          },
        ]
      : []),
    ...(header.timeClass !== 'any'
      ? [
          {
            id: 'time',
            name: 'Time',
            value: header.timeClass,
            remove: () => setHeader({ ...header, timeClass: 'any' }),
          },
        ]
      : []),
  ].map((chip) => ({
    ...chip,
    remove: () => {
      chip.remove();
      setPage(0);
    },
  }));

  const previewing = previewId ? (rows.find((row) => row.id === previewId) ?? null) : null;
  // Once the restored page has its rows, the restored game is brought into view.
  const rowKey = rows.map((row) => row.id).join('|');
  useEffect(() => {
    const id = restoreScrollTo.current;
    if (!id || !rowKey.split('|').includes(id)) return;
    restoreScrollTo.current = null;
    document
      .querySelector(`tr[data-game-row="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [rowKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Library"
        subtitle={`${stored.toLocaleString()} ${stored === 1 ? 'game' : 'games'} in ${source.name}`}
        icon={<LibraryIcon />}
        actions={
          <>
            <Button onClick={() => openAnalysisQueue()} title="Analysis queue">
              <span className="sm:hidden">Queue</span>
              <span className="hidden sm:inline">Analysis queue</span>
            </Button>
            <Button variant="accent" icon={<Import />} onClick={() => setImportOpen(true)}>
              <span className="hidden xs:inline">Import</span>
            </Button>
          </>
        }
      />

      <div
        className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-2.5 pb-2 sm:px-4"
        data-library-toolbar
      >
        <SearchField
          value={text}
          onChange={(value) => {
            setText(value);
            setPage(0);
          }}
          placeholder="Search players, events, openings…"
          aria-label="Search games"
          className="max-w-[520px] min-w-[220px] flex-1"
        />
        <label className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-panel)] bg-surface-2 pr-1 pl-2.5 text-xs text-secondary">
          <Database className="h-3.5 w-3.5 shrink-0 text-tertiary" />
          <span className="sr-only">Database</span>
          <select
            aria-label="Database"
            value={source.id}
            onChange={(event) => {
              setSourceId(event.target.value);
              setSelected(new Set());
              setPreviewId(null);
              setPage(0);
            }}
            className="h-7 max-w-[220px] bg-transparent pr-1 text-xs text-primary outline-none"
            data-library-database
          >
            <option value={LOCAL_SOURCE.id}>My games</option>
            {(collections.data ?? [])
              .filter((entry) => entry.kind === 'sqlite')
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                  {entry.games !== null ? ` · ${entry.games.toLocaleString()}` : ''}
                </option>
              ))}
            {referencePacks.map((entry) => (
              <option key={entry.id} value={`reference:${entry.id}`}>
                {entry.name}
                {(entry.openableCount ?? entry.gameCount) !== undefined
                  ? ` · ${(entry.openableCount ?? entry.gameCount)!.toLocaleString()}`
                  : ''}
              </option>
            ))}
            {!local && !sourceFacts && !referenceFacts ? (
              <option value={source.id}>{source.name}</option>
            ) : null}
          </select>
        </label>
        {source.kind !== 'reference' ? (
          <DatabasesPicker
            collections={(collections.data ?? []).filter(
              (entry) => entry.kind === 'indexeddb' || entry.kind === 'sqlite',
            )}
            current={source.id}
            also={also.filter((id) => id !== source.id)}
            onChange={(next) => {
              setAlso(next);
              setPreviewId(null);
            }}
          />
        ) : null}
        <Button
          id="library-filters-trigger"
          active={filtersOpen || filtersActive}
          aria-expanded={filtersOpen}
          aria-controls="library-filters-panel"
          icon={<Filter />}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters{chips.length ? ` ${chips.length}` : ''}
        </Button>
      </div>
      {chips.length ? (
        <div
          className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pb-2 sm:px-4"
          data-filter-chips
        >
          {chips.map((chip) => (
            <FilterChip key={chip.id} name={chip.name} value={chip.value} onRemove={chip.remove} />
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="ml-1 text-[11px] text-tertiary underline-offset-2 hover:text-secondary hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {coverage.data?.length && source.kind === 'reference' ? (
        <p className="shrink-0 px-3 pb-2 text-[11px] text-caution sm:px-4" data-reference-coverage>
          {source.name} keeps the moves of each player’s newest games only:{' '}
          {coverage.data
            .map(
              (entry) =>
                `${entry.name}, ${entry.listed.toLocaleString()} of ${entry.played.toLocaleString()}`,
            )
            .join('; ')}
          . Older games are counted in the Explorer but cannot be listed or opened here.
        </p>
      ) : null}
      {dropped.length ? (
        <p className="shrink-0 px-3 pb-2 text-[11px] text-caution sm:px-4" data-library-dropped>
          Not applied in {source.name}: {dropped.join(', ')}. The list below ignores{' '}
          {dropped.length === 1 ? 'it' : 'them'}.
        </p>
      ) : null}
      {local && selected.size > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-2 px-2 py-1.5 sm:px-3">
          <span className="text-2xs text-secondary tabular">{selected.size} selected</span>
          <Button onClick={() => setSelected(new Set())}>Clear selection</Button>
          <Button variant="accent" onClick={() => openAnalysisQueue([...selected])}>
            Add to analysis queue
          </Button>
          {selected.size >= 2 ? (
            /*
              Phase 84: ChessBase's select-and-Enter. The games are laid over
              each other in the order this list shows them, so the first row
              is the main line; the result opens as a new analysis and nothing
              stored changes.
            */
            <Button
              onClick={() => {
                // The list's order for the rows on this page, then any
                // selected on another page, which were dropped before.
                const ids = [
                  ...rows.filter((row) => selected.has(row.id)).map((row) => row.id),
                  ...[...selected].filter((id) => !rows.some((row) => row.id === id)),
                ];
                let opened = false;
                void mergeSelectedGames(ids, (input) =>
                  openInNewTab(router, () => useAnalysis.getState().openDocument(input)).then(
                    (done) => {
                      opened = done;
                    },
                  ),
                )
                  .then(({ message, result }) => {
                    if (opened) {
                      notify({ tone: result.skipped.length ? 'info' : 'success', message });
                    }
                  })
                  .catch((error: unknown) =>
                    notify({
                      tone: 'error',
                      message: 'The games could not be merged.',
                      detail: error instanceof Error ? error.message : String(error),
                    }),
                  );
              }}
            >
              Merge into one tree
            </Button>
          ) : null}
          {/*
            Phase 85: ChessBase's Novelty Annotation over a selection, as
            facts about a named population (BatchDepartureDialog).
          */}
          <Button
            onClick={() =>
              setDepartureIds([
                ...rows.filter((row) => selected.has(row.id)).map((row) => row.id),
                ...[...selected].filter((id) => !rows.some((row) => row.id === id)),
              ] as GameId[])
            }
          >
            Where they leave the source…
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

      {departureIds ? (
        <BatchDepartureDialog ids={departureIds} onClose={() => setDepartureIds(null)} />
      ) : null}
      {tournamentOf ? (
        <CrosstableDialog
          source={source}
          game={tournamentOf}
          onClose={() => setTournamentOf(null)}
          onOpenGame={(game) => {
            setTournamentOf(null);
            void open(game, '/analysis');
          }}
        />
      ) : null}

      <div className="relative flex min-h-0 flex-1 border-t border-line-subtle">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto" data-library-list>
          {across.length > 1 ? (
            <LibraryAcross
              ids={across}
              names={new Map((collections.data ?? []).map((entry) => [entry.id, entry.name]))}
              query={headerOnly}
              label={`the Library across ${across.length} databases`}
            />
          ) : games.isError ? (
            <EmptyState
              title={local ? 'Local storage is unavailable' : `${source.name} could not be read`}
              description={
                games.error instanceof Error
                  ? games.error.message
                  : 'This browser refused access to its database.'
              }
            />
          ) : moveState?.status === 'failed' ? (
            <EmptyState
              title="The move search stopped with an error"
              description={`${moveState.error ?? 'The games could not be read.'} Nothing was changed; the header filters still work.`}
            />
          ) : moveState && rows.length === 0 ? (
            <EmptyState
              title={
                moveState.status === 'running'
                  ? 'Reading the moves…'
                  : moveState.status === 'stopped'
                    ? 'Stopped before anything matched.'
                    : 'No game contains it.'
              }
              description={
                moveState.status === 'running'
                  ? `${moveState.read.toLocaleString()} of ${moveState.selected.toLocaleString()} games read so far.`
                  : `${moveState.read.toLocaleString()} of the ${moveState.selected.toLocaleString()} games the other filters selected were read.`
              }
            />
          ) : needsPlayer && !moveState ? (
            <EmptyState
              title={`Search ${source.name} by player`}
              description={`Type a name in the search box, or name a player or an opponent in Filters, and their games in ${source.name} are listed with every other filter applied. A reference is read by player, as ChessBase reads Mega Database; it keeps no list of all its games to page through.`}
            />
          ) : games.isPending && !moveState ? (
            <p className="px-3 py-6 text-2xs text-tertiary">Reading {source.name}…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title={stored === 0 ? 'No games imported.' : 'No games match these filters.'}
              description={
                stored === 0
                  ? 'Import a PGN collection to build your local database. Every game is indexed by position, so the explorer can tell you what you actually play.'
                  : source.kind === 'reference'
                    ? `None of the games ${source.name} lists for the players named match.`
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
            <table className="w-full border-collapse text-[12px]" data-library-table>
              <thead className="sticky top-0 z-10 bg-surface-1 shadow-[0_1px_0_var(--border-subtle)]">
                <tr className="text-[11px] text-tertiary">
                  <th className="w-8 px-2 py-1.5" scope="col">
                    <span className="sr-only">Select</span>
                  </th>
                  {moveState ? (
                    <th scope="col" className="w-[150px] px-2 py-1.5 text-left font-medium">
                      Found
                    </th>
                  ) : null}
                  {COLUMNS.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className={cn(
                        'px-2 py-1.5 text-left font-medium whitespace-nowrap',
                        column.className,
                      )}
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
                          onClick={() => sort(column.sort ?? (column.id as SortField))}
                          className="inline-flex items-center gap-1 transition-colors hover:text-secondary"
                        >
                          {column.label}
                          {sortBy === (column.sort ?? column.id) && (
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
                {rows.map((game) => {
                  const active = game.id === previewId;
                  return (
                    <tr
                      key={game.id}
                      data-game-row={game.id}
                      tabIndex={0}
                      aria-selected={active}
                      onClick={() => setPreviewId(game.id)}
                      onDoubleClick={() => void open(game)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || event.nativeEvent.isComposing)
                          return;
                        if (event.key === 'Enter') void open(game);
                        if (event.key === 'Home' || event.key === 'End') {
                          event.preventDefault();
                          const next = event.key === 'Home' ? rows[0] : rows.at(-1);
                          if (next) {
                            setPreviewId(next.id);
                            const body = event.currentTarget.parentElement;
                            const target = (
                              event.key === 'Home'
                                ? body?.firstElementChild
                                : body?.lastElementChild
                            ) as HTMLElement | null;
                            target?.focus();
                          }
                        }
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault();
                          const index = rows.findIndex((row) => row.id === game.id);
                          const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
                          if (next) {
                            setPreviewId(next.id);
                            (
                              event.currentTarget[
                                event.key === 'ArrowDown'
                                  ? 'nextElementSibling'
                                  : 'previousElementSibling'
                              ] as HTMLElement | null
                            )?.focus();
                          }
                        }
                      }}
                      data-library-row={game.id}
                      className={cn(
                        'cursor-default border-b border-line-subtle transition-colors focus:outline-none',
                        /*
                          The active branch named no `focus:` rule, so
                          keyboard-focusing the row you are already on produced
                          no change from the row's own styling — the only branch
                          that could go anywhere. The global outline still
                          covers it, so this is about the class list telling the
                          truth rather than about a blind control: a reader
                          would reasonably delete the outline as redundant.
                        */
                        active
                          ? 'bg-accent-muted shadow-[inset_3px_0_0_var(--accent)] focus:bg-accent-muted/80'
                          : 'odd:bg-surface-2/40 hover:bg-surface-2 focus:bg-surface-3 active:bg-surface-3',
                      )}
                    >
                      <td className="px-2 py-[5px]" onClick={(event) => event.stopPropagation()}>
                        <input
                          disabled={!local}
                          title={local ? undefined : 'Selecting games works in My games'}
                          type="checkbox"
                          checked={selected.has(game.id)}
                          onChange={() => toggle(game.id)}
                          aria-label={`Select ${gameTitle(game)}`}
                          className="accent-[var(--accent)]"
                        />
                      </td>
                      {moveState ? (
                        <td className="px-2 py-[5px]" data-found-at>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void open(game);
                            }}
                            className="block w-full truncate text-left hover:underline"
                          >
                            {foundAtLabel(foundAt.get(game.id) ?? 0)}
                          </button>
                        </td>
                      ) : null}
                      <td className="max-w-0 px-2 py-[5px]">
                        {/* The name opens the game, as it always has; the rest of the row
                            previews it. */}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void open(game);
                          }}
                          className="block w-full truncate text-left text-primary hover:underline"
                        >
                          <CountryFlag name={game.white} />
                          {game.white}
                        </button>
                      </td>
                      <td
                        className={
                          'px-2 py-[5px] text-right whitespace-nowrap text-tertiary tabular'
                        }
                      >
                        {game.whiteRating ?? ''}
                      </td>
                      <td className="max-w-0 px-2 py-[5px]">
                        {/* The name opens the game, as it always has; the rest of the row
                            previews it. */}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void open(game);
                          }}
                          className="block w-full truncate text-left text-primary hover:underline"
                        >
                          <CountryFlag name={game.black} />
                          {game.black}
                        </button>
                      </td>
                      <td
                        className={
                          'px-2 py-[5px] text-right whitespace-nowrap text-tertiary tabular'
                        }
                      >
                        {game.blackRating ?? ''}
                      </td>
                      <td className="px-2 py-[5px] text-center tabular">
                        {game.result === '1/2-1/2' ? '½–½' : game.result}
                      </td>
                      <td className="max-w-0 px-2 py-[5px]">
                        <OpeningCell game={game} />
                      </td>
                      <td className={'max-w-0 truncate px-2 py-[5px] text-secondary'}>
                        {game.event ?? ''}
                      </td>
                      <td className={'px-2 py-[5px] whitespace-nowrap text-tertiary tabular'}>
                        {formatPgnDate(game.date)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {rows.map((game) => (
                <li key={game.id} className="flex items-center gap-2 px-2 py-2">
                  <input
                    disabled={!local}
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
                      <span className="shrink-0 text-2xs text-secondary tabular">
                        {game.result}
                      </span>
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-baseline gap-2 text-[10.5px] text-tertiary">
                      <span className="truncate">
                        {[openingDisplay(game).eco, openingDisplay(game).label ?? game.event]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="ml-auto shrink-0 tabular">{formatPgnDate(game.date)}</span>
                    </span>
                    {moveState ? (
                      <span className="mt-0.5 block text-[10.5px] text-secondary" data-found-at>
                        Found {foundAtLabel(foundAt.get(game.id) ?? 0)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {wide ? (
          <aside
            className="flex w-[340px] shrink-0 flex-col border-l border-line-subtle bg-surface-1 xl:w-[380px]"
            aria-label="Game preview"
          >
            <GamePreview
              source={source}
              game={previewing}
              onOpen={(game, ply) => void open(game, '/analysis', ply)}
              onReview={(game, ply) => void open(game, '/review', ply)}
              onQueue={local ? (game) => openAnalysisQueue([game.id]) : undefined}
              onTournament={setTournamentOf}
            />
          </aside>
        ) : null}
        {filtersOpen ? (
          <aside
            id="library-filters-panel"
            className={cn(
              'z-20 flex flex-col border border-line bg-surface-1 shadow-[var(--shadow-popover)]',
              wide
                ? 'absolute inset-y-3 right-[348px] w-[320px] rounded-[var(--radius-panel)] xl:right-[388px]'
                : 'absolute inset-x-0 bottom-0 max-h-[70%] border-t',
            )}
            aria-label="Filters"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeFilters();
              }
            }}
          >
            <FilterPanel
              recentFilters={recentFilters}
              onApply={applyFilter}
              onSave={() => void saveCurrent()}
              savedQueries={<SavedQueries onApply={applyQuery} />}
              player={player}
              setPlayer={(value) => {
                setPlayer(value);
                setPage(0);
              }}
              playerColor={playerColor}
              setPlayerColor={(value) => {
                setPlayerColor(value);
                setPage(0);
              }}
              opponent={opponent}
              setOpponent={(value) => {
                setOpponent(value);
                setPage(0);
              }}
              result={result}
              setResult={(value) => {
                setResult(value);
                setPage(0);
              }}
              minRating={minRating}
              setMinRating={(value) => {
                setMinRating(value);
                setPage(0);
              }}
              eco={eco}
              setEco={(value) => {
                setEco(value);
                setPage(0);
              }}
              header={header}
              setHeader={(next) => {
                setHeader(next);
                setPage(0);
              }}
              moves={
                <>
                  {source.kind === 'companion' ? (
                    /*
                        A companion database is read for its moves too: the
                        companion selects by header and serves the games a
                        page at a time, and each is asked the question here.
                      */
                    <p className="mb-1 text-[11px] text-tertiary" data-move-search-source>
                      Reads the moves of {source.name}’s games through the companion, a page at a
                      time; a large file takes a while, and it can be stopped.
                    </p>
                  ) : source.kind === 'reference' ? (
                    <p className="mb-1 text-[11px] text-tertiary" data-move-search-source>
                      Reads the moves of the games the filters above select in {source.name}; name a
                      player first.
                    </p>
                  ) : null}
                  <MoveMaskFields
                    mask={moves}
                    onChange={setMoves}
                    compiled={compiledMoves}
                    state={moveState}
                    onSearch={startMoveSearch}
                    onStop={deep.stop}
                    onClear={deep.clear}
                  />
                </>
              }
              active={filtersActive}
              onClear={clearFilters}
              onProfile={
                player.trim()
                  ? () => router.push(`/player/${encodeURIComponent(playerKey(player))}`)
                  : undefined
              }
              onClose={closeFilters}
            />
          </aside>
        ) : null}
      </div>

      <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-line-subtle bg-surface-1 px-2 text-[10.5px] text-tertiary sm:px-3">
        {moveState ? (
          <span className="tabular" data-move-search-status>
            {moveState.status === 'running'
              ? `Reading moves: ${moveState.read.toLocaleString()} of ${moveState.selected.toLocaleString()} games · ${(moveState.found ?? moveRows.length).toLocaleString()} found so far`
              : moveState.status === 'failed'
                ? // Not an answer: "0 of 0 games read contain it" after the companion
                  // went away mid-search read as "none do" (Phase 85, Part E).
                  `The move search stopped with an error after ${moveState.read.toLocaleString()} of ${moveState.selected.toLocaleString()} games; this is not a result`
                : `${(moveState.found ?? moveRows.length).toLocaleString()} of ${moveState.read.toLocaleString()} games read contain it${
                    (moveState.found ?? moveRows.length) > moveRows.length
                      ? `; the first ${moveRows.length.toLocaleString()} are listed`
                      : ''
                  }`}
            {moveState.status === 'stopped'
              ? ` · stopped; ${(moveState.selected - moveState.read).toLocaleString()} not read`
              : ''}
          </span>
        ) : (
          <span className="tabular" data-library-status>
            {/*
              While a query is out there is no answer yet, and "0–0 of 578,262
              games" read as one: no matches. Seen for ~110 ms on a filtered
              578k-game Lichess collection, and for as long as a slow query
              takes. The list above already says it is reading; so does this.
            */}
            {games.isLoading
              ? `Reading ${source.name}…`
              : filtered === null
                ? `${visibleFrom.toLocaleString()}–${visibleTo.toLocaleString()} of ${stored.toLocaleString()} games`
                : `${filtered.toLocaleString()} of ${stored.toLocaleString()} games`}
            {!games.isLoading && filtered !== null && filtered > PAGE_SIZE
              ? ` · ${visibleFrom.toLocaleString()}–${visibleTo.toLocaleString()}`
              : ''}
          </span>
        )}
        {moveState && moveRows.length > PAGE_SIZE ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              onClick={() => setMovePage((value) => Math.max(0, value - 1))}
              disabled={movePage === 0}
            >
              Previous
            </Button>
            <span className="px-1 tabular">
              {movePage + 1}/{Math.ceil(moveRows.length / PAGE_SIZE)}
            </span>
            <Button
              size="sm"
              onClick={() => setMovePage((value) => value + 1)}
              disabled={(movePage + 1) * PAGE_SIZE >= moveRows.length}
            >
              Next
            </Button>
          </div>
        ) : null}
        {paged && !moveState && (
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
        {local && stored > 0 && (
          <Button
            variant="danger"
            size="sm"
            className={paged ? undefined : 'ml-auto'}
            onClick={() => setConfirmation('all')}
          >
            Delete all games
          </Button>
        )}
      </footer>

      {queryToSave ? (
        <PromptDialog
          open
          title="Save query"
          label="Name"
          confirmLabel="Save query"
          onCancel={() => setQueryToSave(null)}
          onSubmit={async (name) => {
            await saveQuery(name, queryToSave.query, queryToSave.source);
            await queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_KEY });
            setQueryToSave(null);
            notify({ tone: 'success', message: `Saved query “${name}”.` });
          }}
        />
      ) : null}

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
        <span aria-hidden className="shrink-0 text-[9px] text-tertiary/60">
          file
        </span>
      ) : null}
    </span>
  );
}

/**
 * The Library's filters, docked where the preview is.
 *
 * Docked rather than a popover that closes on the next click: a person
 * narrowing twelve thousand games changes one field, looks at the list,
 * changes another, and a panel that vanished each time they looked would be
 * a panel they had to keep reopening.
 */
function FilterPanel(props: {
  readonly recentFilters: readonly ResearchFilter[];
  readonly onApply: (filter: ResearchFilter) => void;
  readonly onSave: () => void;
  readonly savedQueries: React.ReactNode;
  readonly player: string;
  readonly setPlayer: (value: string) => void;
  readonly playerColor: 'any' | 'w' | 'b';
  readonly setPlayerColor: (value: 'any' | 'w' | 'b') => void;
  readonly opponent: string;
  readonly setOpponent: (value: string) => void;
  readonly result: GameResult | 'any';
  readonly setResult: (value: GameResult | 'any') => void;
  readonly minRating: string;
  readonly setMinRating: (value: string) => void;
  readonly eco: string;
  readonly setEco: (value: string) => void;
  readonly header: HeaderMask;
  readonly setHeader: (next: HeaderMask) => void;
  readonly moves: React.ReactNode;
  readonly active: boolean;
  readonly onClear: () => void;
  readonly onProfile?: (() => void) | undefined;
  readonly onClose: () => void;
}) {
  const { recentFilters } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-library-filters>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle px-3.5">
        <Filter className="h-3.5 w-3.5 text-tertiary" />
        <h2 className="text-xs font-semibold text-primary">Filters</h2>
        {props.active ? (
          <button
            type="button"
            onClick={props.onClear}
            className="ml-auto text-[11px] text-tertiary underline-offset-2 hover:text-secondary hover:underline"
          >
            Clear filters
          </button>
        ) : null}
        <IconButton
          label="Close filters"
          className={cn('h-7 w-7', !props.active && 'ml-auto')}
          onClick={props.onClose}
        >
          <Close />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PopoverSection title="Saved queries">{props.savedQueries}</PopoverSection>
        {recentFilters.length ? (
          <PopoverSection title="Recent">
            <select
              aria-label="Recent filters"
              className={cn(FIELD, 'w-full')}
              defaultValue=""
              onChange={(event) => {
                const chosen = recentFilters.find((entry) => entry.id === event.target.value);
                if (chosen) props.onApply(chosen);
                event.currentTarget.value = '';
              }}
            >
              <option value="">Choose…</option>
              {recentFilters.map((entry) => (
                <option key={`recent-${entry.id}`} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </PopoverSection>
        ) : null}
        <PopoverSection
          icon={<Players />}
          title="Player"
          hint="A whole name as it appears in the PGN; case and spacing are ignored. The search above finds partial names."
        >
          <input
            aria-label="Player"
            value={props.player}
            onChange={(event) => props.setPlayer(event.target.value)}
            className={cn(FIELD, 'w-full')}
            placeholder="Carlsen, Magnus"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Segmented
              label="Colour"
              size="sm"
              value={props.playerColor}
              onChange={props.setPlayerColor}
              options={[
                { id: 'any', label: 'Either' },
                { id: 'w', label: 'White' },
                { id: 'b', label: 'Black' },
              ]}
            />
            {props.onProfile ? (
              <Button size="sm" variant="subtle" onClick={props.onProfile}>
                Player profile
              </Button>
            ) : null}
          </div>
        </PopoverSection>
        <PopoverSection
          icon={<Players />}
          title="Opponent"
          hint="The other player in the game, as a whole name. With a player, the games between them; the colour above stays the player's."
        >
          <input
            aria-label="Opponent"
            value={props.opponent}
            onChange={(event) => props.setOpponent(event.target.value)}
            className={cn(FIELD, 'w-full')}
            placeholder="Nakamura, Hikaru"
          />
        </PopoverSection>
        <PopoverSection title="Result">
          <Segmented
            label="Result"
            size="sm"
            value={props.result}
            onChange={props.setResult}
            options={RESULTS.map((entry) => ({ id: entry.id, label: entry.label }))}
          />
        </PopoverSection>
        <PopoverSection title="Rating and opening">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10.5px] text-tertiary">
              Min Elo
              <input
                value={props.minRating}
                inputMode="numeric"
                onChange={(event) => props.setMinRating(event.target.value.replace(/\D/g, ''))}
                className={cn(FIELD, 'mt-0.5 w-full')}
                placeholder="2400"
              />
            </label>
            <label className="text-[10.5px] text-tertiary">
              ECO
              <input
                value={props.eco}
                onChange={(event) => props.setEco(event.target.value.toUpperCase().slice(0, 3))}
                className={cn(FIELD, 'mt-0.5 w-full')}
                placeholder="B90"
              />
            </label>
          </div>
        </PopoverSection>
        <PopoverSection title="Header">
          <div className="flex flex-wrap items-end gap-2">
            <HeaderMaskFields mask={props.header} onChange={props.setHeader} />
          </div>
        </PopoverSection>
        <PopoverSection
          title="In the moves"
          hint="Reads only the games the filters above select, and can be stopped."
        >
          <div className="flex flex-wrap items-end gap-2">{props.moves}</div>
        </PopoverSection>
        <div className="flex flex-wrap gap-1.5 px-3.5 py-3">
          <Button size="sm" onClick={props.onSave}>
            Save query
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The selected game, previewed: its header, the board at any move, and the
 * notation to step through — without leaving the list.
 */
function GamePreview({
  source,
  game,
  onOpen,
  onReview,
  onQueue,
  onTournament,
}: {
  readonly source: LibrarySource;
  readonly game: GameSummary | null;
  /** The event's cross-table, for a game that names one. */
  readonly onTournament: (game: GameSummary) => void;
  /** `ply` is the move the preview was stepped to; absent when it was not. */
  readonly onOpen: (game: GameSummary, ply?: number) => void;
  readonly onReview: (game: GameSummary, ply?: number) => void;
  /** Absent for a database the analysis queue does not read. */
  readonly onQueue: ((game: GameSummary) => void) | undefined;
}) {
  const full = useQuery({
    queryKey: ['library', 'preview', source.id, game?.id ?? null],
    enabled: Boolean(game),
    queryFn: async () => (game ? { tree: await sourceTree(source, game.id) } : null),
  });
  const line = useMemo(() => {
    const tree = full.data?.tree;
    if (!tree) return [];
    return mainlinePath(tree).map((id) => tree.nodes[id]!);
  }, [full.data]);
  const [ply, setPly] = useState<number | null>(null);
  const [previewed, setPreviewed] = useState<string | null>(null);
  if (game && previewed !== game.id) {
    setPreviewed(game.id);
    setPly(null);
  }

  if (!game) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-tertiary">
          <Board className="h-5 w-5" />
        </span>
        <h2 className="text-sm font-semibold text-primary">Select a game</h2>
        <p className="text-[11.5px] text-tertiary">
          Pick a row to preview the game with its notation. Double-click, or press Return, to open
          it on the board.
        </p>
      </div>
    );
  }

  const last = line.length - 1;
  const at = ply === null ? last : Math.max(0, Math.min(last, ply));
  const node = line[at];
  const display = openingDisplay(game);
  /* Only a move the player stepped to; the preview's default is not a choice. */
  const chosenPly = ply === null || !node ? undefined : node.ply;
  const moveLabel = node?.move
    ? `${Math.ceil(node.ply / 2)}${node.ply % 2 === 1 ? '.' : '…'}${node.move.san}`
    : 'the start';

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-library-preview={game.id}>
      <div className="shrink-0 px-4 pt-4">
        {/*
          A portrait as tall as the line (`xs`): the preview's board is square
          and full width, so a taller row pushed Open, Review and Tournament
          under the status bar at 1280 × 720.
        */}
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-primary">
          <PlayerPortrait name={game.white} size="xs" />
          <span className="truncate">
            <CountryFlag name={game.white} />
            {game.white}
            {game.whiteRating ? (
              <span className="font-normal text-tertiary"> {game.whiteRating}</span>
            ) : null}
          </span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-primary">
          <PlayerPortrait name={game.black} size="xs" />
          <span className="truncate">
            <CountryFlag name={game.black} />
            {game.black}
            {game.blackRating ? (
              <span className="font-normal text-tertiary"> {game.blackRating}</span>
            ) : null}
          </span>
        </p>
        <p className="mt-1 truncate text-[11px] text-tertiary">
          {[game.event, siteLabel(game.site), formatPgnDate(game.date)].filter(Boolean).join(' · ')}
        </p>
        <p className="truncate text-[11px] text-tertiary">
          {[display.eco, display.label].filter(Boolean).join(' ')} · {game.result}
        </p>
      </div>
      <div className="shrink-0 px-4 py-3">
        {/*
          The empty case used to draw a blank grey square with the right aspect
          ratio, which reads as a board that failed to render. It also bypassed
          `SheetBoard`, so it carried none of the board's own styling — a
          different frame from every other board in the application, for a
          position that is simply not reached yet. The hole is now what it is.
        */}
        {node ? (
          <SheetBoard fen={node.fen} className="w-full" />
        ) : (
          <div
            className="flex aspect-square w-full items-center justify-center rounded-[var(--radius-panel)] border border-dashed border-line bg-surface-1 p-4 text-center text-[11px] text-tertiary"
            role="img"
            aria-label="No position reached yet"
          >
            Not reached yet
          </div>
        )}
        <div className="mt-2 flex items-center justify-center gap-0.5">
          <IconButton label="Start" disabled={at === 0} onClick={() => setPly(0)}>
            <SkipStart />
          </IconButton>
          <IconButton label="Previous move" disabled={at === 0} onClick={() => setPly(at - 1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton label="Next move" disabled={at >= last} onClick={() => setPly(at + 1)}>
            <ChevronRight />
          </IconButton>
          <IconButton label="Final position" disabled={at >= last} onClick={() => setPly(last)}>
            <SkipEnd />
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line-subtle px-4 py-2 text-[12px] leading-6">
        {full.isPending ? (
          <span className="text-tertiary">Reading the moves…</span>
        ) : (
          line.slice(1).map((entry, index) => (
            <span key={entry.id}>
              {index % 2 === 0 ? (
                <span className="text-tertiary tabular">{index / 2 + 1}.</span>
              ) : null}
              <button
                type="button"
                onClick={() => setPly(index + 1)}
                className={cn(
                  'mx-0.5 rounded-[var(--radius-board)] px-0.5',
                  at === index + 1
                    ? 'bg-accent text-accent-contrast'
                    : 'text-primary hover:bg-surface-2',
                )}
              >
                {entry.move?.san}
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-line-subtle px-4 py-2.5">
        <Button
          variant="accent"
          icon={<Board />}
          onClick={() => onOpen(game, chosenPly)}
          title={chosenPly === undefined ? undefined : `Opens at the move shown (${moveLabel})`}
        >
          Open
        </Button>
        <Button onClick={() => onReview(game, chosenPly)}>Review</Button>
        {onQueue ? <Button onClick={() => onQueue(game)}>Analyse</Button> : null}
        {game.event?.trim() && game.event.trim() !== '?' ? (
          <Button onClick={() => onTournament(game)} data-library-tournament>
            Tournament
          </Button>
        ) : null}
      </div>
    </div>
  );
}
