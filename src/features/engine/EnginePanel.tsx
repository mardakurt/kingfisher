'use client';

import { useCallback } from 'react';

import { formatScore } from '@/chess/evaluation';
import { variationTokens } from '@/engine/pv';
import type { PrincipalVariation } from '@/engine/types';
import { Play, Plus, Stop } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Tabs';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { cn } from '@/lib/cn';
import { useAnalysis } from '@/stores/analysis-store';
import { useEngine } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';
import { useUi } from '@/stores/ui-store';

export function EnginePanel() {
  const { node } = useAnalysisPosition();

  const status = useEngine((state) => state.status);
  const problem = useEngine((state) => state.problem);
  const identity = useEngine((state) => state.identity);
  const analysis = useEngine((state) => state.analysis);
  const analysedFen = useEngine((state) => state.analysedFen);
  const running = useEngine((state) => state.running);
  const runEngine = useEngine((state) => state.analyse);
  const stopEngine = useEngine((state) => state.stop);

  const prefs = usePreferences();
  const insertUciLine = useAnalysis((state) => state.insertUciLine);
  const notify = useUi((state) => state.notify);

  const stale = analysedFen !== node.fen;

  const start = useCallback(() => {
    void runEngine(node.fen, prefs.engineLimit, {
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

  const insert = useCallback(
    (line: PrincipalVariation, upto: number) => {
      const moves = line.moves.slice(0, upto + 1);
      const result = insertUciLine(moves);
      if (!result.ok) notify({ tone: 'error', message: result.error.message });
    },
    [insertUciLine, notify],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader
        actions={
          <>
            <Segmented
              items={[1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) }))}
              value={String(prefs.engineMultiPv)}
              onChange={(value) => prefs.set('engineMultiPv', Number(value))}
              className="mr-1"
            />
            {running ? (
              <IconButton label="Stop analysis (E)" onClick={stopEngine} active>
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
        {analysis && analysis.depth > 0 && (
          <span className={cn('tabular', stale ? 'text-tertiary/60' : 'text-tertiary')}>
            depth {analysis.depth}
            {analysis.seldepth ? `/${analysis.seldepth}` : ''}
          </span>
        )}
      </PanelHeader>

      <PanelBody>
        {status === 'unavailable' || status === 'error' ? (
          <EmptyState
            title={problem?.message ?? 'The engine is unavailable.'}
            description={problem?.remedy}
          />
        ) : status === 'loading' ? (
          <EmptyState title="Loading Stockfish…" description="The build is about 7 MB." />
        ) : !analysis || analysis.lines.length === 0 ? (
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
                            onClick={() => insert(line, moveIndexOf(line, index, node.ply))}
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

                  <IconButton
                    label="Insert this variation into the game"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => insert(line, line.moves.length - 1)}
                  >
                    <Plus />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
        )}
      </PanelBody>

      {analysis && analysis.nodes > 0 && (
        <footer className="flex shrink-0 items-center gap-3 border-t border-line-subtle px-2.5 py-1 text-[10.5px] text-tertiary tabular">
          <span>{formatCount(analysis.nodes)} nodes</span>
          <span>{Math.round(analysis.nps / 1000)}k n/s</span>
          {analysis.hashFull !== undefined && (
            <span>hash {(analysis.hashFull / 10).toFixed(0)}%</span>
          )}
          {analysis.tbHits ? <span>tb {formatCount(analysis.tbHits)}</span> : null}
          <span className="ml-auto">{(analysis.timeMs / 1000).toFixed(1)}s</span>
        </footer>
      )}
    </div>
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
