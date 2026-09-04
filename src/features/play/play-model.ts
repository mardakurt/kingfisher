import { Position } from '@/chess/position';
import type { Fen, MoveIntent, Square, Uci } from '@/chess/types';

export interface PracticeLine {
  readonly startFen: Fen;
  readonly fen: Fen;
  readonly moves: readonly Uci[];
  readonly positions: readonly Fen[];
}

export const startPracticeLine = (fen: Fen): PracticeLine => ({
  startFen: fen,
  fen,
  moves: [],
  positions: [fen],
});

export function playPracticeMove(
  line: PracticeLine,
  intent: MoveIntent | string,
):
  | { readonly ok: true; readonly line: PracticeLine }
  | { readonly ok: false; readonly message: string } {
  const position = Position.fromTrustedFen(line.fen);
  const played = typeof intent === 'string' ? position.playUci(intent) : position.play(intent);
  if (!played.ok) return { ok: false, message: played.error.message };
  return {
    ok: true,
    line: {
      ...line,
      fen: played.value.after,
      moves: [...line.moves, played.value.uci],
      positions: [...line.positions, played.value.after],
    },
  };
}

export function takeBackToTurn(line: PracticeLine, playerTurn: 'w' | 'b'): PracticeLine {
  let count = line.moves.length;
  while (count > 0) {
    count -= 1;
    const candidate = Position.fromTrustedFen(line.positions[count] as Fen);
    if (candidate.turn === playerTurn) break;
  }
  return {
    ...line,
    fen: line.positions[count] as Fen,
    moves: line.moves.slice(0, count),
    positions: line.positions.slice(0, count + 1),
  };
}

export function legalDestinations(fen: Fen): ReadonlyMap<Square, readonly Square[]> {
  const map = new Map<Square, Square[]>();
  for (const move of Position.fromTrustedFen(fen).legalMoves()) {
    const values = map.get(move.from) ?? [];
    if (!values.includes(move.to)) values.push(move.to);
    map.set(move.from, values);
  }
  return map;
}
