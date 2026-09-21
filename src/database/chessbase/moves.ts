/**
 * Reading ChessBase movetext (.cbg).
 *
 * A game is a byte stream. Most moves are one byte naming a piece *by slot*
 * ("the second rook", "the d-pawn") and a relative displacement; promotions and
 * pieces past the third of their kind take three bytes; 254 opens a variation
 * and 255 closes one. Each byte is obfuscated by the count of moves decoded so
 * far and a fixed permutation (`table.ts`). The layout is the one documented
 * with `morphy`, and the reader is checked against a database ChessBase itself
 * wrote (`moves.test.ts`).
 *
 * Nothing here trusts the bytes. Every move the stream names is played through
 * Kingfisher's own rules, and a move that is not legal in the position the
 * stream has reached fails the game rather than being repaired: a slot table
 * that has drifted by one produces moves that are legal, plausible and wrong,
 * and the only defence is to refuse to guess.
 *
 * Only encoding mode 0 — regular chess, the compact encoder — is read. The
 * other modes are chess variants, or need further permutation tables for a
 * vanishing share of games; they are reported, not decoded. Chess960 is
 * refused by rule (AGENTS.md).
 */

import { Position } from '@/chess/position';
import type { ChessMove, Color, Fen, PieceType, PromotionPiece } from '@/chess/types';

import { u24be, u8 } from './bytes';
import { MODE_0_DECRYPT } from './table';

export interface MoveNode {
  /** Position in the stream, root = 0; what an annotation refers to. */
  readonly index: number;
  readonly move: ChessMove | null;
  readonly before: Fen;
  readonly children: MoveNode[];
  /** A null move in the source; nothing after it in this line can be kept. */
  readonly nullMove: boolean;
}

export interface DecodedMoves {
  readonly ok: true;
  readonly root: MoveNode;
  /** Every node by stream index; index 0 is the root. */
  readonly nodes: readonly MoveNode[];
  readonly setup: Fen | null;
  readonly issues: readonly string[];
}

export interface MovesFailure {
  readonly ok: false;
  readonly reason: string;
}

export type MovesResult = DecodedMoves | MovesFailure;

const OPCODE_NULL = 0;
const OPCODE_TWO_BYTES = 235;
const OPCODE_IGNORE = 236;
const OPCODE_START = 254;
const OPCODE_END = 255;

type Slotted = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

interface OpcodeRange {
  readonly piece: Slotted;
  readonly opcode: number;
  readonly slot: number;
}

const RANGES: readonly OpcodeRange[] = [
  { piece: 'k', opcode: 1, slot: 0 },
  { piece: 'q', opcode: 11, slot: 0 },
  { piece: 'r', opcode: 39, slot: 0 },
  { piece: 'r', opcode: 53, slot: 1 },
  { piece: 'b', opcode: 67, slot: 0 },
  { piece: 'b', opcode: 81, slot: 1 },
  { piece: 'n', opcode: 95, slot: 0 },
  { piece: 'n', opcode: 103, slot: 1 },
  { piece: 'p', opcode: 111, slot: 0 },
  { piece: 'p', opcode: 115, slot: 1 },
  { piece: 'p', opcode: 119, slot: 2 },
  { piece: 'p', opcode: 123, slot: 3 },
  { piece: 'p', opcode: 127, slot: 4 },
  { piece: 'p', opcode: 131, slot: 5 },
  { piece: 'p', opcode: 135, slot: 6 },
  { piece: 'p', opcode: 139, slot: 7 },
  { piece: 'q', opcode: 143, slot: 1 },
  { piece: 'q', opcode: 171, slot: 2 },
  { piece: 'r', opcode: 199, slot: 2 },
  { piece: 'b', opcode: 213, slot: 2 },
  { piece: 'n', opcode: 227, slot: 2 },
];

interface OpcodeMeaning {
  readonly piece: Slotted;
  readonly slot: number;
  readonly offset: number;
}

const OPCODES: readonly (OpcodeMeaning | null)[] = (() => {
  const table: (OpcodeMeaning | null)[] = new Array<OpcodeMeaning | null>(256).fill(null);
  for (let op = 1; op < OPCODE_TWO_BYTES; op += 1) {
    let range = RANGES[0]!;
    for (const candidate of RANGES) if (candidate.opcode <= op) range = candidate;
    table[op] = { piece: range.piece, slot: range.slot, offset: op - range.opcode };
  }
  return table;
})();

/** (dx, dy) for king offsets 0–7 and knight offsets 0–7. */
const KING_STEPS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];
const KNIGHT_STEPS: readonly (readonly [number, number])[] = [
  [2, 1],
  [1, 2],
  [-1, 2],
  [-2, 1],
  [-2, -1],
  [-1, -2],
  [1, -2],
  [2, -1],
];

const SLOTS: Readonly<Record<Slotted, number>> = { k: 1, q: 3, r: 3, b: 3, n: 3, p: 8 };
const PROMOTIONS: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];

/** ChessBase square index: a1 = 0, a2 = 1 … a8 = 7, b1 = 8 … h8 = 63. */
const sqi = (file: number, rank: number): number => file * 8 + rank;
const squareName = (index: number): string =>
  `${'abcdefgh'[Math.floor(index / 8)]}${'12345678'[index % 8]}`;
const squareIndexOf = (square: string): number =>
  sqi(square.charCodeAt(0) - 97, square.charCodeAt(1) - 49);

/**
 * Where each addressable piece stands, by colour, type and slot.
 *
 * The slots are the format's own idea of identity: the pieces of one kind are
 * numbered in board-scan order at the start, a capture shifts the later ones
 * down, a promotion takes the first free slot, and pawns keep their slot for
 * life. Kept as a flat array and copied on every move so a variation can be
 * abandoned by dropping a reference.
 */
class Slots {
  private constructor(private readonly at: Int8Array) {}

  static fromPosition(position: Position): Slots {
    const at = new Int8Array(2 * 21).fill(-1);
    const board = position.board();
    for (let index = 0; index < 64; index += 1) {
      const file = Math.floor(index / 8);
      const rank = index % 8;
      const piece = board[rank * 8 + file];
      if (!piece) continue;
      const base = Slots.base(piece.color, piece.type as Slotted);
      const count = SLOTS[piece.type as Slotted];
      for (let slot = 0; slot < count; slot += 1) {
        if (at[base + slot] === -1) {
          at[base + slot] = index;
          break;
        }
      }
    }
    return new Slots(at);
  }

  private static base(color: Color, piece: Slotted): number {
    const offsets: Record<Slotted, number> = { k: 0, q: 1, r: 4, b: 7, n: 10, p: 13 };
    return (color === 'w' ? 0 : 21) + offsets[piece];
  }

  square(color: Color, piece: Slotted, slot: number): number {
    if (slot < 0 || slot >= SLOTS[piece]) return -1;
    return this.at[Slots.base(color, piece) + slot] ?? -1;
  }

  private slotOf(color: Color, piece: Slotted, square: number): number {
    const base = Slots.base(color, piece);
    for (let slot = 0; slot < SLOTS[piece]; slot += 1)
      if (this.at[base + slot] === square) return slot;
    return -1;
  }

  /** The table after `move`, which was legal in the position it came from. */
  after(move: ChessMove): Slots {
    const at = new Int8Array(this.at);
    const next = new Slots(at);
    const color = move.color;
    const piece = move.piece as Slotted;
    const from = squareIndexOf(move.from);
    const to = squareIndexOf(move.to);
    const slot = this.slotOf(color, piece, from);
    if (slot >= 0) at[Slots.base(color, piece) + slot] = to;

    if (move.promotion && piece === 'p') {
      if (slot >= 0) at[Slots.base(color, piece) + slot] = -1;
      const base = Slots.base(color, move.promotion);
      for (let candidate = 0; candidate < SLOTS[move.promotion]; candidate += 1) {
        if (at[base + candidate] === -1) {
          at[base + candidate] = to;
          break;
        }
      }
    }

    if (move.flags.kingsideCastle || move.flags.queensideCastle) {
      const rank = color === 'w' ? 0 : 7;
      const rookFrom = sqi(move.flags.kingsideCastle ? 7 : 0, rank);
      const rookTo = sqi(move.flags.kingsideCastle ? 5 : 3, rank);
      const rookSlot = this.slotOf(color, 'r', rookFrom);
      if (rookSlot >= 0) at[Slots.base(color, 'r') + rookSlot] = rookTo;
    }

    if (move.captured) {
      const victim: Color = color === 'w' ? 'b' : 'w';
      const captured = move.captured as Slotted;
      const square = move.flags.enPassant
        ? sqi(move.to.charCodeAt(0) - 97, move.from.charCodeAt(1) - 49)
        : to;
      const base = Slots.base(victim, captured);
      const count = SLOTS[captured];
      if (captured === 'p') {
        const pawn = this.slotOf(victim, 'p', square);
        if (pawn >= 0) at[base + pawn] = -1;
      } else {
        let write = base;
        for (let read = base; read < base + count; read += 1) {
          if (at[read] !== square) at[write++] = at[read]!;
        }
        while (write < base + count) at[write++] = -1;
      }
    }
    return next;
  }
}

interface Intent {
  readonly from: number;
  readonly to: number;
  readonly promotion?: PromotionPiece;
}

function singleByteIntent(
  opcode: number,
  slots: Slots,
  turn: Color,
): Intent | { readonly error: string } {
  const meaning = OPCODES[opcode];
  if (!meaning) return { error: `opcode ${opcode} has no meaning` };
  const from = slots.square(turn, meaning.piece, meaning.slot);
  if (from < 0) return { error: `no ${meaning.piece} in slot ${meaning.slot} for ${turn}` };
  const file = Math.floor(from / 8);
  const rank = from % 8;
  const offset = meaning.offset;
  switch (meaning.piece) {
    case 'k': {
      if (offset === 8)
        return { from: sqi(4, turn === 'w' ? 0 : 7), to: sqi(6, turn === 'w' ? 0 : 7) };
      if (offset === 9)
        return { from: sqi(4, turn === 'w' ? 0 : 7), to: sqi(2, turn === 'w' ? 0 : 7) };
      const step = KING_STEPS[offset];
      if (!step) return { error: `king offset ${offset}` };
      return { from, to: sqi((file + step[0] + 8) % 8, (rank + step[1] + 8) % 8) };
    }
    case 'n': {
      const step = KNIGHT_STEPS[offset];
      if (!step) return { error: `knight offset ${offset}` };
      return { from, to: sqi((file + step[0] + 8) % 8, (rank + step[1] + 8) % 8) };
    }
    case 'q':
    case 'r':
    case 'b': {
      const direction = Math.floor(offset / 7) + (meaning.piece === 'b' ? 2 : 0);
      const stride = (offset % 7) + 1;
      switch (direction) {
        case 0:
          return { from, to: sqi(file, (rank + stride) % 8) };
        case 1:
          return { from, to: sqi((file + stride) % 8, rank) };
        case 2:
          return { from, to: sqi((file + stride) % 8, (rank + stride) % 8) };
        case 3:
          return { from, to: sqi((file + stride) % 8, (rank + 8 - stride) % 8) };
        default:
          return { error: `slider direction ${direction}` };
      }
    }
    case 'p': {
      const forward = turn === 'w' ? 1 : -1;
      switch (offset) {
        case 0:
          return { from, to: from + forward };
        case 1:
          return { from, to: from + 2 * forward };
        case 2:
          return { from, to: from + 9 * forward };
        case 3:
          return { from, to: from - 7 * forward };
        default:
          return { error: `pawn offset ${offset}` };
      }
    }
  }
}

function twoByteIntent(value: number, position: Position): Intent | { readonly error: string } {
  const from = value % 64;
  const to = Math.floor(value / 64) % 64;
  if (from === to) return { error: 'a castling move of the Chess960 kind' };
  const piece = position.pieceAt(squareName(from) as ChessMove['from']);
  if (!piece) return { error: `no piece on ${squareName(from)} for a two-byte move` };
  if (piece.type !== 'p') return { from, to };
  const targetRank = to % 8;
  if (targetRank !== 0 && targetRank !== 7) return { from, to };
  const promotion = PROMOTIONS[Math.floor(value / 4096) & 3]!;
  return { from, to, promotion };
}

const START_BYTES = 28;

/** The explicit start position stored before the moves of a game that does not begin at move one. */
function readSetup(
  bytes: Uint8Array,
  at: number,
): { readonly fen: string } | { readonly error: string } {
  if (at + START_BYTES > bytes.length) return { error: 'the start position is cut short' };
  const epFile = (u8(bytes, at + 1) & 15) - 1;
  const blackToMove = (u8(bytes, at + 1) & 16) !== 0;
  const castling = u8(bytes, at + 2);
  const moveNumber = Math.max(1, u8(bytes, at + 3));
  const board: (string | null)[] = new Array<string | null>(64).fill(null);
  let bit = 0;
  const readBit = (): number => {
    const byte = u8(bytes, at + 4 + (bit >> 3));
    const value = (byte >> (7 - (bit & 7))) & 1;
    bit += 1;
    return value;
  };
  const LETTERS = ['', 'k', 'q', 'n', 'b', 'r', 'p'];
  for (let index = 0; index < 64; index += 1) {
    if (readBit() === 0) continue;
    const black = readBit() === 1;
    const kind = (readBit() << 2) | (readBit() << 1) | readBit();
    const letter = LETTERS[kind];
    if (!letter) return { error: `piece code ${kind} in the start position` };
    board[index] = black ? letter : letter.toUpperCase();
  }
  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = board[sqi(file, rank)];
      if (piece) {
        if (empty) row += String(empty);
        empty = 0;
        row += piece;
      } else empty += 1;
    }
    if (empty) row += String(empty);
    ranks.push(row);
  }
  const rights =
    `${castling & 2 ? 'K' : ''}${castling & 1 ? 'Q' : ''}${castling & 8 ? 'k' : ''}${castling & 4 ? 'q' : ''}` ||
    '-';
  const ep = epFile >= 0 ? `${'abcdefgh'[epFile]}${blackToMove ? '3' : '6'}` : '-';
  return {
    fen: `${ranks.join('/')} ${blackToMove ? 'b' : 'w'} ${rights} ${ep} 0 ${moveNumber}`,
  };
}

/**
 * Decode the game whose movetext starts at `offset`.
 *
 * `bytes` is the whole .cbg file; the four-byte game header gives the flags
 * and the byte count, and the decoder never reads past that count.
 */
export function decodeMoves(bytes: Uint8Array, offset: number): MovesResult {
  if (offset < 0 || offset + 4 > bytes.length)
    return { ok: false, reason: 'movetext offset is outside the file' };
  const flags = u8(bytes, offset);
  const size = u24be(bytes, offset + 1);
  const end = Math.min(bytes.length, offset + size);
  const mode = flags & 0x3f;
  if (mode === 10 || mode === 11)
    return { ok: false, reason: 'a Chess960 game, which Kingfisher does not play' };
  if (mode !== 0) return { ok: false, reason: `movetext encoding mode ${mode} is not supported` };
  let at = offset + 4;
  let setup: Fen | null = null;
  let position: Position;
  if (flags & 0x40) {
    const parsed = readSetup(bytes, at);
    if ('error' in parsed) return { ok: false, reason: parsed.error };
    const built = Position.fromFen(parsed.fen);
    if (!built.ok) return { ok: false, reason: `start position rejected: ${built.error.message}` };
    position = built.value;
    setup = position.fen;
    at += START_BYTES;
  } else {
    position = Position.initial();
  }

  const root: MoveNode = {
    index: 0,
    move: null,
    before: position.fen,
    children: [],
    nullMove: false,
  };
  const nodes: MoveNode[] = [root];
  const issues: string[] = [];
  let modifier = 0;
  let current = root;
  let currentPosition: Position | null = position;
  let turn: Color = position.turn;
  let slots = Slots.fromPosition(position);
  const stack: { node: MoveNode; position: Position | null; turn: Color; slots: Slots }[] = [];

  const next = (): number => {
    const key = (u8(bytes, at) - modifier) & 255;
    at += 1;
    return MODE_0_DECRYPT[key]!;
  };

  while (at < end) {
    const opcode = next();
    if (opcode === OPCODE_IGNORE) continue;
    if (opcode > OPCODE_IGNORE && opcode < OPCODE_START) {
      issues.push(`unknown opcode ${opcode} ignored`);
      continue;
    }
    if (opcode === OPCODE_START) {
      stack.push({ node: current, position: currentPosition, turn, slots });
      continue;
    }
    if (opcode === OPCODE_END) {
      const frame = stack.pop();
      if (!frame) break;
      current = frame.node;
      currentPosition = frame.position;
      turn = frame.turn;
      slots = frame.slots;
      continue;
    }

    const index = nodes.length;

    if (opcode === OPCODE_NULL) {
      modifier += 1;
      const node: MoveNode = {
        index,
        move: null,
        before: currentPosition?.fen ?? current.before,
        children: [],
        nullMove: true,
      };
      nodes.push(node);
      current.children.push(node);
      current = node;
      // The side to move changes and nothing else; the rules engine may refuse
      // the result (a king left in check), in which case the rest of this line
      // is decoded for its byte count only and dropped.
      currentPosition = currentPosition ? flipTurn(currentPosition) : null;
      turn = turn === 'w' ? 'b' : 'w';
      continue;
    }

    let intent: Intent | { readonly error: string };
    let described: string;
    if (opcode === OPCODE_TWO_BYTES) {
      if (at + 2 > end) return { ok: false, reason: 'a two-byte move is cut short' };
      const value = next() * 256 + next();
      modifier += 1;
      if (!currentPosition) {
        turn = turn === 'w' ? 'b' : 'w';
        continue;
      }
      intent = twoByteIntent(value, currentPosition);
      described = `two-byte move ${value}`;
    } else {
      if (!currentPosition) {
        // Past a null move the engine could not represent: keep the slot table
        // moving so the stream stays aligned, but nothing can be verified.
        const blind = singleByteIntent(opcode, slots, turn);
        if ('error' in blind) return { ok: false, reason: `after a null move: ${blind.error}` };
        modifier += 1;
        turn = turn === 'w' ? 'b' : 'w';
        continue;
      }
      intent = singleByteIntent(opcode, slots, currentPosition.turn);
      described = `opcode ${opcode}`;
      modifier += 1;
    }
    if ('error' in intent) return { ok: false, reason: `move ${index}: ${intent.error}` };
    if (!currentPosition) {
      turn = turn === 'w' ? 'b' : 'w';
      continue;
    }

    const from = squareName(intent.from) as ChessMove['from'];
    const to = squareName(intent.to) as ChessMove['to'];
    const played = currentPosition.advance(
      intent.promotion ? { from, to, promotion: intent.promotion } : { from, to },
    );
    if (!played.ok) {
      return {
        ok: false,
        reason: `move ${index} (${described}, ${from}${to}) is not legal in ${currentPosition.fen}`,
      };
    }
    const node: MoveNode = {
      index,
      move: played.value.move,
      before: currentPosition.fen,
      children: [],
      nullMove: false,
    };
    nodes.push(node);
    current.children.push(node);
    current = node;
    slots = slots.after(played.value.move);
    currentPosition = played.value.next;
    turn = currentPosition.turn;
  }

  return { ok: true, root, nodes, setup, issues };
}

function flipTurn(position: Position): Position | null {
  const fields = position.fen.split(' ');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[3] = '-';
  const built = Position.fromFen(fields.join(' '));
  return built.ok ? built.value : null;
}

export type { PieceType };
