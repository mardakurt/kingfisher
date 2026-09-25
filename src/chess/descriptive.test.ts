import { describe, expect, it } from 'vitest';

import { resolveDescriptive, transcribeDescriptive } from './descriptive';
import { START_FEN } from './fen';

// Marshall–Capablanca, match 1909, game 23, as Capablanca printed it in
// *Chess Fundamentals* (1921), Game 1: the moves exactly as the book has them.
const MARSHALL_CAPABLANCA = [
  ['P - Q 4', 'P - Q 4'],
  ['P - Q B 4', 'P - K 3'],
  ['Kt - Q B 3', 'Kt - K B 3'],
  ['B - Kt 5', 'B - K 2'],
  ['P - K 3', 'Kt - K 5'],
  ['B x B', 'Q x B'],
  ['B - Q 3', 'Kt x Kt'],
  ['P x Kt', 'Kt - Q 2'],
  ['Kt - B 3', 'O - O'],
  ['P x P', 'P x P'],
  ['Q - Kt 3', 'Kt - B 3'],
  ['P - Q R 4', 'P - B 4'],
  ['Q - R 3', 'P - Q Kt 3'],
  ['P - R 5', 'B - Kt 2'],
  ['O - O', 'Q - B 2'],
  ['K R - Kt 1', 'Kt - Q 2'],
  ['B - B 5', 'K R - B 1'],
  ['B x Kt', 'Q x B'],
  ['P - R 6', 'B - B 3'],
  ['P x P', 'P x P'],
  ['Q x P', 'Q R - Kt 1'],
  ['R x R', 'R x R'],
  ['Kt - K 5', 'Q - B 4'],
  ['P - K B 4', 'R - Kt 3'],
  ['Q x R !'],
].flat();

describe('descriptive notation', () => {
  it('transcribes a whole book game to the moves that were played', () => {
    // Checked against the book's own note after move 25: "if 25 Kt x B,
    // R - Kt 8 ch would have drawn" — Nxc6 Rb1+ in this line.
    const result = transcribeDescriptive(MARSHALL_CAPABLANCA);
    expect(result.ok, result.ok ? '' : JSON.stringify(result.error)).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((entry) => entry.move.san).join(' ')).toBe(
      'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 Ne4 Bxe7 Qxe7 Bd3 Nxc3 bxc3 Nd7 Nf3 O-O cxd5 exd5 ' +
        'Qb3 Nf6 a4 c5 Qa3 b6 a5 Bb7 O-O Qc7 Rfb1 Nd7 Bf5 Rfc8 Bxd7 Qxd7 a6 Bc6 dxc5 bxc5 ' +
        'Qxc5 Rab8 Rxb8 Rxb8 Ne5 Qf5 f4 Rb6 Qxb6',
    );
  });

  it('refuses text that fits two legal moves', () => {
    // From the start `Kt - B 3` fits Nc3 and Nf3; a book would have said which.
    const result = resolveDescriptive(START_FEN, 'Kt - B 3');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/fits 2 legal moves \(Nc3, Nf3\)/);
  });

  it('reads the square from the mover’s side of the board', () => {
    const black = resolveDescriptive(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      'P - K 4',
    );
    expect(black.ok && black.value.san).toBe('e5');
  });

  it('refuses a qualifier that contradicts the only candidate', () => {
    const result = resolveDescriptive(START_FEN, 'Q Kt - K B 3');
    expect(result.ok).toBe(false);
  });

  it('names where the transcription stopped', () => {
    const result = transcribeDescriptive(['P - K 4', 'P - K 4', 'Q - K 4']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.index).toBe(2);
  });

  it('reads an en passant capture as the capture it is', () => {
    const result = resolveDescriptive(
      'rnbqkbnr/ppppp1pp/8/4Pp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
      'P x P e.p.',
    );
    expect(result.ok && result.value.san).toBe('exf6');
  });

  it('lets the rest of the score settle a move the text alone does not', () => {
    // After 1.e4 e5 2.d4 Nc6, `B - Kt 5` is Bb5 or Bg5, neither a check.
    // `B x Kt` then `Q x B` is legal only after Bg5: Bxf6 Qxf6; after Bb5,
    // Bxc6 leaves the queen nothing to take on c6 past her own d-pawn.
    const result = transcribeDescriptive([
      'P - K 4',
      'P - K 4',
      'P - Q 4',
      'Kt - Q B 3',
      'B - Kt 5',
      'Kt - B 3',
      'B x Kt',
      'Q x B',
    ]);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value[4]!.move.san).toBe('Bg5');
    expect(result.value[4]!.excluded).toEqual(['Bb5']);
  });

  it('refuses a score that stays legal under two readings', () => {
    const result = transcribeDescriptive(['P - K 4', 'P - K 4', 'Kt - B 3']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Nc3 and Nf3|Nf3 and Nc3/);
  });

  it('holds a printed check to a checking move, and an unmarked move to a quiet one', () => {
    // After 1.e4 e5 2.Bc4 Nc6, `B x P` is Bxf7+ only with `ch` printed.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3';
    expect(resolveDescriptive(fen, 'B x P ch').ok && 'fits').toBe('fits');
    expect(resolveDescriptive(fen, 'B x P').ok).toBe(false);
  });
});
