'use client';

/**
 * Similar games, as a page.
 *
 * The dock panel has answered this question since Phase 8, over the player's
 * own games and any SQLite collection, and it is a column three hundred
 * pixels wide. The research asks for it as a page and over the reference
 * packs too (§6 item 7), and the second half is where the honesty lives: a
 * pack stores positions and their counts, not structures, so it can be asked
 * "who else reached this position" and cannot be asked "who else had these
 * pawns". Each source answers for itself, in its own column, with its own
 * count — populations are never merged.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import {
  describePawnSkeleton,
  pawnSkeletonKey,
  structureClaims,
  structureFacts,
  structureSignature,
} from '@/chess/structure';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { Search } from '@/components/icons';
import { Segmented } from '@/components/ui/Tabs';
import { companionClient } from '@/companion/session';
import { useCompanionStatus } from '@/companion/useCompanion';
import { openReferenceGame } from '@/features/games/open-reference-game';
import { openStoredGame } from '@/features/games/open-game';
import { NavButton } from '@/features/shell/NavButton';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import type {
  StructureSearchMode,
  StructureSearchQuery,
  StructureSearchResult,
} from '@/persistence/types';
import { readyPackReaders } from '@/reference/manager';
import { useReferenceSources } from '@/reference/use-references';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

import { searchPacks, type PackAnswer } from './pack-search';

const MODES: readonly { id: StructureSearchMode; label: string }[] = [
  { id: 'pawn-skeleton', label: 'Same pawns' },
  { id: 'signature', label: 'Same features' },
  { id: 'exact-position', label: 'Same position' },
  { id: 'claims', label: 'Chosen facts' },
];

const MODE_MEANING: Record<StructureSearchMode, string> = {
  'pawn-skeleton': 'Every pawn on the same square. Pieces and side to move are ignored.',
  signature: 'The same structural features, as Kingfisher computes them from the pawns.',
  'exact-position': 'The same position: placement, side to move, castling and a usable en passant.',
  claims: 'Only the facts you ticked, all of them present.',
};

export function SimilarWorkspace() {
  const node = useAnalysis((state) => state.tree.nodes[state.currentId]);
  const fen = node?.fen ?? '';
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const companion = useCompanionStatus();
  const catalog = useReferenceSources();
  const [mode, setMode] = useState<StructureSearchMode>('pawn-skeleton');
  const [submitted, setSubmitted] = useState<StructureSearchQuery | null>(null);

  const identity = useMemo(() => {
    const facts = structureFacts(fen);
    if (!facts) return null;
    return {
      positionKey: positionKey(fen),
      pawnSkeleton: pawnSkeletonKey(fen),
      structureSignature: structureSignature(facts),
      claims: structureClaims(facts).map((claim) => claim.id),
      description: describePawnSkeleton(fen),
    };
  }, [fen]);

  const mine = useQuery({
    queryKey: ['similar', 'mine', submitted],
    enabled: submitted !== null,
    queryFn: async () => (await getRepositories()).games.searchStructures(submitted!),
    retry: false,
  });

  const collections = useQuery({
    queryKey: [
      'similar',
      'sqlite',
      submitted,
      companion.data?.databases.map((database) => database.key).join(',') ?? '',
    ],
    enabled: submitted !== null,
    queryFn: async () => {
      const client = companionClient();
      if (!client) return [];
      return Promise.all(
        (companion.data?.databases ?? []).map(async (database) => ({
          key: database.key,
          name: database.name,
          results: (
            await client.searchStructures<{ results: readonly StructureSearchResult[] }>(
              database.key,
              submitted!,
            )
          ).results,
        })),
      );
    },
    retry: false,
  });

  /*
    Keyed on which packs are *ready*, not on how many sources exist. A search
    run while the bundled pack was still installing left the packs out of the
    answer altogether — not an empty row, no row — and nothing re-ran when it
    arrived. Now the answer includes it the moment it can answer.
  */
  const readyPackIds = catalog.sources
    .filter((source) => source.installed && source.state === 'ready')
    .map((source) => source.id)
    .join(',');

  const packs = useQuery({
    queryKey: ['similar', 'packs', submitted, readyPackIds],
    enabled: submitted !== null,
    queryFn: async (): Promise<readonly PackAnswer[]> =>
      searchPacks(readyPackReaders(), submitted!.mode, submitted!.positionKey),
    retry: false,
  });

  const run = () => {
    if (!identity) return;
    setSubmitted({
      mode,
      sort: 'closest',
      positionKey: identity.positionKey,
      pawnSkeleton: identity.pawnSkeleton,
      structureSignature: identity.structureSignature,
      claims: identity.claims,
      limit: 40,
    });
  };

  const openMine = async (row: StructureSearchResult) => {
    try {
      await openStoredGame(row.game.id, { ply: row.position.ply });
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  };

  const openPackGame = async (answer: PackAnswer, gameId: string, title: string) => {
    try {
      await openReferenceGame(answer.packId, answer.packName, gameId, title);
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  };

  const loading = mine.isFetching || collections.isFetching || packs.isFetching;

  return (
    <div className="flex h-full min-h-0 flex-col" data-workspace-frame="similar">
      <header className="flex shrink-0 items-center gap-2 border-b border-line-subtle px-2 py-2">
        <NavButton />
        <Search className="h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-primary">Similar games</h1>
          <p className="hidden text-xs text-tertiary sm:block">
            The position on the board, looked for in every source you have.
          </p>
        </div>
        <Button variant="accent" className="ml-auto" disabled={!identity} onClick={run}>
          Search
        </Button>
      </header>

      <div className="shrink-0 border-b border-line-subtle p-2">
        <Segmented items={MODES} value={mode} onChange={setMode} />
        <p className="mt-1 text-2xs text-tertiary">{MODE_MEANING[mode]}</p>
        {identity ? (
          <p className="mt-1 truncate font-mono text-[9.5px] text-tertiary" title={fen}>
            {mode === 'exact-position' ? identity.positionKey : identity.pawnSkeleton}
          </p>
        ) : (
          <p className="mt-1 text-2xs text-negative">
            This position cannot be read, so there is nothing to match.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-xs" data-testid="similar-results">
        {submitted === null ? (
          <EmptyState
            title="Nothing searched yet."
            description="Put a position on the board, choose what counts as similar, and search. Every source answers for itself; nothing is added together."
          />
        ) : null}
        {loading ? <p role="status">Searching…</p> : null}

        {submitted !== null ? (
          <section className="mb-3" data-testid="similar-mine">
            <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              My games · {mine.data?.length ?? 0}
            </h2>
            {(mine.data?.length ?? 0) === 0 ? (
              <p className="text-tertiary">
                {mine.isFetching ? 'Searching your games…' : 'No game of yours matches.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {(mine.data ?? []).map((row) => (
                  <li key={`${row.game.id}:${row.position.ply}`}>
                    <button
                      type="button"
                      className="w-full rounded-[4px] border border-line px-2 py-1.5 text-left hover:bg-surface-2"
                      onClick={() => void openMine(row)}
                    >
                      <span className="block truncate text-primary">{gameTitle(row.game)}</span>
                      <span className="block truncate text-2xs text-tertiary">
                        move {Math.floor(row.position.ply / 2) + 1}
                        {row.exactPosition ? ' · same position' : ''}
                        {row.samePawnSkeleton ? ' · same pawns' : ''}
                        {row.sameSignature ? ' · same features' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {(collections.data ?? []).map((collection) => (
          <section key={collection.key} className="mb-3">
            <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              {collection.name} · {collection.results.length}
            </h2>
            {collection.results.length === 0 ? (
              <p className="text-tertiary">Nothing in this collection matches.</p>
            ) : (
              <ul className="space-y-1">
                {collection.results.map((row) => (
                  <li key={`${collection.key}:${row.game.id}:${row.position.ply}`}>
                    <span className="block rounded-[4px] border border-line px-2 py-1.5">
                      <span className="block truncate text-primary">{gameTitle(row.game)}</span>
                      <span className="block truncate text-2xs text-tertiary">
                        move {Math.floor(row.position.ply / 2) + 1} · in {collection.name}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {(packs.data ?? []).map((answer) => (
          <section
            key={answer.packId}
            className="mb-3"
            data-testid={`similar-pack-${answer.packId}`}
          >
            <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              {answer.packName} ·{' '}
              {answer.unanswerable ? 'cannot answer this' : answer.matches.length}
            </h2>
            {answer.unanswerable ? (
              <p
                className={cn(
                  'rounded-[4px] border border-caution/40 bg-caution/10 p-2 text-caution',
                )}
              >
                {answer.unanswerable}
              </p>
            ) : answer.matches.length === 0 ? (
              <p className="text-tertiary">No game in this pack reached the position.</p>
            ) : (
              <ul className="space-y-1">
                {answer.matches.map((match) => (
                  <li key={`${answer.packId}:${match.game.id}`}>
                    <button
                      type="button"
                      className="w-full rounded-[4px] border border-line px-2 py-1.5 text-left hover:bg-surface-2"
                      onClick={() =>
                        void openPackGame(
                          answer,
                          match.game.id,
                          `${match.game.white} – ${match.game.black}`,
                        )
                      }
                    >
                      <span className="block truncate text-primary">
                        {match.game.white} – {match.game.black}
                      </span>
                      <span className="block truncate text-2xs text-tertiary">
                        {[
                          match.game.event,
                          match.game.date || String(match.game.year),
                          match.game.result,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
