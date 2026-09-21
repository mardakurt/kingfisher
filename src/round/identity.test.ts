import { describe, expect, it } from 'vitest';

import { gameIdentity, nameKey, ownColor } from './identity';

describe('ownColor', () => {
  it('matches an alias against either player exactly, up to case and whitespace', () => {
    expect(ownColor({ White: 'Kurt,  Metin', Black: 'Rival' }, ['kurt, metin'])).toBe('w');
    expect(ownColor({ White: 'Rival', Black: 'KURT, METIN' }, ['Kurt, Metin'])).toBe('b');
    // Two spellings are two aliases: nothing is guessed from the letters.
    expect(ownColor({ White: 'Kurt, Metin', Black: 'Rival' }, ['Metin Kurt'])).toBeNull();
    expect(nameKey('Carlsen, Magnus')).not.toBe(nameKey('Magnus Carlsen'));
  });

  it('answers nothing when neither or both players are the person', () => {
    expect(ownColor({ White: 'A', Black: 'B' }, ['C'])).toBeNull();
    expect(ownColor({ White: 'Me', Black: 'Me' }, ['Me'])).toBeNull();
    expect(ownColor({ White: 'Me', Black: 'B' }, [])).toBeNull();
  });

  it('never matches an empty alias', () => {
    expect(nameKey('  ')).toBe('');
    expect(ownColor({ White: '', Black: 'B' }, [''])).toBeNull();
  });
});

describe('gameIdentity', () => {
  it('names the game, the opponent for the known colour, and drops unknown tags', () => {
    expect(
      gameIdentity(
        {
          White: 'Kurt, Metin',
          Black: 'Rival',
          Event: 'Club Open',
          Round: '3',
          Date: '2026.09.20',
          Result: '1-0',
        },
        'w',
      ),
    ).toEqual({
      title: 'Kurt, Metin – Rival',
      event: 'Club Open',
      round: '3',
      date: '2026.09.20',
      opponent: 'Rival',
      result: '1-0',
    });
    expect(gameIdentity({ Date: '????.??.??', Round: '?', Result: '*' }, null)).toEqual({
      title: 'White – Black',
    });
  });
});
