/**
 * The move decoder at the byte level.
 *
 * Streams here are written by a small encoder built from the same description
 * (opcode tables, the counter, the permutation) so that each rule can be
 * exercised on its own: piece slots shifting after a capture, a promotion as
 * three bytes, nested variations, a null move. That a database ChessBase
 * wrote decodes the same way is `database.test.ts`; that the encoding is the
 * one ChessBase uses was checked outside the repository by re-encoding 421
 * of its games byte for byte (`docs/data/chessbase-archive-format.md`).
 */
import { describe, expect, it } from 'vitest';

import { decodeMoves } from './moves';
import { MODE_0_DECRYPT } from './table';

const ENCRYPT = (() => {
  const table = new Array<number>(256);
  MODE_0_DECRYPT.forEach((value, index) => (table[value] = index));
  return table;
})();

type Op = number | 'start' | 'end' | 'null' | { readonly two: number };

/** Wrap decrypted opcodes as a game: header, obfuscation by move count, end marker. */
function game(opcodes: readonly Op[], setup?: readonly number[]): Uint8Array {
  const body: number[] = [];
  let moves = 0;
  const put = (value: number) => body.push((ENCRYPT[value]! + moves) & 255);
  for (const op of opcodes) {
    if (op === 'start') put(254);
    else if (op === 'end') put(255);
    else if (op === 'null') {
      put(0);
      moves += 1;
    } else if (typeof op === 'object') {
      // A two-byte move: 235 then the value, all under the same counter.
      put(235);
      put(op.two >> 8);
      put(op.two & 255);
      moves += 1;
    } else {
      put(op);
      moves += 1;
    }
  }
  put(255);
  const size = 4 + (setup?.length ?? 0) + body.length;
  return Uint8Array.from([
    setup ? 0x40 : 0,
    (size >> 16) & 255,
    (size >> 8) & 255,
    size & 255,
    ...(setup ?? []),
    ...body,
  ]);
}

const line = (result: ReturnType<typeof decodeMoves>): string[] => {
  if (!result.ok) throw new Error(result.reason);
  const out: string[] = [];
  let node = result.root;
  while (node.children[0]) {
    node = node.children[0];
    out.push(node.move?.san ?? '--');
  }
  return out;
};

// Opcodes from the table in moves.ts: e-pawn two steps = 127 + 1, first knight (b1) (x+1,y+2) = 95 + 1.
const E4 = 128;
const E5 = 128;

describe('decodeMoves', () => {
  it('reads single-byte moves by slot and displacement', () => {
    // 1. e4 e5 2. Nf3 Nc6: g1 = second white knight, offset 2 (x-1, y+2); b8 = first black knight, offset 6 (x+1, y-2).
    const bytes = game([E4, E5, 103 + 2, 95 + 6]);
    expect(line(decodeMoves(bytes, 0))).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('shifts the slots of a colour when one of its pieces is captured', () => {
    // 1. d4 e5 2. dxe5 Nc6 3. Nf3 Nxe5 4. Nxe5. The d-pawn captures to the right (123 + 2);
    // black's c6 knight is its first knight, offset 7 (x+2, y-1); white's f3 knight is the
    // second white knight, offset 2 (x-1, y+2) — and stays the second after black's first
    // knight is gone, because slots shift within a colour only.
    const D4 = 123 + 1;
    const DXE5 = 123 + 2;
    const decoded = line(decodeMoves(game([D4, E5, DXE5, 95 + 6, 103 + 2, 95 + 7, 103 + 2]), 0));
    expect(decoded).toEqual(['d4', 'e5', 'dxe5', 'Nc6', 'Nf3', 'Nxe5', 'Nxe5']);
  });

  it('addresses the surviving piece by its new slot after a capture', () => {
    // 1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. Nb5 Qxb5: white's b1 knight was the first knight;
    // after it is taken, the g1 knight becomes the first, so 5. Nf3 is encoded with the
    // first-knight range (95 + 2), not the second (103 + 2).
    const D5 = 123 + 1;
    const EXD5 = 127 + 3; // e-pawn captures to the left
    const decoded = line(
      decodeMoves(
        game([
          E4,
          D5,
          EXD5,
          11 + 0 * 7 + 4, // Qxd5: d8 → d5 is (x, y-3) = (x, y+5 mod 8): direction 0, stride 5
          95 + 1, // Nc3: b1 knight (x+1, y+2)
          11 + 1 * 7 + 4, // Qa5: d5 → a5 is (x-3, y) = (x+5, y): direction 1, stride 5
          95 + 2, // Nb5: c3 knight (x-1, y+2)
          11 + 1 * 7 + 0, // Qxb5: a5 → b5 is (x+1, y): direction 1, stride 1
          95 + 2, // Nf3 by the *first* knight range: g1 (x-1, y+2)
        ]),
        0,
      ),
    );
    expect(decoded).toEqual(['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'Nb5', 'Qxb5', 'Nf3']);
  });

  it('reads a promotion as a two-byte move, choosing the piece the bytes name', () => {
    // White pawn a7, kings e1 and e8: a7a8 = from square 6, to square 7 (a1 = 0, a2 = 1 …).
    const setup = setupBytes('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const queen = { two: 6 + 7 * 64 + 0 * 4096 };
    const knight = { two: 6 + 7 * 64 + 3 * 4096 };
    expect(line(decodeMoves(game([queen], setup), 0))).toEqual(['a8=Q+']);
    expect(line(decodeMoves(game([knight], setup), 0))).toEqual(['a8=N']);
    const sideways = { two: 6 + 14 * 64 }; // a7 → b7 is not a pawn move
    expect(decodeMoves(game([sideways], setup), 0)).toMatchObject({ ok: false });
  });

  it('reads the set-up position, side to move and castling rights', () => {
    const setup = setupBytes('r3k2r/8/8/8/8/8/8/R3K2R b Kq - 0 40');
    const result = decodeMoves(game([1 + 9], setup), 0); // 40... O-O-O
    if (!result.ok) throw new Error(result.reason);
    expect(result.setup).toBe('r3k2r/8/8/8/8/8/8/R3K2R b Kq - 0 40');
    expect(line(result)).toEqual(['O-O-O']);
  });

  it('nests variations as alternatives to the move they replace', () => {
    // 1. e4 c5 (1... c6 2. d4) 2. Nf3: stream = e4 <start> c5 Nf3 <end> c6 d4 <end>
    const C5 = 119 + 1;
    const C6 = 119;
    const D4 = 123 + 1;
    const result = decodeMoves(game([E4, 'start', C5, 103 + 2, 'end', C6, D4]), 0);
    if (!result.ok) throw new Error(result.reason);
    const afterE4 = result.root.children[0]!;
    expect(afterE4.move!.san).toBe('e4');
    expect(afterE4.children.map((n) => n.move!.san)).toEqual(['c5', 'c6']);
    expect(afterE4.children[0]!.children[0]!.move!.san).toBe('Nf3');
    expect(afterE4.children[1]!.children[0]!.move!.san).toBe('d4');
    // Stream order numbering: root 0, e4 1, c5 2, Nf3 3, c6 4, d4 5.
    expect(result.nodes.map((n) => n.move?.san ?? null)).toEqual([
      null,
      'e4',
      'c5',
      'Nf3',
      'c6',
      'd4',
    ]);
  });

  it('refuses a move that is not legal instead of repairing it', () => {
    // 1. e4 then the "e-pawn two steps" again: e4-e6 is not a move.
    const result = decodeMoves(game([E4, E5, E4]), 0);
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('not legal') });
  });

  it('keeps a null move as a node the PGN will cut at, and stays aligned past it', () => {
    const result = decodeMoves(game([E4, 'null', 103 + 2]), 0);
    if (!result.ok) throw new Error(result.reason);
    const e4 = result.root.children[0]!;
    expect(e4.children[0]!.nullMove).toBe(true);
    expect(e4.children[0]!.children[0]!.move!.san).toBe('Nf3');
  });

  it('refuses Chess960 and unknown encodings by name', () => {
    const bytes = game([E4]);
    bytes[0] = 10;
    expect(decodeMoves(bytes, 0)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Chess960'),
    });
    bytes[0] = 1;
    expect(decodeMoves(bytes, 0)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('mode 1'),
    });
  });
});

/** The 28-byte set-up block for a FEN: flags, castling, move number, then 5-bit pieces in a1,a2… order. */
function setupBytes(fen: string): number[] {
  const [board, turn, castling, ep, , moveNumber] = fen.split(' ');
  const out = new Array<number>(28).fill(0);
  out[0] = 1;
  const epFile = ep && ep !== '-' ? ep.charCodeAt(0) - 96 : 0;
  out[1] = epFile | (turn === 'b' ? 16 : 0);
  out[2] =
    (castling!.includes('Q') ? 1 : 0) |
    (castling!.includes('K') ? 2 : 0) |
    (castling!.includes('q') ? 4 : 0) |
    (castling!.includes('k') ? 8 : 0);
  out[3] = Number(moveNumber);
  const squares: (string | null)[] = new Array<string | null>(64).fill(null);
  board!.split('/').forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else {
        squares[file * 8 + (7 - r)] = ch;
        file += 1;
      }
    }
  });
  let bit = 0;
  const write = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i -= 1) {
      if ((value >> i) & 1) out[4 + (bit >> 3)]! |= 0x80 >> (bit & 7);
      bit += 1;
    }
  };
  const KIND: Record<string, number> = { k: 1, q: 2, n: 3, b: 4, r: 5, p: 6 };
  for (const piece of squares) {
    if (!piece) write(0, 1);
    else {
      write(1, 1);
      write(piece === piece.toLowerCase() ? 1 : 0, 1);
      write(KIND[piece.toLowerCase()]!, 3);
    }
  }
  return out;
}
