import { describe, expect, it } from 'vitest';

import { describeChange, endingFor, outcomeFor } from './conversion';

describe('outcomeFor', () => {
  it('reads a category directly when it is our move', () => {
    expect(outcomeFor('win', 'w', 'w')).toBe('win');
    expect(outcomeFor('loss', 'w', 'w')).toBe('loss');
    expect(outcomeFor('draw', 'w', 'w')).toBe('draw');
  });

  /*
    The regression worth having a test for: `category` is always for the side
    to move, so failing to invert it would make the referee announce a change
    on every single move of the game.
  */
  it('inverts a category reported for the other side', () => {
    expect(outcomeFor('win', 'b', 'w')).toBe('loss');
    expect(outcomeFor('loss', 'b', 'w')).toBe('win');
    expect(outcomeFor('draw', 'b', 'w')).toBe('draw');
  });

  it('treats the fifty-move categories as the draws they are in play', () => {
    // A cursed win is a win on the board and a draw in the game being played.
    expect(outcomeFor('cursed-win', 'w', 'w')).toBe('draw');
    expect(outcomeFor('blessed-loss', 'w', 'w')).toBe('draw');
  });

  it('reads checkmate as a loss for the side to move', () => {
    expect(outcomeFor('checkmate', 'w', 'w')).toBe('loss');
    expect(outcomeFor('checkmate', 'w', 'b')).toBe('win');
  });

  it('reads stalemate as a draw for both sides', () => {
    expect(outcomeFor('stalemate', 'w', 'w')).toBe('draw');
    expect(outcomeFor('stalemate', 'w', 'b')).toBe('draw');
  });
});

describe('describeChange', () => {
  it('says nothing when the result held', () => {
    // A trainer that comments on every move trains the player to stop reading it.
    expect(describeChange('win', 'win')).toBeNull();
  });

  /* §53's exact wording, and the reason for it. */
  it('reports the change as a fact about the position', () => {
    const change = describeChange('win', 'draw');
    expect(change?.message).toBe('The tablebase result changed from Win to Draw on this move.');
    expect(change?.direction).toBe('worse');
  });

  it('never accuses the player', () => {
    for (const [before, after] of [
      ['win', 'draw'],
      ['win', 'loss'],
      ['draw', 'loss'],
    ] as const) {
      const message = describeChange(before, after)?.message ?? '';
      expect(message.toLowerCase()).not.toContain('blunder');
      expect(message.toLowerCase()).not.toContain('mistake');
      expect(message.toLowerCase()).not.toMatch(/\byou\b/);
    }
  });

  it('reports an improvement too, because the opponent errs as well', () => {
    expect(describeChange('draw', 'win')?.direction).toBe('better');
  });
});

describe('endingFor', () => {
  const base = {
    sideToMove: 'b' as const,
    perspective: 'w' as const,
    startingOutcome: 'win' as const,
    halfmoveClock: 0,
  };

  it('does not end a session whose result is holding', () => {
    expect(endingFor({ ...base, category: 'loss' })).toBeNull();
  });

  it('ends on mate, naming the winner rather than the side to move', () => {
    expect(endingFor({ ...base, category: 'checkmate' })).toEqual({
      kind: 'checkmate',
      winner: 'w',
    });
  });

  it('ends on stalemate', () => {
    expect(endingFor({ ...base, category: 'stalemate' })?.kind).toBe('stalemate');
  });

  it('ends when the fifty-move rule has run out', () => {
    expect(endingFor({ ...base, category: 'loss', halfmoveClock: 100 })?.kind).toBe('draw');
  });

  it('ends when the result you started with is gone', () => {
    expect(endingFor({ ...base, category: 'draw' })).toEqual({
      kind: 'result-lost',
      from: 'win',
    });
  });

  /*
    Judged against the starting result rather than the previous move, so
    drifting Win → Draw → Win is a session worth continuing rather than one
    that ended two moves ago.
  */
  it('does not end a session that recovered', () => {
    expect(endingFor({ ...base, category: 'loss', startingOutcome: 'win' })).toBeNull();
  });

  it('does not end a drawn study just because it is still drawn', () => {
    expect(endingFor({ ...base, category: 'draw', startingOutcome: 'draw' })).toBeNull();
  });

  it('does not end a drawn study that the player has improved', () => {
    // Holding a draw and then winning it is not a reason to stop.
    expect(endingFor({ ...base, category: 'loss', startingOutcome: 'draw' })).toBeNull();
  });
});
