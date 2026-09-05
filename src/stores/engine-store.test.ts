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

const { useEngine } = await import('./engine-store');

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
