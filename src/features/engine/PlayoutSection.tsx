'use client';

/**
 * Monte Carlo playouts in the engine panel (Phase 85): the engine plays the
 * position out against itself, many times, at a short time per move, and the
 * panel says how those games ended — a count, with the engine and the time
 * named, never an evaluation (`src/engine/playouts.ts`).
 */

import { useMemo, useState } from 'react';

import { positionKey } from '@/chess/fen';
import type { Fen } from '@/chess/types';
import { Button } from '@/components/ui/Button';
import { describePlayouts } from '@/engine/playouts';
import { DEFAULT_ENGINE_ID } from '@/engine/registry';
import { useEngine } from '@/stores/engine-store';
import { useAnalysis } from '@/stores/analysis-store';
import { readExperiment } from '@/engine/playout-experiment';

import { usePlayouts } from '@/stores/playout-store';

const COUNTS = [10, 20, 40, 100] as const;
const MILLISECONDS = [50, 100, 250, 500] as const;
const MAX_PLIES = 200;

const SELECT =
  'h-6 rounded-[var(--radius-control)] border border-line bg-surface-inset px-1 text-[10.5px] text-primary';

export function PlayoutSection({ fen }: { readonly fen: Fen }) {
  const job = usePlayouts();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number>(20);
  const [ms, setMs] = useState<number>(100);
  const [seed, setSeed] = useState(7);
  const tree = useAnalysis((state) => state.tree);
  const saved = useMemo(() => {
    try {
      return readExperiment(tree);
    } catch {
      return null;
    }
  }, [tree]);
  const engineId = useEngine((state) => state.primary.engineId) ?? DEFAULT_ENGINE_ID;
  const here = job.startFen !== null && positionKey(job.startFen) === positionKey(fen);

  return (
    <section
      className="border-t border-line-subtle px-2.5 py-1.5 text-[10.5px]"
      aria-label="Playouts"
      data-playouts={job.status}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-tertiary">Playouts</span>
        {job.status === 'running' ? (
          <Button size="sm" variant="ghost" onClick={job.stop}>
            Stop · {job.finished} played
          </Button>
        ) : job.status === 'idle' ? (
          <Button size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            Play it out…
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={job.clear}>
            Discard
          </Button>
        )}
      </div>

      {job.status !== 'running' && saved && saved.completed.length < saved.options.playouts ? (
        <Button
          size="sm"
          onClick={() => void job.start(saved.fen, saved.engineId, saved.options, saved)}
        >
          Resume saved experiment
        </Button>
      ) : null}
      {job.experiment ? (
        <>
          <p className="text-tertiary">
            Saved after each completed game in Studies; open its chapter to resume after restart. A
            game interrupted mid-play is rerun. Engine search timing can change answers.
          </p>
          <Button
            size="sm"
            onClick={() => {
              const blob = new Blob([JSON.stringify(job.experiment, null, 2)], {
                type: 'application/json',
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'kingfisher-playout-experiment.json';
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export experiment evidence
          </Button>
        </>
      ) : null}
      {job.status === 'idle' && open ? (
        <div className="mt-1.5 space-y-1.5" data-playouts-form>
          <div className="flex flex-wrap items-center gap-2 text-tertiary">
            <label>
              Games{' '}
              <select
                className={SELECT}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              >
                {COUNTS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Per move{' '}
              <select
                className={SELECT}
                value={ms}
                onChange={(event) => setMs(Number(event.target.value))}
              >
                {MILLISECONDS.map((value) => (
                  <option key={value} value={value}>
                    {value} ms
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Seed{' '}
            <input
              aria-label="Playout seed"
              type="number"
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value))}
              className={SELECT}
            />
          </label>
          <p className="text-tertiary">
            The engine plays both sides from here, choosing among its moves within 0.30 of its best.
            The result is how these games ended, not an evaluation; a game still going after{' '}
            {MAX_PLIES} plies is counted unfinished.
          </p>
          <Button
            size="sm"
            variant="accent"
            disabled={!Number.isSafeInteger(seed)}
            data-playouts-start
            onClick={() => {
              setOpen(false);
              void job.start(fen, engineId, {
                playouts: count,
                msPerMove: ms,
                multiPv: 3,
                marginCp: 30,
                maxPlies: MAX_PLIES,
                seed,
              });
            }}
          >
            Start {count} playouts
          </Button>
        </div>
      ) : null}

      {job.status === 'running' ? (
        <p className="mt-1 text-tertiary tabular" data-playouts-progress>
          {job.engineName}: game {job.finished + 1}, ply {job.plies}
        </p>
      ) : null}
      {job.status === 'failed' ? (
        <p className="mt-1 text-negative" role="alert">
          {job.error}
        </p>
      ) : null}
      {job.status === 'done' && job.report ? (
        <div className="mt-1" data-playouts-report>
          <p className="text-secondary">{describePlayouts(job.report)}</p>
          {here ? null : (
            <p className="text-caution">From another position than the one on the board.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
