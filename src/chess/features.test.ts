/**
 * Every feature is checked against a position a human can verify by eye.
 *
 * Fixtures are real, nameable structures rather than constructed edge cases
 * wherever possible: an isolated queen's pawn from a Panov, a Carlsbad minority
 * attack, a French pawn chain. If a definition here disagrees with a chess
 * book, that is a bug in the definition, and a named position is what makes
 * the disagreement visible.
 */

import { describe, expect, it } from 'vitest';

import { expect as unwrap } from './result';
import { parseFen, START_FEN } from './fen';
import { positionFeatures, hasImbalance } from './features';
import { asFen } from './types';

const at = (fen: string) => positionFeatures(unwrap(parseFen(asFen(fen))));
const start = () => positionFeatures(unwrap(parseFen(START_FEN)));

describe('the starting position', () => {
  it('has eight pawns on eight files and one island each', () => {
    const features = start();
    expect(features.white.pawns.islands).toBe(1);
    expect(features.black.pawns.islands).toBe(1);
    expect(features.white.pawns.isolated).toEqual([]);
    expect(features.white.pawns.doubled).toEqual([]);
    expect(features.white.pawns.passed).toEqual([]);
  });

  it('has no open or semi-open files', () => {
    const features = start();
    expect(features.white.files.open).toEqual([]);
    expect(features.white.files.semiOpen).toEqual([]);
    expect(features.black.files.semiOpen).toEqual([]);
  });

  it('gives both sides the bishop pair, all castling rights and no castled king', () => {
    const features = start();
    expect(features.white.bishopPair).toBe(true);
    expect(features.black.bishopPair).toBe(true);
    expect(features.white.canCastleKingside).toBe(true);
    expect(features.white.canCastleQueenside).toBe(true);
    expect(features.white.castled).toBe(false);
  });

  it('counts material as equal', () => {
    const features = start();
    expect(features.material.balance).toBe(0);
    expect(hasImbalance(features.material.difference)).toBe(false);
    expect(features.pieceCount).toBe(32);
  });
});

/** Panov–Botvinnik structure: White's d4 pawn has no c- or e-pawn beside it. */
describe('the isolated queen’s pawn', () => {
  const iqp = () => at('r1bqkb1r/pp3ppp/2n2n2/3p4/3P4/2N2N2/PP3PPP/R1BQKB1R w KQkq - 0 8');

  it('names the isolated pawn and nothing else', () => {
    expect(iqp().white.pawns.isolated).toEqual(['d4']);
    expect(iqp().black.pawns.isolated).toEqual(['d5']);
  });

  it('opens the c- and e-files for both sides', () => {
    expect(iqp().white.files.open).toEqual(['c', 'e']);
    expect(iqp().black.files.open).toEqual(['c', 'e']);
  });

  it('splits the pawns into three islands per side', () => {
    /* a2-b2, the lone d-pawn, then f2-g2-h2. */
    expect(iqp().white.pawns.islands).toBe(3);
    expect(iqp().black.pawns.islands).toBe(3);
  });

  it('does not call a blocked isolated pawn passed', () => {
    expect(iqp().white.pawns.passed).toEqual([]);
  });
});

describe('doubled pawns', () => {
  /* Exchange Ruy Lopez: Black's c-pawns after ...dxc6. */
  const exchange = () => at('r1bqkbnr/1pp2ppp/p1p5/4p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 0 5');

  it('lists every pawn on the doubled file, not just the rear one', () => {
    expect([...exchange().black.pawns.doubled].sort()).toEqual(['c6', 'c7']);
  });

  it('counts the file once in the per-file tally', () => {
    expect(exchange().black.pawns.byFile.c).toBe(2);
  });

  it('does not treat a doubled pawn with neighbours as isolated', () => {
    expect(exchange().black.pawns.isolated).toEqual([]);
  });
});

describe('passed pawns', () => {
  it('sees a pawn with no enemy pawn ahead on its own or adjacent files', () => {
    /* White a-pawn is passed; Black's nearest pawns are on f, g, h. */
    const features = at('8/5ppp/8/8/8/8/P4PPP/4k1K1 w - - 0 1');
    expect(features.white.pawns.passed).toEqual(['a2']);
  });

  it('does not call a pawn passed when an enemy pawn stands on an adjacent file ahead', () => {
    const features = at('8/1p6/8/8/8/8/P7/4k1K1 w - - 0 1');
    expect(features.white.pawns.passed).toEqual([]);
  });

  it('ignores an enemy pawn that is behind rather than ahead', () => {
    const features = at('8/8/8/8/P7/1p6/8/4k1K1 w - - 0 1');
    expect(features.white.pawns.passed).toEqual(['a4']);
  });

  it('marks adjacent passed pawns as connected', () => {
    const features = at('8/8/8/8/PP6/8/8/4k1K1 w - - 0 1');
    expect([...features.white.pawns.passed].sort()).toEqual(['a4', 'b4']);
    expect([...features.white.pawns.connectedPassed].sort()).toEqual(['a4', 'b4']);
  });

  it('does not connect passed pawns two files apart', () => {
    const features = at('8/8/8/8/P1P5/8/8/4k1K1 w - - 0 1');
    expect(features.white.pawns.connectedPassed).toEqual([]);
  });
});

describe('backward pawns', () => {
  it('finds a pawn behind its neighbours whose advance square an enemy pawn covers', () => {
    /* White d3 is behind c4/e4; Black's c5 and e5 pawns cover d4. */
    const features = at('4k3/8/8/2p1p3/2P1P3/3P4/8/4K3 w - - 0 1');
    expect(features.white.pawns.backward).toEqual(['d3']);
  });

  it('does not call a pawn backward when nothing covers the square ahead', () => {
    const features = at('4k3/8/8/8/2P1P3/3P4/8/4K3 w - - 0 1');
    expect(features.white.pawns.backward).toEqual([]);
  });

  it('does not call an isolated pawn backward', () => {
    const features = at('4k3/8/8/2p1p3/8/3P4/8/4K3 w - - 0 1');
    expect(features.white.pawns.isolated).toEqual(['d3']);
    expect(features.white.pawns.backward).toEqual([]);
  });
});

describe('pawn islands', () => {
  it('counts consecutive files as one island', () => {
    expect(at('4k3/8/8/8/8/8/PPP2PP1/4K3 w - - 0 1').white.pawns.islands).toBe(2);
  });

  it('counts three separated groups', () => {
    expect(at('4k3/8/8/8/8/8/P1P2P2/4K3 w - - 0 1').white.pawns.islands).toBe(3);
  });

  it('reports zero islands with no pawns', () => {
    expect(at('4k3/8/8/8/8/8/8/4K3 w - - 0 1').white.pawns.islands).toBe(0);
  });
});

describe('open and semi-open files', () => {
  it('separates a file with no pawns from one with only enemy pawns', () => {
    /* White has no d-pawn and no e-pawn; Black has an e-pawn but no d-pawn. */
    const features = at('4k3/4p3/8/8/8/8/PPP2PPP/4K3 w - - 0 1');
    expect(features.white.files.open).toEqual(['d']);
    expect(features.white.files.semiOpen).toEqual(['e']);
  });

  it('is not symmetric: a file is semi-open only for the side without pawns there', () => {
    const features = at('4k3/4p3/8/8/8/8/PPP2PPP/4K3 w - - 0 1');
    expect([...features.black.files.semiOpen].sort()).toEqual(['a', 'b', 'c', 'f', 'g', 'h']);
    expect(features.black.files.open).toEqual(['d']);
  });

  it('places a rook on the open file it stands on', () => {
    const features = at('4k3/4p3/8/8/8/8/PPP2PPP/3RK3 w - - 0 1');
    expect(features.white.rooksOnOpenFiles).toEqual(['d1']);
    expect(features.white.rooksOnSemiOpenFiles).toEqual([]);
  });

  it('places a rook on a semi-open file separately', () => {
    const features = at('4k3/4p3/8/8/8/8/PPP2PPP/4RK2 w - - 0 1');
    expect(features.white.rooksOnSemiOpenFiles).toEqual(['e1']);
    expect(features.white.rooksOnOpenFiles).toEqual([]);
  });
});

describe('the bishop pair', () => {
  it('needs two bishops, not one', () => {
    expect(at('4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1').white.bishopPair).toBe(true);
    expect(at('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1').white.bishopPair).toBe(false);
  });

  it('is asymmetric when one side has traded one off', () => {
    const features = at('2b1k3/8/8/8/8/8/8/2B1KB2 w - - 0 1');
    expect(features.white.bishopPair).toBe(true);
    expect(features.black.bishopPair).toBe(false);
  });
});

describe('material', () => {
  it('reports two minor pieces against a rook as an imbalance, not as a score', () => {
    const features = at('4k3/8/8/8/8/8/8/RN2KB2 w - - 0 1');
    expect(features.material.difference).toEqual({ p: 0, n: 1, b: 1, r: 1, q: 0 });
    expect(hasImbalance(features.material.difference)).toBe(true);
  });

  it('values a queen at nine and a rook at five', () => {
    expect(at('3qk3/8/8/8/8/8/8/3RK3 w - - 0 1').material.balance).toBe(-4);
  });

  it('counts pieces for endgame eligibility, kings included', () => {
    expect(at('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1').pieceCount).toBe(3);
  });
});

describe('the king', () => {
  it('reports a castled king by the rook beside it and the rights being gone', () => {
    const features = at('4k3/8/8/8/8/8/5PPP/5RK1 w - - 0 1');
    expect(features.white.castled).toBe(true);
    expect(features.white.kingSquare).toBe('g1');
  });

  it('does not call a king castled while it still has the right to castle', () => {
    expect(at('4k3/8/8/8/8/8/5PPP/4K2R w K - 0 1').white.castled).toBe(false);
  });

  it('does not call a king castled when it walked to g1 without its rook', () => {
    expect(at('4k3/8/8/8/8/8/5PPP/6K1 w - - 0 1').white.castled).toBe(false);
  });

  it('recognises the queenside castled position', () => {
    expect(at('4k3/8/8/8/8/8/PPP5/2KR4 w - - 0 1').white.castled).toBe(true);
  });

  it('counts the pawns shielding the king', () => {
    expect(at('4k3/8/8/8/8/8/5PPP/5RK1 w - - 0 1').white.kingShieldPawns).toBe(3);
    expect(at('4k3/8/8/8/8/6P1/5P1P/5RK1 w - - 0 1').white.kingShieldPawns).toBe(3);
    expect(at('4k3/8/8/8/8/8/8/5RK1 w - - 0 1').white.kingShieldPawns).toBe(0);
  });

  it('does not count pawns behind the king as a shield', () => {
    expect(at('5rk1/5ppp/8/8/8/8/8/4K3 b - - 0 1').black.kingShieldPawns).toBe(3);
    /* Black king on g2 with its own pawns on the third rank, i.e. behind it. */
    expect(at('8/8/8/8/8/5ppp/6k1/4K3 b - - 0 1').black.kingShieldPawns).toBe(0);
  });
});
