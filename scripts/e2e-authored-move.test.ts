import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { authoredMove } from '../e2e/support/authored-move';

describe('cross-tab authored-move oracle', () => {
  const root = new Chess().fen();
  const game = new Chess();
  game.move('e4');
  const e4 = game.fen();
  game.move('e5');
  const e5 = game.fen();

  it('does not report a chapter switch as an accepted move', () => {
    expect(
      authoredMove(
        [
          { fen: e5, chapter: 'Alpha' },
          { fen: root, chapter: 'Charlie' },
        ],
        'g1',
        'f3',
      ),
    ).toBeNull();
  });

  it('keeps an accepted move even when a chapter switch immediately follows it', () => {
    expect(
      authoredMove(
        [
          { fen: root, chapter: 'Alpha' },
          { fen: e4, chapter: 'Alpha' },
          { fen: root, chapter: 'Charlie' },
        ],
        'e2',
        'e4',
      ),
    ).toEqual({ chapter: 'Alpha', after: e4, san: 'e4' });
  });

  it('attributes a move to the board it actually lands on after a pending switch', () => {
    expect(
      authoredMove(
        [
          { fen: root, chapter: 'Alpha' },
          { fen: e4, chapter: 'Charlie' },
          { fen: e5, chapter: 'Charlie' },
        ],
        'e7',
        'e5',
      ),
    ).toEqual({ chapter: 'Charlie', after: e5, san: 'e5' });
  });
});
