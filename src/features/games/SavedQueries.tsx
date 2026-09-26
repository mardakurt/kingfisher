'use client';

/**
 * Saved queries in the Library (Phase 86).
 *
 * A saved query is the whole question — header filters and the move mask,
 * in the query model (`src/database/query/`) — kept in a store every backup
 * carries. Running it reads My games through the same executor the move
 * search uses and says what it found against what it read, and, from the
 * second run on, which games are new since the last run and which have gone:
 * the "rerun after an import" a researcher does by hand in other programs.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { describeQuery, filtersFromQuery, parseQuery, type GameQuery } from '@/database/query/ast';
import { executeQuery } from '@/database/query/execute';

import { QueryEditorDialog } from './QueryEditor';
import type { SavedQueryRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import type { QueryRunDiff } from '@/persistence/repositories/saved-query-repository';

const KEY = ['saved-queries'] as const;

export function useSavedQueries() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await getRepositories()).savedQueries.list(),
  });
}

interface RunView {
  readonly status: 'running' | 'done' | 'stopped' | 'failed';
  readonly selected: number;
  readonly read: number;
  readonly found: number;
  readonly diff?: QueryRunDiff;
  readonly error?: string;
}

const day = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function SavedQueries(props: {
  /** Put a query's fields into the mask; absent when the mask cannot show it. */
  readonly onApply: (query: GameQuery) => void;
}) {
  const saved = useSavedQueries();
  const client = useQueryClient();
  const [runs, setRuns] = useState<Readonly<Record<string, RunView>>>({});

  const run = async (record: SavedQueryRecord) => {
    const parsed = parseQuery(record.query);
    if (!parsed.ok) return;
    const repositories = await getRepositories();
    const update = (view: RunView) => setRuns((current) => ({ ...current, [record.id]: view }));
    const result = await executeQuery({
      games: repositories.games,
      query: parsed.query,
      limit: Number.MAX_SAFE_INTEGER,
      onProgress: (progress) =>
        update({
          status: progress.status,
          selected: progress.selected,
          read: progress.read,
          found: progress.found,
        }),
    });
    if (result.status !== 'done') {
      update({ ...result, ...(result.error ? { error: result.error } : {}) });
      return;
    }
    const recorded = await repositories.savedQueries.recordRun(record.id, {
      selected: result.selected,
      found: result.found,
      fingerprints: result.matches.map((match) => match.game.fingerprint),
    });
    update({ ...result, diff: recorded.diff });
    await client.invalidateQueries({ queryKey: KEY });
  };

  const remove = async (record: SavedQueryRecord) => {
    await (await getRepositories()).savedQueries.remove(record.id);
    await client.invalidateQueries({ queryKey: KEY });
  };

  const [editing, setEditing] = useState<{ record?: SavedQueryRecord } | null>(null);
  const editor = editing ? (
    <QueryEditorDialog
      {...(editing.record && parseQuery(editing.record.query).ok
        ? {
            initial: {
              name: editing.record.name,
              query: (parseQuery(editing.record.query) as { ok: true; query: GameQuery }).query,
            },
          }
        : {})}
      onClose={() => setEditing(null)}
      onSave={async (name, query) => {
        const repositories = await getRepositories();
        await repositories.savedQueries.save({
          ...(editing.record ? { id: editing.record.id } : {}),
          name,
          query,
          source: editing.record?.source ?? 'local',
        });
        await client.invalidateQueries({ queryKey: KEY });
      }}
    />
  ) : null;
  const newQuery = (
    <Button size="sm" variant="subtle" onClick={() => setEditing({})} data-new-query>
      New query with “any of” and “not”…
    </Button>
  );

  const list = saved.data ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-tertiary" data-saved-queries-empty>
          No saved queries. Set filters, then Save query; it is kept in your backups.
        </p>
        {newQuery}
        {editor}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {newQuery}
      {editor}
      <ul className="flex flex-col gap-2" data-saved-queries>
        {list.map((record) => {
          const parsed = parseQuery(record.query);
          const words = parsed.ok ? describeQuery(parsed.query) : null;
          const view = runs[record.id];
          const fits = parsed.ok && filtersFromQuery(parsed.query) !== null;
          return (
            <li
              key={record.id}
              className="rounded-[6px] border border-line bg-surface-inset p-2 text-xs"
              data-saved-query={record.name}
            >
              <div className="font-medium text-primary">{record.name}</div>
              <div className="mt-0.5 text-[11px] text-secondary">
                {words ? words.summary : 'This saved query no longer reads as a query.'}
              </div>
              {words?.exclusions.map((note) => (
                <div key={note} className="text-[10.5px] text-tertiary">
                  {note}
                </div>
              ))}
              {record.source !== 'local' ? (
                <div className="mt-1 text-[10.5px] text-tertiary">
                  Saved on another database; running here reads My games.
                </div>
              ) : null}
              <div className="mt-1 text-[10.5px] text-tertiary" data-saved-query-result>
                {view?.status === 'running'
                  ? `Reading… ${view.read.toLocaleString()} of ${view.selected.toLocaleString()} games`
                  : view?.status === 'failed'
                    ? `The run failed: ${view.error ?? 'unknown error'}`
                    : view?.status === 'done'
                      ? `${view.found.toLocaleString()} of ${view.selected.toLocaleString()} games read match`
                      : record.lastRun
                        ? `Last run ${day(record.lastRun.at)}: ${record.lastRun.found.toLocaleString()} of ${record.lastRun.selected.toLocaleString()} games`
                        : 'Not run yet'}
              </div>
              {view?.diff && view.diff.since !== null ? (
                <div className="text-[10.5px] text-secondary" data-saved-query-diff>
                  Since {day(view.diff.since)}: {view.diff.added.length.toLocaleString()} new,{' '}
                  {view.diff.removed.length.toLocaleString()} gone
                  {view.diff.complete ? '' : ' (among the games each run kept)'}
                </div>
              ) : null}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  onClick={() => void run(record)}
                  disabled={!parsed.ok || view?.status === 'running'}
                >
                  Run
                </Button>
                {fits && parsed.ok ? (
                  <Button size="sm" variant="subtle" onClick={() => props.onApply(parsed.query)}>
                    Use as filters
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => setEditing({ record })}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(record)}>
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Save the question on screen, header and moves together. */
export async function saveQuery(name: string, query: GameQuery, source: string): Promise<void> {
  await (await getRepositories()).savedQueries.save({ name, query, source });
}

export const SAVED_QUERIES_KEY = KEY;
