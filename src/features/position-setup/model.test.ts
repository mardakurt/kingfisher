import { START_FEN } from '@/chess/fen';
import {
  clearSetup,
  setupFen,
  setupFromFen,
  startingSetup,
  validateSetup,
  withPiece,
} from './model';

describe('position setup', () => {
  it('round-trips the starting position', () => {
    expect(setupFen(startingSetup())).toBe(START_FEN);
  });

  it('refuses missing kings and impossible castling rights', () => {
    expect(validateSetup(clearSetup())).toMatchObject({ ok: false });
    const withoutRook = withPiece(startingSetup(), 'h1', null);
    expect(validateSetup(withoutRook)).toEqual({
      ok: false,
      message: 'White kingside castling needs a white rook on h1.',
    });
  });

  it('accepts a legal arbitrary position pasted as FEN', () => {
    const result = setupFromFen('8/8/3k4/8/3P4/8/4K3/8 b - - 7 42');
    expect(result.ok).toBe(true);
    expect(result.state?.fullmoveNumber).toBe(42);
  });
});
