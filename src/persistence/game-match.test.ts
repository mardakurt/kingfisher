import { describe, expect, it } from 'vitest';

import { exactEvent, matchesEvent } from './game-match';
import type { GameSummary } from './types';

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

describe('an opening filter', () => {
  const summary = (opening?: string, classified?: string) =>
    ({
      id: 'g',
      fingerprint: 'g',
      white: 'W',
      black: 'B',
      whiteKey: 'w',
      blackKey: 'b',
      playerKeys: ['w', 'b'],
      result: '1-0',
      importedAt: 0,
      ...(opening ? { opening } : {}),
      ...(classified ? { classification: { eco: 'D06', name: classified } } : {}),
    }) as unknown as GameSummary;

  it('quoted, matches the family whole, not a longer family that contains it', async () => {
    const { matchesGameSearch } = await import('./game-match');
    const declined = summary("Queen's Gambit Declined: Exchange Variation");
    const gambit = summary("Queen's Gambit: Albin Countergambit");
    expect(matchesGameSearch(declined, { opening: "Queen's Gambit" })).toBe(true);
    expect(matchesGameSearch(declined, { opening: `"Queen's Gambit"` })).toBe(false);
    expect(matchesGameSearch(gambit, { opening: `"queen's gambit"` })).toBe(true);
    // The classification counts as well as the file's tag.
    expect(
      matchesGameSearch(summary(undefined, "Queen's Gambit"), { opening: `"Queen's Gambit"` }),
    ).toBe(true);
  });
});
