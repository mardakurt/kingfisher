import { describe, expect, it } from 'vitest';

import { readableDate, siteLabel } from './GameHeaderCard';

describe('the game header’s place and date', () => {
  it('names a URL site by its host, and a place as written', () => {
    expect(
      siteLabel('https://lichess.org/broadcast/fide-world-team-rapid/round-11/grvUn9pX/RIwLqgqb'),
    ).toBe('lichess.org');
    expect(siteLabel('https://www.chess.com/game/live/1')).toBe('chess.com');
    expect(siteLabel('Wijk aan Zee NED')).toBe('Wijk aan Zee NED');
    expect(siteLabel('?')).toBeNull();
  });

  it('keeps the known part of a date and drops an unknown one', () => {
    expect(readableDate('2026.06.19')).toBe('2026.06.19');
    expect(readableDate('2026.??.??')).toBe('2026');
    expect(readableDate('????.??.??')).toBeNull();
  });
});
