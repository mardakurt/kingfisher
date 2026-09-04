import { START_FEN } from '@/chess/fen';
import { describeVariation, variationPositions, variationTokens } from './pv';

describe('principal variation presentation', () => {
  it('builds non-destructive preview positions and stops at an illegal move', () => {
    const positions = variationPositions(START_FEN, ['e2e4', 'e7e5', 'e2e4']);
    expect(positions).toHaveLength(3);
    expect(positions[0]?.fen).toBe(START_FEN);
    expect(positions[1]?.san).toBe('e4');
    expect(positions[2]?.san).toBe('e5');
  });

  it('describes and numbers a line from Black to move', () => {
    const san = describeVariation(START_FEN, ['e2e4', 'e7e5']);
    expect(variationTokens(0, san).map((token) => token.text)).toEqual(['1.', 'e4', 'e5']);
  });
});
