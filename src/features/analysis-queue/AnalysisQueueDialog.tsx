'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { engineDefinitions, DEFAULT_ENGINE_ID } from '@/engine/registry';
import { useVisibleEngineDefinitions } from '@/engine/use-engines';
import type {
  AnalysisQueuePreset,
  AnalysisQueueSides,
  AnalysisQueueStrategy,
} from '@/persistence/domain';
import { useUi } from '@/stores/ui-store';
import { useAnalysisQueue } from './queue-store';

const PRESETS: readonly { id: AnalysisQueuePreset; label: string; detail: string }[] = [
  { id: 'quick', label: 'Quick review', detail: '250 ms per position' },
  { id: 'standard', label: 'Standard', detail: '1 second per position' },
  { id: 'deep', label: 'Deep', detail: '5 seconds per position' },
  { id: 'custom', label: 'Custom', detail: 'Choose a fixed time' },
];

export function AnalysisQueueDialog() {
  const open = useUi((state) => state.analysisQueueOpen);
  const setOpen = useUi((state) => state.setAnalysisQueueOpen);
  return open ? <QueueForm onClose={() => setOpen(false)} /> : null;
}

function QueueForm({ onClose }: { readonly onClose: () => void }) {
  const visibleEngines = useVisibleEngineDefinitions();
  const gameIds = useUi((state) => state.analysisQueueGameIds);
  const clearSelection = useUi((state) => state.clearAnalysisQueueSelection);
  const jobs = useAnalysisQueue((state) => state.jobs);
  const running = useAnalysisQueue((state) => state.running);
  const foregroundPriority = useAnalysisQueue((state) => state.foregroundPriority);
  const enqueue = useAnalysisQueue((state) => state.enqueue);
  const start = useAnalysisQueue((state) => state.start);
  const pause = useAnalysisQueue((state) => state.pause);
  const resume = useAnalysisQueue((state) => state.resume);
  const cancel = useAnalysisQueue((state) => state.cancel);
  const retryFailed = useAnalysisQueue((state) => state.retryFailed);
  const [engineId, setEngineId] = useState(DEFAULT_ENGINE_ID);
  const [preset, setPreset] = useState<AnalysisQueuePreset>('standard');
  const [multiPv, setMultiPv] = useState(1);
  const [strategy, setStrategy] = useState<AnalysisQueueStrategy>('after-opening');
  const [sides, setSides] = useState<AnalysisQueueSides>('both');
  const [startMove, setStartMove] = useState(10);
  const [customTimeMs, setCustomTimeMs] = useState(2_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await enqueue(gameIds, {
        engineId,
        preset,
        multiPv,
        strategy,
        sides,
        startPly: strategy === 'after-opening' ? startMove * 2 : 1,
        customTimeMs,
      });
      clearSelection();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The games could not be queued.');
    } finally {
      setBusy(false);
    }
  };

  const failed = jobs.some((job) => job.status === 'failed');
  const resumable = jobs.some((job) => job.status === 'paused' || job.status === 'running');
  const waiting = jobs.some((job) => job.status === 'queued');

  return (
    <Dialog
      open
      onClose={onClose}
      title={gameIds.length ? 'Add games to analysis queue' : 'Background analysis queue'}
      description="One background engine stores final, factual position evidence. Interactive board analysis always has priority."
      width="w-[720px]"
      footer={
        gameIds.length ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="accent" disabled={busy} onClick={() => void add()}>
              {busy ? 'Adding…' : `Add ${gameIds.length} game${gameIds.length === 1 ? '' : 's'}`}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Close</Button>
            {failed ? <Button onClick={() => void retryFailed()}>Retry failed</Button> : null}
            {/*
              While interactive analysis holds the engine, background jobs sit
              at `queued` — offering "Start queue" there would promise
              something the priority policy will immediately undo, so the
              banner in the body is the only thing said about it.
            */}
            {foregroundPriority ? null : running ? (
              <Button variant="accent" onClick={() => void pause()}>
                Pause
              </Button>
            ) : resumable ? (
              <Button variant="accent" onClick={() => void resume()}>
                Resume
              </Button>
            ) : waiting ? (
              <Button variant="accent" onClick={() => void start()}>
                Start queue
              </Button>
            ) : null}
          </>
        )
      }
    >
      {gameIds.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Engine">
            <select
              aria-label="Engine"
              value={engineId}
              onChange={(event) => setEngineId(event.target.value)}
              className={CONTROL}
            >
              {visibleEngines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Analysis preset">
            <select
              aria-label="Analysis preset"
              value={preset}
              onChange={(event) => setPreset(event.target.value as AnalysisQueuePreset)}
              className={CONTROL}
            >
              {PRESETS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} · {option.detail}
                </option>
              ))}
            </select>
          </Field>
          <Field label="MultiPV">
            <input
              aria-label="MultiPV"
              type="number"
              min={1}
              max={5}
              value={multiPv}
              onChange={(event) => setMultiPv(Number(event.target.value))}
              className={CONTROL}
            />
          </Field>
          <Field label="Positions">
            <select
              aria-label="Positions"
              value={strategy}
              onChange={(event) => setStrategy(event.target.value as AnalysisQueueStrategy)}
              className={CONTROL}
            >
              <option value="every-move">Every move</option>
              <option value="after-opening">After opening move N</option>
            </select>
          </Field>
          {/*
            Whose decisions to judge.

            The pass has been able to narrow to one side since Phase 18, and
            nothing in the product could ask it to: `sides` was carried by the
            store, the repository, the position selection and its tests, and
            set by no control. A player reviewing their own game wants their
            own moves and pays twice over without this.

            `both` stays the default, because it is the honest one for a game
            somebody is studying rather than one they played. Narrowing does
            not simply drop the other side's positions — judging a move needs
            the evaluation before it and after it — which is why the saving is
            about a third rather than a half, and why the hint says so.
          */}
          <Field label="Moves to judge">
            <select
              aria-label="Moves to judge"
              value={sides}
              onChange={(event) => setSides(event.target.value as AnalysisQueueSides)}
              className={CONTROL}
            >
              <option value="both">Both sides</option>
              <option value="w">White&rsquo;s decisions</option>
              <option value="b">Black&rsquo;s decisions</option>
            </select>
          </Field>
          {strategy === 'after-opening' ? (
            <Field label="Start after move">
              <input
                aria-label="Start after move"
                type="number"
                min={1}
                max={100}
                value={startMove}
                onChange={(event) => setStartMove(Number(event.target.value))}
                className={CONTROL}
              />
            </Field>
          ) : null}
          {preset === 'custom' ? (
            <Field label="Milliseconds per position">
              <input
                aria-label="Milliseconds per position"
                type="number"
                min={100}
                max={60000}
                value={customTimeMs}
                onChange={(event) => setCustomTimeMs(Number(event.target.value))}
                className={CONTROL}
              />
            </Field>
          ) : null}
          {error ? <p className="text-xs text-negative sm:col-span-2">{error}</p> : null}
        </div>
      ) : jobs.length ? (
        <div className="space-y-2">
          {foregroundPriority ? (
            <p className="rounded-[4px] border border-caution/40 bg-caution/10 px-3 py-2 text-xs text-secondary">
              Background work is waiting while interactive analysis has priority.
            </p>
          ) : null}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-3 rounded-[4px] border border-line-subtle bg-surface-inset px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-primary">{job.gameLabel}</p>
                <p className="mt-0.5 text-[10.5px] text-tertiary">
                  {job.status} · {job.nextIndex} / {job.totalPositions} positions ·{' '}
                  {engineDefinitionLabel(job.engineId)} · {job.preset}
                </p>
                {job.error ? <p className="mt-1 text-[10.5px] text-negative">{job.error}</p> : null}
              </div>
              {job.status === 'queued' || job.status === 'running' || job.status === 'paused' ? (
                <Button variant="ghost" onClick={() => void cancel(job.id)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-xs text-tertiary">
          No games are queued. Select games in the database and choose Add to analysis queue.
        </p>
      )}
    </Dialog>
  );
}

const engineDefinitionLabel = (id: string) =>
  engineDefinitions().find((engine) => engine.id === id)?.name ?? id;

const CONTROL =
  'mt-1 h-8 w-full rounded-[4px] border border-line bg-surface-inset px-2 text-xs text-primary outline-none focus:border-accent/60';

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="text-2xs text-tertiary">
      {label}
      {children}
    </label>
  );
}
