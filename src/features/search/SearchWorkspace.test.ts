import { describe, expect, it } from 'vitest';

import { readQuery } from './SearchWorkspace';

describe('readQuery', () => {
  it('reads a FEN as a position', () => {
    const reading = readQuery('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(reading).toMatchObject({ kind: 'position', from: 'fen' });
  });

  it('reads a line of moves as the position it reaches', () => {
    const reading = readQuery('1.e4 c5 2.Nf3 d6');
    expect(reading.kind).toBe('position');
    if (reading.kind !== 'position') throw new Error('not a position');
    expect(reading.from).toBe('moves');
    expect(reading.fen).toContain(' w ');
  });

  it('reads anything else as words, and nothing as nothing', () => {
    expect(readQuery('Najdorf')).toEqual({ kind: 'words', text: 'Najdorf' });
    expect(readQuery('   ')).toEqual({ kind: 'empty' });
  });
});
