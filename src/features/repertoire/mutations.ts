'use client';

/**
 * Repertoire writes.
 *
 * Kept apart from the components so that adding a line from the analysis board,
 * from the repertoire screen, or from the command palette all go through one
 * implementation — and so the merge semantics (a repeated position is updated,
 * never duplicated) live in exactly one place.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getRepositories } from '@/persistence/repositories';
import type { RepertoireRecord } from '@/persistence/domain';
import type { LineEntry } from '@/repertoire';

export { invalidateRepertoires, useRepertoire, useRepertoires } from '../persistence/queries';
import { invalidateRepertoires } from '../persistence/queries';

export interface SaveLineInput {
  /** null creates a new repertoire from `title` and `color`. */
  readonly repertoireId: string | null;
  readonly title: string;
  readonly color: 'w' | 'b';
  readonly entries: readonly LineEntry[];
}

export function useRepertoireMutation() {
  const client = useQueryClient();

  return useMutation<RepertoireRecord, Error, SaveLineInput>({
    mutationFn: async (input) => {
      const repositories = await getRepositories();
      const existing = input.repertoireId
        ? await repositories.repertoires.get(input.repertoireId)
        : null;
      const repertoire =
        existing?.repertoire ??
        (await repositories.repertoires.create({
          title: input.title || 'Untitled repertoire',
          color: input.color,
        }));

      const revisions = new Map(
        (existing?.positions ?? []).map((position) => [position.positionKey, position.revision]),
      );

      for (const entry of input.entries) {
        const written = await repositories.repertoires.upsertPosition({
          repertoireId: repertoire.id,
          fen: entry.fen,
          sideToMove: entry.sideToMove,
          depth: entry.depth,
          moves: [entry.move],
          ...(entry.move.note ? { note: entry.move.note } : {}),
          ...(revisions.has(entry.positionKey)
            ? { expectedRevision: revisions.get(entry.positionKey) }
            : {}),
        });
        revisions.set(entry.positionKey, written.revision);
      }

      return repertoire;
    },
    onSuccess: () => invalidateRepertoires(client),
  });
}
