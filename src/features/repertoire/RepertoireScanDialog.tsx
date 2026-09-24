'use client';

/**
 * Scan games against the repertoire (Phase 84).
 *
 * ChessBase's Repertoire scan, over any collection Kingfisher can read: the
 * browser's own games or a SQLite file behind the companion. Each game is
 * walked by position (`src/repertoire/scan.ts`); a game that left the
 * repertoire deep enough is reported with the move it left by, grouped by
 * what happened where. The three kinds of departure are three sections,
 * never one list — a new move against your line is not the same news as
 * somebody else's idea for your own side.
 */

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { parseSingleGame } from '@/chess/pgn';
import { moveNumberOfPly } from '@/chess/tree/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { listCollections, openCollection } from '@/database/collections/registry';
import { LOCAL_COLLECTION_ID } from '@/database/collections/local';
import { scanCollection, type CollectionScanState } from '@/database/collections/scan';
import { openStoredGame } from '@/features/games/open-game';
import type { RepertoireWithPositions } from '@/persistence/domain';
import { gameTitle } from '@/persistence/describe';
import { indexPositions } from '@/repertoire/index';
import {
  DEFAULT_MINIMUM_PLIES,
  groupFindings,
  scanAgainstRepertoire,
  SCAN_KIND_ORDER,
  type ScanFinding,
  type ScanGroup,
  type ScanKind,
} from '@/repertoire/scan';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';

const KIND_TITLE: Record<ScanKind, string> = {
  'new-move': 'New moves against your line',
  'own-alternative': 'Other choices for your side',
  'past-preparation': 'Past your preparation',
};

const KIND_HINT: Record<ScanKind, string> = {
  'new-move': 'The other side played something your repertoire has not prepared for.',
  'own-alternative': 'A player on your side chose differently from your repertoire.',
  'past-preparation': 'The game followed your preparation to its end and went on.',
};

const DEPTHS = [4, 8, 12, 16] as const;

/** `12. Nf3` or `12... Nf3`, from the ply the move was played at. */
const moveLabel = (ply: number, san: string) =>
  `${moveNumberOfPly(ply)}${ply % 2 === 1 ? '.' : '...'} ${san}`;

type Hit = CollectionScanState<ScanFinding>['hits'][number];

export function RepertoireScanDialog({
  repertoire,
  onClose,
}: {
  readonly repertoire: RepertoireWithPositions;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const notify = useUi((state) => state.notify);
  const collections = useQuery({
    queryKey: ['collections', 'repertoire-scan'],
    retry: false,
    queryFn: () => listCollections(),
  });
  const [collectionId, setCollectionId] = useState<string>(LOCAL_COLLECTION_ID);
  const [depth, setDepth] = useState<number>(DEFAULT_MINIMUM_PLIES);
  const [state, setState] = useState<CollectionScanState<ScanFinding> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const color = repertoire.repertoire.color;
  const index = useMemo(() => indexPositions(repertoire.positions), [repertoire.positions]);
  const running = state?.status === 'running';

  const run = async () => {
    const collection = await openCollection(collectionId);
    if (!collection) {
      notify({ tone: 'error', message: 'That collection is not available on this machine now.' });
      return;
    }
    abort.current = new AbortController();
    setState({ status: 'running', read: 0, total: null, unreadable: 0, hits: [] });
    await scanCollection({
      collection,
      visit: (tree) => scanAgainstRepertoire(tree, color, index, depth),
      signal: abort.current.signal,
      onProgress: setState,
    });
  };

  const open = async (hit: Hit) => {
    try {
      if (collectionId === LOCAL_COLLECTION_ID && hit.game.id) {
        await openStoredGame(hit.game.id, { ply: hit.answer.ply });
      } else {
        // A game in a companion collection has no id the board can open; the
        // scan read its movetext, and the same parser as an import rebuilds it.
        const parsed = parseSingleGame(hit.pgn);
        if (!parsed.ok) throw new Error('The game could not be read.');
        useAnalysis.getState().openDocument({
          tree: parsed.value.tree,
          document: { kind: 'untitled', title: gameTitle(hit.game) },
          currentId: hit.answer.nodeId,
        });
      }
      router.push('/analysis');
      onClose();
    } catch (error) {
      notify({
        tone: 'error',
        message: 'That game could not be opened.',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const groups = useMemo(
    () => groupFindings((state?.hits ?? []).map((hit) => ({ game: hit, finding: hit.answer }))),
    [state?.hits],
  );
  const list = collections.data ?? [];
  const chosen = list.find((entry) => entry.id === collectionId);

  return (
    <Dialog
      open
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      title="Scan games against this repertoire"
      description={`Which games in a collection reach ${repertoire.repertoire.title} (${color === 'w' ? 'White' : 'Black'}), and where each one leaves it.`}
      width="w-[720px]"
      footer={
        <>
          {running ? (
            <Button onClick={() => abort.current?.abort()}>Stop</Button>
          ) : (
            <Button variant="accent" onClick={() => void run()} data-scan-run>
              {state ? 'Scan again' : 'Scan'}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3" data-repertoire-scan>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[11px] text-tertiary">
            Collection
            <select
              aria-label="Collection to scan"
              value={collectionId}
              disabled={running}
              onChange={(event) => setCollectionId(event.target.value)}
              className="h-8 rounded-[6px] border border-line bg-surface-inset px-2 text-xs text-primary"
            >
              {(list.length
                ? list
                : [{ id: LOCAL_COLLECTION_ID, name: 'My games', games: null }]
              ).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                  {entry.games !== null ? ` · ${entry.games.toLocaleString()} games` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-tertiary">
            Left the line after at least
            <select
              aria-label="Minimum depth"
              value={depth}
              disabled={running}
              onChange={(event) => setDepth(Number(event.target.value))}
              className="h-8 rounded-[6px] border border-line bg-surface-inset px-2 text-xs text-primary"
            >
              {DEPTHS.map((plies) => (
                <option key={plies} value={plies}>
                  {plies / 2} moves
                </option>
              ))}
            </select>
          </label>
        </div>

        {state ? (
          <p className="text-[11px] text-secondary tabular" data-scan-status={state.status}>
            {state.status === 'running'
              ? `Reading ${chosen?.name ?? 'the collection'}: ${state.read.toLocaleString()}${state.total !== null ? ` of ${state.total.toLocaleString()}` : ''} games…`
              : state.status === 'stopped'
                ? `Stopped after ${state.read.toLocaleString()} games; the findings below are from those only.`
                : state.status === 'failed'
                  ? `The scan failed after ${state.read.toLocaleString()} games: ${state.error ?? 'unknown error'}.`
                  : `${state.read.toLocaleString()} games read; ${state.hits.length.toLocaleString()} left your repertoire at least ${depth / 2} moves in.`}
            {state.unreadable ? ` ${state.unreadable} could not be read as games.` : ''}
          </p>
        ) : (
          <p className="text-[11px] text-secondary">
            Every game is read by position, so a game that reaches your line by another move order
            counts. Nothing is written anywhere.
          </p>
        )}

        {state && state.status !== 'running' && state.hits.length === 0 ? (
          <p className="rounded-[6px] bg-surface-2 px-3 py-2 text-xs text-secondary">
            No game in this collection left your repertoire at least {depth / 2} moves in.
          </p>
        ) : null}

        {SCAN_KIND_ORDER.map((kind) =>
          groups[kind].length ? (
            <ScanSection key={kind} kind={kind} groups={groups[kind]} onOpen={open} />
          ) : null,
        )}
      </div>
    </Dialog>
  );
}

function ScanSection({
  kind,
  groups,
  onOpen,
}: {
  readonly kind: ScanKind;
  readonly groups: readonly ScanGroup<Hit>[];
  readonly onOpen: (hit: Hit) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? groups : groups.slice(0, 8);
  const games = groups.reduce((sum, group) => sum + group.games.length, 0);
  return (
    <section data-scan-kind={kind} className="border-t border-line-subtle pt-2">
      <h3 className="text-xs font-semibold text-primary">
        {KIND_TITLE[kind]}{' '}
        <span className="font-normal text-tertiary tabular">
          · {games} {games === 1 ? 'game' : 'games'}
        </span>
      </h3>
      <p className="mb-1.5 text-[11px] text-tertiary">{KIND_HINT[kind]}</p>
      <ul className="flex flex-col divide-y divide-line-subtle">
        {shown.map((group) => {
          const first = group.games[0]!;
          return (
            <li key={`${group.positionKey}|${group.san}`} className="py-1.5" data-scan-group>
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-semibold text-primary tabular">
                  {moveLabel(first.finding.ply, group.san)}
                </span>
                {group.expected.length ? (
                  <span className="text-tertiary">
                    your repertoire: {group.expected.join(', ')}
                  </span>
                ) : null}
                <span className="ml-auto text-[11px] text-tertiary tabular">
                  {group.games.length} {group.games.length === 1 ? 'game' : 'games'}
                </span>
              </div>
              <ul className="mt-0.5 flex flex-col">
                {group.games.slice(0, 4).map(({ game }) => (
                  <li key={`${game.game.id ?? ''}${game.pgn.length}${game.answer.ply}`}>
                    <button
                      type="button"
                      onClick={() => onOpen(game)}
                      className="max-w-full truncate text-left text-[11.5px] text-accent hover:underline"
                    >
                      {gameTitle(game.game)}
                      {game.game.result && game.game.result !== '*' ? ` · ${game.game.result}` : ''}
                    </button>
                  </li>
                ))}
                {group.games.length > 4 ? (
                  <li className="text-[11px] text-tertiary">and {group.games.length - 4} more</li>
                ) : null}
              </ul>
            </li>
          );
        })}
      </ul>
      {groups.length > shown.length ? (
        <Button size="sm" onClick={() => setExpanded(true)}>
          Show all {groups.length}
        </Button>
      ) : null}
    </section>
  );
}
