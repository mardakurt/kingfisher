'use client';

/**
 * Two engines on one position.
 *
 * The panel reports what both said and marks where they part company. It does
 * not resolve the disagreement, because a disagreement between a neural engine
 * and an alpha-beta engine is a finding about the position, not a defect to be
 * averaged away — and the two systematically differ in ways worth seeing:
 * MCTS is happier in closed positions, alpha-beta in long forcing lines.
 */

import { useCallback, useMemo } from 'react';

import { formatScore } from '@/chess/evaluation';
import { Play, Stop } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Panel';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { compareEngines, describeComparison, type EngineReading } from '@/engine/comparison';
import { engineDefinition } from '@/engine/registry';
import { useVisibleEngineDefinitions } from '@/engine/use-engines';
import { variationTokens } from '@/engine/pv';
import { cn } from '@/lib/cn';
import { useEngine, type EngineSlot } from '@/stores/engine-store';
import { usePreferences } from '@/stores/preferences-store';

export function EngineComparison() {
  const { node } = useAnalysisPosition();
  const primary = useEngine((state) => state.primary);
  const secondary = useEngine((state) => state.secondary);
  const comparing = useEngine((state) => state.comparing);
  const compare = useEngine((state) => state.compare);
  const stop = useEngine((state) => state.stop);
  const setComparing = useEngine((state) => state.setComparing);
  const selectEngine = useEngine((state) => state.selectEngine);
  const prefs = usePreferences();

  const readings = useMemo<EngineReading[]>(
    () => [toReading(primary), toReading(secondary)],
    [primary, secondary],
  );
  const comparison = useMemo(() => compareEngines(readings), [readings]);
  const running = primary.running || secondary.running;

  const run = useCallback(() => {
    void compare(node.fen, prefs.engineLimit, {
      multiPv: Math.max(2, prefs.engineMultiPv),
      threads: prefs.engineThreads,
      hashMb: prefs.engineHashMb,
    });
  }, [
    compare,
    node.fen,
    prefs.engineHashMb,
    prefs.engineLimit,
    prefs.engineMultiPv,
    prefs.engineThreads,
  ]);

  const definitions = useVisibleEngineDefinitions();

  /*
    The two engines agree on the first `pvAgreementPlies` moves, so either
    engine's SAN can name them; the primary's is used because it is the one the
    rest of the interface is showing.
  */
  const sharedLine = useMemo(() => {
    const line = primary.analysis?.lines[0];
    if (!line?.san) return [];
    return variationTokens(node.ply, line.san.slice(0, comparison.pvAgreementPlies)).map(
      (token) => token.text,
    );
  }, [comparison.pvAgreementPlies, node.ply, primary.analysis]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line-subtle px-2.5">
        <h2 className="text-2xs font-medium uppercase tracking-[0.08em] text-tertiary">
          Two engines
        </h2>
        <div className="ml-auto flex items-center gap-1">
          {running ? (
            <Button size="sm" icon={<Stop />} onClick={() => stop()}>
              Stop
            </Button>
          ) : (
            <Button size="sm" variant="accent" icon={<Play />} onClick={run}>
              Run both
            </Button>
          )}
          {comparing ? (
            <Button size="sm" onClick={() => setComparing(false)}>
              Release
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-px border-b border-line-subtle bg-line-subtle">
        {(['primary', 'secondary'] as const).map((slot) => {
          const state = slot === 'primary' ? primary : secondary;
          return (
            <div key={slot} className="bg-surface-1 p-2">
              <select
                aria-label={slot === 'primary' ? 'First engine' : 'Second engine'}
                value={state.engineId}
                onChange={(event) => {
                  void selectEngine(slot, event.target.value);
                  prefs.set(
                    slot === 'primary' ? 'primaryEngineId' : 'secondaryEngineId',
                    event.target.value,
                  );
                }}
                className="h-6 w-full rounded-[3px] border border-line bg-surface-inset px-1.5 text-[10.5px] text-secondary outline-none focus:border-accent/60"
              >
                {definitions.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.name}
                  </option>
                ))}
              </select>
              <SlotSummary state={state} />
            </div>
          );
        })}
      </div>

      <p
        className={cn(
          'shrink-0 border-b border-line-subtle px-2.5 py-1.5 text-[10.5px]',
          comparison.topMove === 'differ' ? 'text-caution' : 'text-tertiary',
        )}
      >
        {describeComparison(comparison)}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {comparison.moves.length === 0 ? (
          <EmptyState
            title="No comparison yet."
            description="Run both engines to see where they agree and where they part."
          />
        ) : (
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr className="border-b border-line-subtle text-left text-[9.5px] uppercase tracking-wide text-tertiary">
                <th className="px-2.5 py-1.5 font-medium">Move</th>
                {readings.map((reading) => (
                  <th key={reading.engineId} className="px-2 py-1.5 text-right font-medium">
                    {reading.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {comparison.moves.map((move) => (
                <tr key={move.uci}>
                  <td className="px-2.5 py-1.5 font-medium text-primary">{move.san ?? move.uci}</td>
                  {readings.map((reading) => {
                    const rank = move.ranks[reading.engineId];
                    const score = move.scores[reading.engineId];
                    return (
                      <td
                        key={reading.engineId}
                        className={cn(
                          'px-2 py-1.5 text-right tabular',
                          rank === 1 ? 'text-primary' : 'text-secondary',
                          rank === null && 'text-tertiary/60',
                        )}
                      >
                        {score ? formatScore(score) : '—'}
                        {rank !== null && rank !== undefined && rank > 1 ? (
                          <span className="ml-1 text-[9px] text-tertiary">#{rank}</span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {comparison.pvAgreementPlies > 0 && sharedLine.length > 0 ? (
          <p className="border-t border-line-subtle px-2.5 py-2 text-[10.5px] leading-relaxed text-tertiary">
            Shared line: <span className="text-secondary">{sharedLine.join(' ')}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SlotSummary({ state }: { readonly state: EngineSlot }) {
  const line = state.analysis?.lines[0];
  const definition = engineDefinition(state.engineId);
  return (
    <div className="mt-1.5">
      {state.problem ? (
        <p className="text-[10px] leading-relaxed text-negative">
          {state.problem.message}
          {state.problem.remedy ? (
            <span className="block text-tertiary">{state.problem.remedy}</span>
          ) : null}
        </p>
      ) : line ? (
        <p className="text-[11px] text-primary tabular">
          {formatScore(line.score)}
          <span className="ml-1.5 text-tertiary">
            depth {line.depth}
            {definition && definition.family !== 'unknown'
              ? ` · ${definition.family === 'neural' ? 'neural' : 'α-β'}`
              : ''}
          </span>
        </p>
      ) : (
        <p className="text-[10px] text-tertiary">
          {state.status === 'analysing' ? 'Searching…' : 'Not started.'}
        </p>
      )}
    </div>
  );
}

const toReading = (slot: EngineSlot): EngineReading => {
  const definition = engineDefinition(slot.engineId);
  return {
    engineId: slot.engineId,
    name: definition?.name ?? slot.engineId,
    family: definition?.family ?? 'unknown',
    analysis: slot.analysis,
  };
};
