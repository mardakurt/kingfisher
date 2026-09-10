/**
 * What the engine panel shows when the engine stops answering.
 *
 * A search can end without the listener ever hearing about it: the session
 * fails the search when its engine dies, and a dead engine emits no final
 * snapshot to carry the news. The store used to watch only the listener, so a
 * crash left the slot reading "analysing" indefinitely — the stuck spinner, in
 * the place a player is most likely to sit and wait for it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { START_FEN } from '@/chess/fen';
import type { AnalysisHandle, EngineSession } from '@/engine/types';

const create = vi.fn();

vi.mock('@/engine/registry', () => ({
  DEFAULT_ENGINE_ID: 'test-engine',
  engineDefinition: () => ({ id: 'test-engine', name: 'Test engine' }),
  engineProviderById: () => ({
    checkAvailability: async () => ({ available: true }),
    create: (config: unknown) => create(config),
  }),
}));

const { useEngine, shareResources } = await import('./engine-store');

/** A session whose one search never produces a snapshot and then fails. */
function failingSession(error: Error): { session: EngineSession; fail: () => void } {
  let reject!: (reason: unknown) => void;
  const finished = new Promise<never>((_resolve, rej) => {
    reject = rej;
  });
  const handle: AnalysisHandle = { stop: vi.fn(), finished };
  const session = {
    identity: { name: 'Test engine' },
    capabilities: { multiPv: true, searchMoves: true, threads: false, hash: true },
    configure: vi.fn(async () => undefined),
    analyse: vi.fn(() => handle),
    stop: vi.fn(),
    dispose: vi.fn(),
  } as unknown as EngineSession;
  return { session, fail: () => reject(error) };
}

describe('an engine that dies mid-search fails its own panel', () => {
  beforeEach(() => {
    useEngine.getState().shutdown();
    create.mockReset();
  });

  it('reports the failure instead of analysing for ever', async () => {
    const { session, fail } = failingSession(new Error('The engine process failed.'));
    create.mockResolvedValue(session);

    await useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, { multiPv: 1, threads: 1, hashMb: 16 });

    expect(useEngine.getState().primary.status).toBe('analysing');
    expect(useEngine.getState().primary.running).toBe(true);

    fail();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const slot = useEngine.getState().primary;
    expect(slot.running).toBe(false);
    expect(slot.status).toBe('error');
    expect(slot.problem?.message).toBe('The engine process failed.');
  });

  it('leaves the other engine slot alone', async () => {
    const { session, fail } = failingSession(new Error('gone'));
    create.mockResolvedValue(session);

    await useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, { multiPv: 1, threads: 1, hashMb: 16 });
    fail();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useEngine.getState().primary.status).toBe('error');
    // The failure belongs to the slot that had it. A second engine, and every
    // other surface in the workspace, is untouched.
    expect(useEngine.getState().secondary.status).toBe('idle');
    expect(useEngine.getState().secondary.problem).toBeNull();
  });
});

describe('sharing a machine between engines', () => {
  /*
    Threads were split and hash was not, so turning comparison on doubled the
    real memory the engines allocated without changing anything the user had
    set. Memory is the worse half to get wrong: too many threads is contention
    and a slower search, too much hash is the operating system swapping.
  */
  it('splits both threads and hash between two engines', () => {
    expect(shareResources({ threads: 8, hashMb: 4096, multiPv: 1 }, 2)).toEqual({
      threads: 4,
      hashMb: 2048,
      multiPv: 1,
    });
  });

  it('gives a single engine everything the user allowed', () => {
    // The setting is the user's statement about their own machine.
    expect(shareResources({ threads: 8, hashMb: 4096, multiPv: 1 }, 1)).toEqual({
      threads: 8,
      hashMb: 4096,
      multiPv: 1,
    });
  });

  it('never drops below one thread or a workable table', () => {
    // Two cores split four ways is half a thread, which is not a number an
    // engine accepts; 16 MB is Stockfish's own default.
    expect(shareResources({ threads: 2, hashMb: 32, multiPv: 1 }, 4)).toMatchObject({
      threads: 1,
      hashMb: 16,
    });
  });

  it('leaves every other setting alone', () => {
    // A resource split, not a rewrite of the configuration.
    expect(
      shareResources({ threads: 8, hashMb: 1024, multiPv: 5, syzygyPath: '/tb' }, 2),
    ).toMatchObject({ multiPv: 5, syzygyPath: '/tb' });
  });

  it('rounds down rather than up, so the total never exceeds the setting', () => {
    const engines = 3;
    const shared = shareResources({ threads: 8, hashMb: 1000, multiPv: 1 }, engines);
    expect(shared.threads * engines).toBeLessThanOrEqual(8);
    expect(shared.hashMb * engines).toBeLessThanOrEqual(1000);
  });
});

describe('position changes invalidate evidence and pending searches', () => {
  beforeEach(() => {
    useEngine.getState().shutdown();
    create.mockReset();
  });

  it('stops the old search and clears its evidence when the board changes', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, { multiPv: 1, threads: 1, hashMb: 16 });
    const other = START_FEN.replace(' w ', ' b ') as typeof START_FEN;
    useEngine.getState().invalidatePosition(other);
    expect(session.stop).toHaveBeenCalled();
    expect(useEngine.getState().primary.running).toBe(false);
    expect(useEngine.getState().primary.analysedFen).toBeNull();
    expect(useEngine.getState().primary.analysis).toBeNull();
  });

  it('keeps a pending search when the mounted workspace has the same position', async () => {
    const { session } = failingSession(new Error('unused'));
    let resolve!: (value: EngineSession) => void;
    create.mockImplementation(
      () =>
        new Promise<EngineSession>((r) => {
          resolve = r;
        }),
    );
    const started = useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, { multiPv: 1, threads: 1, hashMb: 16 });
    await Promise.resolve();
    useEngine.getState().invalidatePosition(START_FEN);
    resolve(session);
    await started;
    expect(session.analyse).toHaveBeenCalledTimes(1);
    expect(useEngine.getState().primary.running).toBe(true);
  });

  it('does not revive an old position after a delayed engine start', async () => {
    const { session } = failingSession(new Error('unused'));
    let resolve!: (value: EngineSession) => void;
    create.mockImplementation(
      () =>
        new Promise<EngineSession>((r) => {
          resolve = r;
        }),
    );
    const started = useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, { multiPv: 1, threads: 1, hashMb: 16 });
    await Promise.resolve();
    useEngine.getState().invalidatePosition(START_FEN.replace(' w ', ' b ') as typeof START_FEN);
    resolve(session);
    await started;
    expect(session.analyse).not.toHaveBeenCalled();
    expect(useEngine.getState().primary.running).toBe(false);
  });
});

describe('a snapshot from a search the user has already moved past is dropped (Phase 38 PART AS)', () => {
  beforeEach(() => {
    useEngine.getState().shutdown();
    create.mockReset();
  });

  it('a late snapshot for a stale position never lands on the live slot', async () => {
    /*
      The first search on a position is still going. The user has already
      moved to a second position, and that search is producing snapshots. The
      first search finally emits a snapshot. The slot must keep the second
      position's verdict, not the first one's late straggler.
    */
    const sessions: EngineSession[] = [];
    function recordingSession(): EngineSession {
      let listener: ((snapshot: unknown) => void) | null = null;
      const handle: AnalysisHandle = {
        stop: vi.fn(),
        finished: new Promise<never>(() => undefined),
      };
      const session: EngineSession = {
        identity: { name: 'Test engine' },
        capabilities: { multiPv: true, searchMoves: true, threads: false, hash: true },
        configure: vi.fn(async () => undefined),
        analyse: vi.fn((_req, l) => {
          listener = l as (snapshot: unknown) => void;
          return handle;
        }),
        stop: vi.fn(),
        dispose: vi.fn(),
      } as unknown as EngineSession;
      sessions.push(session);
      return Object.assign(session, {
        emit(snapshot: unknown) {
          listener?.(snapshot);
        },
      });
    }

    const first = recordingSession();
    const second = recordingSession();
    create.mockImplementation(async () => {
      const next = sessions[0] === undefined ? first : second;
      return next;
    });

    // Start the first search. It holds the session open without producing
    // a snapshot so the user can move to the next position.
    const firstRun = useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, { multiPv: 1, threads: 1, hashMb: 16 });
    await Promise.resolve();
    await Promise.resolve();

    // Move the board. The store is told the user is on a different FEN,
    // so the first session's late snapshot must be dropped.
    const other = START_FEN.replace(' w ', ' b ') as typeof START_FEN;
    useEngine.getState().invalidatePosition(other);
    // Start a new search for the new position.
    const secondRun = useEngine
      .getState()
      .analyse('primary', other, { kind: 'infinite' }, { multiPv: 1, threads: 1, hashMb: 16 });
    await Promise.resolve();
    await Promise.resolve();

    // The first search finally emits a snapshot. The slot must keep the
    // second search's verdict, not absorb this straggler.
    (first as unknown as { emit: (snapshot: unknown) => void }).emit({
      fen: START_FEN,
      depth: 10,
      seldepth: 12,
      nodes: 1000,
      nps: 0,
      timeMs: 0,
      lines: [{ moves: [], score: { kind: 'cp', value: 30 } }],
      complete: false,
    });

    // The second search produces a snapshot. That one lands.
    (second as unknown as { emit: (snapshot: unknown) => void }).emit({
      fen: other,
      depth: 6,
      seldepth: 8,
      nodes: 200,
      nps: 0,
      timeMs: 0,
      lines: [{ moves: [], score: { kind: 'cp', value: 12 } }],
      complete: false,
    });
    await Promise.resolve();

    const slot = useEngine.getState().primary;
    expect(slot.analysedFen).toBe(other);
    expect(slot.analysis?.fen).toBe(other);
    // The straggler from the first session must not be on the live slot.
    expect(slot.analysis?.lines[0]?.score).toEqual({ kind: 'cp', value: 12 });
    await firstRun.catch(() => undefined);
    await secondRun;
  });
});
