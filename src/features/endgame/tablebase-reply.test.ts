import { describe, expect, it } from 'vitest';

import { whenTablebaseGivesNoMove } from './tablebase-reply';

describe('whenTablebaseGivesNoMove', () => {
  it('declines a tablebase-perfect defence when the tablebase gives no move', () => {
    expect(whenTablebaseGivesNoMove('tablebase-perfect')).toBe('decline');
  });

  it('still searches for an opponent the controls already describe as an engine', () => {
    expect(whenTablebaseGivesNoMove('strong')).toBe('search');
    expect(whenTablebaseGivesNoMove('club')).toBe('search');
  });
});
