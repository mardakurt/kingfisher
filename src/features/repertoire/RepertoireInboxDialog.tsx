'use client';

/**
 * The repertoire maintenance inbox, on screen (Phase 86). What goes in it
 * and why is `src/repertoire/inbox.ts`; this reads the evidence, shows each
 * item with its rule and counts, opens its games at the move, and records the
 * player's decision — accept, dismiss with a reason, snooze — in the
 * `inboxDecisions` store, which every backup carries.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { openStoredGame } from '@/features/games/open-game';
import { useProfile } from '@/features/persistence/queries';
import { loadAllSeasonGames } from '@/features/season/use-season-games';
import type {
  InboxDecisionRecord,
  RepertoireWithPositions,
  StoredEngineEvidenceRecord,
} from '@/persistence/domain';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import type { RepertoireGap } from '@/repertoire/index';
import {
  buildInbox,
  DEFAULT_BRANCH_GAMES,
  DEFAULT_STALE_AFTER_DAYS,
  INBOX_KIND_LABEL,
  type InboxGame,
  type InboxItem,
} from '@/repertoire/inbox';
import { nameKey } from '@/round/identity';
import { useUi } from '@/stores/ui-store';

const DAY_MS = 86_400_000;

export function RepertoireInboxDialog({
  repertoire,
  gaps,
  onClose,
}: {
  readonly repertoire: RepertoireWithPositions;
  readonly gaps: readonly RepertoireGap[];
  readonly onClose: () => void;
}) {
  const profile = useProfile();
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const client = useQueryClient();
  const aliases = useMemo(() => profile.data?.aliases ?? [], [profile.data?.aliases]);
  const id = repertoire.repertoire.id;
  const color = repertoire.repertoire.color;
  const [reasons, setReasons] = useState<Readonly<Record<string, string>>>({});
  const [now] = useState(() => Date.now());

  const evidence = useQuery({
    queryKey: ['repertoire-inbox', id, repertoire.repertoire.updatedAt, aliases.join('|')],
    retry: false,
    queryFn: async () => {
      const repositories = await getRepositories();
      const keys = new Set(aliases.map(nameKey).filter(Boolean));
      const games = keys.size ? await loadAllSeasonGames(repositories.games) : [];
      const myGames: InboxGame[] = games.flatMap((game) => {
        const myColor = keys.has(nameKey(game.white))
          ? 'w'
          : keys.has(nameKey(game.black))
            ? 'b'
            : null;
        return myColor
          ? [
              {
                id: game.id,
                fingerprint: game.fingerprint,
                title: gameTitle(game),
                tree: game.tree,
                myColor,
              },
            ]
          : [];
      });
      const own = repertoire.positions.filter((position) => position.sideToMove === color);
      const held = new Map<string, readonly StoredEngineEvidenceRecord[]>(
        await Promise.all(
          own.map(
            async (position) =>
              [
                position.positionKey,
                await repositories.analysisQueue.evidenceForPosition(position.positionKey),
              ] as const,
          ),
        ),
      );
      return { myGames, held, libraryGames: games.length };
    },
  });

  const decisions = useQuery({
    queryKey: ['inbox-decisions', id],
    queryFn: async () => (await getRepositories()).inboxDecisions.forRepertoire(id),
  });

  const items = useMemo(() => {
    if (!evidence.data || !decisions.data) return null;
    return buildInbox({
      repertoireId: id,
      color,
      positions: repertoire.positions,
      myGames: evidence.data.myGames,
      gaps,
      evidenceAt: (key) => evidence.data.held.get(key) ?? [],
      decisions: decisions.data,
      now,
    });
  }, [evidence.data, decisions.data, id, color, repertoire.positions, gaps, now]);

  const decide = async (
    item: InboxItem,
    status: InboxDecisionRecord['status'],
    extra: { reason?: string; snoozedUntil?: number } = {},
  ) => {
    try {
      await (
        await getRepositories()
      ).inboxDecisions.decide({
        id: item.id,
        repertoireId: id,
        status,
        evidence: item.evidence,
        ...extra,
      });
      await client.invalidateQueries({ queryKey: ['inbox-decisions', id] });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The decision was not saved.',
      });
    }
  };

  const reopen = async (item: InboxItem) => {
    await (await getRepositories()).inboxDecisions.reopen(item.id);
    await client.invalidateQueries({ queryKey: ['inbox-decisions', id] });
  };

  const openGame = async (gameId: string, ply: number) => {
    try {
      await openStoredGame(gameId, { ply });
      onClose();
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  };

  const open = items?.filter((item) => item.status === 'open') ?? [];
  const later = items?.filter((item) => item.status !== 'open') ?? [];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Repertoire inbox"
      description={`What needs your attention in ${repertoire.repertoire.title}: from your own games, the repertoire itself, My games and stored engine evidence. Nothing is decided for you.`}
      width="w-[760px]"
    >
      <div className="flex flex-col gap-4 text-xs" data-repertoire-inbox>
        <p className="text-[11px] leading-relaxed text-tertiary">
          The rules: your games are those with a player named as in Settings → Profile, played with
          this repertoire’s colour
          {aliases.length === 0 ? ' — no names are set, so none of your games are read' : ''}; a
          branch is listed when at least {DEFAULT_BRANCH_GAMES} games in My games played it;
          evidence is old after {DEFAULT_STALE_AFTER_DAYS} days. A decision holds until the evidence
          behind the item changes.
        </p>
        {evidence.isPending || decisions.isPending ? (
          <p role="status">Reading your games and the repertoire…</p>
        ) : evidence.isError ? (
          <p role="alert" className="text-negative">
            The evidence could not be read:{' '}
            {evidence.error instanceof Error ? evidence.error.message : 'unknown error'}
          </p>
        ) : open.length === 0 ? (
          <p className="text-secondary" data-inbox-empty>
            Nothing needs attention now
            {later.length ? ` (${later.length} decided or snoozed below)` : ''}.
          </p>
        ) : null}

        {open.length > 0 ? (
          <ol className="flex flex-col gap-2" aria-label="Open items">
            {open.map((item) => (
              <li
                key={item.id}
                data-inbox-item={item.kind}
                className="rounded-[6px] border border-line bg-surface-inset p-2.5"
              >
                <p className="text-[10.5px] font-semibold text-tertiary">
                  {INBOX_KIND_LABEL[item.kind]}
                  {item.reopened ? ' · open again: the evidence changed' : ''}
                </p>
                <p className="mt-0.5 text-primary">{item.title}</p>
                <p className="mt-0.5 text-[11px] text-secondary">{item.detail}</p>
                {item.reopened && item.decision ? (
                  <p className="mt-0.5 text-[10.5px] text-tertiary">
                    Earlier: {item.decision.status}
                    {item.decision.reason ? ` — “${item.decision.reason}”` : ''}.
                  </p>
                ) : null}
                {item.games.length > 0 ? (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {item.games.slice(0, 6).map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className="rounded-[5px] border border-line px-1.5 py-0.5 text-[10.5px] text-secondary hover:bg-surface-2"
                          onClick={() => void openGame(entry.id, entry.ply)}
                        >
                          {entry.title}
                        </button>
                      </li>
                    ))}
                    {item.games.length > 6 ? (
                      <li className="text-[10.5px] text-tertiary">
                        and {item.games.length - 6} more
                      </li>
                    ) : null}
                  </ul>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="accent" onClick={() => void decide(item, 'accepted')}>
                    Done
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      void decide(item, 'snoozed', { snoozedUntil: Date.now() + 7 * DAY_MS })
                    }
                  >
                    Snooze a week
                  </Button>
                  <input
                    aria-label={`Why dismiss: ${item.title}`}
                    placeholder="Why it does not matter"
                    value={reasons[item.id] ?? ''}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    className="h-7 min-w-[160px] flex-1 rounded-[5px] border border-line bg-surface-1 px-1.5 text-[11px]"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!reasons[item.id]?.trim()}
                    onClick={() => void decide(item, 'dismissed', { reason: reasons[item.id] })}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {later.length > 0 ? (
          <section aria-label="Decided and snoozed">
            <h3 className="mb-1 text-[10.5px] font-semibold text-tertiary">Decided and snoozed</h3>
            <ul className="flex flex-col gap-1">
              {later.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2"
                  data-inbox-decided={item.status}
                >
                  <span className="min-w-0 flex-1 truncate text-secondary">
                    {item.title} —{' '}
                    {item.status === 'snoozed'
                      ? `snoozed until ${new Date(item.decision!.snoozedUntil!).toLocaleDateString()}`
                      : item.status === 'dismissed'
                        ? `dismissed: “${item.decision?.reason ?? ''}”`
                        : 'done'}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void reopen(item)}>
                    Reopen
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
