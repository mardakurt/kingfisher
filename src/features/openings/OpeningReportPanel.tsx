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
 * So `continuations` is asked for from whichever source can answer, and when
 * none can, the two sections are **absent rather than empty**:
 * `buildOpeningReport` drops a section whose input was never supplied, which
 * is a different statement from one that was looked for and found nothing.
 */

import { useEffect, useMemo, useState } from 'react';

import { PanelBody, PanelHeader } from '@/components/ui/Panel';
import { nodePath } from '@/chess/tree/tree';
import type { Fen } from '@/chess/types';
import { useChessWorkspace } from '@/features/workspace/ChessWorkspaceContext';
import { useQuery } from '@tanstack/react-query';

import { databaseProviderById } from '@/database/registry';
import { useExplorerSources } from '@/features/explorer/useExplorer';
import { useReferenceSources } from '@/reference/use-references';
import type { BranchPopulation } from '@/theory/critical-branches';
import { loadTheoryBook, type TheoryBook } from '@/theory/theory-book';

import { buildOpeningReport } from './opening-report';

/**
 * How each source is used in the report.
 *
 * One reference to count frequencies against, one recent population to find
 * what is growing, and one contrasting population to find where practice
 * disagrees. The roles are assigned by what a source *is* rather than by the
 * order it happens to be installed in, because "recent" and "contrast" are
 * claims about the population and getting them the wrong way round would
 * reverse every growth figure in the report.
 */
function roleOf(id: string, index: number): BranchPopulation['role'] {
  if (id.includes('recent')) return 'recent';
  if (id.includes('online') || id.includes('lichess')) return 'contrast';
  return index === 0 ? 'reference' : 'contrast';
}

export function OpeningReportPanel() {
  const { tree, currentId } = useChessWorkspace();
  const references = useReferenceSources();
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

  const node = tree.nodes[currentId];
  const fen = (node?.fen ?? '') as Fen;

  /*
    Every source that can actually answer. A source that is not installed is
    not a column that failed — it is a column that was never asked for, and the
    report's own rule is that those are different facts.
  */
  const sources = useMemo(
    () => references.sources.filter((source) => source.installed && source.enabled).slice(0, 3),
    [references.sources],
  );
  const results = useExplorerSources(
    sources.map((source) => source.id),
    fen,
    {},
  );

  const populations: readonly BranchPopulation[] = sources.map((source, index) => {
    const query = results[index];
    return {
      id: source.id,
      name: source.name,
      role: roleOf(source.id, index),
      // Undefined while loading, null when the source could not answer. The
      // report distinguishes them and so must this.
      result: query?.isPending ? undefined : (query?.data ?? null),
    };
  });

  /*
    The continuations, from the first source that can supply them. Most cannot:
    a reference pack has aggregated its games away. The query is keyed on the
    position so that walking the board re-asks, and it returns an empty list
    rather than throwing when the companion is not there.
  */
  const continuationSource = sources.find((source) =>
    Boolean(databaseProviderById(source.id)?.continuations),
  );
  const continuations = useQuery({
    queryKey: ['opening-report-continuations', continuationSource?.id ?? null, fen],
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

  /*
    `populations` is a fresh array on every render, so it cannot be a dependency
    on its own. What actually changes the report is which sources answered and
    with how many games, so that is what the memo watches.
  */
  const answered = populations
    .map((population) => `${population.id}:${population.result?.totalGames ?? '-'}`)
    .join('|');

  const report = useMemo(
    () =>
      buildOpeningReport({
        fen,
        placement,
        ...(placement ? { crumbs: book?.crumbs(placement.node.key) ?? [] } : {}),
        ...(placement ? { children: book?.variations(placement.node.key) ?? [] } : {}),
        ...(placement ? { brief: book?.brief(placement.node.key) ?? null } : {}),
        populations,
        // Absent when nothing can answer, which drops the plan sections rather
        // than showing them empty.
        ...(continuations.data ? { continuations: continuations.data } : {}),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fen, placement, book, answered, continuations.data],
  );

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
          {report.sections.map((section) => (
            <section key={section.id} data-report-section={section.id}>
              <h3 className="text-xs font-semibold tracking-wide text-secondary uppercase">
                {section.title}
              </h3>
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
                      <span className="text-primary">{entry.primary}</span>
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
