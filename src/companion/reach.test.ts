import { describe, expect, it } from 'vitest';

import { companionReachFor } from './reach';

describe('where a companion can be reached from', () => {
  it('the desktop shell has one built in, whatever origin it serves', () => {
    expect(companionReachFor('http://127.0.0.1:52431', true)).toBe('desktop');
    expect(companionReachFor(null, true)).toBe('desktop');
  });

  it('a loopback checkout can pair one from the terminal', () => {
    expect(companionReachFor('http://localhost:3210', false)).toBe('checkout');
    expect(companionReachFor('http://127.0.0.1:3210', false)).toBe('checkout');
  });

  it('the public site cannot: the companion refuses every other origin', () => {
    expect(companionReachFor('https://kingfisherchess.app', false)).toBe('remote');
    // Loopback over https is not what the companion allows either.
    expect(companionReachFor('https://localhost:3210', false)).toBe('remote');
    expect(companionReachFor('not a url', false)).toBe('remote');
    expect(companionReachFor(null, false)).toBe('remote');
  });
});
