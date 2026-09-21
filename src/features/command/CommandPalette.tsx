'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Search } from '@/components/icons';
import { useWorkspaceSearch } from '@/features/persistence/queries';
import { cn } from '@/lib/cn';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import { playerKey } from '@/persistence/schema/migrations';
import {
  canonicalise,
  searchByPosition,
  positionHitLabel,
  type PositionHit,
} from '@/persistence/position-search';
import { openStoredGame } from '@/features/games/open-game';
import { useQuery } from '@tanstack/react-query';
import type { WorkspaceSearchHit } from '@/persistence/search';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { searchLegends, searchPlayerRoster, type PlayerSearchHit } from '@/features/search/players';
import { searchOpenings, type OpeningSearchHit } from '@/features/search/openings';
import { parseMoveSequence } from '@/features/search/move-sequence';
import { assessQuery } from '@/features/search/query-limits';

import { rank } from './rank';

import { useCommands, type Command } from './useCommands';

/**
 * Command palette.
 *
 * The single front door for everything the user can reach. Four providers
 * feed it: the static `useCommands` list, the workspace search, the opening
 * index, and the legends index. Position and move-sequence search are
 * detected on the input itself, with a FEN / line parser that returns
 * grouped actions instead of trying to text-match a position string.
 */
export function CommandPalette() {
  const open = useUi((state) => state.commandPaletteOpen);
  const setOpen = useUi((state) => state.setCommandPaletteOpen);
  // The 404 page uses `kingfisher:open-search` because the page itself
  // is a client component but cannot import the ui-store. The event
  // stays in the same realm the palette already lives in; it is the
  // cheapest bridge that does not require lifting a context.
  useEffect(() => {
    /*
     * Phase 56: a position-search entry point. The 404 page and the move
     * context menu both fire `kingfisher:open-search`; this listener
     * accepts the optional `detail.query` so the menu can prefill a FEN
     * and get straight to the cross-collection lookup it asked for.
     */
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string }>).detail;
      if (detail?.query) {
        useUi.setState({ commandPalettePrefill: detail.query });
      }
      setOpen(true);
    };
    window.addEventListener('kingfisher:open-search', onOpen);
    return () => window.removeEventListener('kingfisher:open-search', onOpen);
  }, [setOpen]);
  // Mounting the palette only while it is open means its query and selection
  // start fresh by construction, with no state to reset.
  return open ? <PaletteDialog /> : null;
}

function PaletteDialog() {
  const router = useRouter();
  const setOpen = useUi((state) => state.setCommandPaletteOpen);
  const prefill = useUi((state) => state.commandPalettePrefill);
  const clearPrefill = useUi((state) => state.setCommandPalettePrefill);
  const commands = useCommands();

  /*
   * The prefill is consumed once on mount: if a caller asked the palette
   * to open with a specific FEN in the input, that text is here, and the
   * store is cleared so a subsequent ordinary open does not reapply it.
   */
  const [query, setQuery] = useState(prefill);
  useEffect(() => {
    if (prefill) clearPrefill('');
  }, [prefill, clearPrefill]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const entities = useWorkspaceSearch(query);

  /*
   * Openings and legends are local metadata — small enough to search
   * synchronously, so the React query layer would only add latency. They
   * are read through `useMemo` rather than `useQuery` because the data
   * source is already cached on the module (see openings.ts / players.ts).
   */
  /*
   * The opening index is module-cached, so once it has loaded the search is
   * effectively synchronous. The first render starts the load, and a state
   * variable holds the resolved hits. The render is allowed to show fewer
   * results than the query could match on the very first frame, because the
   * catalog is heavy and the user has just opened the palette.
   */
  const [openingHits, setOpeningHits] = useState<readonly OpeningSearchHit[]>([]);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    let cancelled = false;
    searchOpenings(trimmed, 6).then((hits) => {
      if (!cancelled) setOpeningHits(hits);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);
  // `openingHits` is read through this derived value so an out-of-date
  // resolution cannot be shown against a different query. The dependency on
  // `query` keeps the change cheap.
  const openingCommands = useMemo<readonly Command[]>(
    () =>
      query.trim().length >= 2 ? openingHits.map((hit) => commandForOpening(hit, router)) : [],
    [openingHits, query, router],
  );
  /*
   * Players: the curated roster answers at once, and the titled roster
   * (fetched once, lazily) joins as soon as it has — the same shape as the
   * openings above.
   */
  const legendHits = useMemo<readonly PlayerSearchHit[]>(
    () => (query.trim().length >= 2 ? searchLegends(query.trim(), 5) : []),
    [query],
  );
  const [rosterHits, setRosterHits] = useState<{
    readonly query: string;
    readonly hits: readonly PlayerSearchHit[];
  } | null>(null);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    let cancelled = false;
    searchPlayerRoster(trimmed, 5).then((hits) => {
      if (!cancelled) setRosterHits({ query: trimmed, hits });
    });
    return () => {
      cancelled = true;
    };
  }, [query]);
  const playerCommands = useMemo<readonly Command[]>(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    // The roster's answer replaces the legends' once it is for this query.
    const hits = rosterHits?.query === trimmed ? rosterHits.hits : legendHits;
    return hits.map((hit) => commandForPlayer(hit, router));
  }, [legendHits, rosterHits, query, router]);

  /*
    A pasted FEN is not a text query and must not be run as one — a position
    string shares no words with anything and would return nothing while
    looking like a broken search. The palette recognises it and answers the
    question actually being asked: where does this position appear in my work?
  */
  const pastedPosition = canonicalise(query);
  const positions = useQuery({
    queryKey: ['position-search', pastedPosition],
    enabled: Boolean(pastedPosition),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => searchByPosition(await getRepositories(), pastedPosition!),
  });

  /*
   * A move sequence typed in plain text (`1.e4 c5 2.Nf3 d6`) is not a text
   * query either, but the position parser does not know how to read it. We
   * try the move-sequence parser and, on success, expose the same position
   * actions the FEN branch already uses.
   */
  const parsedSequence = useMemo(() => {
    if (pastedPosition) return null;
    return parseMoveSequence(query);
  }, [pastedPosition, query]);
  const sequencePosition = parsedSequence?.ok ? parsedSequence.fen : null;

  const positionCommands = useMemo<readonly Command[]>(() => {
    if (pastedPosition) {
      const openHit = (hit: PositionHit) => {
        const at = hit.ply !== undefined ? `&ply=${hit.ply}` : '';
        if (hit.kind === 'game' || hit.kind === 'model-game') {
          void openStoredGame(hit.targetId, hit.ply !== undefined ? { ply: hit.ply } : {})
            .then(() => router.push('/analysis'))
            .catch(() => router.push('/games'));
        } else if (hit.kind === 'chapter') {
          router.push(
            `/studies?study=${encodeURIComponent(hit.parentId ?? '')}&chapter=${encodeURIComponent(hit.targetId)}${hit.nodeId ? `&node=${encodeURIComponent(hit.nodeId)}` : ''}`,
          );
        } else if (hit.kind === 'team') {
          router.push(
            `/team?team=${encodeURIComponent(hit.parentId ?? '')}&assignment=${encodeURIComponent(hit.targetId)}${at}`,
          );
        } else if (hit.kind === 'endgame') router.push('/endgame');
        else if (hit.kind === 'opening-file') router.push('/opening-files');
        else if (hit.kind === 'preparation') router.push('/preparation');
        else if (hit.kind === 'repertoire')
          router.push(`/repertoire?repertoire=${encodeURIComponent(hit.targetId)}`);
        else if (hit.kind === 'decision' || hit.kind === 'critical-position') {
          router.push('/review');
        } else router.push('/training');
      };
      return [
        ...(positions.data?.hits ?? []).map((hit) => ({
          id: `position:${hit.id}`,
          title: hit.subtitle ? `${hit.title} — ${hit.subtitle}` : hit.title,
          // The palette renders the group and the title, so the kind goes in the
          // group where it is actually read rather than in a subtitle nothing
          // displays.
          group: positionHitLabel(hit.kind),
          run: () => openHit(hit),
        })),
        // The same pawns, elsewhere in your work: a second group, after the
        // exact hits, never mixed with them.
        ...(positions.data?.structure ?? []).map((hit) => ({
          id: `structure:${hit.id}`,
          title: hit.subtitle ? `${hit.title} — ${hit.subtitle}` : hit.title,
          group: `Same pawns · ${positionHitLabel(hit.kind)}`,
          run: () => openHit(hit),
        })),
      ];
    }
    if (sequencePosition) {
      // The user typed a move sequence, not pasted a FEN. The hits are the
      // same set of routes the FEN branch would offer, but the "primary"
      // action is the reached position in the Explorer — a move sequence is
      // almost always typed because the player wants to see what an opening
      // is called, not because they want to query their library.
      const moves = parsedSequence?.moves ?? [];
      return [
        {
          id: 'position:explorer',
          title: `Open in Explorer — ${moves.join(' ')}`,
          group: 'Position',
          run: () => router.push(`/openings?fen=${encodeURIComponent(sequencePosition)}`),
        },
        {
          id: 'position:analysis',
          title: `Open in Analysis — ${moves.join(' ')}`,
          group: 'Position',
          run: () => router.push(`/analysis?fen=${encodeURIComponent(sequencePosition)}`),
        },
        {
          id: 'position:databases',
          title: `Search my databases from this position`,
          group: 'Position',
          run: () => router.push(`/games?q=${encodeURIComponent(sequencePosition)}`),
        },
      ];
    }
    return [];
  }, [parsedSequence, pastedPosition, positions.data, router, sequencePosition]);
  const entityCommands = useMemo(
    () =>
      (entities.data ?? []).map((hit) =>
        commandForHit(hit, async (selectedHit) => {
          const repositories = await getRepositories();
          if (selectedHit.kind === 'game' || selectedHit.kind === 'model-game') {
            const game = selectedHit.targetId
              ? await repositories.games.get(selectedHit.targetId)
              : null;
            if (!game) throw new Error('That game is no longer in the database.');
            useAnalysis.getState().openDocument({
              tree: game.tree,
              document: { kind: 'database-game', title: gameTitle(game), gameId: game.id },
            });
            router.push('/analysis');
            return;
          }
          if (selectedHit.kind === 'chapter') {
            const chapter = selectedHit.targetId
              ? await repositories.studies.getChapter(selectedHit.targetId)
              : null;
            if (!chapter) throw new Error('That chapter is no longer available.');
            const study = await repositories.studies.get(chapter.studyId);
            useAnalysis.getState().openDocument({
              tree: chapter.tree,
              document: {
                kind: 'study-chapter',
                title: chapter.title,
                studyId: chapter.studyId,
                studyTitle: study?.study.title ?? 'Study',
                chapterId: chapter.id,
                revision: chapter.revision,
              },
            });
            router.push('/analysis');
            return;
          }
          if (selectedHit.kind === 'study') router.push('/studies');
          else if (selectedHit.kind === 'repertoire') router.push('/repertoire');
          else if (selectedHit.kind === 'player') {
            // The profile, not a filtered explorer. `targetId` is already the
            // canonical player key, which is what the profile route is keyed on.
            router.push(
              `/player/${encodeURIComponent(selectedHit.targetId ?? playerKey(selectedHit.title))}`,
            );
          } else if (
            selectedHit.kind === 'decision' ||
            selectedHit.kind === 'critical-position' ||
            selectedHit.kind === 'theme'
          )
            router.push('/review');
          else if (selectedHit.kind === 'training-set')
            router.push(`/training?set=${encodeURIComponent(selectedHit.targetId ?? '')}`);
          else if (selectedHit.kind === 'opening-file') router.push('/opening-files');
          else if (selectedHit.kind === 'preparation') router.push('/preparation');
          else if (selectedHit.kind === 'endgame') router.push('/endgame');
          else router.push('/training');
        }),
      ),
    [entities.data, router],
  );
  const matches = useMemo(
    () =>
      // A pasted position answers itself: ranking its hits against the FEN as
      // a text query would score them all zero and hide them.
      pastedPosition
        ? [...positionCommands]
        : rank([...openingCommands, ...playerCommands, ...commands, ...entityCommands], query),
    [
      commands,
      entityCommands,
      openingCommands,
      playerCommands,
      positionCommands,
      pastedPosition,
      query,
    ],
  );
  const selected = Math.min(index, Math.max(0, matches.length - 1));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKeys);
    return () => document.removeEventListener('keydown', handleDialogKeys);
  }, [setOpen]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    setOpen(false);
    void command.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-3 pt-[7dvh] animate-fade-in sm:p-4 sm:pt-[14vh]"
      onPointerDown={() => setOpen(false)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-label="Command palette"
        className="max-h-[calc(100dvh-2rem)] w-[540px] max-w-full overflow-hidden rounded-[6px] border border-line-strong bg-surface-1 shadow-2xl animate-rise sm:max-w-[92vw]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {/*
          One control, not two. The icon and the input share a field, and the
          field — not the input — is what shows focus, through the
          `[data-palette-search]` rules in globals.css. The input's own outline
          is suppressed there: the global `:focus-visible` ring used to land on
          the input alone, a rectangle that started after the icon and was
          clipped by the dialog's rounded top edge into a gold U.
        */}
        <div className="border-b border-line-subtle p-2">
          <div
            data-palette-search
            className="flex h-10 items-center gap-2.5 rounded-[4px] border border-line bg-surface-2 px-2.5"
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-tertiary" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setIndex(Math.min(selected + 1, matches.length - 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setIndex(Math.max(selected - 1, 0));
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  run(matches[selected]);
                } else if (event.key === 'Escape') {
                  setOpen(false);
                }
              }}
              placeholder="Search commands, games, studies, players…"
              /*
              A placeholder is announced only while the field is empty, so a
              palette that relied on it went nameless the moment somebody typed
              — which is every moment that matters here.
            */
              aria-label="Search commands, games, studies and players"
              role="searchbox"
              className="h-full w-full min-w-0 bg-transparent text-sm text-primary placeholder:text-tertiary"
            />
          </div>
        </div>

        <div ref={listRef} className="max-h-[min(46vh,calc(100dvh-8rem))] overflow-y-auto p-2">
          {matches.length === 0 ? (
            <EmptyState
              fetching={entities.isFetching}
              reason={query.length > 0 ? assessQuery(query).reason : undefined}
              /*
               * Phase 57: when the user pasted a FEN and the cross-store
               * lookup returned zero hits, the previous "No matching
               * command or item" was true but useless. The empty state
               * now names what was searched and offers one next action.
               */
              positionMiss={Boolean(pastedPosition) && (positions.data?.hits.length ?? 0) === 0}
            />
          ) : (
            matches.map((command, position) => {
              /*
                Section dividers. The list is still ranked globally (score, then
                recency, then alphabetic tiebreak), so two items with the same
                group may sit apart from each other; the divider appears every
                time the previous row's group is different. The old in-row
                group label is gone — when two items from the same group sit
                together, the divider above the first is the only header they
                need, and when they sit apart, the divider alone is enough for
                the reader to know where each row came from.
              */
              const previous = position > 0 ? matches[position - 1] : null;
              const showDivider = !previous || previous.group !== command.group;
              return (
                <div key={command.id}>
                  {showDivider ? (
                    <div
                      className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary first:pt-0"
                      data-group-header={command.group}
                    >
                      {command.group}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    data-active={position === selected}
                    onPointerEnter={() => setIndex(position)}
                    onClick={() => run(command)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[4px] px-2.5 py-1.5 text-left text-xs',
                      position === selected ? 'bg-surface-3 text-primary' : 'text-secondary',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{command.title}</span>
                    {command.shortcut ? (
                      <kbd className="shrink-0 rounded-[3px] border border-line bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-tertiary">
                        {command.shortcut}
                      </kbd>
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state for the palette.
 *
 * The brief is explicit: never show a useless blank panel. Three branches:
 *   1. The query was rejected (too long, looks like PGN) — show the reason
 *      and a pointer to the right tool.
 *   2. The query is fine but nothing matched — show what the user can do
 *      next: search openings, search players, or paste a FEN.
 *   3. The query is still being looked up — show a loading hint.
 */
function EmptyState({
  fetching,
  reason,
  positionMiss,
}: {
  readonly fetching: boolean;
  readonly reason?: string;
  readonly positionMiss?: boolean;
}) {
  if (reason) {
    return (
      <div className="px-4 py-6 text-center text-xs text-tertiary">
        <p>{reason}</p>
        <p className="mt-1 text-[11px]">Open the import dialog with ⌘O for long PGN.</p>
      </div>
    );
  }
  if (fetching) {
    return <p className="px-4 py-6 text-center text-xs text-tertiary">Searching the workspace…</p>;
  }
  if (positionMiss) {
    /*
     * The user pasted a FEN and we searched games, studies,
     * repertoire, training, endgames, opening files, preparation and
     * decisions. None of them had the position. Naming the searched
     * stores turns "no results" into "you do not have this position
     * anywhere yet" — and the action gives them the obvious next
     * step: study it now in Analysis.
     */
    return (
      <div className="px-4 py-6 text-center text-xs text-tertiary">
        <p>This position is not in your games, studies, repertoire, training or endgames yet.</p>
        <p className="mt-1 text-[11px]">Open it in Analysis to study the move with the engine.</p>
      </div>
    );
  }
  return (
    <div className="px-4 py-6 text-center text-xs text-tertiary">
      <p>No matching command or item.</p>
      <p className="mt-1 text-[11px]">Try an opening, a player, a FEN, or 1.e4 c5.</p>
    </div>
  );
}

const HIT_GROUP: Record<WorkspaceSearchHit['kind'], string> = {
  study: 'Study',
  chapter: 'Chapter',
  game: 'Game',
  player: 'Player',
  repertoire: 'Repertoire',
  training: 'Training',
  'model-game': 'Model game',
  decision: 'Decision',
  'critical-position': 'Critical',
  'training-set': 'Training set',
  'opening-file': 'Opening file',
  preparation: 'Preparation',
  endgame: 'Endgame',
  theme: 'Theme',
  tag: 'Tag',
};

function commandForHit(
  hit: WorkspaceSearchHit,
  open: (hit: WorkspaceSearchHit) => Promise<void>,
): Command {
  return {
    id: `entity:${hit.id}`,
    title: hit.subtitle ? `${hit.title} · ${hit.subtitle}` : hit.title,
    group: HIT_GROUP[hit.kind],
    keywords: hit.subtitle,
    run: () => open(hit),
  };
}

function commandForOpening(hit: OpeningSearchHit, router: ReturnType<typeof useRouter>): Command {
  return {
    id: `opening:${hit.id}`,
    title: hit.label,
    // The group label is the ECO plus the family, which the ranker
    // already used to score the entry; showing it again here would be
    // repetition. Just keep the family so the user knows what shelf
    // they are on.
    group: 'Opening',
    keywords: [hit.eco, hit.name, hit.variation ?? ''].join(' '),
    run: () => {
      router.push(`/openings?fen=${encodeURIComponent(hit.id)}`);
    },
  };
}

function commandForPlayer(hit: PlayerSearchHit, router: ReturnType<typeof useRouter>): Command {
  return {
    id: `player:${hit.key}`,
    title: hit.name,
    group: 'Player',
    keywords: `${hit.title} ${hit.note}`,
    run: () => {
      router.push(`/player/${encodeURIComponent(hit.key)}`);
    },
  };
}

/** What kind of record a position hit is, shown in the palette's group column. */
