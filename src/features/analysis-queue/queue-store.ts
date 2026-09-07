'use client';

import { create } from 'zustand';

import { positionKey } from '@/chess/fen';
import { mainlinePath } from '@/chess/tree/tree';
import { engineDefinition, engineProviderById } from '@/engine/registry';
import type { AnalysisHandle, EngineSession } from '@/engine/types';
import type {
  AnalysisQueueJobRecord,
  AnalysisQueuePreset,
  AnalysisQueueSides,
  AnalysisQueueStrategy,
  StoredEngineEvidenceRecord,
} from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import type { GameRecord } from '@/persistence/types';

export interface QueueConfiguration {
  readonly engineId: string;
  readonly preset: AnalysisQueuePreset;
  readonly multiPv: number;
  readonly strategy: AnalysisQueueStrategy;
  readonly startPly: number;
  /** Whose moves to evaluate. Defaults to both. */
  readonly sides?: AnalysisQueueSides;
  readonly customTimeMs?: number;
}

interface QueueState {
  jobs: readonly AnalysisQueueJobRecord[];
  loading: boolean;
  running: boolean;
  foregroundPriority: boolean;
  currentJobId: string | null;
  error: string | null;
  refresh(): Promise<void>;
  enqueue(gameIds: readonly string[], configuration: QueueConfiguration): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  cancel(id: string): Promise<void>;
  retryFailed(): Promise<void>;
  setForegroundActive(active: boolean): void;
}

const ownerId = `queue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let generation = 0;
let intentRunning = false;
let foregroundActive = false;
let currentJob: AnalysisQueueJobRecord | null = null;
let currentSession: EngineSession | null = null;
let currentHandle: AnalysisHandle | null = null;
let loop: Promise<void> | null = null;
/*
  A one-shot signal the loop races against the engine's own answer.

  `AnalysisHandle.finished` is guaranteed to settle, but not promptly: tearing
  a session down while its search is still queued leaves the session waiting up
  to ten seconds for a `bestmove` that will never arrive. Pausing has to be
  immediate — the user asked for the engine back — so the loop stops waiting as
  soon as it is interrupted and lets the abandoned promise settle on its own.
*/
let abortSignal: Promise<void> = Promise.resolve();
let abortNow: (() => void) | null = null;
const armAbort = () => {
  abortSignal = new Promise<void>((resolve) => {
    abortNow = resolve;
  });
};

const limitFor = (configuration: QueueConfiguration) => {
  if (configuration.preset === 'quick') return { kind: 'movetime' as const, ms: 250 };
  if (configuration.preset === 'standard') return { kind: 'movetime' as const, ms: 1_000 };
  if (configuration.preset === 'deep') return { kind: 'movetime' as const, ms: 5_000 };
  return {
    kind: 'movetime' as const,
    ms: Math.max(100, Math.min(60_000, configuration.customTimeMs ?? 2_000)),
  };
};

const sideToMoveOf = (fen: string): 'w' | 'b' => (fen.split(/\s+/)[1] === 'b' ? 'b' : 'w');

/**
 * The positions a job evaluates.
 *
 * `sides` narrows to one player's decisions, and it cannot simply drop the
 * other player's positions: judging a move needs the evaluation *before* it
 * and *after* it, so keeping only White's positions would leave every swing
 * with nothing to compare against. What it keeps is the position each of that
 * side's moves was played from, and the position it led to.
 *
 * **Which is why narrowing here saves nothing, and it is worth stating.** A
 * side moves at every other ply, so the union of "before and after each of
 * White's moves" is every position in the game; the only one ever dropped is a
 * final position no move was played from. Measured across game lengths, the
 * saving is at most **one position**, whatever the game — not the half the
 * option was introduced believing. It is arithmetic and not a bug to fix.
 *
 * So the narrowing that matters is not here. The pass evaluates the whole
 * game, because it must, and `suggestReviewCandidates` uses `sides` to decide
 * whose decisions the review offers. This function keeps applying it only so
 * that a job's stored position count stays consistent with the job.
 */
export const positionsFor = (
  game: GameRecord,
  job: Pick<AnalysisQueueJobRecord, 'strategy' | 'startPly' | 'sides'>,
) => {
  const path = mainlinePath(game.tree);
  const nodes = path
    .map((id) => game.tree.nodes[id])
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
  const side = job.sides ?? 'both';

  const wanted = new Set<string>();
  /*
    `index + 1 < nodes.length` because a position with no successor is one no
    move was played from, and there is nothing there to judge. Without it the
    final position joins the set whenever the game ends on the other side's
    move — an evaluation paid for and never read.
  */
  for (let index = 0; index + 1 < nodes.length; index += 1) {
    const node = nodes[index];
    const after = nodes[index + 1];
    if (!node || !after) continue;
    if (side !== 'both' && sideToMoveOf(node.fen) !== side) continue;
    // The position the move was played from, and the one it produced.
    wanted.add(node.id);
    wanted.add(after.id);
  }

  return nodes
    .slice(1)
    .filter((node) => side === 'both' || wanted.has(node.id))
    .filter((node) => job.strategy === 'every-move' || node.ply >= job.startPly);
};

export const useAnalysisQueue = create<QueueState>((set, get) => {
  const refresh = async () => {
    set({ loading: true });
    try {
      const jobs = await (await getRepositories()).analysisQueue.list();
      set({ jobs, loading: false, error: null });
    } catch (error) {
      set({ loading: false, error: describe(error) });
    }
  };

  /**
   * Stop the engine now, and let the loop record what happened.
   *
   * An earlier version wrote the job's status here, which is exactly where the
   * bug was: the interruption can land while `claimNext` is still in flight,
   * so `currentJob` is null, nothing is written — and a job that the database
   * already marked `running` is stranded, invisible to `claimNext` and unable
   * to resume. The loop's own `finally` always runs for a claimed job, so it
   * is the only honest place to release a claim.
   */
  const interruptEngine = () => {
    generation += 1;
    abortNow?.();
    currentHandle?.stop();
    currentHandle = null;
    currentSession?.dispose();
    currentSession = null;
  };

  /** Wait for the loop to finish unwinding, so statuses are settled before a read. */
  const settle = async () => {
    const pending = loop;
    if (pending) await pending.catch(() => undefined);
  };

  const ensureLoop = async () => {
    if (loop) return loop;
    loop = (async () => {
      const myGeneration = generation;
      armAbort();
      set({ running: true, error: null });
      try {
        while (intentRunning && !foregroundActive && generation === myGeneration) {
          const repositories = await getRepositories();
          const job = await repositories.analysisQueue.claimNext(ownerId);
          /*
            Nothing left to claim is not an interruption: it is the end of the
            work the user asked for. Clearing the intent here is what stops the
            unwind hook below from immediately re-entering an empty loop, which
            would spin on IndexedDB forever after the last job completed.
          */
          if (!job) {
            intentRunning = false;
            break;
          }
          currentJob = job;
          set({ currentJobId: job.id });
          await refresh();

          /*
            What the loop wrote about this job before it leaves the iteration.
            While this is null the claim is still outstanding, and the `finally`
            below is responsible for releasing it — which is what keeps a job
            from being stranded as `running` with nobody running it.
          */
          let recorded: 'completed' | 'failed' | null = null;
          try {
            const game = await repositories.games.get(job.gameId);
            if (!game) throw new Error('The source game was deleted.');
            const positions = positionsFor(game, job);
            const provider = engineProviderById(job.engineId);
            if (!provider) throw new Error(`Unknown engine: ${job.engineId}`);
            const availability = await provider.checkAvailability();
            if (!availability.available) {
              throw new Error(availability.reason ?? 'The selected engine is unavailable.');
            }
            const config = { multiPv: job.multiPv, threads: 1, hashMb: 64 };
            currentSession = await provider.create(config);

            for (let index = job.nextIndex; index < positions.length; index += 1) {
              if (!intentRunning || foregroundActive || generation !== myGeneration) return;
              const node = positions[index]!;
              await repositories.analysisQueue.update(job.id, {
                heartbeatAt: Date.now(),
                ownerId,
              });
              currentHandle = currentSession.analyse(
                { fen: node.fen, limit: job.limit },
                () => undefined,
              );
              const raced = await Promise.race([
                currentHandle.finished.then((value) => ({ finished: value })),
                abortSignal.then(() => ({ finished: null })),
              ]);
              currentHandle = null;
              if (!raced.finished) return;
              if (!intentRunning || foregroundActive || generation !== myGeneration) return;
              const result = raced.finished;
              const line = result.lines[0];
              if (!line) throw new Error('The engine finished without a principal variation.');
              const evidence: StoredEngineEvidenceRecord = {
                id: `${job.id}|${node.id}`,
                jobId: job.id,
                gameId: job.gameId,
                nodeId: node.id,
                positionKey: positionKey(node.fen),
                fen: node.fen,
                engineId: job.engineId,
                engineName:
                  currentSession.identity.name ??
                  engineDefinition(job.engineId)?.name ??
                  job.engineId,
                score: line.score,
                depth: line.depth || result.depth,
                nodes: result.nodes,
                timeMs: result.timeMs,
                pv: line.moves,
                /*
                  Every line the search produced, not just the first. A
                  MultiPV 5 pass computed five and kept one, which threw away
                  four fifths of what the user paid for and left "was the move
                  I played even among the engine's candidates" unanswerable
                  from stored evidence.
                */
                ...(result.lines.length > 1
                  ? {
                      alternatives: result.lines.slice(1).map((other) => ({
                        score: other.score,
                        pv: other.moves,
                      })),
                    }
                  : {}),
                analysedAt: Date.now(),
              };
              await repositories.analysisQueue.saveEvidence(evidence);
              await repositories.analysisQueue.update(job.id, {
                nextIndex: index + 1,
                totalPositions: positions.length,
                heartbeatAt: Date.now(),
              });
              await refresh();
            }
            currentSession.dispose();
            currentSession = null;
            recorded = 'completed';
            await repositories.analysisQueue.update(job.id, {
              status: 'completed',
              nextIndex: positions.length,
              totalPositions: positions.length,
              ownerId: undefined,
              heartbeatAt: undefined,
            });
          } catch (error) {
            // An interruption is not a failure: only a job this loop still
            // owns is allowed to be marked as one.
            if (generation === myGeneration) {
              recorded = 'failed';
              await repositories.analysisQueue
                .update(job.id, {
                  status: 'failed',
                  error: describe(error),
                  ownerId: undefined,
                  heartbeatAt: undefined,
                })
                .catch(() => undefined);
            }
          } finally {
            // Reached by completion, failure and by the priority returns inside
            // the position loop alike, so one background engine can never
            // outlive the iteration that created it, and a claimed job is never
            // left `running` with nobody running it.
            currentHandle?.stop();
            currentHandle = null;
            currentSession?.dispose();
            currentSession = null;
            if (!recorded) {
              await repositories.analysisQueue
                .update(job.id, {
                  status: intentRunning ? 'queued' : 'paused',
                  ownerId: undefined,
                  heartbeatAt: undefined,
                })
                .catch(() => undefined);
            }
            currentJob = null;
            set({ currentJobId: null });
            await refresh();
          }
        }
      } finally {
        loop = null;
        set({ running: false, currentJobId: null });
      }
    })();
    return loop;
  };

  return {
    jobs: [],
    loading: true,
    running: false,
    foregroundPriority: false,
    currentJobId: null,
    error: null,
    refresh,
    enqueue: async (gameIds, configuration) => {
      const repositories = await getRepositories();
      for (const gameId of gameIds) {
        const game = await repositories.games.get(gameId);
        if (!game) continue;
        const totalPositions = positionsFor(game, {
          strategy: configuration.strategy,
          startPly: configuration.startPly,
          ...(configuration.sides ? { sides: configuration.sides } : {}),
        }).length;
        await repositories.analysisQueue.enqueue({
          gameId,
          gameLabel: `${game.white} – ${game.black}${game.date ? `, ${game.date}` : ''}`,
          engineId: configuration.engineId,
          preset: configuration.preset,
          multiPv: Math.max(1, Math.min(5, configuration.multiPv)),
          limit: limitFor(configuration),
          strategy: configuration.strategy,
          startPly: configuration.strategy === 'after-opening' ? configuration.startPly : 1,
          // Omitted rather than defaulted, so a job carries a side only when
          // one was chosen and an older job keeps meaning what it meant.
          ...(configuration.sides && configuration.sides !== 'both'
            ? { sides: configuration.sides }
            : {}),
          totalPositions,
        });
      }
      await refresh();
    },
    start: async () => {
      intentRunning = true;
      if (!foregroundActive) await ensureLoop();
    },
    pause: async () => {
      intentRunning = false;
      interruptEngine();
      // Waiting for the loop to unwind is what makes the pause honest: the
      // status the panel then reads is the one the loop actually wrote.
      await settle();
      await refresh();
    },
    resume: async () => {
      const repositories = await getRepositories();
      for (const job of get().jobs) {
        if (job.status === 'paused' || job.status === 'running') {
          await repositories.analysisQueue.update(job.id, {
            status: 'queued',
            ownerId: undefined,
            heartbeatAt: undefined,
          });
        }
      }
      await refresh();
      intentRunning = true;
      if (!foregroundActive) await ensureLoop();
    },
    cancel: async (id) => {
      const repositories = await getRepositories();
      if (currentJob?.id === id) {
        // Stop first, then write: the loop releases the claim as it unwinds,
        // and cancellation is the last word on this job either way.
        interruptEngine();
        await settle();
      }
      await repositories.analysisQueue
        .update(id, { status: 'cancelled', ownerId: undefined, heartbeatAt: undefined })
        .catch(() => undefined);
      await refresh();
      if (intentRunning && !foregroundActive) void ensureLoop();
    },
    retryFailed: async () => {
      const repositories = await getRepositories();
      for (const job of get().jobs) {
        if (job.status === 'failed') {
          await repositories.analysisQueue.update(job.id, { status: 'queued', error: undefined });
        }
      }
      await refresh();
    },
    setForegroundActive: (active) => {
      if (foregroundActive === active) return;
      foregroundActive = active;
      set({ foregroundPriority: active });
      if (active) {
        // Interactive analysis has priority unconditionally, including while a
        // claim is still being made — the loop releases whatever it holds.
        interruptEngine();
        void settle().then(refresh);
      } else if (intentRunning) {
        void settle().then(() => {
          if (intentRunning && !foregroundActive) void ensureLoop();
        });
      }
    },
  };
});

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : 'Background analysis failed.';
