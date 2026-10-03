import { describe, expect, it } from 'vitest';

import { exactEvent, matchesEvent } from './game-match';

describe('an event filter', () => {
  it('matches part of the name unquoted', () => {
    expect(matchesEvent('Synthetic Open 10', 'open 1')).toBe(true);
    expect(matchesEvent('Tata Steel Masters', 'tata')).toBe(true);
    expect(matchesEvent(undefined, 'tata')).toBe(false);
  });

  it('matches the whole name, in any case, when quoted', () => {
    // The tournament row "Synthetic Open 1" must not bring Opens 10 to 19.
    expect(matchesEvent('Synthetic Open 10', '"Synthetic Open 1"')).toBe(false);
    expect(matchesEvent('Synthetic Open 1', '"synthetic open 1"')).toBe(true);
    expect(matchesEvent('  Synthetic Open 1 ', '"Synthetic Open 1"')).toBe(true);
  });

  it('reads two quote marks alone as text, not as an empty whole name', () => {
    expect(exactEvent('""')).toBeNull();
    expect(exactEvent('"Norway Chess"')).toBe('Norway Chess');
    expect(exactEvent('Norway "Chess"')).toBeNull();
  });
});
