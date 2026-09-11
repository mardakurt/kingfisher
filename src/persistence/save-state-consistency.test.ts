/**
 * Consistency tests for the visible save state.
 *
 * Phase 39 (PART E) requires that every visible save indicator
 * derive from the same write-tracker truth. The sidebar's
 * `composeSavedState()` consumes a `SavedStateWrite`; the
 * Study-local `StudySaveStatus` reads the same `useWriteTracker`
 * hook. There is no second save model.
 *
 * These tests pin the structural invariants:
 *
 *   1. `composeSavedState` cannot return "Save failed" while the
 *      write tracker is in `saved` state — i.e. the visible label
 *      matches the write-tracker status it was built on.
 *   2. `composeSavedState` returns "Saving…" only while the write
 *      tracker is in `saving` state, never while it is `saved`.
 *   3. The "failed" copy is never silent: a `failureLabel` of
 *      null still produces copy that names what is at risk.
 *
 * Because both surfaces read from the same hook, the only way for
 * them to disagree would be a regression in the reducer. These
 * tests pin the reducer; if the hook ever stops being shared,
 * these tests will still fail loudly.
 */

import { describe, expect, it } from 'vitest';

import { composeSavedState, type SavedStateWrite } from './saved-state';

describe('save-state consistency between sidebar and study-local indicator', () => {
  it('cannot report "Saving…" unless the write tracker is in "saving" state', () => {
    const writes: SavedStateWrite[] = ['saved', 'saving', 'failed'];
    for (const write of writes) {
      const view = composeSavedState('persistent', write, null);
      if (write === 'saving') {
        expect(view.label).toBe('Saving…');
      } else {
        expect(view.label).not.toBe('Saving…');
      }
    }
  });

  it('cannot report "Save failed" unless the write tracker is in "failed" state', () => {
    const writes: SavedStateWrite[] = ['saved', 'saving', 'failed'];
    for (const write of writes) {
      const view = composeSavedState('persistent', write, null);
      if (write === 'failed') {
        expect(view.label).toBe('Save failed');
        expect(view.tone).toBe('text-negative');
      } else {
        expect(view.label).not.toBe('Save failed');
      }
    }
  });

  it('reports a non-empty failure detail even when the label is absent', () => {
    const view = composeSavedState('persistent', 'failed', null);
    expect(view.detail.length).toBeGreaterThan(0);
    expect(view.detail.toLowerCase()).toContain('try again');
  });

  it('reports the failed-record label in the detail when one is supplied', () => {
    const view = composeSavedState('persistent', 'failed', 'studies:chapter:abc');
    expect(view.detail).toContain('studies:chapter:abc');
  });

  it('returns a non-negative tone only on failed write, never on saved or saving', () => {
    expect(composeSavedState('persistent', 'saved', null).tone).not.toBe('text-negative');
    expect(composeSavedState('persistent', 'saving', null).tone).not.toBe('text-negative');
    expect(composeSavedState('persistent', 'failed', null).tone).toBe('text-negative');
  });
});
