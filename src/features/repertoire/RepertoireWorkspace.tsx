'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { positionKey, START_FEN } from '@/chess/fen';
import { Position } from '@/chess/position';
import { createTree } from '@/chess/tree/tree';
import type { Fen } from '@/chess/types';
import { Export, Plus, Repertoire as RepertoireIcon, Target, Trash } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState, Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { useExplorer } from '@/features/explorer/useExplorer';
import {
  invalidateRepertoires,
  useRepertoire,
  useRepertoires,
} from '@/features/persistence/queries';
import { cn } from '@/lib/cn';
import { coverage, findGaps, indexPositions, isExpectedReply, roleOf } from '@/repertoire';
import { exportRepertoirePgn } from '@/repertoire/export';
import { getRepositories } from '@/persistence/repositories';
import {
  REPERTOIRE_ROLES,
  StaleRepertoirePositionWriteError,
  type RepertoirePositionRecord,
  type RepertoireRole,
  type RepertoireWithPositions,
} from '@/persistence/domain';
import type { RepertoireGap } from '@/repertoire';
import { useAnalysis } from '@/stores/analysis-store';
import { useUi } from '@/stores/ui-store';
import { NavButton } from '@/features/shell/NavButton';
import { CanonicalBoardSurface } from '@/features/workspace/CanonicalBoardSurface';
import { WorkspaceLowerPanel } from '@/features/workspace/WorkspaceLowerPanel';
import { WorkspaceToolDock } from '@/features/workspace/WorkspaceToolDock';
import { RepertoireReviewDialog } from './RepertoireReviewDialog';
import { ReferenceCoveragePanel } from './ReferenceCoveragePanel';

const ROLE_LABEL: Record<RepertoireRole, string> = {
  main: 'Main',
  alternative: 'Alternative',
  candidate: 'Candidate',
  avoid: 'Avoid',
};

export function RepertoireWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const notify = useUi((state) => state.notify);
  const openDocument = useAnalysis((state) => state.openDocument);
  const setTrainingCaptureOpen = useUi((state) => state.setTrainingCaptureOpen);
  const repertoires = useRepertoires();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('repertoire'),
  );
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('position'),
  );
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState<'w' | 'b'>('w');
  const [creating, setCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const list = repertoires.data ?? [];
  const effectiveId = selectedId ?? list[0]?.id ?? null;
  const repertoire = useRepertoire(effectiveId);
  const positions = useMemo(() => repertoire.data?.positions ?? [], [repertoire.data?.positions]);
  const current =
    positions.find((position) => position.id === selectedPositionId) ?? positions[0] ?? null;
  const metrics = useMemo(() => coverage(positions), [positions]);
  const gaps = useRepertoireGaps(repertoire.data ?? null);
  const syncedPosition = useRef<string | null>(null);

  useEffect(() => {
    if (!current || !repertoire.data) return;
    const key = `${repertoire.data.repertoire.id}:${current.id}`;
    if (syncedPosition.current === key) return;
    syncedPosition.current = key;
    openDocument({
      tree: createTree(current.fen, {
        Event: repertoire.data.repertoire.title,
        Result: '*',
      }),
      document: {
        kind: 'untitled',
        title: `${repertoire.data.repertoire.title} · repertoire position`,
      },
      orientation: repertoire.data.repertoire.color,
    });
  }, [current, openDocument, repertoire.data]);

  const create = async () => {
    if (!newTitle.trim()) return;
    try {
      const repositories = await getRepositories();
      const record = await repositories.repertoires.create({
        title: newTitle,
        color: newColor,
      });
      invalidateRepertoires(queryClient);
      setSelectedId(record.id);
      setNewTitle('');
      setCreating(false);
      notify({ tone: 'success', message: `${record.title} created.` });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The repertoire could not be created.',
      });
    }
  };

  /**
   * Take a repertoire position to the analysis board.
   *
   * Preparation is written from Analysis, so "this position needs an answer"
   * has to be one click from the board where the answer gets played. The
   * repertoire is a set of positions, not a game, so the board opens on the
   * position itself rather than replaying a route to it.
   */
  const openOnBoard = (fen: Fen, title: string) => {
    openDocument({
      tree: createTree(fen, { Event: title, Result: '*' }),
      document: { kind: 'untitled', title },
    });
    router.push('/analysis');
  };

  const exportPgn = async () => {
    if (!repertoire.data) return;
    const pgn = exportRepertoirePgn(repertoire.data.repertoire, repertoire.data.positions);
    try {
      await navigator.clipboard.writeText(pgn);
      notify({
        tone: 'success',
        message: `${repertoire.data.repertoire.title} copied as PGN.`,
        detail: 'Roles and notes travel as comments; PGN has nowhere else to put them.',
      });
    } catch {
      notify({ tone: 'error', message: 'The clipboard is not available in this context.' });
    }
  };

  const remove = async () => {
    if (!effectiveId || !repertoire.data) return;
    try {
      await (await getRepositories()).repertoires.delete(effectiveId);
      invalidateRepertoires(queryClient);
      setSelectedId(null);
      notify({ tone: 'success', message: `${repertoire.data.repertoire.title} deleted.` });
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The repertoire could not be deleted.',
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {reviewOpen && repertoire.data ? (
        <RepertoireReviewDialog repertoire={repertoire.data} onClose={() => setReviewOpen(false)} />
      ) : null}
      <header className="density-row flex h-10 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-1 px-2 sm:px-3">
        <NavButton />
        <RepertoireIcon className="h-4 w-4 text-accent" />
        <h1 className="text-xs font-semibold text-primary">Repertoire</h1>
        {repertoire.data ? (
          <span className="hidden text-2xs text-tertiary sm:inline">
            {repertoire.data.repertoire.color === 'w' ? 'White' : 'Black'} ·{' '}
            {metrics.answeredPositions} prepared positions
            {gaps.data?.length ? ` · ${gaps.data.length} evidence-backed gaps` : ''}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {repertoire.data ? (
            <Button onClick={() => setReviewOpen(true)}>Review repertoire</Button>
          ) : null}
          {repertoire.data ? (
            <Button icon={<Export />} onClick={() => void exportPgn()}>
              <span className="hidden sm:inline">Export PGN</span>
              <span className="sm:hidden">PGN</span>
            </Button>
          ) : null}
          <Button variant="accent" icon={<Plus />} onClick={() => setCreating(true)}>
            New repertoire
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto wide:flex-row wide:overflow-hidden">
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 md:max-panes:grid-cols-[230px_minmax(340px,1fr)] wide:grid-cols-[230px_minmax(340px,1fr)]">
          <Panel className="min-h-[200px] border-b border-line-subtle md:min-h-0 md:border-r md:border-b-0">
            <PanelHeader>Repertoires</PanelHeader>
            <PanelBody>
              {list.length === 0 ? (
                <EmptyState
                  title="No repertoire yet."
                  description="Create one here, then add a line from Analysis. Positions reached by transposition will converge automatically."
                  action={<Button onClick={() => setCreating(true)}>Create repertoire</Button>}
                />
              ) : (
                <>
                  <div className="border-b border-line-subtle p-2">
                    <select
                      aria-label="Active repertoire"
                      value={effectiveId ?? ''}
                      onChange={(event) => {
                        setSelectedId(event.target.value);
                        setSelectedPositionId(null);
                      }}
                      className="h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
                    >
                      {list.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} ({item.color === 'w' ? 'White' : 'Black'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <PositionNavigator
                    positions={positions}
                    selectedId={current?.id ?? null}
                    onSelect={setSelectedPositionId}
                  />
                </>
              )}
            </PanelBody>
            {repertoire.data ? (
              <div className="flex items-center border-t border-line-subtle px-2 py-1.5">
                <span className="text-[10.5px] text-tertiary tabular">
                  {metrics.totalMoves} moves · {metrics.expectedReplies} replies · max depth{' '}
                  {metrics.maxDepth}
                </span>
                <IconButton
                  className="ml-auto"
                  label="Delete this repertoire"
                  tone="danger"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash />
                </IconButton>
              </div>
            ) : null}
          </Panel>

          <section className="flex min-h-[430px] min-w-0 flex-col px-3 py-3 sm:px-5 sm:py-4 md:min-h-0">
            {current ? (
              <>
                <CanonicalBoardSurface
                  mode="interactive"
                  className="min-h-0 flex-1"
                  showContext={false}
                />
                <div className="mx-auto mt-3 flex w-full max-w-[690px] items-center gap-2 border-t border-line-subtle pt-2">
                  <span className="text-2xs text-tertiary tabular">Depth {current.depth}</span>
                  <span className="truncate text-2xs text-secondary">
                    {current.moves
                      .map(
                        (move) =>
                          `${move.san} · ${move.expected ? 'Expected reply' : ROLE_LABEL[move.role]}`,
                      )
                      .join('   ')}
                  </span>
                  <span className="ml-auto shrink-0 text-2xs text-tertiary">
                    {current.sideToMove === 'w' ? 'White' : 'Black'} to move
                  </span>
                </div>
              </>
            ) : (
              <EmptyState
                title={
                  repertoire.data ? 'This repertoire has no positions.' : 'Choose a repertoire.'
                }
                description={
                  repertoire.data
                    ? 'Open Analysis, play an opening line, then use Add to repertoire.'
                    : 'Create a repertoire to start organising prepared moves by position.'
                }
              />
            )}
            <WorkspaceLowerPanel workspace="repertoire" contextLabel="Repertoire" />
          </section>
        </div>
        <WorkspaceToolDock
          workspace="repertoire"
          contextLabel="Repertoire"
          contextPanel={
            <div className="flex h-full min-h-0 flex-col">
              {repertoire.data ? (
                <CoverageSummary metrics={metrics} unresolved={gaps.data?.length ?? 0} />
              ) : null}
              <GapSummary
                gaps={gaps.data ?? []}
                pending={gaps.isPending && Boolean(repertoire.data)}
                onOpen={(gap) =>
                  openOnBoard(
                    gap.fen,
                    `Unanswered after ${gap.opponentMove.san} · ${repertoire.data?.repertoire.title ?? 'Repertoire'}`,
                  )
                }
              />
              <ReferenceCoveragePanel positions={positions} />
              <div className="min-h-0 flex-1">
                <PositionEvidence
                  position={current}
                  onChanged={() => invalidateRepertoires(queryClient)}
                  onOpenBoard={(fen) =>
                    openOnBoard(fen, repertoire.data?.repertoire.title ?? 'Repertoire position')
                  }
                  onTrain={(fen) => {
                    openOnBoard(fen, repertoire.data?.repertoire.title ?? 'Repertoire position');
                    setTrainingCaptureOpen(true);
                  }}
                />
              </div>
            </div>
          }
        />
      </div>

      {/*
        The one modal in the application that was not a dialog.

        This was a hand-rolled overlay: no `role="dialog"`, no `aria-modal`, no
        label, no focus trap and no Escape — so a screen reader was told nothing
        had happened, and Tab walked straight out of it into the page behind.
        Every other modal here already went through `Dialog`, which has all four;
        this one predated it and nothing had gone looking. Moving it over is the
        fix, rather than adding the attributes again by hand.
      */}
      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New repertoire"
        description="A repertoire stores decisions at canonical positions, so transpositions share one entry."
        width="w-[420px]"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="accent"
              disabled={!newTitle.trim()}
              onClick={() => {
                void create();
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label className="block text-2xs text-tertiary">
            Title
            <input
              autoFocus
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
            />
          </label>
          <label className="mt-3 block text-2xs text-tertiary">
            Side
            <select
              value={newColor}
              onChange={(event) => setNewColor(event.target.value as 'w' | 'b')}
              className="mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60"
            >
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
          </label>
          {/* Enter submits, which is why the form survives the move. */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Dialog>
      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${repertoire.data?.repertoire.title ?? 'this repertoire'}?`}
        description="Every prepared position and move in this repertoire will be removed. Imported games and training items are not affected."
        confirmLabel="Delete repertoire"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await remove();
          setDeleteOpen(false);
        }}
      />
    </div>
  );
}

function PositionNavigator({
  positions,
  selectedId,
  onSelect,
}: {
  readonly positions: readonly RepertoirePositionRecord[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}) {
  if (positions.length === 0) return null;
  return (
    <ol className="divide-y divide-line-subtle">
      {positions.map((position) => (
        <li key={position.id}>
          <button
            type="button"
            onClick={() => onSelect(position.id)}
            className={cn(
              'flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-2',
              selectedId === position.id && 'bg-accent-muted',
            )}
          >
            <span className="w-8 shrink-0 text-[10px] text-tertiary tabular">
              d{position.depth}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-secondary">
              {position.moves.map((move) => move.san).join(' / ') || 'Position note'}
            </span>
            <span className="text-[10px] text-tertiary tabular">{position.moves.length}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function useRepertoireGaps(repertoire: RepertoireWithPositions | null) {
  return useQuery({
    queryKey: [
      'repertoire-gaps',
      repertoire?.repertoire.id ?? 'none',
      repertoire?.repertoire.updatedAt ?? 0,
    ],
    enabled: repertoire !== null,
    retry: false,
    queryFn: async (): Promise<readonly RepertoireGap[]> => {
      if (!repertoire) return [];
      const opponentPositions = repertoire.positions.filter(
        (position) => position.sideToMove !== repertoire.repertoire.color,
      );
      const games = (await getRepositories()).games;
      const inputs = await Promise.all(
        opponentPositions.map(async (position) => {
          const evidence = await games.explore(position.fen, {}, 10);
          const origin = Position.fromTrustedFen(position.fen);
          return {
            position,
            replies: evidence.moves.flatMap((move) => {
              const played = origin.playUci(move.uci);
              if (!played.ok) return [];
              const resultingFen = origin.after(played.value).fen;
              return [
                {
                  move,
                  resultingFen,
                  resultingKey: positionKey(resultingFen),
                },
              ];
            }),
          };
        }),
      );
      return findGaps(indexPositions(repertoire.positions), inputs).slice(0, 20);
    },
  });
}

function GapSummary({
  gaps,
  pending,
  onOpen,
}: {
  readonly gaps: readonly RepertoireGap[];
  readonly pending: boolean;
  readonly onOpen: (gap: RepertoireGap) => void;
}) {
  return (
    <section className="shrink-0 border-b border-line-subtle">
      <div className="flex h-8 items-center px-3">
        <h2 className="text-[10px] uppercase tracking-wide text-tertiary">Coverage gaps</h2>
        <span className="ml-auto text-[10px] text-tertiary tabular">
          {pending ? 'Checking…' : gaps.length}
        </span>
      </div>
      {!pending && gaps.length === 0 ? (
        <p className="border-t border-line-subtle px-3 py-2 text-[10.5px] text-tertiary">
          No gap is supported by the imported local games.
        </p>
      ) : (
        <ol className="max-h-28 overflow-y-auto border-t border-line-subtle">
          {gaps.map((gap) => (
            <li key={gap.positionKey}>
              <button
                type="button"
                onClick={() => onOpen(gap)}
                title="Open this position in Analysis to prepare a reply"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="font-medium text-primary">{gap.opponentMove.san}</span>
                <span className="truncate text-[10.5px] text-secondary">no prepared response</span>
                <span className="ml-auto shrink-0 text-[10px] text-tertiary tabular">
                  {gap.games} games
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PositionEvidence({
  position,
  onChanged,
  onOpenBoard,
  onTrain,
}: {
  readonly position: RepertoirePositionRecord | null;
  readonly onChanged: () => void;
  readonly onOpenBoard: (fen: Fen) => void;
  readonly onTrain: (fen: Fen) => void;
}) {
  const explorer = useExplorer('local-collection', position?.fen ?? START_FEN, {});
  const data = position ? explorer.data : undefined;

  return (
    <Panel className="h-full">
      <PanelHeader
        actions={
          position ? (
            <>
              <IconButton
                label="Open this position in Analysis"
                onClick={() => onOpenBoard(position.fen)}
              >
                <RepertoireIcon />
              </IconButton>
              <IconButton
                label="Create a training position here"
                onClick={() => onTrain(position.fen)}
              >
                <Target />
              </IconButton>
            </>
          ) : null
        }
      >
        Position evidence
      </PanelHeader>
      <PanelBody>
        {!position ? (
          <EmptyState title="No position selected." />
        ) : (
          <>
            <MoveEditor position={position} onChanged={onChanged} />

            <section className="border-b border-line-subtle px-3 py-3">
              <h2 className="text-[10px] uppercase tracking-wide text-tertiary">Notes</h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-secondary">
                {position.note || 'No position note.'}
              </p>
              <p className="mt-2 break-all font-mono text-[9.5px] leading-relaxed text-tertiary">
                {positionKey(position.fen)}
              </p>
            </section>

            <section>
              <div className="flex h-8 items-center border-b border-line-subtle px-3">
                <h2 className="text-[10px] uppercase tracking-wide text-tertiary">Moves</h2>
                <span className="ml-auto text-[10px] text-tertiary tabular">
                  {data ? `${data.totalGames.toLocaleString()} local games` : 'Local database'}
                </span>
              </div>
              {explorer.isPending ? (
                <p className="px-3 py-4 text-2xs text-tertiary">Reading local evidence…</p>
              ) : explorer.isError ? (
                <p className="px-3 py-4 text-2xs text-negative">Local evidence is unavailable.</p>
              ) : (data?.moves.length ?? 0) === 0 ? (
                <p className="px-3 py-4 text-2xs text-tertiary">
                  No imported game reaches this position.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[330px] border-collapse text-[10.5px]">
                    <thead>
                      <tr className="border-b border-line-subtle text-left text-[9.5px] uppercase tracking-wide text-tertiary">
                        <th className="px-3 py-1.5 font-medium">Move</th>
                        <th className="px-2 py-1.5 text-right font-medium">Games</th>
                        <th className="px-2 py-1.5 text-right font-medium">Score</th>
                        <th className="px-2 py-1.5 text-right font-medium">Avg Elo</th>
                        <th className="px-3 py-1.5 font-medium">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-subtle">
                      {data?.moves.map((move) => {
                        const role = roleOf(position, move.uci);
                        const expected = isExpectedReply(position, move.uci);
                        const score = move.games
                          ? Math.round(((move.white + move.draws / 2) / move.games) * 100)
                          : 0;
                        return (
                          <tr key={move.uci} className="text-secondary">
                            <td className="px-3 py-1.5 font-medium text-primary">{move.san}</td>
                            <td className="px-2 py-1.5 text-right tabular">{move.games}</td>
                            <td className="px-2 py-1.5 text-right tabular">{score}% W</td>
                            <td className="px-2 py-1.5 text-right tabular">
                              {move.averageRating ?? '—'}
                            </td>
                            <td className="px-3 py-1.5">
                              {expected ? 'Expected' : role ? ROLE_LABEL[role] : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

/**
 * Editing the decisions stored at one position.
 *
 * Roles change here rather than only at the moment a line is filed, because a
 * repertoire is revised far more often than it is created: last season's main
 * line becomes this season's alternative, and a candidate is promoted once it
 * has been trusted for a while. The note travels with the move, so the reason
 * survives alongside the decision.
 */
function MoveEditor({
  position,
  onChanged,
}: {
  readonly position: RepertoirePositionRecord;
  readonly onChanged: () => void;
}) {
  const notify = useUi((state) => state.notify);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [conflict, setConflict] = useState<{
    latest: RepertoirePositionRecord;
    mine: RepertoirePositionRecord;
  } | null>(null);

  const write = async (uci: string, change: { role?: RepertoireRole; note?: string }) => {
    const move = position.moves.find((candidate) => candidate.uci === uci);
    if (!move) return;
    setBusy(uci);
    try {
      const repositories = await getRepositories();
      await repositories.repertoires.upsertPosition({
        repertoireId: position.repertoireId,
        fen: position.fen,
        sideToMove: position.sideToMove,
        depth: position.depth,
        moves: [{ ...move, ...change }],
        expectedRevision: position.revision,
      });
      onChanged();
    } catch (error) {
      if (error instanceof StaleRepertoirePositionWriteError) {
        setConflict({
          latest: error.current,
          mine: {
            ...position,
            moves: position.moves.map((candidate) =>
              candidate.uci === uci ? { ...candidate, ...change } : candidate,
            ),
          },
        });
        return;
      }
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That change could not be saved.',
      });
    } finally {
      setBusy(null);
      setEditing(null);
    }
  };

  const drop = async (uci: string) => {
    setBusy(uci);
    try {
      await (await getRepositories()).repertoires.removeMove(position.id, uci, position.revision);
      onChanged();
    } catch (error) {
      if (error instanceof StaleRepertoirePositionWriteError) {
        setConflict({
          latest: error.current,
          mine: { ...position, moves: position.moves.filter((move) => move.uci !== uci) },
        });
        return;
      }
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'That move could not be removed.',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="border-b border-line-subtle">
      {conflict ? (
        <div role="alert" className="border-b border-caution/40 bg-caution/10 px-3 py-2">
          <p className="text-xs font-medium text-primary">
            This repertoire position changed in another tab.
          </p>
          <p className="mt-0.5 text-2xs text-secondary">
            The other version was kept. Reload it, or preserve this tab in a separate repertoire.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() => {
                setConflict(null);
                onChanged();
              }}
            >
              Reload latest
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                void (async () => {
                  const repositories = await getRepositories();
                  const source = await repositories.repertoires.get(conflict.mine.repertoireId);
                  const copy = await repositories.repertoires.create({
                    title: `${source?.repertoire.title ?? 'Repertoire'} (this tab)`,
                    color: source?.repertoire.color ?? conflict.mine.sideToMove,
                  });
                  await repositories.repertoires.upsertPosition({
                    repertoireId: copy.id,
                    fen: conflict.mine.fen,
                    sideToMove: conflict.mine.sideToMove,
                    depth: conflict.mine.depth,
                    moves: conflict.mine.moves,
                    ...(conflict.mine.note ? { note: conflict.mine.note } : {}),
                  });
                  setConflict(null);
                  onChanged();
                  notify({
                    tone: 'success',
                    message: `Saved this tab's position in “${copy.title}”.`,
                  });
                })();
              }}
            >
              Save mine as copy
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex h-8 items-center px-3">
        <h2 className="text-[10px] uppercase tracking-wide text-tertiary">Decisions here</h2>
        <span className="ml-auto text-[10px] text-tertiary tabular">
          {position.sideToMove === 'w' ? 'White' : 'Black'} to move
        </span>
      </div>
      <ul className="divide-y divide-line-subtle border-t border-line-subtle">
        {position.moves.map((move) => (
          <li key={move.uci} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11.5px] font-medium text-primary">
                {move.san}
              </span>
              {move.expected ? (
                <span className="text-[10.5px] text-tertiary">Expected opponent reply</span>
              ) : (
                <select
                  aria-label={`Role for ${move.san}`}
                  value={move.role}
                  disabled={busy === move.uci}
                  onChange={(event) =>
                    void write(move.uci, { role: event.target.value as RepertoireRole })
                  }
                  className="h-6 rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10.5px] text-secondary outline-none focus:border-accent/60"
                >
                  {REPERTOIRE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  className="text-[10px] text-tertiary hover:text-secondary"
                  onClick={() => {
                    setEditing(editing === move.uci ? null : move.uci);
                    setNote(move.note ?? '');
                  }}
                >
                  {move.note ? 'Edit note' : 'Add note'}
                </button>
                <IconButton
                  label={`Remove ${move.san}`}
                  tone="danger"
                  disabled={busy === move.uci}
                  onClick={() => void drop(move.uci)}
                >
                  <Trash />
                </IconButton>
              </div>
            </div>
            {editing === move.uci ? (
              <form
                className="mt-1.5 flex gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void write(move.uci, { note: note.trim() });
                }}
              >
                <input
                  autoFocus
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Why this move, and what to remember about it"
                  className="h-7 min-w-0 flex-1 rounded-[3px] border border-line bg-surface-inset px-2 text-[11px] text-primary outline-none focus:border-accent/60"
                />
                <Button variant="accent" type="submit" disabled={busy === move.uci}>
                  Save
                </Button>
              </form>
            ) : move.note ? (
              <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">{move.note}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What the repertoire contains, counted.
 *
 * Every number here is something the user could recount by hand from their own
 * entries. There is deliberately no percentage and no "strength": a repertoire
 * has no denominator — chess does not end — so a completeness score would be a
 * number invented to look reassuring.
 */
function CoverageSummary({
  metrics,
  unresolved,
}: {
  readonly metrics: ReturnType<typeof coverage>;
  readonly unresolved: number;
}) {
  const rows: readonly (readonly [string, number])[] = [
    ['Positions with an answer', metrics.answeredPositions],
    ['Main moves', metrics.mainMoves],
    ['Alternatives', metrics.alternativeMoves],
    ['Candidates, not yet trusted', metrics.candidateMoves],
    ['Moves ruled out', metrics.avoidMoves],
    ['Expected opponent replies', metrics.expectedReplies],
    ['Unresolved continuations in local games', unresolved],
  ];

  return (
    <section className="shrink-0 border-b border-line-subtle">
      <div className="flex h-8 items-center px-3">
        <h2 className="text-[10px] uppercase tracking-wide text-tertiary">Coverage</h2>
        <span className="ml-auto text-[10px] text-tertiary tabular">
          max depth {metrics.maxDepth}
        </span>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-line-subtle px-3 py-2 text-[10.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-tertiary">{label}</dt>
            <dd className="text-right text-secondary tabular">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
