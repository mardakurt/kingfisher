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
import { WorkspaceFrame } from '@/features/workspace/WorkspaceFrame';
import { librarySource, openSourceGame } from '@/features/games/library-source';
import { usePreferences } from '@/stores/preferences-store';
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
  /*
    "Chosen facts" said "only the facts you ticked" and offered nothing to
    tick: it searched every fact of the position. The facts are listed now,
    all ticked, and a person unticks what does not matter to them.
  */
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(() => new Set());
  const pairedCompanion = usePreferences((state) =>
    Boolean(state.companionUrl && state.companionToken),
  );

  const identity = useMemo(() => {
    const facts = structureFacts(fen);
    if (!facts) return null;
    return {
      positionKey: positionKey(fen),
      pawnSkeleton: pawnSkeletonKey(fen),
      structureSignature: structureSignature(facts),
      claims: structureClaims(facts).map((claim) => claim.id),
      claimLabels: structureClaims(facts),
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
      claims: identity.claims.filter((claim) => !unticked.has(claim)),
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
      await openReferenceGame(
        answer.packId,
        answer.packName,
        gameId,
        title,
        undefined,
        submitted?.positionKey,
      );
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  };

  const openCollectionGame = async (
    collection: { readonly key: string; readonly name: string },
    row: StructureSearchResult,
  ) => {
    try {
      await openSourceGame(librarySource(`sqlite:${collection.key}`, collection.name), row.game, {
        ply: row.position.ply,
      });
      router.push('/analysis');
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That game could not be opened.',
      });
    }
  };

  // The board moved after the search: the answer is about another position.
  const stale =
    submitted !== null &&
    identity !== null &&
    (submitted.mode === 'pawn-skeleton'
      ? submitted.pawnSkeleton !== identity.pawnSkeleton
      : submitted.mode === 'signature'
        ? submitted.structureSignature !== identity.structureSignature
        : submitted.positionKey !== identity.positionKey);
  const chosenClaims = identity ? identity.claims.filter((claim) => !unticked.has(claim)) : [];
  const canSearch = identity !== null && (mode !== 'claims' || chosenClaims.length > 0);

  const loading = mine.isFetching || collections.isFetching || packs.isFetching;

  const railContent = (
    <div className="flex flex-col gap-3 px-3 py-3">
      <section aria-label="What counts as similar" className="flex flex-col gap-1.5">
        <Segmented items={MODES} value={mode} onChange={setMode} />
        <p className="text-2xs leading-relaxed text-tertiary">{MODE_MEANING[mode]}</p>
        {identity ? (
          <p className="text-2xs leading-relaxed text-secondary" title={identity.pawnSkeleton}>
            {mode === 'exact-position'
              ? 'The position on the board, exactly.'
              : `On the board: ${identity.description}`}
          </p>
        ) : (
          <p className="text-2xs text-negative" role="alert">
            This position cannot be read, so there is nothing to match.
          </p>
        )}
        {mode === 'claims' && identity ? (
          identity.claimLabels.length === 0 ? (
            <p className="text-2xs text-tertiary">
              Kingfisher finds no structural fact to match in this position.
            </p>
          ) : (
            <fieldset className="flex flex-col gap-1" data-similar-claims>
              <legend className="sr-only">Facts to match</legend>
              {identity.claimLabels.map((claim) => (
                <label key={claim.id} className="flex items-center gap-2 text-2xs text-secondary">
                  <input
                    type="checkbox"
                    checked={!unticked.has(claim.id)}
                    onChange={(event) =>
                      setUnticked((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.delete(claim.id);
                        else next.add(claim.id);
                        return next;
                      })
                    }
                  />
                  {claim.label}
                </label>
              ))}
            </fieldset>
          )
        ) : null}
        <Button variant="accent" disabled={!canSearch} onClick={run} data-similar-search>
          {stale ? 'Search this position' : 'Search'}
        </Button>
        <p className="text-2xs leading-relaxed text-tertiary">
          Searched: My games, {pairedCompanion ? 'every companion collection, ' : ''}and the
          reference packs installed. Each answers in its own list; nothing is added together.
          {pairedCompanion
            ? ''
            : ' Companion collections are not searched: the companion is not paired.'}
        </p>
      </section>
      {stale ? (
        <p
          className="rounded-[6px] border border-caution/40 bg-caution/10 p-2 text-2xs text-caution"
          role="status"
        >
          The board has moved since this search. These results are for the earlier position.
        </p>
      ) : null}
      <div className="text-xs" data-testid="similar-results">
        {submitted === null ? (
          <EmptyState
            title="Nothing searched yet."
            description="Put a position on the board, choose what counts as similar, and search. Every source answers for itself; nothing is added together."
          />
        ) : null}
        {loading ? <p role="status">Searching…</p> : null}

        {submitted !== null ? (
          <section className="mb-3" data-testid="similar-mine">
            <h2 className="mb-1 text-[10px] font-semibold text-tertiary">
              My games · {mine.data?.length ?? 0}
            </h2>
            {(mine.data?.length ?? 0) === 0 ? (
              <p className="text-tertiary">
                {mine.isFetching
                  ? 'Searching your games…'
                  : mine.isError
                    ? `My games could not be searched: ${mine.error instanceof Error ? mine.error.message : 'unknown error'}`
                    : 'No game of yours matches.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {(mine.data ?? []).map((row) => (
                  <li key={`${row.game.id}:${row.position.ply}`}>
                    <button
                      type="button"
                      className="w-full rounded-[6px] border border-line px-2 py-1.5 text-left hover:bg-surface-2"
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
            <h2 className="mb-1 text-[10px] font-semibold text-tertiary">
              {collection.name} · {collection.results.length}
            </h2>
            {collection.results.length === 0 ? (
              <p className="text-tertiary">Nothing in this collection matches.</p>
            ) : (
              <ul className="space-y-1">
                {collection.results.map((row) => (
                  <li key={`${collection.key}:${row.game.id}:${row.position.ply}`}>
                    <button
                      type="button"
                      className="w-full rounded-[6px] border border-line px-2 py-1.5 text-left hover:bg-surface-2"
                      onClick={() => void openCollectionGame(collection, row)}
                    >
                      <span className="block truncate text-primary">{gameTitle(row.game)}</span>
                      <span className="block truncate text-2xs text-tertiary">
                        move {Math.floor(row.position.ply / 2) + 1} · in {collection.name}
                      </span>
                    </button>
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
            <h2 className="mb-1 text-[10px] font-semibold text-tertiary">
              {answer.packName} ·{' '}
              {answer.unanswerable ? 'cannot answer this' : answer.matches.length}
            </h2>
            {answer.unanswerable ? (
              <p
                className={cn(
                  'rounded-[6px] border border-caution/40 bg-caution/10 p-2 text-caution',
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
                      className="w-full rounded-[6px] border border-line px-2 py-1.5 text-left hover:bg-surface-2"
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

  return (
    <WorkspaceFrame
      workspace="similar"
      title="Similar games"
      subtitle="Games that reached this position, its pawns or its features — each source on its own."
      icon={<Search />}
      rail={{ label: 'Search', width: 320, content: railContent }}
      board={{ mode: 'interactive' }}
      contextLabel="Position"
    />
  );
}
