'use client';

/**
 * "Where does this game leave the source?" — asked from the explorer, of the
 * game on the board, against the source and filters the explorer is showing.
 *
 * ChessBase answers it with Find Novelty and Novelty Annotation against its
 * reference database. Here the reference is whichever population the player
 * has chosen — the built-in pack, an installed one, Lichess Masters, their own
 * games — and the answer names it, because "not in 2,000 elite broadcast
 * games" and "not in Lichess Masters" are different facts. The move is never
 * called a novelty (`src/theory/departure.ts`).
 *
 * The walk reads the game's main line one position at a time and stops at the
 * first move the source's games did not play, so it asks as few questions of
 * an online source as the game allows, and it can be stopped.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { mainlinePath } from '@/chess/tree/tree';
import type { GameTree } from '@/chess/tree/types';
import type { ChessDatabaseProvider, DatabaseGameRef, ExplorerFilters } from '@/database/types';
import { Button } from '@/components/ui/Button';
import { openReferenceGame } from '@/features/games/open-reference-game';
import { canOpenGames, openOnlineGame } from '@/features/games/open-online-game';
import { openInNewTab } from '@/features/tabs/tab-actions';
import { describeError } from '@/lib/describe-error';
import { packReader } from '@/reference/manager';
import { useAnalysis, type OpenDocumentInput } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import {
  DEPARTURE_MOVE_LIMIT,
  describeMoves,
  findDeparture,
  markDeparture,
  moveLabelOf,
  type Departure,
} from '@/theory/departure';

type Walk =
  | { readonly state: 'idle' }
  | { readonly state: 'reading'; readonly read: number }
  | { readonly state: 'done'; readonly departure: Departure }
  | { readonly state: 'failed'; readonly message: string };

export function DepartureSection({
  provider,
  filters,
  tree,
  depthLimit,
}: {
  readonly provider: ChessDatabaseProvider;
  readonly filters: ExplorerFilters;
  readonly tree: GameTree;
  readonly depthLimit: number | null;
}) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const goTo = useAnalysis((state) => state.goTo);
  const applyEdit = useAnalysis((state) => state.applyEdit);
  const controller = useRef<AbortController | null>(null);

  const moves = useMemo(() => mainlinePath(tree).length - 1, [tree]);
  /*
    An answer belongs to one game, one source and one set of filters. The
    moment any of them changes the old answer is about something else, so it
    is not shown beside the new question: each walk is stored with the
    signature it answered, and a stale one reads as idle.
  */
  const signature = `${provider.id}|${JSON.stringify(filters)}|${mainlinePath(tree)
    .map((id) => tree.nodes[id]?.move?.uci ?? '')
    .join(' ')}`;
  const [stored, setStored] = useState<{ readonly signature: string; readonly walk: Walk }>({
    signature: '',
    walk: { state: 'idle' },
  });
  const walk: Walk = stored.signature === signature ? stored.walk : { state: 'idle' };
  useEffect(() => {
    // A walk still reading for the previous question is stopped, not left to finish.
    controller.current?.abort();
  }, [signature]);
  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const asked = signature;
    const setWalk = (next: Walk) => setStored({ signature: asked, walk: next });
    setWalk({ state: 'reading', read: 0 });
    try {
      const departure = await findDeparture({
        tree,
        depthLimit,
        signal: abort.signal,
        explore: (fen, signal) =>
          provider.explore({ fen, filters, limit: DEPARTURE_MOVE_LIMIT }, signal),
        onProgress: (read) => {
          if (!abort.signal.aborted) setWalk({ state: 'reading', read });
        },
      });
      if (!abort.signal.aborted) setWalk({ state: 'done', departure });
    } catch (error) {
      if (abort.signal.aborted) {
        setWalk({ state: 'idle' });
        return;
      }
      const described = describeError(error);
      setWalk({
        state: 'failed',
        message: [described.message, described.remedy].filter(Boolean).join(' '),
      });
    }
  }, [depthLimit, filters, provider, signature, tree]);

  const openGame = useCallback(
    async (game: DatabaseGameRef) => {
      const title = `${game.white} – ${game.black}`;
      const inNewTab = (input: OpenDocumentInput) =>
        openInNewTab(router, () => useAnalysis.getState().openDocument(input));
      try {
        if (packReader(provider.id)) {
          await openReferenceGame(provider.id, provider.name, game.id, title, inNewTab);
        } else {
          await openOnlineGame(provider, game.id, title, undefined, inNewTab);
        }
      } catch (error) {
        notify({
          tone: 'error',
          message: error instanceof Error ? error.message : 'Could not open this game.',
        });
      }
    },
    [notify, provider, router],
  );

  if (moves < 1) return null;
  const openable = Boolean(packReader(provider.id)) || canOpenGames(provider);

  return (
    <section
      className="shrink-0 border-b border-line-subtle px-2.5 py-1.5 text-[10.5px]"
      aria-label="This game against the source"
      data-departure={walk.state === 'done' ? walk.departure.kind : walk.state}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-tertiary">
          This game against {provider.name}
        </span>
        {walk.state === 'reading' ? (
          <Button size="sm" variant="ghost" onClick={() => controller.current?.abort()}>
            Stop · {walk.read} read
          </Button>
        ) : (
          <Button size="sm" onClick={() => void start()}>
            {walk.state === 'done' ? 'Read again' : 'Where does it leave this source?'}
          </Button>
        )}
      </div>

      {walk.state === 'failed' ? (
        <p className="mt-1 text-caution" role="status">
          {walk.message}
        </p>
      ) : null}

      {walk.state === 'done' ? (
        <DepartureAnswer
          departure={walk.departure}
          source={provider.name}
          tree={tree}
          openable={openable}
          onGoTo={goTo}
          onOpenGame={(game) => void openGame(game)}
          onMark={(departure) => {
            const changed = applyEdit((current) =>
              markDeparture(current, departure, provider.name),
            );
            notify({
              tone: changed ? 'success' : 'info',
              message: changed
                ? `Written into the game at ${departure.label}. Undo with ⌘Z.`
                : 'The game already carries this note.',
            });
          }}
        />
      ) : null}
    </section>
  );
}

function DepartureAnswer({
  departure,
  source,
  tree,
  openable,
  onGoTo,
  onOpenGame,
  onMark,
}: {
  readonly departure: Departure;
  readonly source: string;
  readonly tree: GameTree;
  readonly openable: boolean;
  readonly onGoTo: (id: string) => void;
  readonly onOpenGame: (game: DatabaseGameRef) => void;
  readonly onMark: (departure: Extract<Departure, { kind: 'left' }>) => void;
}) {
  const lastKnown =
    departure.kind === 'left' || departure.kind === 'uncertain'
      ? tree.nodes[departure.known.nodeId]
      : undefined;
  const before = lastKnown?.move ? `after ${moveLabelOf(lastKnown)}` : 'at the start';

  switch (departure.kind) {
    case 'not-in-source':
      return (
        <p className="mt-1 text-secondary" data-departure-sentence>
          {source} has no games from this game’s starting position.
        </p>
      );
    case 'past-depth': {
      const node = tree.nodes[departure.nodeId];
      return (
        <p className="mt-1 text-secondary" data-departure-sentence>
          The game is still in {source} at {node?.move ? moveLabelOf(node) : 'the start'}, and the
          source records nothing past it.
          {departure.stated
            ? ' It aggregated positions only to that depth, so this is where it stops, not where the game left it.'
            : ' That can be where it stops recording rather than where the game left it.'}
        </p>
      );
    }
    case 'followed': {
      const node = tree.nodes[departure.nodeId];
      return (
        <p className="mt-1 text-secondary" data-departure-sentence>
          {departure.capped
            ? `Every move to ${node?.move ? moveLabelOf(node) : 'here'} is in ${source}; the walk stopped there.`
            : `Every move of the game is in ${source}: ${departure.totalGames.toLocaleString()} ${
                departure.totalGames === 1 ? 'game reaches' : 'games reach'
              } its last position.`}
        </p>
      );
    }
    case 'uncertain':
      return (
        <p className="mt-1 text-secondary" data-departure-sentence>
          {departure.label} is not among the {DEPARTURE_MOVE_LIMIT} moves {source} listed {before},
          so it may be further down its list. Not reported as a departure.
        </p>
      );
    case 'left': {
      const instead = describeMoves(departure.known.moves);
      return (
        <div className="mt-1 space-y-1">
          <p className="text-secondary" data-departure-sentence>
            <span className="font-medium text-primary">
              Leaves {source} at {departure.label}.
            </span>{' '}
            {departure.known.totalGames.toLocaleString()}{' '}
            {departure.known.totalGames === 1 ? 'game' : 'games'} reached the position {before}
            {instead ? `; they played ${instead}` : ''}.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => onGoTo(departure.nodeId)}>
              Go to {departure.label}
            </Button>
            <Button size="sm" onClick={() => onMark(departure)}>
              Write it into the game
            </Button>
          </div>
          {departure.known.games.length > 0 ? (
            <div>
              <p className="text-tertiary">Games that reached the position {before}:</p>
              <ul className="divide-y divide-line-subtle">
                {departure.known.games.slice(0, 5).map((game) => {
                  const text = `${game.white} – ${game.black} ${game.result}${
                    game.year ? ` · ${game.year}` : ''
                  }${game.event ? ` · ${game.event}` : ''}`;
                  return (
                    <li key={game.id} className="py-0.5">
                      {openable ? (
                        <button
                          type="button"
                          className="w-full truncate text-left text-secondary hover:text-accent"
                          aria-label={`Open ${game.white} – ${game.black} in a new tab`}
                          onClick={() => onOpenGame(game)}
                        >
                          {text}
                        </button>
                      ) : (
                        <span className="block truncate text-secondary">{text}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      );
    }
  }
}
