/**
 * Tests for the saved-state reducer.
 *
 * The brief (PART P) requires the visible workspace status to
 * reflect real write state, not just the storage-persistence
 * promise. These tests pin the compose() contract: a write in
 * flight is always shown as Saving…; a rejection is shown as
 * Save failed; otherwise the persistence label is the source of
 * truth.
 */

import { describe, expect, it } from 'vitest';

import { composeSavedState, type SavedStatePersistence } from './saved-state';

describe('composeSavedState', () => {
  it('shows "Saving…" while a write is in flight, regardless of persistence', () => {
    const view = composeSavedState('persistent', 'saving', null);
    expect(view.label).toBe('Saving…');
    expect(view.tone).toBe('text-tertiary');
    expect(view.openable).toBe(false);
    expect(view.requestable).toBe(false);
  });

  it('shows "Save failed" with a label when a write has rejected since the last success', () => {
    const view = composeSavedState('persistent', 'failed', 'write:studies');
    expect(view.label).toBe('Save failed');
    expect(view.tone).toBe('text-negative');
    expect(view.openable).toBe(true);
    expect(view.detail).toContain('write:studies');
  });

  it('shows "Save failed" with a generic detail when no label is recorded', () => {
    const view = composeSavedState('persistent', 'failed', null);
    expect(view.label).toBe('Save failed');
    expect(view.detail).toContain('locally');
    expect(view.openable).toBe(true);
  });

  it('falls back to the persistence labels once writes are saved', () => {
    const cases: ReadonlyArray<readonly [SavedStatePersistence, string]> = [
      ['persistent', 'Saved on'],
      ['not-persistent', 'Storage is not protected'],
      ['unavailable', 'Storage protection unavailable'],
      ['pending', 'Storage status…'],
    ];
    for (const [state, expectedLabelPrefix] of cases) {
      const view = composeSavedState(state, 'saved', null);
      expect(view.label.startsWith(expectedLabelPrefix)).toBe(true);
    }
  });

  it('flags the requestable interaction when storage is not protected', () => {
    const view = composeSavedState('not-persistent', 'saved', null);
    expect(view.requestable).toBe(true);
    expect(view.openable).toBe(false);
  });

  it('flags the openable (backup) interaction when storage is persistent', () => {
    const view = composeSavedState('persistent', 'saved', null);
    expect(view.openable).toBe(true);
    expect(view.requestable).toBe(false);
  });

  it('saving beats failure: a still-pending write is shown as Saving…, not Save failed', () => {
    // If a previous write failed AND a new write is in flight, the
    // user wants to see the in-flight state because the new write
    // may yet succeed. We must not get stuck on the failure label.
    const view = composeSavedState('persistent', 'saving', 'write:studies');
    expect(view.label).toBe('Saving…');
  });
});
