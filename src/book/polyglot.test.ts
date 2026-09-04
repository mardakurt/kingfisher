import { describe, expect, it } from 'vitest';

import { Position } from '@/chess/position';
import { asFen } from '@/chess/types';

import { decodeMove, lookupPolyglot, looksLikePolyglot, polyglotKey } from './polyglot';
import { POLYGLOT_INITIAL_KEY, POLYGLOT_RANDOM } from './polyglot-constants.generated';

/**
 * The Polyglot specification publishes worked keys for a handful of positions,
 * which is the only way an implementation of a hash can be checked at all —
 * there is no partial credit with a Zobrist key, it is either the same number
 * as everybody else computes or the book reads nothing.
 *
 * These are those positions, copied from the specification's own table.
 */
const PUBLISHED: readonly (readonly [string, bigint])[] = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 0x463b96181691fc9cn],
  ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 0x823c9b50fd114196n],
  ['rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', 0x0756b94461c50fb0n],
  ['rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2', 0x662fafb965db29d4n],
  ['rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', 0x22a48b5a8e47ff78n],
  ['rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPPKPPP/RNBQ1BNR b kq - 0 3', 0x652a607ca3f242c1n],
  ['rnbq1bnr/ppp1pkpp/8/3pPp2/8/8/PPPPKPPP/RNBQ1BNR w - - 0 4', 0x00fdd303c946bdd9n],
  ['rnbqkbnr/p1pppppp/8/8/PpP4P/8/1P1PPPP1/RNBQKBNR b KQkq c3 0 3', 0x3c8123ea7b067637n],
  ['rnbqkbnr/p1pppppp/8/8/P6P/R1p5/1P1PPPP1/1NBQKBNR b Kkq - 0 4', 0x5c3f9b829b279560n],
];

describe('the Polyglot Zobrist key', () => {
  it('has the 781 constants the format is defined by', () => {
    expect(POLYGLOT_RANDOM).toHaveLength(781);
    expect(POLYGLOT_INITIAL_KEY).toBe(0x463b96181691fc9cn);
  });

  it.each(PUBLISHED)('matches the published key for %s', (fen, expected) => {
    expect(polyglotKey(asFen(fen))).toBe(expected);
  });

  /**
   * The rule everyone gets wrong. A FEN names the en-passant square after any
   * double push; Polyglot hashes it only when a pawn of the side to move is
   * actually beside the pushed pawn and could make the capture. Two of the
   * published positions above exist precisely to pin this down, and this makes
   * the reason explicit.
   */
  it('hashes the en-passant file only when the capture is really available', () => {
    // 1.e4 — nothing of Black's can take on e3, so the file is not hashed.
    const noCapture = asFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    const withoutSquare = asFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(polyglotKey(noCapture)).toBe(polyglotKey(withoutSquare));

    // …2.e5 f5, where exf6 is available: now the file changes the key.
    const capture = asFen('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
    const stripped = asFen('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3');
    expect(polyglotKey(capture)).not.toBe(polyglotKey(stripped));
  });

  it('returns zero rather than throwing on a FEN it cannot read', () => {
    expect(polyglotKey('not a fen')).toBe(0n);
  });
});

describe('the packed move', () => {
  const pack = (from: string, to: string, promotion = 0) => {
    const file = (square: string) => square.charCodeAt(0) - 97;
    const rank = (square: string) => Number(square[1]) - 1;
    return (promotion << 12) | (rank(from) << 9) | (file(from) << 6) | (rank(to) << 3) | file(to);
  };

  it('unpacks an ordinary move', () => {
    expect(decodeMove(pack('e2', 'e4'), 0n)).toBe('e2e4');
    expect(decodeMove(pack('g8', 'f6'), 0n)).toBe('g8f6');
  });

  it('unpacks a promotion', () => {
    expect(decodeMove(pack('a7', 'a8', 4), 0n)).toBe('a7a8q');
    expect(decodeMove(pack('a7', 'a8', 1), 0n)).toBe('a7a8n');
  });

  /**
   * Polyglot stores castling as the king capturing its own rook. `e1h1` is not
   * a move anybody can play, so a reader that passes it through produces a
   * book move the board rejects — which looks like a corrupt book.
   */
  it('translates king-takes-rook castling into the move that can be played', () => {
    expect(decodeMove(pack('e1', 'h1'), 0n)).toBe('e1g1');
    expect(decodeMove(pack('e1', 'a1'), 0n)).toBe('e1c1');
    expect(decodeMove(pack('e8', 'h8'), 0n)).toBe('e8g8');
    expect(decodeMove(pack('e8', 'a8'), 0n)).toBe('e8c8');
  });

  it('produces castling moves the rules code accepts', () => {
    const position = Position.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(position.ok).toBe(true);
    if (!position.ok) return;
    for (const packed of [pack('e1', 'h1'), pack('e1', 'a1')]) {
      expect(position.value.playUci(decodeMove(packed, 0n)).ok).toBe(true);
    }
  });
});

/** A book file, built the way the format says, so the reader can be tested. */
function book(entries: readonly { key: bigint; move: number; weight: number }[]): DataView {
  const sorted = [...entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const buffer = new ArrayBuffer(sorted.length * 16);
  const view = new DataView(buffer);
  sorted.forEach((entry, index) => {
    view.setBigUint64(index * 16, entry.key, false);
    view.setUint16(index * 16 + 8, entry.move, false);
    view.setUint16(index * 16 + 10, entry.weight, false);
    view.setUint32(index * 16 + 12, 0, false);
  });
  return view;
}

describe('reading a book file', () => {
  const move = 0x1c4; // e2e4, packed.

  it('finds every entry for a key, heaviest first', () => {
    const view = book([
      { key: 1n, move, weight: 5 },
      { key: 5n, move, weight: 10 },
      { key: 5n, move: 0x1c5, weight: 90 },
      { key: 9n, move, weight: 1 },
    ]);
    const found = lookupPolyglot(view, 5n);
    expect(found).toHaveLength(2);
    expect(found[0]?.weight).toBe(90);
    expect(found[1]?.weight).toBe(10);
  });

  it('finds nothing for a key the book does not have', () => {
    expect(lookupPolyglot(book([{ key: 1n, move, weight: 5 }]), 2n)).toEqual([]);
  });

  it('finds the first and last entries, which a binary search can miss', () => {
    const view = book([
      { key: 1n, move, weight: 1 },
      { key: 2n, move, weight: 2 },
      { key: 3n, move, weight: 3 },
      { key: 4n, move, weight: 4 },
    ]);
    expect(lookupPolyglot(view, 1n)).toHaveLength(1);
    expect(lookupPolyglot(view, 4n)).toHaveLength(1);
  });

  it('reads an empty book as empty rather than failing', () => {
    expect(lookupPolyglot(new DataView(new ArrayBuffer(0)), 1n)).toEqual([]);
  });

  it('recognises a real book and refuses a file that is not one', () => {
    expect(looksLikePolyglot(book([{ key: 1n, move, weight: 1 }]))).toBe(true);
    // Not a multiple of the entry size.
    expect(looksLikePolyglot(new DataView(new ArrayBuffer(17)))).toBe(false);
    // Right size, wrong order: a book is sorted by key.
    const unsorted = new DataView(new ArrayBuffer(32));
    unsorted.setBigUint64(0, 9n, false);
    unsorted.setBigUint64(16, 1n, false);
    expect(looksLikePolyglot(unsorted)).toBe(false);
  });
});
