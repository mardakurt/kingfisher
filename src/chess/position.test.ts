import { describe, expect, it } from 'vitest';

import { Position } from './position';
import { expect as unwrap } from './result';

describe('Position', () => {
  it('generates the 20 legal opening moves', () => {
    expect(Position.initial().legalMoves()).toHaveLength(20);
  });

  it('rejects a structurally valid but illegal position', () => {
    // Black is in check with White to move: unreachable.
    const result = Position.fromFen('4k3/8/8/8/8/8/8/R3K2R b KQ - 0 1');
    expect(result.ok).toBe(true);
    const impossible = Position.fromFen(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e3 0 1',
    );
    expect(impossible.ok).toBe(false);
  });

  it('castles kingside and queenside', () => {
    const position = unwrap(Position.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'));
    const kingside = unwrap(position.playSan('O-O'));
    expect(kingside.flags.kingsideCastle).toBe(true);
    expect(kingside.after).toContain('R4RK1');

    const queenside = unwrap(position.playSan('O-O-O'));
    expect(queenside.flags.queensideCastle).toBe(true);
    expect(queenside.uci).toBe('e1c1');
  });

  it('refuses to castle through check', () => {
    const position = unwrap(Position.fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'));
    const attacked = unwrap(Position.fromFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1'));
    expect(position.playSan('O-O').ok).toBe(true);
    expect(attacked.playSan('O-O').ok).toBe(false);
  });

  it('plays en passant and removes the captured pawn', () => {
    const position = unwrap(
      Position.fromFen('rnbqkbnr/pp1ppppp/8/2pP4/8/8/PPP1PPPP/RNBQKBNR w KQkq c6 0 3'),
    );
    const move = unwrap(position.playSan('dxc6'));
    expect(move.flags.enPassant).toBe(true);
    expect(position.after(move).pieceAt('c5')).toBeNull();
    expect(position.after(move).pieceAt('c6')).toEqual({ color: 'w', type: 'p' });
  });

  it('requires a promotion piece and honours the choice', () => {
    const position = unwrap(Position.fromFen('8/4P3/8/8/8/8/8/4K1k1 w - - 0 1'));
    expect(position.requiresPromotion('e7', 'e8')).toBe(true);
    expect(position.play({ from: 'e7', to: 'e8' }).ok).toBe(false);

    const knight = unwrap(position.play({ from: 'e7', to: 'e8', promotion: 'n' }));
    expect(knight.san).toBe('e8=N');
    expect(position.after(knight).pieceAt('e8')).toEqual({ color: 'w', type: 'n' });
  });

  it('detects checkmate, stalemate and insufficient material', () => {
    const foolsMate = unwrap(
      Position.fromFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'),
    );
    expect(foolsMate.isCheckmate()).toBe(true);
    expect(foolsMate.outcome()).toEqual({ kind: 'checkmate', winner: 'b' });

    const stalemate = unwrap(Position.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'));
    expect(stalemate.isStalemate()).toBe(true);
    expect(stalemate.outcome()).toEqual({ kind: 'stalemate' });

    const bareKings = unwrap(Position.fromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1'));
    expect(bareKings.outcome()).toEqual({ kind: 'insufficient-material' });
  });

  it('exposes both notations for every move it produces', () => {
    const move = unwrap(Position.initial().playSan('Nf3'));
    expect(move.san).toBe('Nf3');
    expect(move.uci).toBe('g1f3');
    expect(move.piece).toBe('n');
    expect(move.color).toBe('w');
    expect(move.flags.capture).toBe(false);
  });

  it('reports illegal moves instead of throwing', () => {
    const result = Position.initial().playSan('Nf6');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-san');
  });
});
