'use client';

/**
 * Engine runtime state, for one or two engines at a time.
 *
 * Sessions are held in module-level slots, not in the store: each owns a Worker
 * or a companion stream, none of them is serialisable, and nothing should
 * re-render because a pointer changed. The store holds only what the interface
 * draws — status, identity, the latest snapshot.
 *
 * There are exactly two slots. `primary` is the engine the panel shows;
 * `secondary` exists so two engines can be pointed at one position and
 * disagree, which is the single most useful thing a second engine does. Two is
 * a hard limit rather than a setting: a third search would take cores from the
 * interface, and a board that stutters costs more than a third opinion is
 * worth.
 */

import { create } from 'zustand';

import { annotateAnalysis } from '@/engine/pv';
import { DEFAULT_ENGINE_ID, engineDefinition, engineProviderById } from '@/engine/registry';
import type {
  AnalysisHandle,
  AnalysisLimit,
  EngineAnalysis,
  EngineCapabilities,
  EngineIdentity,
  EngineSession,
} from '@/engine/types';
import type { Score } from '@/chess/evaluation';
import type { Fen, San, Uci } from '@/chess/types';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'analysing' | 'error' | 'unavailable';
export type SlotId = 'primary' | 'secondary';

/**
 * A line the user asked to keep in view.
 *
 * Pins are working memory, not study data: they hold a line steady while the
 * search moves on, so two candidate moves can be compared without racing the
 * engine. Anything worth keeping past the session is inserted into the tree or
 * attached to a move as an evaluation, both of which are persisted.
 */
export interface PinnedLine {
  readonly id: string;
  readonly fen: Fen;
  readonly score: Score;
  readonly depth: number;
  readonly moves: readonly Uci[];
  readonly san: readonly San[];
  readonly engine: string;
  readonly pinnedAt: number;
}

const MAX_PINS = 8;

interface EngineProblem {
  readonly message: string;
  readonly remedy?: string;
}

export interface EngineConfigInput {
  readonly multiPv: number;
  readonly threads: number;
  readonly hashMb: number;
}

export interface EngineSlot {
  readonly engineId: string;
  readonly status: EngineStatus;
  readonly problem: EngineProblem | null;
  readonly identity: EngineIdentity | null;
  readonly capabilities: EngineCapabilities | null;
  readonly analysis: EngineAnalysis | null;
  /** Bounded depth samples for factual stability and volatility metrics. */
  readonly history: readonly EngineAnalysis[];
  /** The position the current analysis belongs to. */
  readonly analysedFen: Fen | null;
  readonly running: boolean;
}

const EMPTY_SLOT = (engineId: string): EngineSlot => ({
  engineId,
  status: 'idle',
  problem: null,
  identity: null,
  capabilities: null,
  analysis: null,
  history: [],
  analysedFen: null,
  running: false,
});

interface Runtime {
  session: EngineSession | null;
  handle: AnalysisHandle | null;
  starting: Promise<EngineSession | null> | null;
  /** Which engine the live session actually is, so a switch can be detected. */
  engineId: string | null;
  /**
   * Monotonic id for the most recent analysis request on this slot.
   *
   * Matching on FEN alone is not enough. `run` awaits twice before it starts a
   * search — once to obtain a session, once to configure it — and two rapid
   * calls interleave across those awaits: the second sets its position and
   * starts, then the first resumes, overwrites `analysedFen` with the position
   * the user has already left, and starts a second search on the same session.
   * The board then showed one position and the engine another. It also matters
   * when the user navigates away and back: the same FEN returning would
   * otherwise let a stale, shallower snapshot land on top of a deeper one.
   */
  request: number;
}

const runtimes: Record<SlotId, Runtime> = {
  primary: { session: null, handle: null, starting: null, engineId: null, request: 0 },
  secondary: { session: null, handle: null, starting: null, engineId: null, request: 0 },
};

interface EngineState {
  primary: EngineSlot;
  secondary: EngineSlot;
  /** Whether the second engine follows the board. */
  comparing: boolean;
  pinned: readonly PinnedLine[];

  selectEngine(slot: SlotId, engineId: string): Promise<void>;
  prepare(slot: SlotId, config: EngineConfigInput): Promise<boolean>;
  analyse(
    slot: SlotId,
    fen: Fen,
    limit: AnalysisLimit,
    config: EngineConfigInput,
    /** Restrict the search to these root moves, where the engine supports it. */
    searchMoves?: readonly Uci[],
  ): Promise<void>;
  /** Run both engines on one position. */
  compare(fen: Fen, limit: AnalysisLimit, config: EngineConfigInput): Promise<void>;
  setComparing(on: boolean): void;
  stop(slot?: SlotId): void;
  shutdown(slot?: SlotId): void;
  applyConfig(slot: SlotId, config: EngineConfigInput): Promise<void>;
  pin(rank: number): void;
  unpin(id: string): void;
  clearPins(): void;
}

/**
 * Threads for one slot.
 *
 * Two engines on one machine must not each ask for every core. They split what
 * the user allowed, and one core is always left for the interface.
 */
export function shareThreads(threads: number, engines: number): number {
  if (engines <= 1) return Math.max(1, threads);
  return Math.max(1, Math.floor(threads / engines));
}

export const useEngine = create<EngineState>((set, get) => {
  const patch = (slot: SlotId, changes: Partial<EngineSlot>) =>
    set((state) =>
      slot === 'primary'
        ? { primary: { ...state.primary, ...changes } }
        : { secondary: { ...state.secondary, ...changes } },
    );

  const startSession = async (
    slot: SlotId,
    config: EngineConfigInput,
  ): Promise<EngineSession | null> => {
    const runtime = runtimes[slot];
    const engineId = get()[slot].engineId;

    // A session for a different engine is not reusable; tear it down first.
    if (runtime.session && runtime.engineId !== engineId) {
      runtime.handle?.stop();
      runtime.session.dispose();
      runtime.session = null;
      runtime.handle = null;
      runtime.engineId = null;
    }
    if (runtime.session) return runtime.session;
    if (runtime.starting) return runtime.starting;

    patch(slot, { status: 'loading', problem: null });
    const provider = engineProviderById(engineId);
    if (!provider) {
      patch(slot, { status: 'error', problem: { message: `Unknown engine: ${engineId}` } });
      return null;
    }

    runtime.starting = (async () => {
      const availability = await provider.checkAvailability();
      if (!availability.available) {
        patch(slot, {
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
        runtime.session = created;
        runtime.engineId = engineId;
        patch(slot, {
          status: 'ready',
          identity: created.identity,
          capabilities: created.capabilities,
          problem: null,
        });
        return created;
      } catch (error) {
        patch(slot, {
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
        runtime.starting = null;
      }
    })();

    return runtime.starting;
  };

  const run = async (
    slot: SlotId,
    fen: Fen,
    limit: AnalysisLimit,
    config: EngineConfigInput,
    searchMoves?: readonly Uci[],
  ): Promise<void> => {
    const runtime = runtimes[slot];
    // Claimed before the first await, so a later request always outranks this
    // one no matter which of them finishes starting first.
    const request = (runtime.request += 1);

    const session = await startSession(slot, config);
    if (!session) return;
    if (runtime.request !== request) return;

    runtime.handle?.stop();
    runtime.handle = null;

    await session.configure(config);
    if (runtime.request !== request) return;

    patch(slot, {
      running: true,
      status: 'analysing',
      analysedFen: fen,
      analysis: null,
      history: [],
    });

    /*
      Restricting the search is a capability, not an assumption. An engine that
      does not honour `searchmoves` would silently return its own favourite
      move and the comparison would be a lie, so the restriction is dropped
      rather than sent — and the caller is told, through the capability, so it
      can label the result honestly.
    */
    const restricted =
      searchMoves?.length && session.capabilities.searchMoves ? { searchMoves } : {};

    runtime.handle = session.analyse({ fen, limit, ...restricted }, (snapshot) => {
      // Stragglers from a search the user has already moved past are dropped,
      // per slot: the two engines finish at different times by definition.
      if (runtime.request !== request) return;
      if (get()[slot].analysedFen !== snapshot.fen) return;
      const annotated = annotateAnalysis(snapshot);
      const next = (current: EngineSlot): EngineSlot => ({
        ...current,
        analysis: annotated,
        history: [...current.history, annotated].slice(-32),
        ...(snapshot.complete ? { running: false, status: 'ready' as const } : {}),
      });
      set((state) =>
        slot === 'primary'
          ? { primary: next(state.primary) }
          : { secondary: next(state.secondary) },
      );
    });
  };

  const teardown = (slot: SlotId) => {
    const runtime = runtimes[slot];
    // Anything still starting is now obsolete; without this a `run` awaiting a
    // session would resume after the teardown and revive a dead slot.
    runtime.request += 1;
    runtime.handle?.stop();
    runtime.handle = null;
    runtime.session?.dispose();
    runtime.session = null;
    runtime.engineId = null;
    patch(slot, { ...EMPTY_SLOT(get()[slot].engineId) });
  };

  return {
    primary: EMPTY_SLOT(DEFAULT_ENGINE_ID),
    secondary: EMPTY_SLOT('lc0'),
    comparing: false,
    pinned: [],

    selectEngine: async (slot, engineId) => {
      if (get()[slot].engineId === engineId) return;
      teardown(slot);
      patch(slot, { ...EMPTY_SLOT(engineId) });
    },

    prepare: async (slot, config) => (await startSession(slot, config)) !== null,

    analyse: async (slot, fen, limit, config, searchMoves) => {
      const engines = get().comparing ? 2 : 1;
      await run(
        slot,
        fen,
        limit,
        { ...config, threads: shareThreads(config.threads, engines) },
        searchMoves,
      );
    },

    compare: async (fen, limit, config) => {
      set({ comparing: true });
      const threads = shareThreads(config.threads, 2);
      // Started together rather than in sequence: the point is two readings of
      // the same position at the same time.
      await Promise.all([
        run('primary', fen, limit, { ...config, threads }),
        run('secondary', fen, limit, { ...config, threads }),
      ]);
    },

    setComparing: (on) => {
      set({ comparing: on });
      if (!on) teardown('secondary');
    },

    stop: (slot) => {
      const slots: SlotId[] = slot ? [slot] : ['primary', 'secondary'];
      for (const id of slots) {
        const runtime = runtimes[id];
        // Stopping also invalidates a request that has not started searching
        // yet, so "Stop" cannot be undone a moment later by a slow start.
        runtime.request += 1;
        runtime.handle?.stop();
        runtime.handle = null;
        runtime.session?.stop();
        patch(id, { running: false, status: runtime.session ? 'ready' : get()[id].status });
      }
    },

    shutdown: (slot) => {
      for (const id of slot ? [slot] : (['primary', 'secondary'] as SlotId[])) teardown(id);
    },

    applyConfig: async (slot, config) => {
      await runtimes[slot].session?.configure(config);
    },

    pin: (rank) => {
      const { primary, pinned } = get();
      const line = primary.analysis?.lines.find((candidate) => candidate.rank === rank);
      if (!primary.analysis || !line) return;

      const entry: PinnedLine = {
        id: `${primary.analysis.fen}|${line.moves.join('')}`,
        fen: primary.analysis.fen,
        score: line.score,
        depth: line.depth || primary.analysis.depth,
        moves: [...line.moves],
        san: [...(line.san ?? [])],
        engine: primary.identity?.name ?? engineDefinition(primary.engineId)?.name ?? 'Engine',
        pinnedAt: Date.now(),
      };

      // Pinning the same line again refreshes it to the deeper reading.
      const rest = pinned.filter((candidate) => candidate.id !== entry.id);
      set({ pinned: [entry, ...rest].slice(0, MAX_PINS) });
    },

    unpin: (id) => set((state) => ({ pinned: state.pinned.filter((line) => line.id !== id) })),

    clearPins: () => set({ pinned: [] }),
  };
});
