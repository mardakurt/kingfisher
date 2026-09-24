'use client';

/**
 * The deep-analysis job: one at a time, in the background, on its own engine
 * session.
 *
 * It runs outside the engine panel's session, the way the analysis queue
 * does, so a person can keep reading the board while it works; it stops the
 * panel's own search when it starts, because two searches on one machine
 * halve each other. The result stays here until it is written into a game or
 * discarded — a tab switch or a new position does not lose it, and it names
 * the position it started from so it is never written anywhere else.
 *
 * It lives while the page does. A night's run needs the window open and the
 * machine awake; that is said on the form rather than discovered in the
 * morning.
 */

import { create } from 'zustand';

import type { Fen } from '@/chess/types';
import { deepen, type DeepenOptions, type DeepenResult, type DeepNode } from '@/engine/deepen';
import { engineDefinition, engineProviderById } from '@/engine/registry';
import type { EngineSession } from '@/engine/types';
import { useEngine } from '@/stores/engine-store';

export interface DeepenJobOptions extends DeepenOptions {
  /** Time given to each position, in milliseconds. */
  readonly msPerPosition: number;
}

type Status = 'idle' | 'running' | 'done' | 'failed';

interface DeepenState {
  status: Status;
  startFen: Fen | null;
  options: DeepenJobOptions | null;
  engineName: string | null;
  searched: number;
  /** The moves from the start to the position last searched. */
  current: readonly DeepNode[];
  result: DeepenResult | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  start(fen: Fen, engineId: string, options: DeepenJobOptions): Promise<void>;
  stop(): void;
  clear(): void;
}

let controller: AbortController | null = null;
let session: EngineSession | null = null;

export const useDeepen = create<DeepenState>((set, get) => ({
  status: 'idle',
  startFen: null,
  options: null,
  engineName: null,
  searched: 0,
  current: [],
  result: null,
  error: null,
  startedAt: null,
  finishedAt: null,

  start: async (fen, engineId, options) => {
    if (get().status === 'running') return;
    controller = new AbortController();
    const signal = controller.signal;
    set({
      status: 'running',
      startFen: fen,
      options,
      engineName: engineDefinition(engineId)?.name ?? engineId,
      searched: 0,
      current: [],
      result: null,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
    });
    // Two searches on one machine halve each other; the panel's goes first.
    useEngine.getState().stop('primary');
    try {
      const provider = engineProviderById(engineId);
      if (!provider) throw new Error(`Unknown engine: ${engineId}`);
      const availability = await provider.checkAvailability();
      if (!availability.available) {
        throw new Error(availability.reason ?? 'The selected engine is unavailable.');
      }
      session = await provider.create({ multiPv: options.breadth, threads: 1, hashMb: 64 });
      set({ engineName: session.identity.name || get().engineName });
      const active = session;
      const result = await deepen(
        fen,
        options,
        async (position, abort) => {
          const handle = active.analyse(
            { fen: position, limit: { kind: 'movetime', ms: options.msPerPosition } },
            () => undefined,
          );
          const onAbort = () => handle.stop();
          abort?.addEventListener('abort', onAbort, { once: true });
          try {
            const analysis = await handle.finished;
            return {
              lines: [...analysis.lines]
                .sort((a, b) => a.rank - b.rank)
                .map((line) => ({ moves: line.moves, score: line.score, depth: line.depth })),
              depth: analysis.depth,
              nodes: analysis.nodes,
              timeMs: analysis.timeMs,
            };
          } finally {
            abort?.removeEventListener('abort', onAbort);
          }
        },
        signal,
        (searched, path) => set({ searched, current: path }),
      );
      set({ status: 'done', result, finishedAt: Date.now(), current: [] });
    } catch (error) {
      set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        finishedAt: Date.now(),
        current: [],
      });
    } finally {
      session?.dispose();
      session = null;
      controller = null;
    }
  },

  stop: () => controller?.abort(),

  clear: () => {
    controller?.abort();
    set({
      status: 'idle',
      startFen: null,
      options: null,
      searched: 0,
      current: [],
      result: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    });
  },
}));
