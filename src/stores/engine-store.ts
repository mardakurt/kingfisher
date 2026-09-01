'use client';

/**
 * Engine runtime state.
 *
 * The session itself is held in a module-level variable, not in the store: it
 * owns a Web Worker, it is not serialisable, and nothing should re-render
 * because a pointer to it changed. The store holds only what the interface
 * needs to draw — status, identity, the latest analysis snapshot.
 */

import { create } from 'zustand';

import { annotateAnalysis } from '@/engine/pv';
import { defaultEngineProvider } from '@/engine/registry';
import type {
  AnalysisHandle,
  AnalysisLimit,
  EngineAnalysis,
  EngineCapabilities,
  EngineIdentity,
  EngineSession,
} from '@/engine/types';
import type { Fen } from '@/chess/types';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'analysing' | 'error' | 'unavailable';

interface EngineProblem {
  readonly message: string;
  readonly remedy?: string;
}

interface EngineConfigInput {
  readonly multiPv: number;
  readonly threads: number;
  readonly hashMb: number;
}

interface EngineState {
  status: EngineStatus;
  problem: EngineProblem | null;
  identity: EngineIdentity | null;
  capabilities: EngineCapabilities | null;
  analysis: EngineAnalysis | null;
  /** The position the current analysis belongs to. */
  analysedFen: Fen | null;
  running: boolean;

  prepare(config: EngineConfigInput): Promise<boolean>;
  analyse(fen: Fen, limit: AnalysisLimit, config: EngineConfigInput): Promise<void>;
  stop(): void;
  shutdown(): void;
  applyConfig(config: EngineConfigInput): Promise<void>;
}

let session: EngineSession | null = null;
let handle: AnalysisHandle | null = null;
let starting: Promise<EngineSession | null> | null = null;

export const useEngine = create<EngineState>((set, get) => ({
  status: 'idle',
  problem: null,
  identity: null,
  capabilities: null,
  analysis: null,
  analysedFen: null,
  running: false,

  prepare: async (config) => {
    if (session) return true;
    if (starting) return (await starting) !== null;

    set({ status: 'loading', problem: null });
    const provider = defaultEngineProvider();

    starting = (async () => {
      const availability = await provider.checkAvailability();
      if (!availability.available) {
        set({
          status: 'unavailable',
          problem: {
            message: availability.reason ?? 'The engine is unavailable.',
            ...(availability.remedy ? { remedy: availability.remedy } : {}),
          },
        });
        return null;
      }
      try {
        const created = await provider.create(config);
        session = created;
        set({
          status: 'ready',
          identity: created.identity,
          capabilities: created.capabilities,
          problem: null,
        });
        return created;
      } catch (error) {
        set({
          status: 'error',
          problem: {
            message: error instanceof Error ? error.message : 'The engine failed to start.',
            ...(error instanceof Error && 'remedy' in error && typeof error.remedy === 'string'
              ? { remedy: error.remedy }
              : {}),
          },
        });
        return null;
      } finally {
        starting = null;
      }
    })();

    return (await starting) !== null;
  },

  analyse: async (fen, limit, config) => {
    const ready = await get().prepare(config);
    if (!ready || !session) return;

    handle?.stop();
    handle = null;

    await session.configure(config);

    set({ running: true, status: 'analysing', analysedFen: fen, analysis: null });

    handle = session.analyse({ fen, limit }, (snapshot) => {
      // Ignore stragglers from a search the user has already moved past.
      if (get().analysedFen !== snapshot.fen) return;
      set({ analysis: annotateAnalysis(snapshot) });
      if (snapshot.complete) set({ running: false, status: 'ready' });
    });
  },

  stop: () => {
    handle?.stop();
    handle = null;
    session?.stop();
    set({ running: false, status: session ? 'ready' : get().status });
  },

  shutdown: () => {
    handle?.stop();
    handle = null;
    session?.dispose();
    session = null;
    set({ status: 'idle', running: false, analysis: null, analysedFen: null, identity: null });
  },

  applyConfig: async (config) => {
    if (!session) return;
    await session.configure(config);
  },
}));
