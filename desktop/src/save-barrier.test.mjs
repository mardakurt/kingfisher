/**
 * The save barrier.
 *
 * These tests pin the fail-closed contract. The brief is explicit:
 * "DATA SAFETY > UPDATE CONVENIENCE." A test that returns `ok: true`
 * on a missing-window / timeout / send-failed path is failing.
 *
 * Every test below asserts a `BarrierResult` shape. None of the
 * negative paths in the test plan may be softened.
 */

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_TIMEOUT_MS, FAILURE_REASONS, createSaveBarrier } from './save-barrier.mjs';

function makeWindow(id = 'window-1') {
  return {
    id,
    destroyed: false,
    webContents: {
      isDestroyed: () => false,
      send: vi.fn(() => true),
    },
  };
}

function destroyedWindow(id = 'window-1') {
  return {
    id,
    destroyed: true,
    webContents: {
      isDestroyed: () => true,
      send: vi.fn(() => false),
    },
  };
}

function makeCoordinator({ windows = [makeWindow()], sendOk = true, log = vi.fn() } = {}) {
  const sent = [];
  const send = (window, channel, payload) => {
    sent.push({ window, channel, payload });
    return sendOk;
  };
  /** Single-shot listener that fires from a controlled list. */
  let pendingListener = null;
  let pendingEvent = null;
  const on = (channel, listener) => {
    pendingListener = listener;
    pendingEvent = { channel };
    return () => {
      pendingListener = null;
      pendingEvent = null;
    };
  };
  const respond = (payload, sender = windows[0]?.webContents) => {
    if (!pendingListener) throw new Error('no listener registered');
    pendingListener({ sender }, payload);
  };
  const isWindowUsable = (window) => Boolean(window) && window.destroyed !== true;
  return {
    barrier: createSaveBarrier({ send, on, getWindows: () => windows, isWindowUsable, log }),
    sent,
    respond,
    pendingEvent,
    log,
  };
}

describe('save barrier — happy path', () => {
  it('resolves ok:true when the only window answers ok:true', async () => {
    const { barrier, respond } = makeCoordinator();
    const p = barrier.dispatch();
    respond({ requestId: barrier.currentRequestId(), ok: true });
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('sends the request on kingfisher:save-barrier:request with a requestId', async () => {
    const { barrier, sent, respond } = makeCoordinator();
    const p = barrier.dispatch();
    expect(sent).toHaveLength(1);
    expect(sent[0].channel).toBe('kingfisher:save-barrier:request');
    expect(typeof sent[0].payload).toBe('string');
    expect(sent[0].payload).toBe(barrier.currentRequestId());
    respond({ requestId: barrier.currentRequestId(), ok: true });
    await p;
  });
});

describe('save barrier — fail closed (GAP-01, GAP-04, GAP-12)', () => {
  it('refuses to install when no window is registered', async () => {
    const { barrier } = makeCoordinator({ windows: [] });
    const result = await barrier.dispatch();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail-closed result');
    expect(result.reason).toBe('renderer-unavailable');
    expect(result.timedOut).toBe(false);
  });

  it('refuses to install when the only window is destroyed', async () => {
    const { barrier } = makeCoordinator({ windows: [destroyedWindow()] });
    const result = await barrier.dispatch();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail-closed result');
    expect(result.reason).toBe('renderer-unavailable');
    expect(result.timedOut).toBe(false);
  });

  it('refuses to install when the only window is destroyed but reports usable', async () => {
    // Defensive: if a future change ever makes the usable check
    // optimistic, the underlying send must still fail closed.
    const window = makeWindow();
    const { barrier } = makeCoordinator({
      windows: [window],
      sendOk: false,
    });
    const result = await barrier.dispatch();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail-closed result');
    expect(result.reason).toBe('renderer-unavailable');
  });

  it('refuses to install when the renderer times out', async () => {
    vi.useFakeTimers();
    try {
      const { barrier, respond } = makeCoordinator();
      const p = barrier.dispatch();
      // The renderer never answers. The barrier must time out
      // and resolve ok:false with reason=timeout, NOT ok:true.
      const resolved = p.then((r) => r);
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 10);
      const result = await resolved;
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected fail-closed result');
      expect(result.reason).toBe('timeout');
      expect(result.timedOut).toBe(true);
      // After the barrier resolved, a late response from the
      // renderer cannot resurrect the resolved barrier. The
      // listener is unregistered on settle, so a stale response
      // is silently dropped.
      // respond() throws if no listener is registered — that is
      // exactly the post-resolve property under test.
      expect(() => respond({ requestId: barrier.currentRequestId() ?? 'late', ok: true })).toThrow(
        /no listener/i,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses to install when the renderer answers ok:false pending-writes', async () => {
    const { barrier, respond } = makeCoordinator();
    const p = barrier.dispatch();
    respond({ requestId: barrier.currentRequestId(), ok: false, reason: 'pending-writes' });
    const result = await p;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail-closed result');
    expect(result.reason).toBe('pending-writes');
  });

  it('refuses to install when the renderer answers ok:false write-failed', async () => {
    const { barrier, respond } = makeCoordinator();
    const p = barrier.dispatch();
    respond({ requestId: barrier.currentRequestId(), ok: false, reason: 'write-failed' });
    const result = await p;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail-closed result');
    expect(result.reason).toBe('write-failed');
  });

  it('accepts a small set of known failure reasons', () => {
    expect(FAILURE_REASONS).toEqual([
      'pending-writes',
      'write-failed',
      'timeout',
      'renderer-unavailable',
    ]);
  });
});

describe('save barrier — multi-window', () => {
  it('refuses to install when any one of multiple windows reports pending writes', async () => {
    const w1 = makeWindow('w1');
    const w2 = makeWindow('w2');
    const sent = [];
    const send = (w, channel, payload) => {
      sent.push({ w, channel, payload });
      return true;
    };
    let pending = null;
    const on = (channel, listener) => {
      pending = listener;
      return () => (pending = null);
    };
    const respond = (payload, sender) => pending?.({ sender }, payload);
    const barrier = createSaveBarrier({
      send,
      on,
      getWindows: () => [w1, w2],
      isWindowUsable: (w) => Boolean(w) && w.destroyed !== true,
    });
    const p = barrier.dispatch();
    const id = barrier.currentRequestId();
    // First window reports committed; second reports still in flight.
    respond({ requestId: id, ok: true }, w1.webContents);
    respond({ requestId: id, ok: false, reason: 'pending-writes' }, w2.webContents);
    const result = await p;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail-closed result');
    expect(result.reason).toBe('pending-writes');
  });

  it('resolves ok:true only when every window answers ok:true', async () => {
    const w1 = makeWindow('w1');
    const w2 = makeWindow('w2');
    let pending = null;
    const on = (channel, listener) => {
      pending = listener;
      return () => (pending = null);
    };
    const respond = (payload, sender) => pending?.({ sender }, payload);
    const barrier = createSaveBarrier({
      send: () => true,
      on,
      getWindows: () => [w1, w2],
      isWindowUsable: (w) => Boolean(w) && w.destroyed !== true,
    });
    const p = barrier.dispatch();
    const id = barrier.currentRequestId();
    respond({ requestId: id, ok: true }, w1.webContents);
    respond({ requestId: id, ok: true }, w2.webContents);
    await expect(p).resolves.toEqual({ ok: true });
  });
});

describe('save barrier — single-flight (PART I)', () => {
  it('returns the same in-flight promise for concurrent dispatches', async () => {
    const { barrier, respond } = makeCoordinator();
    const a = barrier.dispatch();
    const b = barrier.dispatch();
    expect(a).toBe(b);
    respond({ requestId: barrier.currentRequestId(), ok: true });
    await expect(a).resolves.toEqual({ ok: true });
    // After resolution a fresh dispatch is a new promise.
    const c = barrier.dispatch();
    expect(c).not.toBe(a);
    respond({ requestId: barrier.currentRequestId(), ok: true });
    await c;
  });

  it('ignores responses with a different requestId', async () => {
    const { barrier, respond } = makeCoordinator();
    const p = barrier.dispatch();
    const currentId = barrier.currentRequestId();
    // A response from a stale (already-resolved) request must not
    // affect the in-flight one.
    respond({ requestId: '0000000000000000', ok: true });
    respond({ requestId: currentId, ok: true });
    await expect(p).resolves.toEqual({ ok: true });
  });
});

describe('save barrier — robustness', () => {
  it('passes through the default timeout constant', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(5_000);
  });

  it('honors a custom timeout', async () => {
    vi.useFakeTimers();
    try {
      const { barrier } = makeCoordinator();
      const p = barrier.dispatch({ timeoutMs: 250 });
      const resolved = p.then((r) => r);
      // Below the budget: must still be pending.
      await vi.advanceTimersByTimeAsync(100);
      let raced = false;
      await Promise.race([resolved.then(() => (raced = true)), Promise.resolve()]);
      expect(raced).toBe(false);
      // Past the budget: must resolve as a timeout.
      await vi.advanceTimersByTimeAsync(200);
      const result = await resolved;
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected fail-closed result');
      expect(result.reason).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs a recognisable line for each failure path', async () => {
    const log = vi.fn();
    // 1. No window.
    let ctx = makeCoordinator({ windows: [], log });
    await ctx.barrier.dispatch();
    expect(log.mock.calls.some((c) => c[1].includes('no usable window'))).toBe(true);

    // 2. Timeout.
    vi.useFakeTimers();
    try {
      ctx = makeCoordinator({ log });
      const p = ctx.barrier.dispatch();
      const resolved = p.then((r) => r);
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 10);
      await resolved;
      expect(log.mock.calls.some((c) => c[1].includes('timeout'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    // 3. Send failed.
    ctx = makeCoordinator({ sendOk: false, log });
    await ctx.barrier.dispatch();
    expect(log.mock.calls.some((c) => c[1].includes('all sends failed'))).toBe(true);
  });
});
