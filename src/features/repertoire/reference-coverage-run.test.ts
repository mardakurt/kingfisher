import { describe, expect, it } from 'vitest';

import { coverageRunState } from './reference-coverage-run';

describe('coverageRunState', () => {
  it('ends the run when one of three explores rejects, and keeps the two that were read', () => {
    const state = coverageRunState({
      total: 3,
      runEnded: true,
      attempts: [
        { index: 0, ok: true, report: { id: 'a' } },
        { index: 1, ok: false, position: 'fen-b' },
        { index: 2, ok: true, report: { id: 'c' } },
      ],
    });
    expect(state.pending).toBe(false);
    expect(state.unread).toEqual(['fen-b']);
    expect(state.successes).toEqual([{ id: 'a' }, { id: 'c' }]);
    expect(state.completed).toBe(3);
  });
});
