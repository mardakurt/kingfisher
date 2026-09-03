'use client';

/**
 * Every move order in this repertoire that reaches this decision.
 *
 * The point is reassurance, and it is a real one. A player editing a Catalan
 * tabiya has no way to know, from a tree, whether the change they just made
 * also applies to the two other move orders they play into it — and the
 * answer, in Kingfisher, is that it always does, because a repertoire is a map
 * from *positions* to moves (ADR 0010). This panel is the evidence for that
 * claim rather than a request to trust it.
 *
 * It is read-only on purpose. There is nothing to edit here: the decision is
 * one record, shown by the panel above, and these are the ways in.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getRepositories } from '@/persistence/repositories';
import { convergencePoints, describeRoute, routesToPosition } from '@/repertoire/transpositions';
import type { RepertoireId } from '@/persistence/domain';

export function TranspositionRoutes({
  repertoireId,
  positionKey,
}: {
  readonly repertoireId: RepertoireId;
  readonly positionKey: string;
}) {
  const repertoire = useQuery({
    queryKey: ['persistence', 'repertoire', repertoireId],
    queryFn: async () => (await getRepositories()).repertoires.get(repertoireId),
    staleTime: 0,
    retry: false,
  });

  const view = useMemo(() => {
    const positions = repertoire.data?.positions ?? [];
    if (positions.length === 0) return null;
    return {
      routes: routesToPosition(positions, positionKey),
      convergence: convergencePoints(positions).find((point) => point.positionKey === positionKey),
    };
  }, [repertoire.data, positionKey]);

  if (repertoire.isPending) {
    return <p className="px-3 py-2 text-[10px] text-tertiary">Reading move orders…</p>;
  }
  if (!view || view.routes.routes.length === 0) {
    return (
      <p className="px-3 py-2 text-[10px] leading-relaxed text-tertiary">
        No other prepared move order reaches this position yet.
      </p>
    );
  }

  return (
    <section className="border-t border-line-subtle px-3 py-2.5">
      <h4 className="text-[9.5px] uppercase tracking-wide text-tertiary">Reached through</h4>
      <ol className="mt-1 flex flex-col gap-0.5">
        {view.routes.routes.map((route) => (
          <li key={route.moves.map((move) => move.toKey).join('|')}>
            <span className="font-mono text-[10.5px] text-secondary">{describeRoute(route)}</span>
          </li>
        ))}
      </ol>
      {view.routes.truncated ? (
        <p className="mt-1 text-[9.5px] text-tertiary">
          More move orders reach this position than are listed.
        </p>
      ) : null}
      {/*
        The sentence this panel exists for. It states the consequence rather
        than leaving the reader to infer it from a list of lines.
      */}
      <p className="mt-1.5 text-[10px] leading-relaxed text-tertiary">
        {view.convergence ? `${view.convergence.routes} move orders converge here. ` : ''}
        All of them share the one decision above — editing it through any route changes every route.
      </p>
    </section>
  );
}
