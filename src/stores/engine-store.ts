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
import { usePreferences } from '@/stores/preferences-store';

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

/** What to show a player whose engine stopped answering mid-search. */
const describeEngineFailure = (error: unknown): string =>
  error instanceof Error ? error.message : 'The engine stopped answering.';

interface Runtime {
  session: EngineSession | null;
  handle: AnalysisHandle | null;
  starting: Promise<EngineSession | null> | null;
  /**
   * Bumped by every teardown, and read by a start still in flight.
   *
   * A native engine can take seconds to answer `uci` — Lc0 loads its weights
   * first — and a user who changes their mind in that window selects a
   * different engine. The teardown that follows cannot cancel the start; it
   * can only make sure that, when the start finishes, the session it produced
   * is thrown away rather than installed under an engine id that is no longer
   * the slot's. Without this the next request found `starting` set and
   * adopted it, and the slot searched with one engine while naming another.
   */
  startToken: number;
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
  /**
   * The FEN the most recent request is for, set before the first await in
   * `run` and cleared once the search actually starts. The `analysedFen` on the
   * store only reflects a search that has begun, which leaves a request still
   * awaiting `startSession` indistinguishable from a slot that has nothing
   * pending. That gap is what this field closes: a board "leaving" the same
   * FEN the request is for should not kill the request, and a board "leaving"
   * a different FEN should.
   */
  pendingFen: Fen | null;
  /**
   * The limit and configuration of the last unrestricted search, so a running
   * engine can follow the board to the next position with the same settings.
   * A search restricted to root moves is a question about one position and is
   * not carried forward.
   */
  lastRequest: { readonly limit: AnalysisLimit; readonly config: EngineConfigInput } | null;
}

const runtimes: Record<SlotId, Runtime> = {
  primary: {
    session: null,
    handle: null,
    starting: null,
    startToken: 0,
    engineId: null,
    request: 0,
    pendingFen: null,
    lastRequest: null,
  },
  secondary: {
    session: null,
    handle: null,
    starting: null,
    startToken: 0,
    engineId: null,
    request: 0,
    pendingFen: null,
    lastRequest: null,
  },
};

interface EngineState {
  primary: EngineSlot;
  secondary: EngineSlot;
  /** Whether the second engine follows the board. */
  comparing: boolean;
  /**
   * Whether a running engine follows the board to the next position.
   *
   * On by default, because that is what an engine that has been switched on
   * does in every published chess interface: the search restarts on the
   * position the board moves to and stops when the user stops it. Before
   * Phase 52 a move on the board stopped the engine, the bar fell back to
   * "no evaluation" and the user had to start it again for every position —
   * which is what made the bar read as unreliable. Concealing workspaces
   * (Review before reveal, Training) turn this off while they are on screen,
   * because a search that follows the board there would be evidence gathered
   * behind the curtain.
   */
  followBoard: boolean;
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
  setFollowBoard(on: boolean): void;
  stop(slot?: SlotId): void;
  /** Invalidate searches and evidence that belong to a position the board left. */
  invalidatePosition(fen: Fen): void;
  shutdown(slot?: SlotId): void;
  applyConfig(slot: SlotId, config: EngineConfigInput): Promise<void>;
  pin(rank: number): void;
  unpin(id: string): void;
  clearPins(): void;
}

/**
 * Threads for one slot.
 *
 * Two engines on one machine must not each ask for every core, so they split
 * what the user allowed. A single engine gets all of it: the setting is the
 * user's statement about their own machine and nothing here second-guesses it.
 */
export function shareThreads(threads: number, engines: number): number {
  if (engines <= 1) return Math.max(1, threads);
  return Math.max(1, Math.floor(threads / engines));
}

/**
 * Hash for one slot.
 *
 * Threads were split and hash was not, so two engines each allocated the whole
 * transposition table the user had asked for — a 4 GB setting became 8 GB of
 * real memory the moment comparison was turned on.
 *
 * Memory is the more damaging of the two to get wrong. Too many threads is
 * contention, and the search is merely slower; too much hash is the operating
 * system swapping, which takes the interface down with it, and a transposition
 * table is allocated up front rather than grown into.
 *
 * The floor is 16 MB, which is Stockfish's own default and always workable.
 */
export function shareHash(hashMb: number, engines: number): number {
  if (engines <= 1) return Math.max(16, hashMb);
  return Math.max(16, Math.floor(hashMb / engines));
}

/** What one slot may use when `engines` of them are running together. */
export function shareResources<T extends { threads: number; hashMb: number }>(
  config: T,
  engines: number,
): T {
  return {
    ...config,
    threads: shareThreads(config.threads, engines),
    hashMb: shareHash(config.hashMb, engines),
  };
}

/** The preferred line length, clamped to what the panel can show. */
const lineLength = (): number => {
  const value = usePreferences.getState().engineLineLength;
  return Number.isFinite(value) ? Math.min(24, Math.max(4, Math.round(value))) : 12;
};

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

    const token = runtime.startToken;
    runtime.starting = (async () => {
      const availability = await provider.checkAvailability();
      // The slot was torn down (or re-pointed) while this was in flight: its
      // verdict is about an engine the slot no longer wants.
      if (runtime.startToken !== token) return null;
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
        if (runtime.startToken !== token) {
          created.dispose();
          return null;
        }
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
        if (runtime.startToken !== token) return null;
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
        if (runtime.startToken === token) runtime.starting = null;
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
    runtime.lastRequest = searchMoves ? null : { limit, config };
    // A still-starting request is identified by its FEN, not by `analysedFen`,
    // because `analysedFen` is only written once the search actually starts.
    // `invalidatePosition` needs that handle to decide whether a board "change"
    // to the same FEN is really a change.
    runtime.pendingFen = fen;

    const session = await startSession(slot, config);
    if (!session) {
      runtime.pendingFen = null;
      // A restart claimed by `invalidatePosition` that never got a session.
      if (get()[slot].running) patch(slot, { running: false });
      return;
    }
    if (runtime.request !== request) {
      runtime.pendingFen = null;
      return;
    }

    runtime.handle?.stop();
    runtime.handle = null;

    await session.configure(config);
    if (runtime.request !== request) {
      runtime.pendingFen = null;
      return;
    }

    patch(slot, {
      running: true,
      status: 'analysing',
      analysedFen: fen,
      /*
       * Phase 69: keep the previous analysis visible until the first `info`
       * line of the new search arrives. The previous code cleared `analysis`
       * here, which meant the engine panel's depth/eval readout disappeared
       * for the ~150 ms between the player making a move and the engine
       * emitting its depth-1 line. A player watching a live search saw the
       * indicator flash on every move; clearing `history` had the same
       * effect on the running-eval graph. Leaving both populated until the
       * listener writes a new frame is harmless: the listener stamps every
       * snapshot with the `analysedFen` it belongs to, and the panel reads
       * `analysedFen === fen` before trusting the score.
       */
    });
    runtime.pendingFen = null;

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
      // The preference is read per snapshot rather than captured at start,
      // so a change in Settings shortens the lines of the running search.
      const annotated = annotateAnalysis(snapshot, lineLength());
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

    /*
      A search can end without the listener ever hearing about it: the session
      fails the search when its engine dies, and a dead engine emits no final
      snapshot to carry the news. Watching only the listener therefore left the
      panel reading "analysing" for ever after a crash — the stuck spinner, in
      the place where a chess player is most likely to sit and wait for it.

      The engine slot fails; nothing else does. The board, the explorer and the
      rest of the workspace are unaffected, which is the point of the slot
      owning its own status.
    */
    runtime.handle.finished.catch((error: unknown) => {
      if (runtime.request !== request) return;
      patch(slot, {
        running: false,
        status: 'error',
        problem: { message: describeEngineFailure(error) },
      });
    });
  };

  const teardown = (slot: SlotId) => {
    const runtime = runtimes[slot];
    // Anything still starting is now obsolete; without this a `run` awaiting a
    // session would resume after the teardown and revive a dead slot.
    runtime.request += 1;
    runtime.startToken += 1;
    runtime.starting = null;
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
    followBoard: true,
    pinned: [],

    selectEngine: async (slot, engineId) => {
      if (get()[slot].engineId === engineId) return;
      teardown(slot);
      patch(slot, { ...EMPTY_SLOT(engineId) });
    },

    prepare: async (slot, config) => (await startSession(slot, config)) !== null,

    analyse: async (slot, fen, limit, config, searchMoves) => {
      const engines = get().comparing ? 2 : 1;
      await run(slot, fen, limit, shareResources(config, engines), searchMoves);
    },

    compare: async (fen, limit, config) => {
      set({ comparing: true });
      const shared = shareResources(config, 2);
      // Started together rather than in sequence: the point is two readings of
      // the same position at the same time.
      await Promise.all([run('primary', fen, limit, shared), run('secondary', fen, limit, shared)]);
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

    invalidatePosition: (fen) => {
      for (const slot of ['primary', 'secondary'] as const) {
        // A still-running analysis is a match by definition; a still-pending
        // request matches if the FEN the request is for equals the FEN the
        // board is now on — same FEN, leave the search alone, the user
        // navigated away and back rather than to a new position.
        if (get()[slot].analysedFen === fen) continue;
        if (runtimes[slot].pendingFen === fen) continue;
        // Whether the engine was switched on, read before stop() clears it.
        const wasRunning = get()[slot].running || runtimes[slot].pendingFen !== null;
        const last = runtimes[slot].lastRequest;
        // stop also invalidates a request waiting for engine startup/configuration.
        get().stop(slot);
        patch(slot, { analysedFen: null, analysis: null, history: [] });
        runtimes[slot].pendingFen = null;
        // The secondary engine follows only while a comparison is on; a
        // stopped comparison must not quietly keep a second engine running.
        const follows = slot === 'primary' || get().comparing;
        if (wasRunning && last && follows && get().followBoard) {
          /*
            The restart is a fact from this moment, not from the moment the
            asynchronous `run` reaches its own patch. `stop` above cleared
            `running`, and a reader that looked between here and the start of
            the new search — the evaluation bar, deciding whether a search is
            in flight — saw an engine that was off for a frame on every move.
            Claiming the search here closes that gap; `run` writes the same
            values again when it starts, and clears them if it cannot.
          */
          patch(slot, { running: true, status: 'analysing' });
          void run(slot, fen, last.limit, last.config);
        }
      }
    },

    setFollowBoard: (on) => {
      if (get().followBoard !== on) set({ followBoard: on });
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
