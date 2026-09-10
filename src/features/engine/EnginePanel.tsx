'use client';

/**
 * The engine's candidate moves.
 *
 * Three things can be done with a line here, and they are deliberately
 * different actions. *Insert* writes real, legal, structured moves into the
 * game tree, reusing branches that already exist. *Pin* holds a reading still
 * while the search moves on, for comparison. *Save evaluation* attaches one
 * snapshot to the current move as evidence. Only the first and third change
 * the document; pins are session-local, because a database full of engine
 * chatter is not a study.
 */

import { useCallback, useMemo, useState } from 'react';

import { formatScore } from '@/chess/evaluation';
import { variationPositions, variationTokens } from '@/engine/pv';
import { describeGap, engineSessionMetrics } from '@/engine/metrics';
import type { PrincipalVariation } from '@/engine/types';
import { Pin, Play, Plus, Save, Stop, Trash } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { evaluationFromAnalysis } from '@/features/analysis/useEngineSnapshots';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine, type PinnedLine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';
import { MiniBoard } from '@/features/board/MiniBoard';

export function EnginePanel() {
  const { node, currentId } = useAnalysisPosition();

  const status = useEngine((state) => state.primary.status);
  const problem = useEngine((state) => state.primary.problem);
  const identity = useEngine((state) => state.primary.identity);
  const analysis = useEngine((state) => state.primary.analysis);
  const history = useEngine((state) => state.primary.history);
  const analysedFen = useEngine((state) => state.primary.analysedFen);
  const running = useEngine((state) => state.primary.running);
  const runEngine = useEngine((state) => state.analyse);
  const stopEngine = useEngine((state) => state.stop);
  const pinned = useEngine((state) => state.pinned);
  const pin = useEngine((state) => state.pin);
  const unpin = useEngine((state) => state.unpin);

  const prefs = usePreferences();
  const insertUciLine = useAnalysis((state) => state.insertUciLine);
  const attachEvaluation = useAnalysis((state) => state.attachEvaluation);
  const notify = useUi((state) => state.notify);
  const [preview, setPreview] = useState<{ readonly rank: number; readonly ply: number } | null>(
    null,
  );

  const stale = analysedFen !== node.fen;
  const metrics = engineSessionMetrics(history);

  const start = useCallback(() => {
    void runEngine('primary', node.fen, prefs.engineLimit, {
      multiPv: prefs.engineMultiPv,
      threads: prefs.engineThreads,
      hashMb: prefs.engineHashMb,
    });
  }, [
    node.fen,
    prefs.engineHashMb,
    prefs.engineLimit,
    prefs.engineMultiPv,
    prefs.engineThreads,
    runEngine,
  ]);

  /**
   * Insertion replays the UCI moves against the real position, so an engine
   * line that has gone stale — the board moved on mid-search — fails cleanly at
   * the first illegal move instead of corrupting the tree.
   */
  const insert = useCallback(
    (moves: readonly string[], upto: number, from?: string) => {
      const result = insertUciLine(moves.slice(0, upto + 1), from);
      if (!result.ok) {
        notify({
          tone: 'error',
          message: 'That engine line no longer fits this position.',
          detail: result.error.message,
        });
      }
    },
    [insertUciLine, notify],
  );

  const saveEvaluation = useCallback(() => {
    if (!analysis || stale) {
      notify({ tone: 'info', message: 'Analyse this position first.' });
      return;
    }
    const evaluation = evaluationFromAnalysis(analysis, identity?.name ?? 'Stockfish');
    if (!evaluation) {
      notify({ tone: 'info', message: 'The engine has not reported a score yet.' });
      return;
    }
    attachEvaluation(currentId, evaluation);
    notify({
      tone: 'success',
      message: `${formatScore(evaluation.score)} at depth ${evaluation.depth} saved to this move.`,
    });
  }, [analysis, attachEvaluation, currentId, identity, notify, stale]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        actions={
          <>
            <Segmented
              items={[1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) }))}
              value={String(prefs.engineMultiPv)}
              onChange={(value) => {
                prefs.set('engineMultiPv', Number(value));
                prefs.set('enginePreset', 'custom');
              }}
              className="mr-1"
            />
            <IconButton
              label="Save this evaluation to the current move"
              onClick={saveEvaluation}
              disabled={!analysis || stale}
            >
              <Save />
            </IconButton>
            {running ? (
              <IconButton label="Stop analysis (E)" onClick={() => stopEngine('primary')} active>
                <Stop />
              </IconButton>
            ) : (
              <IconButton
                label="Start analysis (E)"
                onClick={start}
                disabled={status === 'unavailable' || status === 'loading'}
              >
                <Play />
              </IconButton>
            )}
          </>
        }
      >
        <span className="truncate normal-case tracking-normal text-secondary">
          {identity?.name ?? 'Stockfish'}
        </span>
        {analysis && !stale && analysis.depth > 0 && (
          <span className={cn('tabular', stale ? 'text-tertiary/60' : 'text-tertiary')}>
            depth {analysis.depth}
            {analysis.seldepth ? `/${analysis.seldepth}` : ''}
          </span>
        )}
      </PanelHeader>

      <PanelBody>
        {pinned.length > 0 && (
          <section className="border-b border-line-subtle bg-surface-2/40">
            <h3 className="flex items-center gap-1.5 px-2.5 pt-1.5 text-[10px] uppercase tracking-wide text-tertiary">
              <Pin className="h-3 w-3" />
              Pinned
            </h3>
            <ul className="divide-y divide-line-subtle">
              {pinned.map((line) => (
                <PinnedRow
                  key={line.id}
                  line={line}
                  applicable={line.fen === node.fen}
                  onInsert={() => insert(line.moves, line.moves.length - 1)}
                  onRemove={() => unpin(line.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {status === 'unavailable' || status === 'error' ? (
          <EmptyState
            title={problem?.message ?? 'The engine is unavailable.'}
            description={problem?.remedy}
          />
        ) : status === 'loading' ? (
          <EmptyState title="Loading Stockfish…" description="The build is about 7 MB." />
        ) : stale || !analysis || analysis.lines.length === 0 ? (
          <EmptyState
            title="No analysis yet"
            description="Start the engine to see its candidate moves and evaluations for this position."
            action={
              <Button variant="subtle" icon={<Play />} onClick={start}>
                Analyse this position
              </Button>
            }
          />
        ) : (
          <ol className={cn('divide-y divide-line-subtle', stale && 'opacity-50')}>
            {analysis.lines.map((line) => (
              <li key={line.rank} className="group px-2.5 py-1.5">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      'w-[52px] shrink-0 rounded-[3px] px-1 py-0.5 text-center text-xs font-medium tabular',
                      scoreTone(line),
                    )}
                  >
                    {formatScore(line.score)}
                  </span>

                  <div className="min-w-0 flex-1 text-[12px] leading-relaxed [overflow-wrap:anywhere]">
                    {line.san && line.san.length > 0 ? (
                      variationTokens(node.ply, line.san).map((token, index) =>
                        token.isMove ? (
                          <button
                            key={`${line.rank}-${index}`}
                            type="button"
                            title="Add this line up to here"
                            onClick={() => insert(line.moves, moveIndexOf(line, index, node.ply))}
                            className="mr-1 rounded-[3px] px-0.5 text-primary transition-colors hover:bg-accent-muted"
                          >
                            {token.text}
                          </button>
                        ) : (
                          <span
                            key={`${line.rank}-${index}`}
                            className="mr-0.5 text-tertiary tabular"
                          >
                            {token.text}
                          </span>
                        ),
                      )
                    ) : (
                      <span className="text-tertiary">…</span>
                    )}
                  </div>

                  <span className="flex shrink-0 items-center opacity-100 mid:opacity-0 mid:transition-opacity mid:focus-within:opacity-100 mid:group-hover:opacity-100">
                    <IconButton
                      label="Preview this variation"
                      className="h-6 w-6"
                      onClick={() => setPreview({ rank: line.rank, ply: 1 })}
                    >
                      <Play />
                    </IconButton>
                    <IconButton
                      label="Pin this line so it stays visible"
                      className="h-6 w-6"
                      onClick={() => pin(line.rank)}
                    >
                      <Pin />
                    </IconButton>
                    <IconButton
                      label="Insert this variation into the game"
                      className="h-6 w-6"
                      onClick={() => insert(line.moves, line.moves.length - 1)}
                    >
                      <Plus />
                    </IconButton>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
        {analysis && !stale && preview ? (
          <PvPreview
            fen={node.fen}
            line={analysis.lines.find((line) => line.rank === preview.rank)}
            ply={preview.ply}
            theme={prefs.boardTheme}
            pieceSet={prefs.pieceSet}
            onPly={(ply) => setPreview({ ...preview, ply })}
            onClose={() => setPreview(null)}
          />
        ) : null}
      </PanelBody>

      {analysis && !stale && analysis.nodes > 0 && (
        <footer className="shrink-0 border-t border-line-subtle px-2.5 py-1 text-[10px] text-tertiary tabular">
          <div className="flex items-center gap-3">
            <span>{formatCount(analysis.nodes)} nodes</span>
            <span>{Math.round(analysis.nps / 1000)}k n/s</span>
            {analysis.hashFull !== undefined && (
              <span>hash {(analysis.hashFull / 10).toFixed(0)}%</span>
            )}
            {analysis.tbHits ? <span>tb {formatCount(analysis.tbHits)}</span> : null}
            <span className="ml-auto">{(analysis.timeMs / 1000).toFixed(1)}s</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-tertiary/80">
            <span>top unchanged {metrics.topMoveStableDepths} depths</span>
            <span>{metrics.topMoveChanges} top-move changes</span>
            <span>score swing {(metrics.scoreSwingCp / 100).toFixed(2)}</span>
            {metrics.multiPvGap ? <span>MultiPV gap {describeGap(metrics.multiPvGap)}</span> : null}
            {metrics.nearEqualCandidates > 0 ? (
              <span>{metrics.nearEqualCandidates} within 0.20</span>
            ) : null}
          </div>
        </footer>
      )}
    </div>
  );
}

function PvPreview({
  fen,
  line,
  ply,
  theme,
  pieceSet,
  onPly,
  onClose,
}: {
  readonly fen: Parameters<typeof variationPositions>[0];
  readonly line: PrincipalVariation | undefined;
  readonly ply: number;
  readonly theme: Parameters<typeof MiniBoard>[0]['theme'];
  readonly pieceSet: Parameters<typeof MiniBoard>[0]['pieceSet'];
  readonly onPly: (ply: number) => void;
  readonly onClose: () => void;
}) {
  const positions = useMemo(() => variationPositions(fen, line?.moves ?? []), [fen, line?.moves]);
  if (!line || positions.length === 0) return null;
  const index = Math.max(0, Math.min(ply, positions.length - 1));
  const current = positions[index];
  if (!current) return null;

  return (
    <section className="border-t border-line-subtle bg-surface-inset p-3" aria-label="PV preview">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-primary">Variation preview</h3>
          <p className="text-xs text-tertiary tabular">
            {index === 0 ? 'Starting position' : current.san} · {index}/{positions.length - 1}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-tertiary hover:text-primary"
        >
          Close
        </button>
      </div>
      <MiniBoard
        fen={current.fen}
        theme={theme}
        pieceSet={pieceSet}
        className="mx-auto max-w-[240px]"
        testId="pv-preview"
      />
      <div className="mt-2 grid grid-cols-4 gap-1">
        <Button variant="subtle" onClick={() => onPly(0)} disabled={index === 0}>
          First
        </Button>
        <Button variant="subtle" onClick={() => onPly(index - 1)} disabled={index === 0}>
          Previous
        </Button>
        <Button
          variant="subtle"
          onClick={() => onPly(index + 1)}
          disabled={index === positions.length - 1}
        >
          Next
        </Button>
        <Button
          variant="subtle"
          onClick={() => onPly(positions.length - 1)}
          disabled={index === positions.length - 1}
        >
          Last
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-tertiary">
        Preview only. The main board and game tree are unchanged.
      </p>
    </section>
  );
}

interface PinnedRowProps {
  readonly line: PinnedLine;
  /** Pins survive navigation, so most of them do not fit the current board. */
  readonly applicable: boolean;
  readonly onInsert: () => void;
  readonly onRemove: () => void;
}

function PinnedRow({ line, applicable, onInsert, onRemove }: PinnedRowProps) {
  return (
    <li className="group flex items-baseline gap-2 px-2.5 py-1.5">
      <span className="w-[52px] shrink-0 rounded-[3px] bg-surface-3 px-1 py-0.5 text-center text-xs font-medium text-secondary tabular">
        {formatScore(line.score)}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[11.5px]',
            applicable ? 'text-secondary' : 'text-tertiary/70',
          )}
        >
          {line.san.join(' ') || line.moves.join(' ')}
        </p>
        <p className="text-[10px] text-tertiary tabular">
          depth {line.depth} · {line.engine}
          {!applicable && ' · another position'}
        </p>
      </div>
      <span className="flex shrink-0 items-center">
        <IconButton
          label="Insert this pinned line"
          className="h-6 w-6"
          disabled={!applicable}
          onClick={onInsert}
        >
          <Plus />
        </IconButton>
        <IconButton label="Remove this pin" className="h-6 w-6" tone="danger" onClick={onRemove}>
          <Trash />
        </IconButton>
      </span>
    </li>
  );
}

/**
 * `variationTokens` interleaves move numbers with moves, so the token index is
 * not the move index; recover it by counting the moves before this token.
 */
function moveIndexOf(line: PrincipalVariation, tokenIndex: number, startPly: number): number {
  const tokens = variationTokens(startPly, line.san ?? []);
  let moves = -1;
  for (let i = 0; i <= tokenIndex && i < tokens.length; i += 1) {
    if (tokens[i]?.isMove) moves += 1;
  }
  return Math.max(0, moves);
}

const scoreTone = (line: { score: { kind: string; cp?: number; moves?: number } }): string => {
  if (line.score.kind === 'mate') {
    return (line.score.moves ?? 0) > 0
      ? 'bg-eval-white text-eval-black'
      : 'bg-eval-black text-eval-white';
  }
  const cp = line.score.cp ?? 0;
  if (cp > 40) return 'bg-eval-white text-eval-black';
  if (cp < -40) return 'bg-eval-black text-eval-white';
  return 'bg-surface-3 text-secondary';
};

const formatCount = (value: number): string => {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
  return String(value);
};
