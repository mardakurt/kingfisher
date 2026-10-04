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
import { EMPTY_ANALYSIS, type AnalysisHandle, type EngineSession } from '@/engine/types';

const create = vi.fn();
const availability = vi.fn(async () => ({ available: true }));

vi.mock('@/engine/registry', () => ({
  DEFAULT_ENGINE_ID: 'test-engine',
  engineDefinition: () => ({ id: 'test-engine', name: 'Test engine' }),
  engineProviderById: () => ({
    checkAvailability: () => availability(),
    create: (config: unknown) => create(config),
  }),
}));

const { useEngine, shareResources } = await import('./engine-store');

describe('engine startup and cancellation failures', () => {
  const config = { multiPv: 1, threads: 1, hashMb: 16 };
  const other = START_FEN.replace(' w ', ' b ') as typeof START_FEN;

  beforeEach(() => {
    useEngine.getState().shutdown();
    useEngine.getState().setFollowBoard(true);
    create.mockReset();
    availability.mockReset().mockResolvedValue({ available: true });
  });

  it('allows retry after an unavailable provider becomes available', async () => {
    availability.mockResolvedValueOnce({ available: false });
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    expect(useEngine.getState().primary.status).toBe('unavailable');
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    expect(session.analyse).toHaveBeenCalledTimes(1);
  });

  it('reports an availability exception and permits a fresh retry', async () => {
    availability.mockRejectedValueOnce(new Error('Availability transport failed'));
    await expect(
      useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config),
    ).resolves.toBeUndefined();
    expect(useEngine.getState().primary).toMatchObject({
      status: 'error',
      running: false,
      problem: { message: 'Availability transport failed' },
    });
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    expect(session.analyse).toHaveBeenCalledTimes(1);
  });

  it('Stop during startup remains stopped after a board move', async () => {
    let release!: (session: EngineSession) => void;
    create.mockImplementationOnce(
      () =>
        new Promise<EngineSession>((resolve) => {
          release = resolve;
        }),
    );
    const started = useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, config);
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    expect(useEngine.getState().primary.running).toBe(true);
    useEngine.getState().stop('primary');
    expect(useEngine.getState().primary.status).toBe('idle');
    useEngine.getState().invalidatePosition(other);
    const { session } = failingSession(new Error('unused'));
    release(session);
    await started;
    await Promise.resolve();
    expect(session.analyse).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(useEngine.getState().primary.running).toBe(false);
  });

  it.each(['configure', 'analyse'] as const)(
    'a failure in %s disposes the failed session and allows retry',
    async (method) => {
      const { session } = failingSession(new Error('unused'));
      if (method === 'configure')
        vi.mocked(session.configure).mockRejectedValueOnce(new Error('Engine disconnected'));
      else
        vi.mocked(session.analyse).mockImplementationOnce(() => {
          throw new Error('Engine disconnected');
        });
      create.mockResolvedValueOnce(session);
      await expect(
        useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config),
      ).resolves.toBeUndefined();
      expect(useEngine.getState().primary).toMatchObject({
        status: 'error',
        running: false,
        analysedFen: null,
      });
      expect(session.dispose).toHaveBeenCalledTimes(1);
      const { session: recovered } = failingSession(new Error('unused'));
      create.mockResolvedValueOnce(recovered);
      await useEngine.getState().analyse('primary', other, { kind: 'infinite' }, config);
      expect(recovered.analyse).toHaveBeenCalledTimes(1);
    },
  );

  it('a superseded configuration cannot clear the newest pending position', async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const { session } = failingSession(new Error('unused'));
    vi.mocked(session.configure)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseSecond = resolve;
          }),
      );
    create.mockResolvedValue(session);
    const first = useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    await vi.waitFor(() => expect(session.configure).toHaveBeenCalledTimes(1));
    const second = useEngine.getState().analyse('primary', other, { kind: 'infinite' }, config);
    await vi.waitFor(() => expect(session.configure).toHaveBeenCalledTimes(2));
    releaseFirst();
    await first;
    useEngine.getState().invalidatePosition(other);
    releaseSecond();
    await second;
    expect(session.analyse).toHaveBeenCalledTimes(1);
    expect(vi.mocked(session.analyse).mock.calls[0]![0].fen).toBe(other);
  });

  it('returning to the old position cancels a pending search for a different position', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    let release!: () => void;
    vi.mocked(session.configure).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const next = useEngine.getState().analyse('primary', other, { kind: 'infinite' }, config);
    await vi.waitFor(() => expect(session.configure).toHaveBeenCalledTimes(2));
    useEngine.getState().invalidatePosition(START_FEN);
    release();
    await next;
    await vi.waitFor(() => expect(session.analyse).toHaveBeenCalledTimes(2));
    expect(vi.mocked(session.analyse).mock.calls.map(([request]) => request.fen)).toEqual([
      START_FEN,
      START_FEN,
    ]);
  });

  it('starting on another position cannot relabel retained evidence with the new FEN', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    const listener = vi.mocked(session.analyse).mock.calls[0]![1];
    listener({ ...EMPTY_ANALYSIS(START_FEN), depth: 12 });
    expect(useEngine.getState().primary.analysis?.depth).toBe(12);
    await useEngine.getState().analyse('primary', other, { kind: 'infinite' }, config);
    expect(useEngine.getState().primary.analysedFen).toBe(other);
    expect(useEngine.getState().primary.analysis).toBeNull();
    expect(useEngine.getState().primary.history).toEqual([]);
  });
});

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
    expect(session.dispose).toHaveBeenCalledTimes(1);
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

describe('switching engines while one is still starting', () => {
  /*
    Lc0 loads its weights before it answers `uci`, which is seconds. A user
    who selects it and then changes their mind to Stockfish in that window
    used to get Lc0's session installed under Stockfish's name: the next
    request found `starting` set and adopted whatever it produced.
  */
  beforeEach(() => {
    useEngine.getState().shutdown();
    create.mockReset();
  });

  it('discards the late session and starts the engine the slot now names', async () => {
    let releaseSlow!: (session: EngineSession) => void;
    const slow = new Promise<EngineSession>((resolve) => {
      releaseSlow = resolve;
    });
    const slowSession = failingSession(new Error('unused')).session;
    const fastSession = failingSession(new Error('unused')).session;
    (fastSession as { identity: { name: string } }).identity = { name: 'Fast engine' };
    create.mockImplementationOnce(() => slow).mockImplementationOnce(async () => fastSession);

    const config = { multiPv: 1, threads: 1, hashMb: 16 };
    // Slow engine chosen and started; it has not answered yet.
    await useEngine.getState().selectEngine('primary', 'slow-engine');
    const first = useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useEngine.getState().primary.status).toBe('loading');

    // The user changes their mind before the slow engine is up.
    await useEngine.getState().selectEngine('primary', 'fast-engine');
    const second = useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Now the slow one finally answers.
    releaseSlow(slowSession);
    await Promise.all([first, second]);

    const slot = useEngine.getState().primary;
    expect(slot.engineId).toBe('fast-engine');
    expect(slot.identity?.name).toBe('Fast engine');
    expect(slowSession.dispose).toHaveBeenCalled();
    expect(slowSession.analyse).not.toHaveBeenCalled();
    expect(fastSession.analyse).toHaveBeenCalled();
  });
});

describe('sharing a machine between engines', () => {
  it('records the shared configuration accepted by each live slot', async () => {
    useEngine.getState().shutdown();
    useEngine.getState().setComparing(false);
    const first = failingSession(new Error('unused')).session;
    const second = failingSession(new Error('unused')).session;
    create.mockReset().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await useEngine
      .getState()
      .compare(START_FEN, { kind: 'infinite' }, { threads: 8, hashMb: 1024, multiPv: 2 });
    for (const slot of ['primary', 'secondary'] as const) {
      expect(useEngine.getState()[slot].configuration).toEqual({
        threads: 4,
        hashMb: 512,
        multiPv: 2,
      });
    }
    expect(first.configure).toHaveBeenCalledWith({ threads: 4, hashMb: 512, multiPv: 2 });
    expect(second.configure).toHaveBeenCalledWith({ threads: 4, hashMb: 512, multiPv: 2 });
    useEngine.getState().shutdown();
    useEngine.getState().setComparing(false);
  });

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
    expect(useEngine.getState().primary.analysedFen).toBeNull();
    expect(useEngine.getState().primary.analysis).toBeNull();
    /*
      Phase 72: the engine was on and follows the board, so a search for the
      new position is pending from this very moment and the slot says so.
      It used to say `running: false` until the asynchronous restart reached
      its own patch — a frame in which the evaluation bar read "engine off"
      on every move.
    */
    expect(useEngine.getState().primary.running).toBe(true);
    expect(useEngine.getState().primary.status).toBe('analysing');
    await vi.waitFor(() => expect(session.analyse).toHaveBeenCalledTimes(2));
    expect(useEngine.getState().primary.analysedFen).toBe(other);
  });

  it('leaves a stopped engine stopped when the board changes', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, { multiPv: 1, threads: 1, hashMb: 16 });
    useEngine.getState().stop('primary');
    const other = START_FEN.replace(' w ', ' b ') as typeof START_FEN;
    useEngine.getState().invalidatePosition(other);
    expect(useEngine.getState().primary.running).toBe(false);
    expect(session.analyse).toHaveBeenCalledTimes(1);
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
    const other = START_FEN.replace(' w ', ' b ') as typeof START_FEN;
    useEngine.getState().invalidatePosition(other);
    resolve(session);
    await started;
    // The pending search was switched on by the user, so it follows the board:
    // the one search that runs is on the position the board moved to, and the
    // old position is never searched.
    const searched = (session.analyse as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => (call[0] as { fen: string }).fen,
    );
    expect(searched).not.toContain(START_FEN);
    expect(searched).toEqual([other]);
  });

  it('with following off, a delayed engine start does not revive the old position', async () => {
    const { session } = failingSession(new Error('unused'));
    let resolve!: (value: EngineSession) => void;
    create.mockImplementation(
      () =>
        new Promise<EngineSession>((r) => {
          resolve = r;
        }),
    );
    useEngine.getState().setFollowBoard(false);
    const started = useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, { multiPv: 1, threads: 1, hashMb: 16 });
    await Promise.resolve();
    useEngine.getState().invalidatePosition(START_FEN.replace(' w ', ' b ') as typeof START_FEN);
    resolve(session);
    await started;
    expect(session.analyse).not.toHaveBeenCalled();
    expect(useEngine.getState().primary.running).toBe(false);
    useEngine.getState().setFollowBoard(true);
  });
});

/**
 * A running engine follows the board.
 *
 * Every published interface does this and Kingfisher did not: a move on the
 * board stopped the search and blanked the bar, and the owner read the bar as
 * unreliable. The rules: the same limit and settings carry over; a search
 * restricted to root moves does not follow; the second engine follows only
 * while a comparison is on; and a concealing workspace can switch following
 * off, which also has to hold for a search that was still starting.
 */
describe('a running engine follows the board', () => {
  const other = START_FEN.replace(' w ', ' b ') as typeof START_FEN;
  const config = { multiPv: 2, threads: 1, hashMb: 16 };

  beforeEach(() => {
    useEngine.getState().shutdown();
    useEngine.getState().setFollowBoard(true);
    useEngine.getState().setComparing(false);
    create.mockReset();
  });

  it('restarts the search on the new position with the same limit and settings', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'depth', depth: 20 }, config);
    useEngine.getState().invalidatePosition(other);
    await vi.waitFor(() => expect(session.analyse).toHaveBeenCalledTimes(2));
    const second = (session.analyse as ReturnType<typeof vi.fn>).mock.calls[1]![0] as {
      fen: string;
      limit: unknown;
    };
    expect(second.fen).toBe(other);
    expect(second.limit).toEqual({ kind: 'depth', depth: 20 });
    expect(useEngine.getState().primary.analysedFen).toBe(other);
    expect(useEngine.getState().primary.running).toBe(true);
  });

  it('does not follow when the engine was not running', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    useEngine.getState().stop('primary');
    useEngine.getState().invalidatePosition(other);
    await Promise.resolve();
    expect(session.analyse).toHaveBeenCalledTimes(1);
    expect(useEngine.getState().primary.running).toBe(false);
  });

  it('does not carry a root-move-restricted search to the next position', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, config, ['e2e4' as never]);
    useEngine.getState().invalidatePosition(other);
    await Promise.resolve();
    expect(session.analyse).toHaveBeenCalledTimes(1);
    expect(useEngine.getState().primary.running).toBe(false);
  });

  it('stays stopped while a concealing workspace has switched following off', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    useEngine.getState().setFollowBoard(false);
    useEngine.getState().invalidatePosition(other);
    await Promise.resolve();
    expect(session.analyse).toHaveBeenCalledTimes(1);
    expect(useEngine.getState().primary.running).toBe(false);
    expect(useEngine.getState().primary.analysedFen).toBeNull();
  });

  it('the second engine follows only while a comparison is on', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine.getState().analyse('secondary', START_FEN, { kind: 'infinite' }, config);
    useEngine.getState().invalidatePosition(other);
    await Promise.resolve();
    expect(session.analyse).toHaveBeenCalledTimes(1);
    expect(useEngine.getState().secondary.running).toBe(false);

    useEngine.getState().shutdown('secondary');
    useEngine.getState().setComparing(true);
    const { session: paired } = failingSession(new Error('unused'));
    create.mockResolvedValue(paired);
    await useEngine.getState().analyse('secondary', other, { kind: 'infinite' }, config);
    useEngine.getState().invalidatePosition(START_FEN);
    await vi.waitFor(() => expect(paired.analyse).toHaveBeenCalledTimes(2));
    expect(useEngine.getState().secondary.analysedFen).toBe(START_FEN);
  });
});

describe('late engine snapshots', () => {
  beforeEach(() => {
    useEngine.getState().shutdown();
    create.mockReset();
  });

  it('rejects old callbacks even after the board returns to the same FEN', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    const config = { multiPv: 1, threads: 1, hashMb: 16 };
    const other = START_FEN.replace(' w ', ' b ') as typeof START_FEN;
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    const first = vi.mocked(session.analyse).mock.calls[0]![1];
    await useEngine.getState().analyse('primary', other, { kind: 'infinite' }, config);
    const second = vi.mocked(session.analyse).mock.calls[1]![1];
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    const current = vi.mocked(session.analyse).mock.calls[2]![1];
    const snapshot = {
      ...EMPTY_ANALYSIS(START_FEN),
      depth: 20,
      lines: [{ rank: 1, depth: 20, moves: [], score: { kind: 'cp' as const, cp: 50 } }],
    };
    current(snapshot);
    expect(useEngine.getState().primary.analysis?.depth).toBe(20);
    first({
      ...snapshot,
      depth: 2,
      complete: true,
      lines: [{ ...snapshot.lines[0]!, score: { kind: 'cp', cp: -300 } }],
    });
    second({ ...snapshot, fen: other, complete: true });
    const slot = useEngine.getState().primary;
    expect(slot.analysedFen).toBe(START_FEN);
    expect(slot.analysis?.depth).toBe(20);
    expect(slot.analysis?.lines[0]?.score).toEqual({ kind: 'cp', cp: 50 });
    expect(slot.running).toBe(true);
    expect(slot.history).toHaveLength(1);
  });
});

describe('live engine preference changes', () => {
  const config = { multiPv: 1, threads: 1, hashMb: 16 };
  beforeEach(() => {
    useEngine.getState().shutdown();
    useEngine.getState().setComparing(false);
    create.mockReset();
  });

  it('updates a running search but does not restart a stopped one', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine.getState().analyse('primary', START_FEN, { kind: 'infinite' }, config);
    useEngine
      .getState()
      .reconfigureRunning({ kind: 'depth', depth: 18 }, { ...config, multiPv: 5 });
    await vi.waitFor(() => expect(session.analyse).toHaveBeenCalledTimes(2));
    expect(useEngine.getState().primary.configuration?.multiPv).toBe(5);
    expect(vi.mocked(session.analyse).mock.calls[1]![0].limit).toEqual({
      kind: 'depth',
      depth: 18,
    });
    useEngine.getState().stop('primary');
    useEngine.getState().reconfigureRunning({ kind: 'infinite' }, config);
    await Promise.resolve();
    expect(session.analyse).toHaveBeenCalledTimes(2);
    expect(useEngine.getState().primary.running).toBe(false);
  });

  it('uses the newest configuration when preferences change during startup', async () => {
    let release!: (value: EngineSession) => void;
    create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, config);
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    useEngine
      .getState()
      .reconfigureRunning({ kind: 'infinite' }, { multiPv: 5, threads: 2, hashMb: 32 });
    const { session } = failingSession(new Error('unused'));
    release(session);
    await pending;
    await vi.waitFor(() => expect(session.analyse).toHaveBeenCalledTimes(1));
    expect(useEngine.getState().primary.configuration).toEqual({
      multiPv: 5,
      threads: 2,
      hashMb: 32,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not turn a restricted candidate search into an unrestricted search', async () => {
    const { session } = failingSession(new Error('unused'));
    create.mockResolvedValue(session);
    await useEngine
      .getState()
      .analyse('primary', START_FEN, { kind: 'infinite' }, config, ['e2e4' as never]);
    useEngine.getState().reconfigureRunning({ kind: 'infinite' }, { ...config, multiPv: 5 });
    await Promise.resolve();
    expect(session.analyse).toHaveBeenCalledTimes(1);
  });
});
