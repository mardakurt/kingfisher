/**
 * Tests for the write tracker.
 *
 * The save barrier before a desktop update refuses to install when
 * the renderer has any in-flight write. These tests pin the
 * tracker's contract: every begin/release pair is balanced, flush
 * reports the live state, and a release is idempotent.
 */

import { describe, expect, it } from 'vitest';

import { createMemoryRepositories } from './repositories';
import { getWriteTracker, resetWriteTrackerForTests, withWriteTracking } from './write-tracker';

describe('write tracker — unit', () => {
  it('reports zero in flight when nothing has begun', () => {
    resetWriteTrackerForTests();
    expect(getWriteTracker().inflight()).toBe(0);
  });

  it('begin/release pair balances inflight count', () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const a = tracker.begin('test:a');
    expect(tracker.inflight()).toBe(1);
    a.release(true);
    expect(tracker.inflight()).toBe(0);
  });

  it('release is idempotent', () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const a = tracker.begin('test:idempotent');
    a.release(true);
    a.release(true);
    a.release(false);
    expect(tracker.inflight()).toBe(0);
  });

  it('flush returns ok:true immediately when there are no in-flight writes', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const r = await tracker.flush(1_000);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.waited).toBe(0);
  });

  it('flush returns ok:true after all in-flight writes complete', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const a = tracker.begin('test:1');
    const b = tracker.begin('test:2');
    const flushPromise = tracker.flush(500);
    a.release(true);
    b.release(true);
    const r = await flushPromise;
    expect(r.ok).toBe(true);
  });

  it('flush returns ok:false pending-writes when the budget elapses', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    tracker.begin('test:stays-pending');
    const r = await tracker.flush(50);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('timeout');
    expect(r.inflight).toBeGreaterThan(0);
  });

  it('flush distinguishes a rejected slot from a still-pending one', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const a = tracker.begin('test:rejecting');
    const flushPromise = tracker.flush(500);
    // Yield to let flush() snapshot the slot.
    await Promise.resolve();
    a.release(false);
    const r = await flushPromise;
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('write-failed');
  });
});

describe('write tracker — wired through PersistenceDatabase', () => {
  it('withWriteTracking lets reads proceed without a slot', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const mem = createMemoryRepositories();
    const wrapped = withWriteTracking(mem.raw, tracker);
    // A read against a non-existent store is fine; we just want
    // the wrapper not to register a slot for it.
    await wrapped.count('studies');
    expect(tracker.inflight()).toBe(0);
  });

  it('withWriteTracking registers a slot for a readwrite transaction', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const mem = createMemoryRepositories();
    const wrapped = withWriteTracking(mem.raw, tracker);
    // Use the lower-level `transaction()` so the slot stays open
    // for the duration of the work; `put` resolves too quickly to
    // observe the open slot in a synchronous assertion.
    const p = wrapped.transaction(['studies'], 'readwrite', async (tx) => {
      await tx.put('studies', {
        id: 'study-1',
        title: 't',
        revision: 1,
        createdAt: 0,
        updatedAt: 0,
      });
    });
    expect(tracker.inflight()).toBe(1);
    await p;
    expect(tracker.inflight()).toBe(0);
  });

  it('withWriteTracking releases the slot even when the work rejects', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const mem = createMemoryRepositories();
    const wrapped = withWriteTracking(mem.raw, tracker);
    // Inject a failure by passing a record that the wrapper or the
    // underlying store will reject. The memory store requires an
    // `id`; passing a value without one throws.
    await expect(
      wrapped.put('studies', { title: 'no-id' } as unknown as { id: string }),
    ).rejects.toThrow();
    expect(tracker.inflight()).toBe(0);
  });

  it('flush reports write-failed when an in-flight write rejects before the budget elapses', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const mem = createMemoryRepositories();
    const wrapped = withWriteTracking(mem.raw, tracker);
    // Hold a write open long enough to observe the slot, then
    // reject it from inside the transaction body. The wrapper
    // must report write-failed once the rejection is observed.
    const failing = wrapped.transaction(['studies'], 'readwrite', async () => {
      // Yield to let flush() see the open slot.
      await Promise.resolve();
      throw new Error('simulated write failure');
    });
    const r = await tracker.flush(500);
    await failing.catch(() => undefined);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('write-failed');
  });

  it('flush reports ok:true after a successful put', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const mem = createMemoryRepositories();
    const wrapped = withWriteTracking(mem.raw, tracker);
    await wrapped.put('studies', { id: 's', title: 't', revision: 1, createdAt: 0, updatedAt: 0 });
    const r = await tracker.flush(500);
    expect(r.ok).toBe(true);
  });
});

describe('write tracker — lastFailure + subscribe (Phase 38 PART P)', () => {
  it('records the most recent rejection and clears it after a subsequent success', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const mem = createMemoryRepositories();
    const wrapped = withWriteTracking(mem.raw, tracker);
    // Trigger a rejection through the tracked transaction so the
    // wrapper actually registers a slot and the rejection path runs
    // `release(false)`.
    const failing = wrapped
      .transaction(['studies'], 'readwrite', async (tx) => {
        await tx.put('studies', { title: 'no-id' } as unknown as { id: string });
      })
      .catch(() => undefined);
    await failing;
    const failure = tracker.lastFailure();
    expect(failure).not.toBeNull();
    if (!failure) throw new Error('expected failure');
    expect(failure.label).toMatch(/^write:studies$/);
    // A successful write clears the failure snapshot so the
    // workspace chrome can stop showing "Save failed".
    const ok = wrapped.transaction(['studies'], 'readwrite', async (tx) => {
      await tx.put('studies', {
        id: 's',
        title: 't',
        revision: 1,
        createdAt: 0,
        updatedAt: 0,
      });
    });
    await ok;
    expect(tracker.lastFailure()).toBeNull();
  });

  it('notifies subscribers when inflight count or lastFailure changes', () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const events: number[] = [];
    const unsubscribe = tracker.subscribe(() => {
      events.push(tracker.inflight());
    });
    const a = tracker.begin('subscribe:a');
    const b = tracker.begin('subscribe:b');
    expect(events).toEqual([1, 2]);
    a.release(true);
    b.release(true);
    expect(events).toEqual([1, 2, 1, 0]);
    unsubscribe();
    const c = tracker.begin('subscribe:c');
    c.release(true);
    // No more events after the listener detached.
    expect(events).toEqual([1, 2, 1, 0]);
  });

  it('a subscriber that was attached during a failure still sees the success notification', async () => {
    resetWriteTrackerForTests();
    const tracker = getWriteTracker();
    const mem = createMemoryRepositories();
    const wrapped = withWriteTracking(mem.raw, tracker);
    const failing = wrapped
      .transaction(['studies'], 'readwrite', async (tx) => {
        await tx.put('studies', { title: 'no-id' } as unknown as { id: string });
      })
      .catch(() => undefined);
    await failing;
    expect(tracker.lastFailure()).not.toBeNull();
    let sawSaved = false;
    const unsubscribe = tracker.subscribe(() => {
      if (tracker.lastFailure() === null && tracker.inflight() === 0) {
        sawSaved = true;
      }
    });
    const ok = wrapped.transaction(['studies'], 'readwrite', async (tx) => {
      await tx.put('studies', {
        id: 's',
        title: 't',
        revision: 1,
        createdAt: 0,
        updatedAt: 0,
      });
    });
    await ok;
    unsubscribe();
    expect(sawSaved).toBe(true);
  });
});
