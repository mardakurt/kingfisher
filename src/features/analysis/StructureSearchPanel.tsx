'use client';

/**
 * Deterministic position research from the facts already shown above it.
 *
 * No embedding and no opaque score: a result states whether the full position,
 * the pawn skeleton or the structural signature matched, and how many selected
 * claims it shares. Sorting can then be factual (rating/date) or by those named
 * match classes.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { positionKey } from '@/chess/fen';
import {
  describePawnSkeleton,
  pawnSkeletonKey,
  structureClaims,
  structureFacts,
  structureSignature,
  type StructureClaim,
} from '@/chess/structure';
import { mainlinePath, mustGetNode } from '@/chess/tree/tree';
import { parsePgn } from '@/chess/pgn';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Tabs';
import { gameTitle } from '@/persistence/describe';
import { getRepositories } from '@/persistence/repositories';
import type {
  StructureSearchMode,
  StructureSearchQuery,
  StructureSearchResult,
  StructureSearchSort,
} from '@/persistence/types';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';
import { useCompanionStatus } from '@/companion/useCompanion';
import { companionClient } from '@/companion/session';
import { indexGame, normalizeGame } from '@/persistence/import-game';

import { invalidateModelGames } from '../persistence/queries';

const MODES: readonly { id: StructureSearchMode; label: string }[] = [
  { id: 'pawn-skeleton', label: 'Same pawns' },
  { id: 'signature', label: 'Same features' },
  { id: 'exact-position', label: 'Exact' },
  { id: 'claims', label: 'Chosen facts' },
];

const SORTS: readonly { id: StructureSearchSort; label: string }[] = [
  { id: 'closest', label: 'Closest' },
  { id: 'rating', label: 'Highest Elo' },
  { id: 'recent', label: 'Most recent' },
];

type SourcedResult = StructureSearchResult & { readonly sqliteKey?: string };

export function StructureSearchPanel({ fen }: { readonly fen: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const openDocument = useAnalysis((state) => state.openDocument);
  const stopEngine = useEngine((state) => state.stop);
  const notify = useUi((state) => state.notify);
  const setSaveOpen = useUi((state) => state.setSaveToStudyOpen);
  const setTrainingOpen = useUi((state) => state.setTrainingCaptureOpen);
  const [mode, setMode] = useState<StructureSearchMode>('pawn-skeleton');
  const [sort, setSort] = useState<StructureSearchSort>('closest');
  const [selectedClaims, setSelectedClaims] = useState<readonly string[]>([]);
  const [submitted, setSubmitted] = useState<StructureSearchQuery | null>(null);
  const companion = useCompanionStatus();

  const identity = useMemo(() => {
    const facts = structureFacts(fen);
    if (!facts) return null;
    const claims = structureClaims(facts);
    return {
      positionKey: positionKey(fen),
      pawnSkeleton: pawnSkeletonKey(fen),
      structureSignature: structureSignature(facts),
      claims,
    };
  }, [fen]);

  const result = useQuery({
    queryKey: [
      'structure-search',
      submitted,
      companion.data?.databases.map((database) => database.key).join(',') ?? '',
    ],
    enabled: submitted !== null,
    queryFn: async () => {
      const local = (await getRepositories()).games.searchStructures(submitted!);
      const native = companionClient();
      const sqlite = native
        ? await Promise.all(
            (companion.data?.databases ?? []).map(async (database) => {
              const response = await native.searchStructures<{
                results: readonly StructureSearchResult[];
              }>(database.key, submitted!);
              return response.results.map((row) => ({ ...row, sqliteKey: database.key }));
            }),
          )
        : [];
      return ([...(await local), ...sqlite.flat()] as SourcedResult[])
        .sort((a, b) => compareResults(a, b, submitted!))
        .slice(0, submitted!.limit ?? 30);
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: false,
  });
  const modelLinks = useQuery({
    queryKey: ['persistence', 'model-games', 'all'],
    queryFn: async () => (await getRepositories()).modelGames.list(),
    staleTime: 0,
    retry: false,
  });
  const marked = new Set((modelLinks.data ?? []).map((link) => link.gameId));

  const search = () => {
    if (!identity) return;
    const claims =
      mode === 'claims'
        ? selectedClaims.length
          ? selectedClaims
          : identity.claims.slice(0, 1).map((claim) => claim.id)
        : identity.claims.map((claim) => claim.id);
    setSubmitted({
      mode,
      sort,
      positionKey: identity.positionKey,
      pawnSkeleton: identity.pawnSkeleton,
      structureSignature: identity.structureSignature,
      claims,
      limit: 30,
    });
  };

  const open = async (
    row: SourcedResult,
    destination: '/analysis' | '/model-game',
    followUp?: 'study' | 'training',
  ) => {
    const game = await loadResultGame(row);
    if (!game) return;
    const currentId = findPositionNode(game.tree, row);
    stopEngine();
    openDocument({
      tree: game.tree,
      document: row.sqliteKey
        ? { kind: 'untitled', title: `${gameTitle(game)} · SQLite` }
        : { kind: 'database-game', title: gameTitle(game), gameId: game.id },
      ...(currentId ? { currentId } : {}),
    });
    if (followUp === 'study') setSaveOpen(true);
    if (followUp === 'training') setTrainingOpen(true);
    router.push(destination);
  };

  const markModel = async (row: SourcedResult) => {
    if (marked.has(row.game.id)) return;
    let gameId = row.game.id;
    if (row.sqliteKey) {
      const game = await loadResultGame(row);
      if (!game) return;
      const saved = await (await getRepositories()).games.persist(game, indexGame(game));
      gameId = saved.game.id;
    }
    await (
      await getRepositories()
    ).modelGames.create({
      gameId,
      kinds: ['model', 'strategic'],
      positionKey: row.position.positionKey,
      note: 'Saved from deterministic structure search.',
      tags: ['structure-search'],
    });
    invalidateModelGames(client);
    await modelLinks.refetch();
    notify({ tone: 'success', message: 'Saved as a model-game reference.' });
  };

  if (!identity) return null;

  return (
    <section className="border-t border-line-subtle px-3 py-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">
        Search structures
      </h3>
      <p className="mt-1 text-[10px] leading-relaxed text-tertiary">
        Exact, indexed facts. Same pawns ignores every piece and whose turn it is.
      </p>
      {/* The identity being matched, spelled out: a search whose subject is
          invisible cannot be checked by the person reading its results. */}
      <p
        className="mt-1 truncate font-mono text-[9.5px] text-tertiary"
        title={describePawnSkeleton(identity.pawnSkeleton)}
      >
        {mode === 'signature'
          ? identity.structureSignature
          : mode === 'exact-position'
            ? identity.positionKey
            : describePawnSkeleton(identity.pawnSkeleton)}
      </p>
      <div className="mt-2 overflow-x-auto">
        <Segmented items={MODES} value={mode} onChange={setMode} />
      </div>
      {mode === 'claims' ? (
        <ClaimPicker
          claims={identity.claims}
          selected={selectedClaims}
          onChange={setSelectedClaims}
        />
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <label className="min-w-0 flex-1 text-[10px] text-tertiary">
          Sort
          <select
            aria-label="Structure result order"
            value={sort}
            onChange={(event) => setSort(event.target.value as StructureSearchSort)}
            className="mt-1 h-7 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-[11px] text-primary"
          >
            {SORTS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="accent" className="mt-4" onClick={search}>
          Search
        </Button>
      </div>

      {result.isPending && submitted ? (
        <p className="mt-3 text-[11px] text-tertiary">Searching the local index…</p>
      ) : result.isError ? (
        <p className="mt-3 text-[11px] text-negative">{result.error.message}</p>
      ) : submitted && (result.data?.length ?? 0) === 0 ? (
        <p className="mt-3 text-[11px] leading-relaxed text-tertiary">
          No indexed positions match. Games imported before the structure index can be re-imported
          to add these facts without duplicating them.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-line-subtle">
          {(result.data ?? []).map((row) => (
            <ResultRow
              key={`${row.sqliteKey ?? 'browser'}:${row.game.id}:${row.position.id}`}
              row={row}
              marked={!row.sqliteKey && marked.has(row.game.id)}
              onOpen={(destination) => void open(row, destination)}
              onStudy={() => void open(row, '/analysis', 'study')}
              onTrain={() => void open(row, '/analysis', 'training')}
              onMark={() => void markModel(row)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function ClaimPicker({
  claims,
  selected,
  onChange,
}: {
  readonly claims: readonly StructureClaim[];
  readonly selected: readonly string[];
  readonly onChange: (value: readonly string[]) => void;
}) {
  return (
    <div
      className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto"
      aria-label="Structure facts"
    >
      {claims.map((claim) => {
        const active = selected.includes(claim.id);
        return (
          <button
            key={claim.id}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(active ? selected.filter((id) => id !== claim.id) : [...selected, claim.id])
            }
            className={cn(
              'rounded-full border px-1.5 py-0.5 text-[9.5px]',
              active ? 'border-accent bg-accent-muted text-primary' : 'border-line text-tertiary',
            )}
          >
            {claim.label}
          </button>
        );
      })}
    </div>
  );
}

function ResultRow({
  row,
  marked,
  onOpen,
  onStudy,
  onTrain,
  onMark,
}: {
  readonly row: SourcedResult;
  readonly marked: boolean;
  readonly onOpen: (destination: '/analysis' | '/model-game') => void;
  readonly onStudy: () => void;
  readonly onTrain: () => void;
  readonly onMark: () => void;
}) {
  const rating = Math.max(row.game.whiteRating ?? 0, row.game.blackRating ?? 0) || null;
  const match = row.exactPosition
    ? 'Exact position'
    : row.samePawnSkeleton
      ? 'Same pawn skeleton'
      : row.sameSignature
        ? 'Same feature signature'
        : `${row.sharedClaims} shared facts`;
  return (
    <li className="py-2">
      <button type="button" className="w-full text-left" onClick={() => onOpen('/model-game')}>
        <span className="block truncate text-[11px] text-primary">
          {row.game.white} – {row.game.black}
        </span>
        <span className="mt-0.5 block text-[9.5px] text-tertiary">
          {row.sqliteKey ? 'SQLite · ' : 'Browser · '}
          {match} · move {Math.ceil(row.position.ply / 2)} · {rating ?? 'Elo —'} ·{' '}
          {row.game.date ?? 'date —'} · {row.game.opening ?? row.game.eco ?? 'opening —'} ·{' '}
          {row.game.result}
        </span>
      </button>
      <div className="mt-1 flex flex-wrap gap-1">
        <Button variant="ghost" onClick={() => onOpen('/analysis')}>
          Open position
        </Button>
        <Button variant="ghost" onClick={() => onOpen('/model-game')}>
          Study game
        </Button>
        <Button variant="ghost" disabled={marked} onClick={onMark}>
          {marked ? 'Model game' : 'Save model'}
        </Button>
        <Button variant="ghost" onClick={onStudy}>
          Add to study
        </Button>
        <Button variant="ghost" onClick={onTrain}>
          Train
        </Button>
      </div>
    </li>
  );
}

function findPositionNode(
  tree: Parameters<typeof mainlinePath>[0],
  row: StructureSearchResult,
): string | null {
  if (row.position.nodeId && tree.nodes[row.position.nodeId]) return row.position.nodeId;
  const wantedPly = Math.max(0, row.position.ply - 1);
  for (const id of mainlinePath(tree)) {
    const node = mustGetNode(tree, id);
    if (node.ply === wantedPly && positionKey(node.fen) === row.position.positionKey) return id;
  }
  return null;
}

async function loadResultGame(row: SourcedResult) {
  if (!row.sqliteKey) return (await getRepositories()).games.get(row.game.id);
  const native = companionClient();
  if (!native) return null;
  const content = await native.gameContent(row.sqliteKey, row.game.id);
  if (!content.pgn) return null;
  const parsed = parsePgn(content.pgn).games[0];
  return parsed ? normalizeGame(parsed.tree) : null;
}

function compareResults(
  a: StructureSearchResult,
  b: StructureSearchResult,
  query: StructureSearchQuery,
): number {
  const rating = (row: StructureSearchResult) =>
    Math.max(row.game.whiteRating ?? 0, row.game.blackRating ?? 0);
  const recent = (row: StructureSearchResult) => row.game.year ?? 0;
  if (query.sort === 'rating') return rating(b) - rating(a) || recent(b) - recent(a);
  if (query.sort === 'recent') return recent(b) - recent(a) || rating(b) - rating(a);
  return (
    Number(b.exactPosition) - Number(a.exactPosition) ||
    Number(b.samePawnSkeleton) - Number(a.samePawnSkeleton) ||
    Number(b.sameSignature) - Number(a.sameSignature) ||
    b.sharedClaims - a.sharedClaims ||
    rating(b) - rating(a) ||
    recent(b) - recent(a)
  );
}
