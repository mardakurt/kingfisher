'use client';

/**
 * The Opening Report, on the board's current position.
 *
 * `opening-report.ts` decides what the report says and this decides nothing:
 * it gathers the evidence the report is built from — where the theory book
 * places the position, what each installed source played there, what the
 * repertoire answers — hands it over, and renders the sections that come back.
 * Every rule about provenance, empty sections and never merging populations
 * lives in the module, with its own tests, rather than in a component.
 *
 * ## Why the sections are rendered generically
 *
 * A `ReportSection` carries a provenance line or a stated reason it is empty,
 * and the module guarantees one of the two for every section. Rendering each
 * section by hand would let a future one quietly ship without either. So there
 * is one renderer, it always draws the provenance, and a section with nothing
 * to say draws why — which makes the guarantee visible rather than merely
 * asserted in a test.
 *
 * ## The plan sections, and when they appear
 *
 * Where the pieces go and which pawns advance are counted by replaying the
 * continuations of the games that reached this position. Only a source that
 * still holds per-game moves can supply those — a SQLite collection through
 * the companion does; a reference pack aggregated its games into per-position
 * counts before Kingfisher ever saw them and cannot.
 *
 * So `continuations` is asked for from whichever *registered provider* can
 * answer — deliberately not from the population columns below, which are packs
 * and can never answer — and when none can, the sections are **absent rather
 * than empty**:
 * `buildOpeningReport` drops a section whose input was never supplied, which
 * is a different statement from one that was looked for and found nothing.
 */

import { useExplorerSource } from '@/features/explorer/useExplorerSource';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { PanelBody, PanelHeader } from '@/components/ui/Panel';
import { positionKey } from '@/chess/fen';
import { useRepertoires, useRepertoire } from '@/features/persistence/queries';
import { nodePath } from '@/chess/tree/tree';
import type { Fen } from '@/chess/types';
import { useChessWorkspace } from '@/features/workspace/ChessWorkspaceContext';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { useQueries, useQuery } from '@tanstack/react-query';

import { databaseProviderById } from '@/database/registry';
import { useDatabaseProviders } from '@/database/use-database-providers';
import { useExplorerSources } from '@/features/explorer/useExplorer';
import { librarySource, openSourceGame } from '@/features/games/library-source';
import { packReader } from '@/reference/manager';
import { useReferenceSources } from '@/reference/use-references';
import type { BranchPopulation } from '@/theory/critical-branches';
import { loadTheoryBook, type TheoryBook } from '@/theory/theory-book';

import { buildOpeningReport, type PopulationHistory } from './opening-report';

/**
 * How each source is used in the report.
 *
 * One reference to count frequencies against, one recent population to find
 * what is growing, and one contrasting population to find where practice
 * disagrees. The roles are assigned by what a source *is* rather than by the
 * order it happens to be installed in, because "recent" and "contrast" are
 * claims about the population and getting them the wrong way round would
 * reverse every growth figure in the report.
 *
 * A selected collection is `own` and nothing else, and that is stated rather
 * than left to the fallback. Falling through to `index === 0` would make the
 * reader's own archive the reference population whenever no pack was
 * installed — quietly redefining the opening's branches as their own games —
 * and `contrast` whenever one was, which asserts that their games disagree
 * with theory. Both are decided by an unrelated setting, and neither is true.
 */
function roleOf(id: string, index: number, own = false): BranchPopulation['role'] {
  if (own) return 'own';
  if (id.includes('recent')) return 'recent';
  if (id.includes('online') || id.includes('lichess')) return 'contrast';
  return index === 0 ? 'reference' : 'contrast';
}

export function OpeningReportPanel() {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const { tree, currentId } = useChessWorkspace();
  const references = useReferenceSources();
  const explorerSourceId = usePreferences((state) => state.explorerSourceId);
  const [book, setBook] = useState<TheoryBook | null>(null);

  useEffect(() => {
    let live = true;
    void loadTheoryBook().then(
      (loaded) => {
        if (live) setBook(loaded);
      },
      () => {
        /* A failed chunk load leaves the report without its naming section. */
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const repertoires = useRepertoires();
  const [repertoireId, setRepertoireId] = useState('');
  const selectedRepertoireId = repertoireId || repertoires.data?.[0]?.id || null;
  const repertoire = useRepertoire(selectedRepertoireId);

  const node = tree.nodes[currentId];
  const fen = (node?.fen ?? '') as Fen;
  const providers = useDatabaseProviders();
  const collections = providers.filter(
    (provider) => provider.id.startsWith('sqlite:') && Boolean(provider.positionHistory),
  );
  /*
    `null` is "never decided", and it follows the Explorer source: a player who
    has already pointed the explorer at their archive should not have to answer
    the same question a second time. `''` is the decision "packs only", and it
    is not the same as never having decided — which is why the choice is
    persisted rather than held in component state that a reload discards.
  */
  const reportCollectionId = usePreferences((state) => state.reportCollectionId);
  const setReportCollectionId = usePreferences((state) => state.set);
  const selectedCollectionId =
    reportCollectionId ?? (explorerSourceId.startsWith('sqlite:') ? explorerSourceId : '');
  const selectedCollection = collections.find((provider) => provider.id === selectedCollectionId);

  /*
    Every source that can actually answer. A source that is not installed is
    not a column that failed — it is a column that was never asked for, and the
    report's own rule is that those are different facts.
  */
  const sources = useMemo(
    () => references.sources.filter((source) => source.installed && source.enabled).slice(0, 3),
    [references.sources],
  );
  /*
    The populations, and the selected collection with them.

    `own` travels on the entry rather than being inferred from an id, so the
    collection's role is the same whatever else is installed and whatever
    order the rest arrive in.
  */
  const reportSources: readonly { id: string; name: string; own: boolean }[] = [
    ...sources.map((source) => ({ ...source, own: false })),
    ...(selectedCollection
      ? [{ id: selectedCollection.id, name: selectedCollection.name, own: true }]
      : []),
  ];
  const results = useExplorerSources(
    reportSources.map((source) => source.id),
    fen,
    {},
  );

  const populations: readonly BranchPopulation[] = reportSources.map((source, index) => {
    const query = results[index];
    return {
      id: source.id,
      name: source.name,
      role: roleOf(source.id, index, source.own),
      // Undefined while loading, null when the source could not answer. The
      // report distinguishes them and so must this.
      result: query?.isPending ? undefined : (query?.data ?? null),
    };
  });

  /*
    The continuations, from the first source that can supply them.

    Searched across registered providers. Reference packs aggregate their
    games and cannot supply per-game continuations; a selected SQLite
    collection can, and its plan sections must use that same collection.

    The chosen report collection first, then the chosen Explorer source if it
    can answer, and otherwise the first registered provider. The source is
    reported in the section's own provenance line, because a machine can hold
    several collections and only one of them supplied these games: "106 games
    from Plans" is a citation, "106 games" is a rumour.

    The query is keyed on the position so that walking the board re-asks, and
    it returns an empty list rather than throwing when the companion is not
    there.
  */
  const resolvedSource = useExplorerSource(explorerSourceId);
  const preferred = resolvedSource.kind === 'ready' ? resolvedSource.provider : undefined;
  // While the chosen source could still register, nothing answers in its place.
  const continuationSource = selectedCollectionId
    ? selectedCollection?.continuations
      ? selectedCollection
      : undefined
    : resolvedSource.kind === 'waiting'
      ? undefined
      : preferred?.continuations
        ? preferred
        : providers.find((provider) => Boolean(provider.continuations));
  const continuations = useQuery({
    queryKey: [
      'opening-report-continuations',
      continuationSource?.id ?? null,
      continuationSource?.cacheVersion ?? '',
      fen,
    ],
    enabled: Boolean(continuationSource) && fen.length > 0,
    queryFn: async ({ signal }) => {
      const provider = databaseProviderById(continuationSource!.id);
      if (!provider?.continuations) return [];
      return provider.continuations({ fen, games: 300, plies: 30 }, signal);
    },
    gcTime: 5 * 60_000,
  });

  /*
    The line played to get here. A canonical position key cannot find its own
    ancestors — that is what makes transpositions converge — so the moves are
    how a position deeper than the dataset names is located.
  */
  const line: string[] = [];
  for (const id of nodePath(tree, currentId)) {
    const move = tree.nodes[id]?.move?.san;
    if (move) line.push(move);
  }

  const placement = book?.deepest(line) ?? null;

  const repertoirePosition = repertoire.data?.positions.find(
    (position) => position.positionKey === (fen ? positionKey(fen) : ''),
  );
  const continuationName = continuationSource?.name ?? '';

  /*
    Phase 85: each installed pack's history at this position — its games by
    year and Elo class, and its earliest games — read from the pack itself.
    One population per section (opening-report.ts); a pack built before
    histories existed simply has none, and the report says so.
  */
  const historyKey = fen ? positionKey(fen) : '';
  const historyQueries = useQueries({
    queries: sources.map((source) => ({
      queryKey: ['pack-history', source.id, historyKey],
      enabled: historyKey.length > 0,
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async (): Promise<PopulationHistory> => {
        const reader = packReader(source.id);
        const bands = reader?.manifest.history?.bands ?? [];
        if (!reader?.hasHistory) return { id: source.id, name: source.name, history: null, bands };
        const history = await reader.history(historyKey);
        const games = history ? await reader.games(history.first.map((entry) => entry.id)) : [];
        return {
          id: source.id,
          name: source.name,
          history,
          bands,
          pioneers: games.map((game) => ({
            year: game.year,
            id: game.id,
            white: game.white,
            black: game.black,
            event: game.event,
            result: game.result,
          })),
        };
      },
    })),
  });
  const histories = historyQueries.flatMap((query) => (query.data ? [query.data] : []));
  const collectionHistory = useQuery({
    queryKey: [
      'collection-opening-history',
      selectedCollection?.id ?? '',
      selectedCollection?.cacheVersion ?? '',
      historyKey,
    ],
    enabled: Boolean(selectedCollection && historyKey),
    queryFn: ({ signal }) => selectedCollection!.positionHistory!(fen, signal),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
  const collectionHistoryEntry: PopulationHistory | null =
    selectedCollection && collectionHistory.data
      ? {
          id: selectedCollection.id,
          name: selectedCollection.name,
          history:
            collectionHistory.data.sampledGames === 0
              ? null
              : {
                  key: historyKey,
                  byYear: new Map(
                    collectionHistory.data.byYear.map(({ year, ...tally }) => [year, tally]),
                  ),
                  byBand: new Map(
                    collectionHistory.data.byBand.map(({ band, ...tally }) => [band, tally]),
                  ),
                  first: collectionHistory.data.first.map(({ year, id }) => ({ year, id })),
                },
          bands: collectionHistory.data.bands,
          pioneers: collectionHistory.data.first,
          sample: {
            games: collectionHistory.data.sampledGames,
            hasMore: collectionHistory.data.hasMore,
            undated: collectionHistory.data.undated,
            unrated: collectionHistory.data.unrated,
            undecided: collectionHistory.data.undecided,
          },
        }
      : null;
  const historyAnswered = histories
    .map((entry) => `${entry.id}:${entry.history ? entry.history.first.length : 'none'}`)
    .join('|');

  /*
    Memoised on the answers themselves.

    `populations` is a fresh array on every render, so it cannot be a dependency
    on its own — but the earlier key, a string of each source's total, was
    wrong in a way worth recording: equal game totals do not mean equal move
    distributions, and "still loading" and "could not answer" are different
    evidence that both stringify to nothing. So the key is each source's actual
    move distribution, with a distinct mark for each of those two silences.

    It is memoised at all because rebuilding is not cheap: the plan sections
    replay up to three hundred games thirty plies deep, and this panel
    re-renders on every board interaction.
  */
  const answered = populations
    .map((population) => {
      if (population.result === undefined) return `${population.id}:loading`;
      if (population.result === null) return `${population.id}:unavailable`;
      return `${population.id}:${population.result.moves
        .map((move) => `${move.uci}=${move.games}`)
        .join(',')}`;
    })
    .join('|');
  const report = useMemo(
    () =>
      buildOpeningReport({
        fen,
        placement,
        ...(placement ? { crumbs: placement.crumbs } : {}),
        ...(placement ? { children: book?.variations(placement.node.key) ?? [] } : {}),
        ...(placement ? { brief: book?.brief(placement.node.key) ?? null } : {}),
        populations,
        ...(repertoire.data
          ? {
              repertoireName: repertoire.data.repertoire.title,
              repertoireMoves: (repertoirePosition?.moves ?? [])
                .filter((move) => move.role === 'main' || move.role === 'alternative')
                .map((move) => move.uci),
            }
          : {}),
        // Absent when nothing can answer, which drops the plan sections rather
        // than showing them empty.
        ...(continuations.data
          ? { continuations: continuations.data, continuationSource: continuationName }
          : {}),
        histories: collectionHistoryEntry ? [...histories, collectionHistoryEntry] : histories,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      fen,
      placement,
      book,
      answered,
      continuations.data,
      continuationName,
      repertoire.data,
      repertoirePosition,
      historyAnswered,
      historyKey,
      collectionHistory.data,
      selectedCollection?.id,
    ],
  );

  const openFirstGame = async (id: string) => {
    if (!selectedCollection || !collectionHistory.data) return;
    const game = collectionHistory.data.first.find((entry) => entry.id === id);
    if (!game) return;
    try {
      await openSourceGame(librarySource(selectedCollection.id, selectedCollection.name), game);
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: `Could not open the game from ${selectedCollection.name}.`,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (!node) {
    return (
      <div className="flex min-h-0 flex-col">
        <PanelHeader>Opening Report</PanelHeader>
        <PanelBody>
          <p className="text-xs text-tertiary">No position on the board.</p>
        </PanelBody>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader>Opening Report</PanelHeader>
      <PanelBody>
        <div className="flex flex-col gap-4" data-opening-report>
          {(collections.length > 0 || selectedCollectionId) && (
            <label className="text-xs text-secondary">
              Report collection
              <select
                aria-label="Report collection"
                value={selectedCollectionId}
                onChange={(event) =>
                  setReportCollectionId('reportCollectionId', event.target.value)
                }
                className="mt-1 block w-full rounded border border-line bg-surface-inset p-2"
              >
                <option value="">Reference packs only</option>
                {selectedCollectionId && !selectedCollection && (
                  <option value={selectedCollectionId}>Selected collection unavailable</option>
                )}
                {collections.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedCollectionId && !selectedCollection && (
            <p role="status" className="text-xs text-secondary">
              The selected collection is unavailable. Connect its companion or choose another
              collection.
            </p>
          )}
          {selectedCollection && collectionHistory.isPending && (
            <p role="status" className="text-xs text-secondary">
              Reading a bounded collection sample…
            </p>
          )}
          {selectedCollection && collectionHistory.isError && (
            <p role="alert" className="text-xs text-negative">
              {selectedCollection.name} could not supply history for this position.
            </p>
          )}
          {Boolean(repertoires.data?.length) && (
            <label className="text-xs text-secondary">
              Compare repertoire
              <select
                aria-label="Report repertoire"
                value={selectedRepertoireId ?? ''}
                onChange={(event) => setRepertoireId(event.target.value)}
                className="mt-1 block w-full rounded border border-line bg-surface-inset p-2"
              >
                {repertoires.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {continuations.isError && (
            <p role="alert" className="text-xs text-negative">
              Plan evidence from {continuationSource?.name} could not be loaded. Other sources
              remain available.
            </p>
          )}
          {report.sections.map((section) => (
            <section key={section.id} data-report-section={section.id}>
              <h3 className="text-xs font-semibold text-secondary">{section.title}</h3>
              {/*
                The provenance line, always, when there is one. It is the
                difference between a citation and a rumour, and drawing it here
                rather than per section is what stops a new section shipping
                without one.
              */}
              {section.provenance && (
                <p className="mt-0.5 text-[11px] text-tertiary" data-report-provenance>
                  {section.provenance}
                </p>
              )}
              {section.entries.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {section.entries.map((entry, index) => (
                    <li key={`${section.id}-${index}`} className="text-xs">
                      {section.id === `pioneers:${selectedCollection?.id}` &&
                      collectionHistory.data?.first[index]?.id ? (
                        <button
                          type="button"
                          className="text-left text-accent-ink hover:underline"
                          aria-label={`Open ${collectionHistory.data.first[index]!.white} – ${collectionHistory.data.first[index]!.black} from ${selectedCollection?.name ?? 'collection'}`}
                          onClick={() =>
                            void openFirstGame(collectionHistory.data!.first[index]!.id)
                          }
                        >
                          {entry.primary}
                        </button>
                      ) : (
                        <span className="text-primary">{entry.primary}</span>
                      )}
                      {entry.criterion && (
                        <span className="ml-2 text-[11px] text-tertiary">{entry.criterion}</span>
                      )}
                      {entry.secondary && (
                        <div className="text-[11px] text-secondary">{entry.secondary}</div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                /*
                  Never a blank space. A section with nothing to say says why,
                  because "we looked and found none" and "we did not look" are
                  different findings and a reader is entitled to tell them apart.
                */
                <p className="mt-1 text-[11px] text-tertiary" data-report-empty>
                  {section.emptyReason}
                </p>
              )}
            </section>
          ))}
        </div>
      </PanelBody>
    </div>
  );
}
