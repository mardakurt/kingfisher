'use client';

/**
 * The deep-analysis job: one at a time, in the background, on its own engine
 * session.
 *
 * It runs outside the engine panel's session, the way the analysis queue
 * does, so a person can keep reading the board while it works; it stops the
 * panel's own search when it starts, because two searches on one machine
 * halve each other. It names the position it started from so it is never
 * written anywhere else.
 *
 * Phase 85: it outlives the page. The run is saved after every position it
 * searches (`repositories.deepAnalysis`), and a page that opens and finds a
 * run still marked running picks it up from its checkpoint (`resumeDeepen`,
 * called from the app shell) — after a reload, a sleep that killed the
 * engine, or a quit. A Web Lock keeps two tabs from running one job twice. On
 * the Mac the window hides rather than closes while a run is going, so it
 * continues with the window closed (`src/desktop/bridge.ts`). A run that
 * finished while nobody was looking is announced once, the next time
 * Kingfisher opens.
 */

import { create } from 'zustand';

import type { Fen } from '@/chess/types';
import {
  deepen,
  type DeepenCheckpoint,
  type DeepenOptions,
  type DeepenResult,
  type DeepNode,
} from '@/engine/deepen';
import { engineDefinition, engineProviderById } from '@/engine/registry';
import type { EngineSession } from '@/engine/types';
import { setBackgroundWork } from '@/desktop/bridge';
import type { DeepAnalysisJobRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';
import { useEngine } from '@/stores/engine-store';

export interface DeepenJobOptions extends DeepenOptions {
  /** Time given to each position, in milliseconds. */
  readonly msPerPosition: number;
}

type Status = 'idle' | 'running' | 'done' | 'failed';

interface DeepenState {
  status: Status;
  /** The saved run this state shows. */
  jobId: string | null;
  startFen: Fen | null;
  options: DeepenJobOptions | null;
  engineId: string | null;
  engineName: string | null;
  searched: number;
  /** How many times this run was picked up again after the page running it went away. */
  resumed: number;
  /** The moves from the start to the position last searched. */
  current: readonly DeepNode[];
  result: DeepenResult | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Set when the run finished while no page was showing it, until it is looked at. */
  finishedUnseen: boolean;
  start(fen: Fen, engineId: string, options: DeepenJobOptions): Promise<void>;
  stop(): void;
  clear(): void;
}

let controller: AbortController | null = null;
let session: EngineSession | null = null;
/** Released when this page's run ends, so another tab may pick a saved one up. */
let releaseLock: (() => void) | null = null;

const LOCK = 'kingfisher-deep-analysis';

/** Hold the run's lock, or learn that another tab holds it. */
async function acquire(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.locks) return true;
  return new Promise<boolean>((resolve) => {
    void navigator.locks.request(LOCK, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>((release) => {
        releaseLock = release;
      });
    });
  });
}

function release(): void {
  releaseLock?.();
  releaseLock = null;
}

async function save(jobId: string | null, patch: Partial<DeepAnalysisJobRecord>): Promise<void> {
  if (!jobId) return;
  try {
    const repositories = await getRepositories();
    await repositories.deepAnalysis.update(jobId, patch);
  } catch {
    // A failed checkpoint costs at most the positions since the last one; the run goes on.
  }
}

export const useDeepen = create<DeepenState>((set, get) => ({
  status: 'idle',
  jobId: null,
  startFen: null,
  options: null,
  engineId: null,
  engineName: null,
  searched: 0,
  resumed: 0,
  current: [],
  result: null,
  error: null,
  startedAt: null,
  finishedAt: null,
  finishedUnseen: false,

  start: async (fen, engineId, options) => {
    if (get().status === 'running') return;
    if (!(await acquire())) {
      set({ status: 'failed', error: 'A deep analysis is already running in another tab.' });
      return;
    }
    const startedAt = Date.now();
    const engineName = engineDefinition(engineId)?.name ?? engineId;
    let jobId: string | null = null;
    try {
      const repositories = await getRepositories();
      const record = await repositories.deepAnalysis.create({
        startFen: fen,
        engineId,
        engineName,
        options,
        status: 'running',
        searched: 0,
        root: { fen, depthFromRoot: 0, children: [] },
        resumed: 0,
        startedAt,
      });
      jobId = record.id;
    } catch {
      // Without a saved record the run still works; it only cannot be resumed.
    }
    set({
      status: 'running',
      jobId,
      startFen: fen,
      options,
      engineId,
      engineName,
      searched: 0,
      resumed: 0,
      current: [],
      result: null,
      error: null,
      startedAt,
      finishedAt: null,
      finishedUnseen: false,
    });
    await run(jobId, fen, engineId, options);
  },

  stop: () => controller?.abort(),

  clear: () => {
    controller?.abort();
    const jobId = get().jobId;
    if (jobId) {
      void getRepositories()
        .then((repositories) => repositories.deepAnalysis.delete(jobId))
        .catch(() => undefined);
    }
    set({
      status: 'idle',
      jobId: null,
      startFen: null,
      options: null,
      engineId: null,
      searched: 0,
      resumed: 0,
      current: [],
      result: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      finishedUnseen: false,
    });
  },
}));

/**
 * The run itself, fresh or resumed. The checkpoint is written after every
 * position; the record's status is what a page opening later reads.
 */
async function run(
  jobId: string | null,
  fen: Fen,
  engineId: string,
  options: DeepenJobOptions,
  resume?: DeepenCheckpoint,
): Promise<void> {
  controller = new AbortController();
  const signal = controller.signal;
  // Two searches on one machine halve each other; the panel's goes first.
  useEngine.getState().stop('primary');
  setBackgroundWork(true, 'Deep analysis');
  let last: DeepenCheckpoint | null = resume ?? null;
  try {
    const provider = engineProviderById(engineId);
    if (!provider) throw new Error(`Unknown engine: ${engineId}`);
    const availability = await provider.checkAvailability();
    if (!availability.available) {
      throw new Error(availability.reason ?? 'The selected engine is unavailable.');
    }
    session = await provider.create({ multiPv: options.breadth, threads: 1, hashMb: 64 });
    useDeepen.setState({ engineName: session.identity.name || useDeepen.getState().engineName });
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
      (searched, path) => useDeepen.setState({ searched, current: path }),
      resume,
      (checkpoint) => {
        last = checkpoint;
        void save(jobId, {
          root: JSON.parse(JSON.stringify(checkpoint.root)),
          searched: checkpoint.searched,
        });
      },
    );
    const finishedAt = Date.now();
    useDeepen.setState({
      status: 'done',
      result,
      finishedAt,
      current: [],
      searched: result.searched,
    });
    await save(jobId, {
      status: result.stopped ? 'stopped' : 'done',
      root: JSON.parse(JSON.stringify(result.root)),
      searched: result.searched,
      finishedAt,
      // Shown now, on the page that ran it.
      seenAt: finishedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = Date.now();
    useDeepen.setState({ status: 'failed', error: message, finishedAt, current: [] });
    await save(jobId, {
      status: 'failed',
      error: message,
      finishedAt,
      ...(last ? { root: JSON.parse(JSON.stringify(last.root)), searched: last.searched } : {}),
    });
  } finally {
    session?.dispose();
    session = null;
    controller = null;
    setBackgroundWork(false);
    release();
  }
}

/** The saved tree as `deepen` builds it; the record's validator has checked its shape. */
const rootOf = (record: DeepAnalysisJobRecord): DeepNode => record.root as DeepNode;

/**
 * Called once when a page opens: pick up a saved run that is still marked
 * running, or show the report of one that finished while nobody was looking.
 * Returns what it did, for the notice the shell shows.
 */
export async function resumeDeepen(): Promise<'resumed' | 'finished-unseen' | 'nothing'> {
  const state = useDeepen.getState();
  if (state.status !== 'idle') return 'nothing';
  let record: DeepAnalysisJobRecord | null;
  try {
    record = await (await getRepositories()).deepAnalysis.latest();
  } catch {
    return 'nothing';
  }
  if (!record) return 'nothing';
  const common = {
    jobId: record.id,
    startFen: record.startFen as Fen,
    options: record.options,
    engineId: record.engineId,
    engineName: record.engineName,
    searched: record.searched,
    resumed: record.resumed,
    startedAt: record.startedAt,
  };

  if (record.status === 'running') {
    // Another tab may be running it; only the holder of the lock resumes it.
    if (!(await acquire())) return 'nothing';
    const resumed = record.resumed + 1;
    useDeepen.setState({
      ...common,
      resumed,
      status: 'running',
      current: [],
      result: null,
      error: null,
      finishedAt: null,
      finishedUnseen: false,
    });
    await save(record.id, { resumed });
    void run(record.id, record.startFen as Fen, record.engineId, record.options, {
      root: rootOf(record),
      searched: record.searched,
    });
    return 'resumed';
  }

  if (record.status === 'done' || record.status === 'stopped') {
    const unseen = record.seenAt === undefined;
    useDeepen.setState({
      ...common,
      status: 'done',
      current: [],
      result: {
        root: rootOf(record),
        searched: record.searched,
        stopped: record.status === 'stopped',
      },
      error: null,
      finishedAt: record.finishedAt ?? record.updatedAt,
      finishedUnseen: unseen,
    });
    if (unseen) await save(record.id, { seenAt: Date.now() });
    return unseen ? 'finished-unseen' : 'nothing';
  }
  return 'nothing';
}
