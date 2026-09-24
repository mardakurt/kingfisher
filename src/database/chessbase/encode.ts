/**
 * Writing ChessBase movetext (.cbg) and annotations (.cba) for one game.
 *
 * The inverse of `moves.ts` and `annotations.ts`, built from the same tables:
 * the slot table, the opcode ranges, the displacement lists and the
 * permutation. A move is named by the slot its piece holds and a
 * displacement when the format allows it, and by its two squares otherwise
 * (a promotion, or a fourth piece of a kind). Variations are written the way
 * ChessBase stores them — every alternative but the last in brackets, the main
 * continuation first — and each move's index in that order is what an
 * annotation refers to.
 *
 * Nothing is trusted here either: `write.test.ts` decodes every stream this
 * writes with the reader and requires the same moves, and reproduces the
 * movetext bytes of databases ChessBase wrote.
 */

import { Position } from '@/chess/position';
import type { Brush, Shape } from '@/chess/annotations';
import type { GameTree, MoveNode as TreeNode, NodeId } from '@/chess/tree/types';
import type { ChessMove, Color } from '@/chess/types';

import {
  KING_STEPS,
  KNIGHT_STEPS,
  OPCODE_END,
  OPCODE_START,
  OPCODE_TWO_BYTES,
  PROMOTIONS,
  RANGES,
  Slots,
  START_BYTES,
  type Slotted,
} from './moves';
import { MODE_0_DECRYPT } from './table';

const ENCRYPT: readonly number[] = (() => {
  const table = new Array<number>(256).fill(0);
  MODE_0_DECRYPT.forEach((value, index) => (table[value] = index));
  return table;
})();

/** ChessBase square index: a1 = 0, a2 = 1 … a8 = 7, b1 = 8 … h8 = 63. */
const cbSquare = (square: string): number =>
  (square.charCodeAt(0) - 97) * 8 + (square.charCodeAt(1) - 49);

/** The first opcode for a piece kind and slot, or null when the format has none. */
function rangeStart(piece: Slotted, slot: number): number | null {
  for (const range of RANGES) if (range.piece === piece && range.slot === slot) return range.opcode;
  return null;
}

/** The single-byte opcode for `move`, or null when it must be written as two squares. */
function singleByteOpcode(move: ChessMove, slots: Slots): number | null {
  if (move.promotion) return null;
  const piece = move.piece as Slotted;
  const from = cbSquare(move.from);
  const to = cbSquare(move.to);
  const slot = slots.slotOf(move.color, piece, from);
  if (slot < 0) return null;
  const start = rangeStart(piece, slot);
  if (start === null) return null;
  const ff = Math.floor(from / 8);
  const fr = from % 8;
  const tf = Math.floor(to / 8);
  const tr = to % 8;
  const df = tf - ff;
  const dr = tr - fr;

  switch (piece) {
    case 'k': {
      if (move.flags.kingsideCastle) return start + 8;
      if (move.flags.queensideCastle) return start + 9;
      const step = KING_STEPS.findIndex(([x, y]) => x === df && y === dr);
      return step < 0 ? null : start + step;
    }
    case 'n': {
      const step = KNIGHT_STEPS.findIndex(([x, y]) => x === df && y === dr);
      return step < 0 ? null : start + step;
    }
    case 'q':
    case 'r':
    case 'b': {
      let direction: number;
      let stride: number;
      if (df === 0) {
        direction = 0;
        stride = (dr + 8) % 8;
      } else if (dr === 0) {
        direction = 1;
        stride = (df + 8) % 8;
      } else if ((df - dr) % 8 === 0) {
        // Four squares along either diagonal reach the same square modulo
        // eight; ChessBase names that move by the first diagonal, and so do we.
        direction = 2;
        stride = (df + 8) % 8;
      } else if (df === -dr) {
        direction = 3;
        stride = (df + 8) % 8;
      } else return null;
      if (piece === 'r' && direction > 1) return null;
      if (piece === 'b') {
        if (direction < 2) return null;
        direction -= 2;
      }
      return start + direction * 7 + (stride - 1);
    }
    case 'p': {
      const forward = move.color === 'w' ? 1 : -1;
      const delta = to - from;
      if (delta === forward) return start;
      if (delta === 2 * forward) return start + 1;
      if (delta === 9 * forward) return start + 2;
      if (delta === -7 * forward) return start + 3;
      return null;
    }
  }
}

/** The 28 bytes before the moves of a game that does not start from the initial position. */
export function setupBytes(fen: string): Uint8Array {
  const [placement = '', turn = 'w', castling = '-', ep = '-', , fullmove = '1'] = fen.split(' ');
  const out = new Uint8Array(START_BYTES);
  out[0] = 1;
  const epFile = ep !== '-' ? ep.charCodeAt(0) - 96 : 0;
  out[1] = epFile | (turn === 'b' ? 16 : 0);
  out[2] =
    (castling.includes('Q') ? 1 : 0) |
    (castling.includes('K') ? 2 : 0) |
    (castling.includes('q') ? 4 : 0) |
    (castling.includes('k') ? 8 : 0);
  out[3] = Math.min(255, Math.max(1, Number(fullmove) || 1));
  const squares = new Array<string | null>(64).fill(null);
  placement.split('/').forEach((row, index) => {
    const rank = 7 - index;
    let file = 0;
    for (const char of row) {
      if (char >= '1' && char <= '8') file += Number(char);
      else {
        squares[file * 8 + rank] = char;
        file += 1;
      }
    }
  });
  const KIND: Record<string, number> = { k: 1, q: 2, n: 3, b: 4, r: 5, p: 6 };
  let bit = 0;
  const write = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i -= 1) {
      if ((value >> i) & 1) out[4 + (bit >> 3)]! |= 0x80 >> (bit & 7);
      bit += 1;
    }
  };
  for (const piece of squares) {
    if (!piece) {
      write(0, 1);
      continue;
    }
    write(1, 1);
    write(piece === piece.toLowerCase() ? 1 : 0, 1);
    write(KIND[piece.toLowerCase()]!, 3);
  }
  return out;
}

export interface EncodedMoves {
  readonly bytes: Uint8Array;
  /** Stream index of every tree node written; the root is 0. */
  readonly index: ReadonlyMap<NodeId, number>;
  /** Full moves in the main line, as the header records them. */
  readonly mainLineMoves: number;
}

/**
 * The movetext record for `tree`: flags, size, the set-up position when the
 * game has one, the obfuscated opcodes and the closing marker.
 */
export function encodeMoves(tree: GameTree): EncodedMoves {
  const root = tree.nodes[tree.rootId]!;
  const start = Position.fromFen(tree.startFen);
  if (!start.ok) throw new Error(`the start position is not playable: ${start.error.message}`);
  const initial =
    tree.startFen.split(' ').slice(0, 4).join(' ') ===
    Position.initial().fen.split(' ').slice(0, 4).join(' ');

  const body: number[] = [];
  const index = new Map<NodeId, number>([[tree.rootId, 0]]);
  let modifier = 0;
  let next = 1;
  const put = (opcode: number) => body.push((ENCRYPT[opcode]! + modifier) & 255);

  const writeMove = (node: TreeNode, slots: Slots): Slots => {
    const move = node.move!;
    const opcode = singleByteOpcode(move, slots);
    if (opcode !== null) put(opcode);
    else {
      const promotion = move.promotion ? PROMOTIONS.indexOf(move.promotion) : 0;
      const value = cbSquare(move.from) + cbSquare(move.to) * 64 + promotion * 4096;
      put(OPCODE_TWO_BYTES);
      put(value >> 8);
      put(value & 255);
    }
    modifier += 1;
    index.set(node.id, next);
    next += 1;
    return slots.after(move);
  };

  /** A line from `from`: each branch point's alternatives but the last bracketed. */
  const writeLine = (from: TreeNode, fromSlots: Slots): void => {
    let node = from;
    let slots = fromSlots;
    while (node.children.length > 0) {
      const children = node.children.map((id) => tree.nodes[id]!);
      for (const child of children.slice(0, -1)) {
        put(OPCODE_START);
        writeLine(child, writeMove(child, slots));
        put(OPCODE_END);
      }
      const last = children[children.length - 1]!;
      slots = writeMove(last, slots);
      node = last;
    }
  };

  writeLine(root, Slots.fromPosition(start.value));
  put(OPCODE_END);

  const setup = initial ? null : setupBytes(tree.startFen);
  const size = 4 + (setup?.length ?? 0) + body.length;
  if (size > 0xffffff) throw new Error('the game is too long for a ChessBase record');
  const bytes = new Uint8Array(size);
  bytes[0] = setup ? 0x40 : 0;
  bytes[1] = (size >> 16) & 255;
  bytes[2] = (size >> 8) & 255;
  bytes[3] = size & 255;
  if (setup) bytes.set(setup, 4);
  bytes.set(body, 4 + (setup?.length ?? 0));

  let mainLineMoves = 0;
  let cursor = root;
  while (cursor.children[0]) {
    cursor = tree.nodes[cursor.children[0]]!;
    if (cursor.move?.color === 'w' || mainLineMoves === 0) mainLineMoves += 1;
  }
  return { bytes, index, mainLineMoves: Math.min(255, mainLineMoves) };
}

// --- Annotations -------------------------------------------------------------

const TEXT_AFTER = 0x02;
const SYMBOLS = 0x03;
const SQUARES = 0x04;
const ARROWS = 0x05;
const TIME_SPENT = 0x07;
const WHITE_CLOCK = 0x16;
const BLACK_CLOCK = 0x17;
const TEXT_BEFORE = 0x82;

/** ChessBase draws in three colours; blue has no equivalent and is reported, not recoloured. */
const BRUSH_CODES: Partial<Record<Brush, number>> = { green: 2, yellow: 3, red: 4 };

export interface AnnotationLosses {
  /** Blue squares and arrows, which ChessBase cannot draw. */
  blueShapes: number;
  /** Symbols beyond the one move, one position and one prefix symbol ChessBase keeps per move. */
  extraSymbols: number;
}

/** ChessBase's three symbol places: the move's, the position's, and a prefix. */
function symbolBytes(nags: readonly number[], losses: AnnotationLosses): number[] {
  let moveNag = 0;
  let positionNag = 0;
  let prefix = 0;
  for (const nag of nags) {
    if (nag >= 1 && nag <= 9) {
      if (moveNag) losses.extraSymbols += 1;
      else moveNag = nag;
    } else if (nag >= 140 && nag <= 255) {
      if (prefix) losses.extraSymbols += 1;
      else prefix = nag;
    } else if (nag >= 10) {
      if (positionNag) losses.extraSymbols += 1;
      else positionNag = nag;
    } else losses.extraSymbols += 1;
  }
  const bytes = [moveNag, positionNag, prefix];
  while (bytes.length > 0 && bytes[bytes.length - 1] === 0) bytes.pop();
  return bytes;
}

/** Text as ChessBase stores it: Windows-1252 when every character fits, UTF-8 otherwise. */
export function encodeText(value: string): Uint8Array {
  const single = toWindows1252(value);
  return single ?? new TextEncoder().encode(value);
}

const CP1252_HIGH: Readonly<Record<string, number>> = {
  '€': 0x80,
  '‚': 0x82,
  ƒ: 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  ˆ: 0x88,
  '‰': 0x89,
  Š: 0x8a,
  '‹': 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  š: 0x9a,
  '›': 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

/** Windows-1252 bytes, or null when a character has no place in it. */
export function toWindows1252(value: string): Uint8Array | null {
  const out: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) out.push(code);
    else if (CP1252_HIGH[char] !== undefined) out.push(CP1252_HIGH[char]!);
    else return null;
  }
  return Uint8Array.from(out);
}

function shapeBytes(
  shapes: readonly Shape[],
  losses: AnnotationLosses,
): { squares: number[]; arrows: number[] } {
  const squares: number[] = [];
  const arrows: number[] = [];
  for (const shape of shapes) {
    const brush = BRUSH_CODES[shape.brush];
    if (brush === undefined) {
      losses.blueShapes += 1;
      continue;
    }
    if (shape.kind === 'square') squares.push(brush, cbSquare(shape.square) + 1);
    else arrows.push(brush, cbSquare(shape.from) + 1, cbSquare(shape.to) + 1);
  }
  return { squares, arrows };
}

interface AnnotationRecord {
  readonly position: number;
  readonly type: number;
  readonly data: readonly number[] | Uint8Array;
}

function textRecord(position: number, type: number, value: string): AnnotationRecord {
  const encoded = encodeText(value);
  const data = new Uint8Array(2 + encoded.length);
  data.set(encoded, 2);
  return { position, type, data };
}

/**
 * The annotation block for one game, or null when it has none. `gameId` is
 * the game's 1-based number, which the block header repeats.
 */
export function encodeAnnotations(
  tree: GameTree,
  index: ReadonlyMap<NodeId, number>,
  gameId: number,
  losses: AnnotationLosses,
): Uint8Array | null {
  const records: AnnotationRecord[] = [];
  const nodes = [...index.entries()].sort((a, b) => a[1] - b[1]);
  for (const [id, streamIndex] of nodes) {
    const node = tree.nodes[id]!;
    // Position -1 is the game as a whole: the root's comments.
    const position = streamIndex - 1;
    if (node.preComment?.trim())
      records.push(textRecord(position, TEXT_BEFORE, node.preComment.trim()));
    if (node.comment?.trim()) records.push(textRecord(position, TEXT_AFTER, node.comment.trim()));
    if (streamIndex === 0) continue;
    const symbols = symbolBytes(node.nags, losses);
    if (symbols.length) records.push({ position, type: SYMBOLS, data: symbols });
    const { squares, arrows } = shapeBytes(node.shapes, losses);
    if (squares.length) records.push({ position, type: SQUARES, data: squares });
    if (arrows.length) records.push({ position, type: ARROWS, data: arrows });
    if (node.meta.clockSeconds !== undefined) {
      const centiseconds = Math.max(0, Math.round(node.meta.clockSeconds * 100));
      records.push({
        position,
        type: node.move!.color === 'w' ? WHITE_CLOCK : BLACK_CLOCK,
        data: [
          (centiseconds >>> 24) & 255,
          (centiseconds >> 16) & 255,
          (centiseconds >> 8) & 255,
          centiseconds & 255,
        ],
      });
    }
    if (node.meta.elapsedSeconds !== undefined) {
      const seconds = Math.max(0, Math.round(node.meta.elapsedSeconds));
      records.push({
        position,
        type: TIME_SPENT,
        data: [
          Math.min(255, Math.floor(seconds / 3600)),
          Math.floor((seconds % 3600) / 60),
          seconds % 60,
        ],
      });
    }
  }
  if (records.length === 0) return null;

  const HEADER = 14;
  let size = HEADER;
  for (const record of records) size += 6 + record.data.length;
  const out = new Uint8Array(size);
  out[0] = (gameId >> 16) & 255;
  out[1] = (gameId >> 8) & 255;
  out[2] = gameId & 255;
  // Four bytes every block ChessBase wrote in the fixtures carries.
  out.set([0, 0, 0x0e, 0x0e], 3);
  const count = records.length + 1;
  out[7] = (count >> 16) & 255;
  out[8] = (count >> 8) & 255;
  out[9] = count & 255;
  out[10] = (size >>> 24) & 255;
  out[11] = (size >> 16) & 255;
  out[12] = (size >> 8) & 255;
  out[13] = size & 255;
  let at = HEADER;
  for (const record of records) {
    const position = record.position & 0xffffff;
    const recordSize = 6 + record.data.length;
    if (recordSize > 0xffff) throw new Error('an annotation is too long for a ChessBase record');
    out[at] = (position >> 16) & 255;
    out[at + 1] = (position >> 8) & 255;
    out[at + 2] = position & 255;
    out[at + 3] = record.type;
    out[at + 4] = (recordSize >> 8) & 255;
    out[at + 5] = recordSize & 255;
    out.set(record.data, at + 6);
    at += recordSize;
  }
  return out;
}

export type { Color };
