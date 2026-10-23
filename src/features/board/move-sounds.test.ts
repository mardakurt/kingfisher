import { describe, expect, it } from 'vitest';

import { soundOf } from './move-sounds';

describe('soundOf', () => {
  it('sounds a check over a capture over a quiet move', () => {
    expect(soundOf('Nf3', false)).toBe('move');
    expect(soundOf('Nxe5', true)).toBe('capture');
    expect(soundOf('Qxf7#', true)).toBe('check');
    expect(soundOf('Bb5+', false)).toBe('check');
    expect(soundOf('O-O', false)).toBe('move');
  });
});
