'use client';

/**
 * The opening library.
 *
 * The explorer answers "what is played here" once you are already at a
 * position. Getting *to* a position required knowing its moves, which is the
 * wrong way round for the thing people ask most often — "show me the Najdorf".
 *
 * Everything on an opening's page is either a fact from the CC0 dataset (name,
 * ECO, the line), a count from a reference source (named, with its
 * denominator), something the rules code computed (transpositions, each one
 * replayed), or the user's own material. There is no prose about plans or
 * ideas: writing that would either be somebody else's theory or Kingfisher's
 * invention, and this application does neither.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { asFen, type Fen } from '@/chess/types';
import { Board, Search } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { MiniBoard } from '@/features/board/MiniBoard';
import { openReferenceGame } from '@/features/games/open-reference-game';
import { useExplorer } from '@/features/explorer/useExplorer';
import { useRepertoiresAtPosition } from '@/features/persistence/queries';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { cn } from '@/lib/cn';
import { VariationBriefPanel } from './VariationBriefPanel';
import {
  alternativeMoveOrders,
  fenAfter,
  loadOpeningCatalog,
  OPENING_FAMILIES,
  searchOpenings,
  type OpeningEntry,
} from '@/theory/opening-catalog';
import { openingLineage } from '@/theory/openings';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

/**
 * Starting points, so an empty search box is a menu rather than a blank.
 *
 * The same list the catalog orders its empty result by, so a chip and the list
 * under it cannot disagree about what a family is called.
 */
const FAMILIES = OPENING_FAMILIES.slice(0, 18);

export function OpeningLibrary() {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const catalog = useQuery({
    queryKey: ['opening-catalog'],
    queryFn: loadOpeningCatalog,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const entries = catalog.data ?? EMPTY;
  const results = useMemo(() => searchOpenings(entries, query, 200), [entries, query]);
  const selected = entries.find((entry) => entry.key === selectedKey) ?? results[0]?.entry ?? null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:overflow-hidden">
      <section className="flex min-h-0 flex-col border-b border-line-subtle bg-surface-1 lg:border-r lg:border-b-0">
        <div className="shrink-0 border-b border-line-subtle p-3">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-tertiary" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedKey(null);
              }}
              placeholder="Najdorf · B90 · 1.e4 c5 2.Nf3 · a FEN"
              aria-label="Search openings"
              className="h-9 w-full rounded-[5px] border border-line bg-surface-2 pl-8 pr-2.5 text-sm text-primary placeholder:text-tertiary focus:border-accent focus:outline-none"
            />
          </label>
          {query.trim().length === 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {FAMILIES.map((family) => (
                <button
                  key={family}
                  type="button"
                  onClick={() => setQuery(family)}
                  className="rounded-[4px] border border-line px-1.5 py-0.5 text-[11px] text-tertiary transition-colors hover:border-line-strong hover:text-secondary"
                >
                  {family.replace(' Defense', '').replace(' Opening', '')}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-[11px] text-tertiary">
              {results.length === 200 ? 'First 200 of more' : `${results.length} matching`}
              {results[0] ? ` · matched by ${results[0].reason}` : ''}
            </p>
          )}
        </div>

        <ul
          className="min-h-0 flex-1 divide-y divide-line-subtle overflow-auto"
          data-opening-results
        >
          {results.map(({ entry }) => (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => setSelectedKey(entry.key)}
                title={entry.label}
                className={cn(
                  'flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-2',
                  selected?.key === entry.key && 'bg-surface-3',
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className="shrink-0 font-mono text-[11px] text-accent">{entry.eco}</span>
                  <span
                    className="min-w-0 flex-1 text-sm leading-snug text-primary"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'normal',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {entry.label}
                  </span>
                </span>
                <span className="block truncate font-mono text-[10px] text-tertiary">
                  {numbered(entry.moves)}
                </span>
              </button>
            </li>
          ))}
          {catalog.isPending ? (
            <li className="p-4 text-sm text-tertiary">Loading the opening dataset…</li>
          ) : null}
          {!catalog.isPending && results.length === 0 ? (
            <li className="p-4 text-sm text-tertiary">
              Nothing in the dataset matches “{query}”. Try an ECO code, a family name, or the
              moves.
            </li>
          ) : null}
        </ul>
      </section>

      <main className="min-h-0 overflow-auto">
        {selected ? (
          <OpeningDetail entry={selected} />
        ) : (
          <EmptyState
            title="Choose an opening"
            description="Search by name, ECO code, move sequence or position, or pick a family."
          />
        )}
      </main>
    </div>
  );
}

const EMPTY: readonly OpeningEntry[] = [];
const NO_ORDERS: readonly (readonly string[])[] = [];

function OpeningDetail({ entry }: { readonly entry: OpeningEntry }) {
  const router = useRouter();
  const prefs = usePreferences();
  const providers = useDatabaseProviders();
  const notify = useUi((state) => state.notify);
  const loadPgn = useAnalysis((state) => state.loadPgn);
  const setDocument = useAnalysis((state) => state.setDocument);

  const fen = useMemo(() => fenAfter(entry.moves) ?? asFen(''), [entry.moves]);
  const provider =
    providers.find((candidate) => candidate.id === prefs.explorerSourceId) ?? providers[0];
  const explorer = useExplorer(provider?.id ?? '', fen as Fen, {});
  const repertoires = useRepertoiresAtPosition(entry.key);

  /*
    Transposition search is bounded but not free, and it is a pure function of
    the line — so it is cached by the query client rather than recomputed every
    time this component re-renders because an explorer request came back.
  */
  const transpositions = useQuery({
    queryKey: ['opening-transpositions', entry.key],
    queryFn: () => alternativeMoveOrders(entry.moves),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const orders = transpositions.data ?? NO_ORDERS;

  /*
    Through the PGN parser rather than by pushing moves into the tree. The
    library's line is data from a file, and data from a file goes through the
    same validation as any other — a dataset line the rules code cannot play is
    a bug worth seeing, not a board to silently half-fill.
  */
  const openOnBoard = () => {
    const loaded = loadPgn(`${numbered(entry.moves)} *`);
    if (!loaded.ok) {
      notify({ tone: 'error', message: `${entry.label} could not be replayed.` });
      return;
    }
    setDocument({ kind: 'untitled', title: entry.label });
    router.push('/analysis');
  };

  const total = explorer.data?.totalGames ?? 0;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6" data-opening-detail={entry.key}>
      <div className="flex flex-wrap items-start gap-5">
        <div className="w-[220px] shrink-0">
          <MiniBoard fen={fen} theme={prefs.boardTheme} pieceSet={prefs.pieceSet} />
          <Button icon={<Board />} className="mt-2 w-full justify-center" onClick={openOnBoard}>
            Open on the board
          </Button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="rounded-[3px] bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-accent">
              {entry.eco}
            </span>
            <h2 className="text-lg font-semibold text-primary">{entry.name}</h2>
          </div>
          {entry.variation ? (
            <p className="mt-0.5 text-sm text-secondary">{entry.variation}</p>
          ) : null}
          <p className="mt-2 font-mono text-sm text-primary">{numbered(entry.moves)}</p>
          <p className="mt-1 text-[11px] text-tertiary">
            {entry.plies} {entry.plies === 1 ? 'ply' : 'plies'} · named by the CC0 opening dataset
            Kingfisher classifies with, replayed through its own rules code.
          </p>

          {/*
            The explanation goes with the identity, above the move orders and
            the statistics. A reader who has just searched for "Najdorf" wants
            to know what it is before they are shown thirteen transpositions
            into it.
          */}
          <VariationBriefPanel
            lineage={openingLineage(entry.name, entry.variation)}
            density="comfortable"
          />

          <Section title="Also reached by">
            {transpositions.isPending ? (
              <p className="text-xs text-tertiary">Searching move orders…</p>
            ) : orders.length === 0 ? (
              <p className="text-xs text-tertiary">
                No other legal move order into this exact position was found within the search
                bound.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {orders.map((order) => (
                  <li key={order.join(' ')} className="font-mono text-xs text-secondary">
                    {numbered(order)}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <Section title={`In ${provider?.name ?? 'the selected source'}`}>
        {explorer.isPending ? (
          <p className="text-xs text-tertiary">Reading the reference source…</p>
        ) : explorer.isError ? (
          <p className="text-xs text-tertiary">
            {provider?.name ?? 'That source'} could not answer:{' '}
            {explorer.error instanceof Error ? explorer.error.message : 'unknown error'}. Choose
            another source in the explorer.
          </p>
        ) : total === 0 ? (
          <p className="text-xs text-tertiary">
            No games reach this position in {provider?.name ?? 'the selected source'}.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-secondary">
              {total.toLocaleString()} games · {percent(explorer.data?.white ?? 0, total)} white,{' '}
              {percent(explorer.data?.draws ?? 0, total)} drawn,{' '}
              {percent(explorer.data?.black ?? 0, total)} black
            </p>
            <table className="w-full text-xs">
              <thead className="border-b border-line-subtle text-left text-[10px] uppercase tracking-wide text-tertiary">
                <tr>
                  <th className="py-1.5">Move</th>
                  <th className="py-1.5 text-right">Games</th>
                  <th className="py-1.5 text-right">Share</th>
                  <th className="py-1.5 text-right">W / D / B</th>
                  <th className="py-1.5 text-right">Recent</th>
                </tr>
              </thead>
              <tbody>
                {explorer.data?.moves.slice(0, 10).map((move) => (
                  <tr key={move.uci} className="border-b border-line-subtle last:border-0">
                    <td className="py-1.5 font-medium text-primary">{move.san}</td>
                    <td className="py-1.5 text-right text-secondary tabular">
                      {move.games.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right text-secondary tabular">
                      {percent(move.games, total)}
                    </td>
                    <td className="py-1.5 text-right text-tertiary tabular">
                      {move.white} / {move.draws} / {move.black}
                    </td>
                    <td className="py-1.5 text-right text-tertiary tabular">
                      {move.recent
                        ? `${move.recent.games.toLocaleString()} since ${move.recent.sinceYear}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      <Section title="Model games">
        {(explorer.data?.topGames?.length ?? 0) === 0 ? (
          <p className="text-xs text-tertiary">
            {provider?.name ?? 'The selected source'} has no game to open at this position.
          </p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {explorer.data?.topGames?.map((game) => (
              <li key={game.id} className="flex items-center gap-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-primary">
                    {game.white} – {game.black}
                  </span>
                  <span className="block truncate text-[10px] text-tertiary">
                    {[game.result, game.year, game.event].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {provider?.game ? (
                  <Button
                    variant="subtle"
                    onClick={async () => {
                      try {
                        await openReferenceGame(
                          provider.id,
                          provider.name,
                          game.id,
                          `${game.white} – ${game.black}`,
                        );
                        router.push('/analysis');
                      } catch {
                        notify({ tone: 'error', message: 'That game could not be opened.' });
                      }
                    }}
                  >
                    Open
                  </Button>
                ) : game.url ? (
                  <a
                    href={game.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-accent underline-offset-2 hover:underline"
                  >
                    View
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Your repertoire">
        {(repertoires.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-tertiary">No repertoire of yours covers this position.</p>
        ) : (
          <ul className="space-y-1">
            {repertoires.data?.map((position) => (
              <li key={position.id} className="text-xs text-secondary">
                {position.moves.length} recorded {position.moves.length === 1 ? 'reply' : 'replies'}
                : {position.moves.map((move) => move.san).join(', ')}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) => (
  <section className="mt-5 border-t border-line-subtle pt-3">
    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
      {title}
    </h3>
    {children}
  </section>
);

const percent = (part: number, whole: number): string =>
  whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;

/** `1.e4 c5 2.Nf3`, the way it is written on a page rather than in a token list. */
export function numbered(moves: readonly string[]): string {
  const parts: string[] = [];
  for (let index = 0; index < moves.length; index += 1) {
    if (index % 2 === 0) parts.push(`${index / 2 + 1}.${moves[index]}`);
    else parts.push(moves[index] as string);
  }
  return parts.join(' ');
}
