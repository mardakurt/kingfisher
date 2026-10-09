import { beforeEach, expect, it } from 'vitest';
import type { Fen, San } from '@/chess/types';
import { useConversion } from './conversion-store';

beforeEach(() => useConversion.getState().stop());

it('keeps a legal move when probing fails, without inventing its result or blaming the next move', () => {
  const session = useConversion.getState();
  session.start({
    fen: '8/8/8/4k3/8/8/4K3/4R3 w - - 0 1' as Fen,
    side: 'w',
    strength: 'strong',
    title: 'Rook ending',
    category: 'win',
    sideToMove: 'w',
  });
  session.record({
    fen: '8/8/8/4k3/8/4K3/8/4R3 b - - 1 1' as Fen,
    san: 'Ke3' as San,
    by: 'w',
    category: null,
    sideToMove: 'b',
    halfmoveClock: 1,
  });
  expect(useConversion.getState().fen).toBe('8/8/8/4k3/8/4K3/8/4R3 b - - 1 1');
  expect(useConversion.getState().currentOutcome).toBeNull();
  expect(useConversion.getState().history).toEqual([
    { san: 'Ke3', by: 'w', outcome: null, change: null },
  ]);
  expect(useConversion.getState().ending).toBeNull();
  session.record({
    fen: '8/8/8/5k2/8/4K3/8/4R3 w - - 2 2' as Fen,
    san: 'Kf5' as San,
    by: 'b',
    category: 'win',
    sideToMove: 'w',
    halfmoveClock: 2,
  });
  expect(useConversion.getState().currentOutcome).toBe('win');
  expect(useConversion.getState().history.at(-1)?.change).toBeNull();
});
