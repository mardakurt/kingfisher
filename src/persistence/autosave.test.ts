import { describe, expect, it } from 'vitest';

import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS, autosaveDelay } from './autosave';

const at = (overrides: Partial<Parameters<typeof autosaveDelay>[0]> = {}) =>
  autosaveDelay({
    dirty: true,
    saving: false,
    now: 10_000,
    lastChangeAt: 10_000,
    firstUnsavedAt: 10_000,
    ...overrides,
  });

describe('autosave scheduling', () => {
  it('does nothing while the document is clean', () => {
    expect(at({ dirty: false, firstUnsavedAt: null })).toBeNull();
  });

  it('does not start a second write while one is in flight', () => {
    expect(at({ saving: true })).toBeNull();
  });

  it('waits out the debounce after a fresh change', () => {
    expect(at()).toBe(AUTOSAVE_DEBOUNCE_MS);
  });

  it('shortens the wait as the debounce elapses', () => {
    expect(at({ now: 10_400, firstUnsavedAt: 10_000 })).toBe(AUTOSAVE_DEBOUNCE_MS - 400);
  });

  it('saves immediately once the debounce has already passed', () => {
    expect(at({ now: 12_000, lastChangeAt: 10_000, firstUnsavedAt: 10_000 })).toBe(0);
  });

  /**
   * The case a debounce alone gets wrong: someone annotating steadily keeps
   * resetting the timer, and without a cap their work would never be written.
   */
  it('caps how long the first unsaved change may wait, however busy the user is', () => {
    const delay = at({
      now: 10_000 + AUTOSAVE_MAX_WAIT_MS,
      lastChangeAt: 10_000 + AUTOSAVE_MAX_WAIT_MS,
      firstUnsavedAt: 10_000,
    });
    expect(delay).toBe(0);
  });

  it('cuts the debounce short when the cap is closer than the debounce', () => {
    // 500 ms of budget left, but 900 ms of debounce ahead: the cap wins.
    const delay = at({
      now: 14_500,
      lastChangeAt: 14_500,
      firstUnsavedAt: 10_000,
      debounceMs: 900,
      maxWaitMs: 5_000,
    });
    expect(delay).toBe(500);
  });

  it('still debounces while the cap is far away', () => {
    const delay = at({
      now: 11_000,
      lastChangeAt: 11_000,
      firstUnsavedAt: 10_000,
      debounceMs: 900,
      maxWaitMs: 5_000,
    });
    expect(delay).toBe(900);
  });

  it('never returns a negative delay', () => {
    expect(at({ now: 99_000, lastChangeAt: 10_000, firstUnsavedAt: 10_000 })).toBe(0);
  });
});
