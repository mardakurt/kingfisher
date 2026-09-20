import { describe, expect, it } from 'vitest';

import { plural } from './plural';

describe('plural', () => {
  it('agrees the noun with the count', () => {
    expect(plural(1, 'move')).toBe('1 move');
    expect(plural(0, 'move')).toBe('0 moves');
    expect(plural(2, 'reply', 'replies')).toBe('2 replies');
  });

  it('formats large counts for reading', () => {
    expect(plural(12345, 'game')).toBe('12,345 games');
  });
});
