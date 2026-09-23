'use client';

/**
 * The round journal, read: every game's one learning point, grouped by
 * event, newest event first. What a player re-reads on the train to the
 * next tournament. The entry opens its game on the board when the game is
 * still in the database.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { openStoredGame } from '@/features/games/open-game';
import type { JournalEntryRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { useUi } from '@/stores/ui-store';

import { invalidateJournal, useJournal } from './queries';

/** Entries grouped by event, each group ordered by its newest entry. */
export function groupByEvent(
  entries: readonly JournalEntryRecord[],
): readonly { readonly event: string; readonly entries: readonly JournalEntryRecord[] }[] {
  const groups = new Map<string, JournalEntryRecord[]>();
  for (const entry of entries) {
    const key = entry.event ?? 'No event';
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([event, list]) => ({
      event,
      entries: [...list].sort(
        (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.updatedAt - a.updatedAt,
      ),
    }))
    .sort(
      (a, b) =>
        Math.max(...b.entries.map((e) => e.updatedAt)) -
        Math.max(...a.entries.map((e) => e.updatedAt)),
    );
}

export function RoundsJournal() {
  const journal = useJournal();
  const notify = useUi((state) => state.notify);
  const router = useRouter();
  const client = useQueryClient();
  const entries = journal.data ?? [];

  if (journal.isLoading) return null;
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No rounds written up yet."
        description="Open a game you played and use After the round in the dock: it files one learning point per game here."
      />
    );
  }

  const open = async (entry: JournalEntryRecord) => {
    if (!entry.gameId) return;
    try {
      await openStoredGame(entry.gameId);
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The game could not be opened.',
      });
    }
  };

  const remove = async (entry: JournalEntryRecord) => {
    await (await getRepositories()).journal.delete(entry.id);
    invalidateJournal(client);
  };

  return (
    <div className="h-full overflow-y-auto" data-rounds-journal>
      {groupByEvent(entries).map((group) => (
        <section key={group.event} className="border-b border-line-subtle px-3 py-2.5">
          <h3 className="text-[10px] text-tertiary">{group.event}</h3>
          <ul className="mt-1.5 space-y-2.5">
            {group.entries.map((entry) => (
              <li key={entry.id} data-rounds-entry={entry.fingerprint}>
                <p className="text-[11.5px] text-primary">
                  {entry.title}
                  <span className="text-tertiary">
                    {entry.round ? ` · R${entry.round}` : ''}
                    {entry.date ? ` · ${entry.date}` : ''}
                    {entry.result ? ` · ${entry.result}` : ''}
                  </span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-secondary">
                  {entry.learningPoint}
                </p>
                <div className="mt-1 flex gap-2">
                  {entry.gameId ? (
                    <Button size="sm" onClick={() => void open(entry)}>
                      Open game
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => void remove(entry)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
