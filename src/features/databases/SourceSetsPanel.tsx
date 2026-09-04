'use client';

/**
 * Named sets of collections: "My reference", "Tournament prep", "Elite games".
 *
 * A source set holds *references*, never games. That is the whole point of it:
 * changing your mind about what "my reference" means should be one click, not
 * an import — and a set that copied games would double the disk cost of every
 * way of looking at the same archive.
 *
 * A set naming a collection that is not on this machine today is shown with
 * that entry missing rather than silently rewritten. A companion that is not
 * running is not the same fact as a collection somebody deleted.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Plus, Trash } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { PromptDialog } from '@/components/ui/PromptDialog';
import type { CollectionFacts } from '@/database/collections/types';
import { getRepositories } from '@/persistence/repositories';
import { useUi } from '@/stores/ui-store';

interface SourceSetsPanelProps {
  readonly collections: readonly CollectionFacts[];
  readonly checked: ReadonlySet<string>;
  readonly onApply: (collectionIds: readonly string[]) => void;
}

export function SourceSetsPanel({ collections, checked, onApply }: SourceSetsPanelProps) {
  const notify = useUi((state) => state.notify);
  const queryClient = useQueryClient();
  const [naming, setNaming] = useState(false);

  const sets = useQuery({
    queryKey: ['source-sets'],
    retry: false,
    queryFn: async () => (await getRepositories()).sourceSets.list(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['source-sets'] });

  const save = useMutation({
    mutationFn: async (name: string) => {
      const repositories = await getRepositories();
      return repositories.sourceSets.create({ name, collectionIds: [...checked] });
    },
    onSuccess: (record) => {
      notify({
        tone: 'success',
        message: `“${record.name}” now points at ${record.collectionIds.length} collection${
          record.collectionIds.length === 1 ? '' : 's'
        }.`,
      });
      void invalidate();
    },
    onError: (error) =>
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That set could not be saved.',
      }),
    onSettled: () => setNaming(false),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await getRepositories()).sourceSets.delete(id),
    onSuccess: () => void invalidate(),
  });

  const known = new Set(collections.map((entry) => entry.id));

  return (
    <section className="border-t border-line-subtle">
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-tertiary">
          Source sets
        </h2>
        <Button
          size="sm"
          icon={<Plus />}
          className="ml-auto"
          disabled={checked.size === 0}
          title={
            checked.size === 0
              ? 'Tick the collections this set should point at'
              : `Save the ${checked.size} ticked collections as a set`
          }
          onClick={() => setNaming(true)}
        >
          Save
        </Button>
      </div>

      <ul className="px-2 pb-3">
        {(sets.data ?? []).map((set) => {
          const present = set.collectionIds.filter((id) => known.has(id));
          const missing = set.collectionIds.length - present.length;
          return (
            <li key={set.id} className="mb-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => onApply(present)}
                disabled={present.length === 0}
                className="min-w-0 flex-1 rounded-[4px] px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="block truncate text-xs text-primary">{set.name}</span>
                <span className="block truncate text-[10px] text-tertiary tabular">
                  {present.length} available
                  {missing > 0 ? ` · ${missing} not on this machine` : ''}
                </span>
              </button>
              <IconButton
                label={`Delete source set ${set.name}`}
                tone="danger"
                onClick={() => remove.mutate(set.id)}
              >
                <Trash />
              </IconButton>
            </li>
          );
        })}
        {sets.data && sets.data.length === 0 ? (
          <li className="px-2 py-2 text-[11px] leading-relaxed text-tertiary">
            Tick some collections and save them as a set, so you can bring the same group back with
            one click. Sets point at collections; they never copy games.
          </li>
        ) : null}
      </ul>

      <PromptDialog
        open={naming}
        title="Save source set"
        description={`${checked.size} collection${checked.size === 1 ? '' : 's'} will be referenced. No games are copied.`}
        label="Name"
        placeholder="My reference"
        confirmLabel="Save set"
        onCancel={() => setNaming(false)}
        onSubmit={(value) => save.mutate(value)}
      />
    </section>
  );
}
