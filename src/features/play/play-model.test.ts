import { START_FEN } from '@/chess/fen';
import { playPracticeMove, startPracticeLine, takeBackToTurn } from './play-model';

describe('play from here session', () => {
  it('keeps the source FEN and records a legal line', () => {
    const start = startPracticeLine(START_FEN);
    const white = playPracticeMove(start, 'e2e4');
    expect(white.ok).toBe(true);
    if (!white.ok) return;
    const black = playPracticeMove(white.line, 'e7e5');
    expect(black.ok && black.line.startFen).toBe(START_FEN);
    expect(black.ok && black.line.moves).toEqual(['e2e4', 'e7e5']);
  });

  it('takes back a complete player and engine turn', () => {
    const first = playPracticeMove(startPracticeLine(START_FEN), 'e2e4');
    if (!first.ok) throw new Error(first.message);
    const second = playPracticeMove(first.line, 'e7e5');
    if (!second.ok) throw new Error(second.message);
    expect(takeBackToTurn(second.line, 'w').moves).toEqual([]);
  });
});
