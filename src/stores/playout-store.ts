'use client';

/**
 * The playout job (Phase 85): Monte Carlo playouts from one position, in the
 * background, on their own engine session — the deep-analysis job's shape
 * (`deepen-store.ts`). It stops the panel's search when it starts, because
 * two searches on one machine halve each other, and it names the position
 * and the engine it ran with, so its count is never shown against another.
 */

import { create } from 'zustand';

import type { Fen } from '@/chess/types';
import { experimentTree, type PlayoutExperiment } from '@/engine/playout-experiment';
import { getRepositories } from '@/persistence/repositories';
import { playOut, type PlayoutOptions, type PlayoutReport } from '@/engine/playouts';
import { engineDefinition, engineProviderById } from '@/engine/registry';
import type { EngineSession } from '@/engine/types';
import { useEngine } from '@/stores/engine-store';

type Status = 'idle' | 'running' | 'done' | 'failed';

interface PlayoutState {
  status: Status;
  startFen: Fen | null;
  engineName: string | null;
  finished: number;
  plies: number;
  report: PlayoutReport | null;
  error: string | null;
  experiment: PlayoutExperiment | null;
  start(
    fen: Fen,
    engineId: string,
    options: PlayoutOptions,
    resume?: PlayoutExperiment,
  ): Promise<void>;
  stop(): void;
  clear(): void;
}

let controller: AbortController | null = null;
let session: EngineSession | null = null;

export const usePlayouts = create<PlayoutState>((set, get) => ({
  status: 'idle',
  experiment: null,
  startFen: null,
  engineName: null,
  finished: 0,
  plies: 0,
  report: null,
  error: null,

  start: async (fen, engineId, options, resume) => {
    if (get().status === 'running') return;
    controller = new AbortController();
    const signal = controller.signal;
    set({
      status: 'running',
      startFen: fen,
      engineName: engineDefinition(engineId)?.name ?? engineId,
      finished: 0,
      plies: 0,
      report: null,
      experiment: null,
      error: null,
    });
    useEngine.getState().stop('primary');
    try {
      const provider = engineProviderById(engineId);
      if (!provider) throw new Error(`Unknown engine: ${engineId}`);
      const availability = await provider.checkAvailability();
      if (!availability.available) {
        throw new Error(availability.reason ?? 'The selected engine is unavailable.');
      }
      session = await provider.create({ multiPv: options.multiPv, threads: 1, hashMb: 32 });
      const name = session.identity.name || get().engineName || engineId;
      set({ engineName: name });
      const active = session;
      if (
        resume &&
        (resume.identity.name !== active.identity.name ||
          resume.identity.version !== active.identity.version ||
          resume.identity.author !== active.identity.author)
      )
        throw new Error(
          'The engine identity differs from the saved experiment. Start a new experiment.',
        );
      const repositories = await getRepositories();
      let experiment: PlayoutExperiment = resume ?? {
        format: 'kingfisher-playout-experiment',
        version: 1,
        fen,
        engineId,
        identity: active.identity,
        options,
        parameters: { threads: 1, hashMb: 32 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completed: [],
      };
      const study = await repositories.studies.create({ title: `Playout experiment · ${name}` });
      let chapter = await repositories.studies.createChapter({
        studyId: study.id,
        title: resume ? 'Resumed experiment' : 'Experiment checkpoint',
        tree: experimentTree(experiment),
      });
      set({ experiment });
      const report = await playOut(
        fen,
        name,
        options,
        async (position, abort) => {
          const handle = active.analyse(
            { fen: position, limit: { kind: 'movetime', ms: options.msPerMove } },
            () => undefined,
          );
          const onAbort = () => handle.stop();
          abort?.addEventListener('abort', onAbort, { once: true });
          try {
            const analysis = await handle.finished;
            return [...analysis.lines]
              .sort((a, b) => a.rank - b.rank)
              .map((line) => ({ moves: line.moves, score: line.score }));
          } finally {
            abort?.removeEventListener('abort', onAbort);
          }
        },
        signal,
        (finished, plies) => set({ finished, plies }),
        {
          completed: experiment.completed,
          save: async (completed) => {
            experiment = { ...experiment, completed, updatedAt: new Date().toISOString() };
            chapter = await repositories.studies.saveChapter({
              ...chapter,
              tree: experimentTree(experiment),
            });
            set({ experiment });
          },
        },
      );
      set({ status: 'done', report });
    } catch (error) {
      set({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
    } finally {
      session?.dispose();
      session = null;
      controller = null;
    }
  },

  stop: () => controller?.abort(),

  clear: () => {
    if (get().status === 'running') return;
    set({
      status: 'idle',
      startFen: null,
      finished: 0,
      plies: 0,
      report: null,
      experiment: null,
      error: null,
    });
  },
}));
