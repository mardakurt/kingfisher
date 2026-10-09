import { Chess } from 'chess.js';

export interface BoardSnapshot {
  readonly fen: string;
  readonly chapter: string;
}

/** Recognize the clicked move independently, including one overwritten by a later switch. */
export function authoredMove(snapshots: readonly BoardSnapshot[], from: string, to: string) {
  for (let index = 1; index < snapshots.length; index += 1) {
    const before = snapshots[index - 1]!;
    const after = snapshots[index]!;
    const chess = new Chess(before.fen);
    const move = chess
      .moves({ verbose: true })
      .find((move) => move.from === from && move.to === to);
    if (!move) continue;
    chess.move(move);
    if (chess.fen() === after.fen)
      return { chapter: after.chapter, after: after.fen, san: move.san };
  }
  return null;
}
