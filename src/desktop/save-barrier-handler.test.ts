/**
 * Tests for the renderer-side save barrier handler.
 *
 * The handler is the renderer's answer to a `kingfisher:save-barrier:request`
 * from the desktop main process. It must:
 *
 *   - return `{ ok: true }` when the write tracker reports no
 *     in-flight writes;
 *   - return `{ ok: false, reason: 'pending-writes' }` when the
 *     tracker times out with writes still open;
 *   - return `{ ok: false, reason: 'write-failed' }` when the
 *     tracker observed a write that rejected;
 *   - never throw.
 */

import { describe, expect, it } from 'vitest';

import { createMemoryRepositories } from '@/persistence/repositories';
import {
  getWriteTracker,
  resetWriteTrackerForTests,
  withWriteTracking,
} from '@/persistence/write-tracker';

import { handleSaveBarrierRequest } from './save-barrier-handler';

describe('save barrier handler', () => {
  it('returns ok:true when no writes are in flight', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const r = await handleSaveBarrierRequest('test-id', { tracker });
    expect(r.ok).toBe(true);
  });

  it('returns ok:false pending-writes when a write is still in flight after the budget', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    tracker.begin('test:stays-pending');
    const r = await handleSaveBarrierRequest('test-id', {
      tracker,
      budgetMs: 25,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('pending-writes');
    // Cleanup so the test process exits cleanly.
    tracker.begin('test:cleanup').release(true);
  });

  it('returns ok:false write-failed when an in-flight write rejected', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const mem = createMemoryRepositories();
    const wrapped = withWriteTracking(mem.raw, tracker);
    const failing = wrapped.transaction(['studies'], 'readwrite', async () => {
      await Promise.resolve();
      throw new Error('simulated');
    });
    const r = await handleSaveBarrierRequest('test-id', { tracker, budgetMs: 500 });
    await failing.catch(() => undefined);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('write-failed');
  });

  it('returns ok:true after a successful write completes', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const mem = createMemoryRepositories();
    const wrapped = withWriteTracking(mem.raw, tracker);
    await wrapped.put('studies', {
      id: 's',
      title: 't',
      revision: 1,
      createdAt: 0,
      updatedAt: 0,
    });
    const r = await handleSaveBarrierRequest('test-id', { tracker, budgetMs: 500 });
    expect(r.ok).toBe(true);
  });

  it('never throws — even if the tracker somehow rejects', async () => {
    // The handler wraps the body in a try/catch. A buggy tracker
    // implementation must not break the save barrier contract.
    const brokenTracker = {
      begin: () => ({ release: () => undefined }),
      inflight: () => 0,
      lastFailure: () => null,
      subscribe: () => () => undefined,
      flush: async () => {
        throw new Error('tracker failure');
      },
    };
    const r = await handleSaveBarrierRequest('test-id', {
      tracker: brokenTracker,
      budgetMs: 100,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('write-failed');
  });
});
