'use client';

/**
 * What Kingfisher already knows about the position being set up.
 *
 * A position is an identity, not a diagram, and now that every door writes
 * the same canonical form the setup dialog can answer the question a player
 * has while placing the last piece: have I been here before? Two sources,
 * kept apart the way the explorer keeps them: the person's own work (games,
 * chapters, repertoire, training…) through the same lookup the command
 * palette uses, and the chosen reference source's game count. Each line
 * names where it came from, and a source that cannot answer says so rather
 * than reading as "nowhere".
 */

import { useQuery } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import type { Fen } from '@/chess/types';
import { databaseProviderById, defaultDatabaseProviderId } from '@/database/registry';
import { DatabaseError } from '@/database/types';
import { plural } from '@/lib/plural';
import {
  positionHitLabel,
  searchByPosition,
  type PositionHitKind,
} from '@/persistence/position-search';
import { getRepositories } from '@/persistence/repositories';
import { usePreferences } from '@/stores/preferences-store';

/** How many of the person's own hits are listed before "and N more". */
const SHOWN = 4;

export function KnownPosition({ fen }: { readonly fen: Fen | null }) {
  const sourceId = usePreferences((state) => state.explorerSourceId);
  const key = fen ? positionKey(fen) : null;

  const mine = useQuery({
    queryKey: ['position-search', key],
    enabled: key !== null,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => searchByPosition(await getRepositories(), fen!),
  });

  const reference = useQuery({
    queryKey: ['setup-reference', sourceId, key],
    enabled: key !== null,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const provider =
        databaseProviderById(sourceId) ?? databaseProviderById(defaultDatabaseProviderId);
      if (!provider) return null;
      try {
        const result = await provider.explore({ fen: fen!, limit: 1 });
        return { name: provider.name, games: result.totalGames };
      } catch (error) {
        return {
          name: provider.name,
          games: null,
          reason: error instanceof DatabaseError ? error.message : 'could not answer',
        };
      }
    },
  });

  if (!fen) return null;

  const hits = mine.data?.hits ?? [];
  const byKind = new Map<string, number>();
  for (const hit of hits) byKind.set(hit.kind, (byKind.get(hit.kind) ?? 0) + 1);
  const summary = [...byKind.entries()]
    .map(([kind, count]) => plural(count, positionHitLabel(kind as PositionHitKind).toLowerCase()))
    .join(' · ');

  return (
    <section className="border-t border-line-subtle pt-3" data-known-position>
      <h3 className="text-xs font-semibold text-primary">Known position?</h3>
      <dl className="mt-1.5 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-tertiary">Your work</dt>
          <dd className="min-w-0 flex-1 text-secondary">
            {mine.isPending ? (
              'Looking…'
            ) : hits.length === 0 ? (
              'Not stored anywhere yet.'
            ) : (
              <>
                <span className="tabular">{summary}</span>
                <ul className="mt-0.5 space-y-0.5">
                  {hits.slice(0, SHOWN).map((hit) => (
                    <li key={hit.id} className="truncate text-tertiary">
                      <span className="text-secondary">{positionHitLabel(hit.kind)}</span> ·{' '}
                      {hit.title}
                      {hit.ply !== undefined ? ` · ply ${hit.ply}` : ''}
                      {hit.subtitle ? ` · ${hit.subtitle}` : ''}
                    </li>
                  ))}
                  {hits.length > SHOWN ? (
                    <li className="text-tertiary">and {hits.length - SHOWN} more</li>
                  ) : null}
                </ul>
              </>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-tertiary">Reference</dt>
          <dd className="min-w-0 flex-1 text-secondary tabular">
            {reference.isPending
              ? 'Looking…'
              : !reference.data
                ? 'No reference source is available.'
                : reference.data.games === null
                  ? `${reference.data.name}: ${reference.data.reason}.`
                  : `${plural(reference.data.games, 'game')} in ${reference.data.name}.`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
