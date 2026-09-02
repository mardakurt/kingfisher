import { describe, expect, it } from 'vitest';

import { START_FEN } from './fen';
import {
  SIGNATURE_VERSION,
  SKELETON_VERSION,
  describePawnSkeleton,
  pawnSkeletonCount,
  pawnSkeletonKey,
  structureClaims,
  structureFacts,
  structureOverlap,
  structureSignature,
} from './structure';

/** A position and the same pawns with completely different pieces. */
const CARLSBAD = 'r2q1rk1/pp2bppp/2n1bn2/3p4/3P4/2N1BN2/PP2BPPP/R2Q1RK1 w - - 0 12';
const CARLSBAD_OTHER_PIECES = '3rr1k1/pp2bppp/8/3p4/3P4/8/PP2BPPP/3RR1K1 w - - 0 20';

const facts = (fen: string) => {
  const value = structureFacts(fen);
  if (!value) throw new Error(`unreadable: ${fen}`);
  return value;
};

describe('pawn skeleton key', () => {
  it('reduces the initial position to its eight pawn pairs', () => {
    expect(pawnSkeletonKey(START_FEN)).toBe(`${SKELETON_VERSION}:2|7/2|7/2|7/2|7/2|7/2|7/2|7/2|7`);
    expect(pawnSkeletonCount(pawnSkeletonKey(START_FEN))).toBe(16);
  });

  it('is identical for the same pawns with different pieces', () => {
    expect(pawnSkeletonKey(CARLSBAD)).toBe(pawnSkeletonKey(CARLSBAD_OTHER_PIECES));
  });

  it('ignores side to move, castling rights, en passant and move counters', () => {
    const base = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR';
    expect(pawnSkeletonKey(`${base} w KQkq c6 0 2`)).toBe(pawnSkeletonKey(`${base} b - - 9 40`));
  });

  it('distinguishes a pawn that has actually moved', () => {
    const after = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(pawnSkeletonKey(after)).not.toBe(pawnSkeletonKey(START_FEN));
  });

  it('handles a board with no pawns at all', () => {
    const key = pawnSkeletonKey('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(pawnSkeletonCount(key)).toBe(0);
    expect(describePawnSkeleton(key)).toBe('No pawns');
  });

  it('reports an unreadable FEN rather than throwing', () => {
    expect(pawnSkeletonKey('not a fen')).toBe(`${SKELETON_VERSION}:invalid`);
    expect(pawnSkeletonCount(`${SKELETON_VERSION}:invalid`)).toBe(0);
    expect(describePawnSkeleton(`${SKELETON_VERSION}:invalid`)).toBe('Unreadable position');
  });

  it('describes a skeleton as squares, White upper-case by file', () => {
    // 1.e4 e5 only: every other pawn is still at home.
    const key = pawnSkeletonKey('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(describePawnSkeleton(key)).toContain('e4');
    expect(describePawnSkeleton(key)).toContain('e5');
    expect(describePawnSkeleton(key)).not.toContain('e2');
  });
});

describe('structure facts', () => {
  it('counts the initial position as level and unremarkable', () => {
    const initial = facts(START_FEN);
    expect(initial.whiteIsolated).toEqual([]);
    expect(initial.openFiles).toEqual([]);
    expect(initial.whiteIslands).toBe(1);
    expect(initial.blackIslands).toBe(1);
    expect(initial.materialProfile).toBe('eq');
    expect(initial.materialBalance).toBe(0);
    expect(initial.pawnCount).toBe(16);
    expect(initial.whiteBishopPair).toBe(true);
    expect(initial.blackBishopPair).toBe(true);
    expect(initial.whiteKingSide).toBe('centre');
  });

  it('reads an isolated queen-pawn structure with the c-file open', () => {
    // White has an isolated d4 pawn; both c-files are empty.
    const iqp = facts('r1bq1rk1/pp3ppp/2n1pn2/8/3P4/2N1BN2/PP3PPP/R2QKB1R w KQ - 0 11');
    expect(iqp.whiteIsolated).toEqual(['d']);
    expect(iqp.openFiles).toContain('c');
    expect(iqp.blackIsolated).toEqual([]);
  });

  it('names a material imbalance both ways round the same way', () => {
    const whiteUp = facts('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
    const blackUp = facts('3qk3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(whiteUp.materialProfile).toBe('q+1');
    expect(blackUp.materialProfile).toBe('q-1');
    expect(whiteUp.materialBalance).toBe(9);
    expect(blackUp.materialBalance).toBe(-9);
  });

  it('places kings by wing', () => {
    const castled = facts('r4rk1/pppppppp/8/8/8/8/PPPPPPPP/R4RK1 w - - 0 10');
    expect(castled.whiteKingSide).toBe('kingside');
    expect(castled.blackKingSide).toBe('kingside');
    const queenside = facts('2kr3r/pppppppp/8/8/8/8/PPPPPPPP/2KR3R w - - 0 10');
    expect(queenside.whiteKingSide).toBe('queenside');
    // 'absent' is defensive only: `parseFen` refuses a board with no king, so
    // no FEN reaching this module can produce it.
  });

  it('returns null for a FEN it cannot read', () => {
    expect(structureFacts('nonsense')).toBeNull();
  });
});

describe('structure signature', () => {
  it('is stable and versioned', () => {
    const signature = structureSignature(facts(START_FEN));
    expect(signature.startsWith(`${SIGNATURE_VERSION}:`)).toBe(true);
    expect(structureSignature(facts(START_FEN))).toBe(signature);
  });

  it('separates two positions whose bishop pairs differ, pawns notwithstanding', () => {
    /*
      The signature is not piece-blind, and should not be: a bishop pair is a
      structural fact a player filters on. The *skeleton* is the piece-blind
      identity, and it still matches here — which is the division of labour
      between the two keys.
    */
    expect(pawnSkeletonKey(CARLSBAD)).toBe(pawnSkeletonKey(CARLSBAD_OTHER_PIECES));
    expect(structureSignature(facts(CARLSBAD))).not.toBe(
      structureSignature(facts(CARLSBAD_OTHER_PIECES)),
    );
  });

  it('separates positions whose structure genuinely differs', () => {
    const iqp = facts('r1bq1rk1/pp3ppp/2n1pn2/8/3P4/2N1BN2/PP3PPP/R2QKB1R w KQ - 0 11');
    expect(structureSignature(iqp)).not.toBe(structureSignature(facts(START_FEN)));
  });

  it('does not change when only the piece placement changes', () => {
    const one = facts('r2q1rk1/pp2bppp/2n1bn2/3p4/3P4/2N1BN2/PP2BPPP/R2Q1RK1 w - - 0 12');
    const two = facts('q1r2rk1/pp2bppp/2n1bn2/3p4/3P4/2N1BN2/PP2BPPP/1RR1Q1K1 w - - 0 14');
    expect(structureSignature(one)).toBe(structureSignature(two));
  });
});

describe('structure claims and overlap', () => {
  it('states each structural fact once, as a chess sentence', () => {
    const iqp = facts('r1bq1rk1/pp3ppp/2n1pn2/8/3P4/2N1BN2/PP3PPP/R2QKB1R w KQ - 0 11');
    const labels = structureClaims(iqp).map((claim) => claim.label);
    expect(labels).toContain('White isolated d-pawn');
    expect(labels).toContain('Open c-file');
    expect(labels.filter((label) => label === 'White isolated d-pawn')).toHaveLength(1);
  });

  it('counts what a candidate shares and names what it is missing', () => {
    const query = structureClaims(
      facts('r1bq1rk1/pp3ppp/2n1pn2/8/3P4/2N1BN2/PP3PPP/R2QKB1R w KQ - 0 11'),
    );
    const same = structureOverlap(query, query);
    expect(same.shared).toBe(query.length);
    expect(same.missing).toEqual([]);

    const other = structureOverlap(query, structureClaims(facts(START_FEN)));
    expect(other.shared).toBeLessThan(query.length);
    expect(other.missing).toContain('White isolated d-pawn');
  });
});
