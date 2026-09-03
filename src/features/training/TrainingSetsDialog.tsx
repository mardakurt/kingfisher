'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { invalidateReview, invalidateTraining } from '@/features/persistence/queries';
import type { TrainingItemRecord, TrainingSetRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { matchesQuery } from '@/persistence/repositories/training-set-repository';
import { useUi } from '@/stores/ui-store';

import { useTrainingSets } from '../review/queries';

export function TrainingSetsDialog({
  open,
  onClose,
  items,
  selectedId,
  onSelect,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly items: readonly TrainingItemRecord[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
}) {
  const client = useQueryClient();
  const notify = useUi((state) => state.notify);
  const sets = useTrainingSets();
  const selected = (sets.data ?? []).find((set) => set.id === selectedId) ?? null;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'static' | 'dynamic'>('static');
  const [themes, setThemes] = useState('');
  const [withinDays, setWithinDays] = useState('');
  const [fromMyGames, setFromMyGames] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteSet, setDeleteSet] = useState<TrainingSetRecord | null>(null);

  const counts = useMemo(
    () =>
      new Map(
        (sets.data ?? []).map((set) => [
          set.id,
          set.kind === 'static'
            ? set.itemIds.filter((id) => items.some((item) => item.id === id)).length
            : items.filter((item) => matchesQuery(item, set.query ?? {})).length,
        ]),
      ),
    [items, sets.data],
  );

  const changed = () => {
    invalidateReview(client);
    invalidateTraining(client);
  };

  const create = async () => {
    setBusy(true);
    try {
      const themeList = themes
        .split(',')
        .map((value) => value.trim().toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean);
      const created = await (
        await getRepositories()
      ).trainingSets.create({
        name,
        kind,
        ...(kind === 'dynamic'
          ? {
              query: {
                ...(themeList.length ? { themes: themeList } : {}),
                ...(Number(withinDays) > 0 ? { withinDays: Number(withinDays) } : {}),
                ...(fromMyGames ? { fromMyGames: true } : {}),
              },
            }
          : {}),
      });
      changed();
      onSelect(created.id);
      setName('');
      notify({ tone: 'success', message: `Training set “${created.name}” created.` });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The training set could not be created.',
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleItem = async (set: TrainingSetRecord, item: TrainingItemRecord) => {
    const repositories = await getRepositories();
    if (set.itemIds.includes(item.id)) {
      await repositories.trainingSets.removeItem(set.id, set.revision, item.id);
    } else {
      await repositories.trainingSets.addItems(set.id, set.revision, [item.id]);
    }
    changed();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Training sets"
        description="Sets hold membership or saved filters. Training positions are never duplicated."
        width="w-[680px]"
      >
        <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              Sets
            </h3>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="mt-2 flex w-full items-center rounded-[4px] px-2 py-1.5 text-left text-xs text-secondary hover:bg-surface-2"
            >
              All training <span className="ml-auto text-tertiary">{items.length}</span>
            </button>
            {(sets.data ?? []).map((set) => (
              <button
                key={set.id}
                type="button"
                onClick={() => onSelect(set.id)}
                className="mt-1 flex w-full items-center rounded-[4px] px-2 py-1.5 text-left text-xs text-secondary hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate">{set.name}</span>
                <span className="ml-2 text-[10px] text-tertiary">{counts.get(set.id) ?? 0}</span>
              </button>
            ))}
          </section>

          <section>
            {selected ? (
              <>
                <div className="flex items-start gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-primary">{selected.name}</h3>
                    <p className="text-[10px] text-tertiary">
                      {selected.kind === 'dynamic' ? 'Saved filters' : 'Chosen membership'} ·{' '}
                      {counts.get(selected.id) ?? 0} positions
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    className="ml-auto"
                    onClick={() => setDeleteSet(selected)}
                  >
                    Delete set
                  </Button>
                </div>
                {selected.kind === 'dynamic' ? (
                  <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-1 text-xs">
                    <dt className="text-tertiary">Themes</dt>
                    <dd className="text-secondary">
                      {selected.query?.themes?.join(', ') || 'Any'}
                    </dd>
                    <dt className="text-tertiary">Created</dt>
                    <dd className="text-secondary">
                      {selected.query?.withinDays
                        ? `Last ${selected.query.withinDays} days`
                        : 'Any time'}
                    </dd>
                    <dt className="text-tertiary">Source</dt>
                    <dd className="text-secondary">
                      {selected.query?.fromMyGames ? 'My games' : 'Any source'}
                    </dd>
                  </dl>
                ) : (
                  <div className="mt-3 max-h-64 overflow-y-auto divide-y divide-line-subtle">
                    {items.length === 0 ? (
                      <p className="py-3 text-xs text-tertiary">
                        Create a training position first.
                      </p>
                    ) : (
                      items.map((item) => (
                        <label key={item.id} className="flex gap-2 py-2 text-xs text-secondary">
                          <input
                            type="checkbox"
                            checked={selected.itemIds.includes(item.id)}
                            onChange={() => void toggleItem(selected, item)}
                          />
                          <span className="min-w-0 truncate">{item.prompt}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void create();
                }}
              >
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
                  New set
                </h3>
                <label className="mt-2 block text-2xs text-tertiary">
                  Name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    aria-label="Training set name"
                    placeholder="Trade decisions"
                    className={FIELD}
                  />
                </label>
                <label className="mt-2 block text-2xs text-tertiary">
                  Kind
                  <select
                    value={kind}
                    onChange={(event) => setKind(event.target.value as 'static' | 'dynamic')}
                    aria-label="Training set kind"
                    className={FIELD}
                  >
                    <option value="static">Static membership</option>
                    <option value="dynamic">Dynamic filters</option>
                  </select>
                </label>
                {kind === 'dynamic' ? (
                  <div className="mt-2 space-y-2 rounded-[4px] border border-line-subtle p-2">
                    <label className="block text-2xs text-tertiary">
                      Themes (comma separated)
                      <input
                        value={themes}
                        onChange={(event) => setThemes(event.target.value)}
                        placeholder="calculation, trade-decision"
                        className={FIELD}
                      />
                    </label>
                    <label className="block text-2xs text-tertiary">
                      Created within days
                      <input
                        value={withinDays}
                        onChange={(event) => setWithinDays(event.target.value.replace(/\D/g, ''))}
                        inputMode="numeric"
                        placeholder="90"
                        className={FIELD}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-2xs text-secondary">
                      <input
                        type="checkbox"
                        checked={fromMyGames}
                        onChange={(event) => setFromMyGames(event.target.checked)}
                      />
                      Source is My games
                    </label>
                  </div>
                ) : null}
                <Button
                  className="mt-3"
                  variant="accent"
                  type="submit"
                  disabled={busy || !name.trim()}
                >
                  Create set
                </Button>
              </form>
            )}
          </section>
        </div>
      </Dialog>
      <ConfirmDialog
        open={deleteSet !== null}
        title="Delete this training set?"
        description="Only the grouping or saved filter is removed. Every training position and its review history stays."
        confirmLabel="Delete set"
        onCancel={() => setDeleteSet(null)}
        onConfirm={async () => {
          if (!deleteSet) return;
          await (await getRepositories()).trainingSets.delete(deleteSet.id);
          if (selectedId === deleteSet.id) onSelect(null);
          changed();
          setDeleteSet(null);
        }}
      />
    </>
  );
}

const FIELD =
  'mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60';
