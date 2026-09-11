'use client';

/**
 * The shared "compare sources" surface for the review workspace.
 *
 * It is the same component the Explorer uses — see
 * `src/features/explorer/SourceComparison.tsx` — wrapped only by the
 * state the Review workspace already has (the position and the
 * configured source list). Anything else would be a duplicate
 * component that drifts the moment one of them changes.
 */

import { useMemo, useState } from 'react';

import type { Fen } from '@/chess/types';
import type { ExplorerFilters } from '@/database/types';
import { SourceComparison } from '@/features/explorer/SourceComparison';
import { useExplorerSources } from '@/features/explorer/useExplorer';
import type { ReferenceSource } from '@/reference/types';
import { useReferenceSources } from '@/reference/use-references';

/**
 * Render the multi-source comparison panel for a review position.
 *
 * Defaults to Elite OTB and Recent Theory — the two sources the brief
 * (PART BH) declares as the default comparison pair. The user can add
 * more from the same picker the Explorer uses; selecting a source here
 * is local to the review workspace and never persists.
 */
export function ReviewSourceComparison({ fen }: { readonly fen: Fen }) {
  const snapshot = useReferenceSources();
  const sources: readonly ReferenceSource[] = snapshot.sources;
  const whiteToMove = useMemo(() => fen.split(/\s+/)[1] === 'w', [fen]);
  const filters = useMemo<ExplorerFilters>(() => ({}), []);
  const installed = useMemo(() => sources.filter((source) => source.installed), [sources]);

  const defaultIds = useMemo(() => {
    const elite = installed.find((source) => source.id.includes('elite'))?.id;
    const theory = installed.find(
      (source) => source.id.includes('recent') || source.id.includes('theory'),
    )?.id;
    return [elite, theory].filter((id): id is string => Boolean(id));
  }, [installed]);

  const [selected, setSelected] = useState<readonly string[]>(defaultIds);
  // The user's pick is preserved on every subsequent render, including when
  // the source snapshot changes. A user who has chosen their own set of
  // sources is never silently re-defaulted.

  const queries = useExplorerSources(selected, fen, filters);
  void queries;

  return (
    <SourceComparison
      sources={sources}
      fen={fen}
      filters={filters}
      whiteToMove={whiteToMove}
      selected={selected}
      onSelectedChange={setSelected}
      onPlay={() => {
        /*
         * The review workspace does not auto-play from a reference move;
         * opening the explorer is the right way to drill into a single
         * source. The brief is explicit that the comparison here is for
         * reading, not navigating.
         */
      }}
    />
  );
}
