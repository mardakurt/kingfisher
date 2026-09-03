'use client';

/**
 * "Compare Nf3, c4 and h3."
 *
 * A question MultiPV answers badly. Asking for five lines and hoping your
 * three candidates appear in them wastes the search on moves you did not ask
 * about, and silently omits any candidate the engine ranks sixth — which is
 * precisely the one you wanted an opinion on.
 *
 * UCI `searchmoves` asks the real question. It is checked rather than assumed:
 * an engine that ignores it would return its own favourite and the comparison
 * would be a lie, so the capability decides whether the restriction is sent,
 * and the panel says which of the two happened.
 */

import { useMemo, useState } from 'react';

import { formatScore } from '@/chess/evaluation';
import { Position } from '@/chess/position';
import { asUci, type Uci } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { PanelBody, PanelHeader } from '@/components/ui/Panel';
import { useAnalysisPosition } from '@/features/analysis/useAnalysisPosition';
import { usePreferences } from '@/stores/preferences-store';
import { useEngine } from '@/stores/engine-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

import { keepLine } from './keep-line';

export function CandidateComparison() {
  const { node } = useAnalysisPosition();
  const primary = useEngine((state) => state.primary);
  const analyse = useEngine((state) => state.analyse);
  const preferences = usePreferences();
  const notify = useUi((state) => state.notify);
  const [selected, setSelected] = useState<readonly Uci[]>([]);

  const legal = useMemo(() => {
    const position = Position.fromTrustedFen(node.fen);
    return position.legalMoves().map((move) => ({ uci: asUci(move.uci), san: move.san }));
  }, [node.fen]);

  const supported = primary.capabilities?.searchMoves ?? false;

  const compare = async () => {
    if (selected.length === 0) return;
    await analyse(
      'primary',
      node.fen,
      preferences.engineLimit,
      {
        // One line per candidate, so every one selected gets its own answer
        // rather than competing for a fixed number of slots.
        multiPv: Math.max(1, Math.min(selected.length, 5)),
        threads: preferences.engineThreads,
        hashMb: preferences.engineHashMb,
      },
      selected,
    );
  };

  const lines = primary.analysis?.lines ?? [];

  return (
    <>
      <PanelHeader>
        Compare candidates
        <span className="normal-case tracking-normal text-tertiary">
          {selected.length} selected
        </span>
      </PanelHeader>
      <PanelBody className="px-3 py-3">
        <p className="text-[10.5px] leading-relaxed text-tertiary">
          Pick the moves you are actually choosing between. The engine is asked about those and
          nothing else.
        </p>
        {!supported ? (
          <p className="mt-1.5 rounded-[4px] bg-surface-2 px-2 py-1.5 text-[10px] leading-relaxed text-caution">
            This engine does not report support for restricted search. The comparison will run as an
            ordinary MultiPV search, so a candidate it ranks low may not appear.
          </p>
        ) : null}

        <div className="mt-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
          {legal.map((move) => {
            const active = selected.includes(move.uci);
            return (
              <button
                key={move.uci}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setSelected((current) =>
                    active ? current.filter((entry) => entry !== move.uci) : [...current, move.uci],
                  )
                }
                className={cn(
                  'rounded-[4px] border px-1.5 py-0.5 font-mono text-[10.5px]',
                  active
                    ? 'border-accent bg-accent-muted text-primary'
                    : 'border-line text-tertiary hover:border-accent/50',
                )}
              >
                {move.san}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex gap-1.5">
          <Button variant="accent" disabled={selected.length === 0} onClick={() => void compare()}>
            Compare {selected.length > 0 ? selected.length : ''}
          </Button>
          <Button disabled={selected.length === 0} onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>

        {lines.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1">
            {lines.map((line) => (
              <li key={line.rank} className="flex items-baseline gap-2">
                <span className="w-[6ch] shrink-0 font-mono text-[11px] text-primary">
                  {line.san?.[0] ?? line.moves[0]}
                </span>
                <span className="w-[7ch] shrink-0 text-[11px] text-secondary tabular">
                  {formatScore(line.score, { alwaysSign: true })}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-tertiary">
                  {(line.san ?? line.moves).slice(0, 8).join(' ')}
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void keepLine({
                      fen: node.fen,
                      engineId: primary.engineId,
                      /*
                        UCI `id name` is the build identity — "Stockfish 17.1"
                        — so it carries the version already. Splitting it would
                        mean parsing a free-text field and getting it wrong for
                        every engine that formats it differently.
                      */
                      engineName: primary.identity?.name ?? 'Engine',
                      multiPv: lines.length,
                      threads: preferences.engineThreads,
                      hashMb: preferences.engineHashMb,
                      ...(selected.length ? { searchMoves: [...selected] } : {}),
                      score: line.score,
                      depth: line.depth || (primary.analysis?.depth ?? 0),
                      nodes: primary.analysis?.nodes ?? 0,
                      timeMs: primary.analysis?.timeMs ?? 0,
                      pvUci: [...line.moves],
                      pvSan: [...(line.san ?? [])],
                    })
                      .then(() =>
                        notify({
                          tone: 'success',
                          message: 'Kept as evidence, with its settings and depth.',
                        }),
                      )
                      .catch(() => notify({ tone: 'error', message: 'Could not store that line.' }))
                  }
                >
                  Keep
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </PanelBody>
    </>
  );
}
