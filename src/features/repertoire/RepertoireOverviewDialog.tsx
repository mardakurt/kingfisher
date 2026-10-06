'use client';

import { useQuery } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import type { RepertoireRecord, RepertoirePositionRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { loadOpeningIndex } from '@/theory/openings';
import { repertoireOverview } from '@/repertoire/overview';
import { plural } from '@/lib/plural';

export default function RepertoireOverviewDialog({
  onClose,
  onSelect,
}: {
  readonly onClose: () => void;
  readonly onSelect: (
    repertoire: RepertoireRecord,
    position: RepertoirePositionRecord | null,
  ) => void;
}) {
  const query = useQuery({
    queryKey: ['persistence', 'repertoires', 'overview'],
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const [repositories, index] = await Promise.all([getRepositories(), loadOpeningIndex()]);
      const list = await repositories.repertoires.list();
      const records = await Promise.all(
        list.map((entry) => repositories.repertoires.get(entry.id)),
      );
      return records.flatMap((record) =>
        record
          ? [
              {
                repertoire: record.repertoire,
                positions: record.positions.length,
                positionRecords: record.positions,
                openings: repertoireOverview(record, (key) => index.lookup(key)?.name ?? null),
              },
            ]
          : [],
      );
    },
  });
  return (
    <Dialog open title="Your openings" onClose={onClose} width="w-[720px]">
      <div className="space-y-4" data-repertoire-overview>
        <p className="text-2xs text-secondary">
          Your recorded main and alternative moves, by repertoire and named opening. Candidates,
          avoided moves and expected replies are excluded. A position is counted once, including
          transpositions. Names come from the CC0 opening classification; unnamed positions stay
          unclassified.
        </p>
        {query.isPending ? (
          <p role="status" className="text-2xs text-secondary">
            Reading your repertoires…
          </p>
        ) : null}
        {query.isError ? (
          <div role="alert" className="text-2xs text-danger">
            Your repertoires could not be read.{' '}
            <Button size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}
        {query.data?.length === 0 ? (
          <p className="text-2xs text-secondary">
            No repertoires yet. Create one, then add the moves you intend to play.
          </p>
        ) : null}
        {(['w', 'b'] as const).map((color) => {
          const entries = query.data?.filter((entry) => entry.repertoire.color === color) ?? [];
          if (!entries.length) return null;
          return (
            <section
              key={color}
              aria-label={color === 'w' ? 'White repertoires' : 'Black repertoires'}
            >
              <h3 className="mb-2 text-sm font-medium text-primary">
                As {color === 'w' ? 'White' : 'Black'}
              </h3>
              <div className="space-y-2">
                {entries.map((entry) => (
                  <article key={entry.repertoire.id} className="rounded border border-line p-3">
                    <button
                      className="text-left text-xs font-medium text-primary hover:text-accent-ink"
                      onClick={() => onSelect(entry.repertoire, null)}
                    >
                      {entry.repertoire.title}
                    </button>
                    <p className="mt-1 text-2xs text-tertiary">
                      {plural(entry.positions, 'stored position')} ·{' '}
                      {plural(
                        entry.openings.reduce((sum, opening) => sum + opening.positions, 0),
                        'position with intended moves',
                        'positions with intended moves',
                      )}
                    </p>
                    {entry.openings.length ? (
                      <ul className="mt-2 space-y-1">
                        {entry.openings.map((opening) => (
                          <li key={opening.name}>
                            <button
                              onClick={() =>
                                onSelect(
                                  entry.repertoire,
                                  entry.positionRecords.find(
                                    (position) => position.id === opening.positionId,
                                  ) ?? null,
                                )
                              }
                              className="flex w-full flex-wrap items-baseline justify-between gap-x-3 rounded px-1 py-1 text-left text-2xs text-primary hover:bg-surface-2"
                            >
                              <span>{opening.name}</span>
                              <span className="text-secondary">
                                {plural(opening.positions, 'position')} ·{' '}
                                {plural(opening.moves, 'intended move')}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-2xs text-tertiary">
                        No main or alternative moves for your side yet.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
