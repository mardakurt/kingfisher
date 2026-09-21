/**
 * Reading ChessBase annotations (.cba).
 *
 * A game's annotations are one block: a 14-byte header, then records of
 * `[position i24][type u8][size u16]` followed by the record's data. The
 * position is the move's index in stream order (`moves.ts`), offset by one so
 * that -1 means the game as a whole. Text, symbols, coloured squares, arrows,
 * clocks and time spent are read; medals, training questions, embedded media
 * and the rest are counted and left behind — there is nothing in a Kingfisher
 * game they could become without inventing something.
 */

import { i24be, text as decodeText, u16be, u24be, u32be, u8 } from './bytes';

export interface NodeAnnotations {
  textBefore: string[];
  textAfter: string[];
  /** Standard PGN NAG numbers. */
  nags: number[];
  /** `Ga1` style: brush letter then square. */
  squares: string[];
  /** `Ge2e4` style. */
  arrows: string[];
  /** Seconds on the mover's clock after the move, when the file recorded one. */
  clockSeconds?: number;
  /** Seconds spent on the move. */
  elapsedSeconds?: number;
}

export interface DecodedAnnotations {
  /** Keyed by stream index; 0 is the game as a whole. */
  readonly byNode: ReadonlyMap<number, NodeAnnotations>;
  /** Annotation types Kingfisher has no place for, by type byte. */
  readonly skipped: ReadonlyMap<number, number>;
  readonly issues: readonly string[];
}

const HEADER_BYTES = 14;
const RECORD_HEADER_BYTES = 6;

const TEXT_AFTER = 0x02;
const SYMBOLS = 0x03;
const SQUARES = 0x04;
const ARROWS = 0x05;
const TIME_SPENT = 0x07;
const WHITE_CLOCK = 0x16;
const BLACK_CLOCK = 0x17;
const TEXT_BEFORE = 0x82;

/** ChessBase colours 2, 3, 4; anything else is drawn green rather than dropped. */
const BRUSHES: Readonly<Record<number, string>> = { 2: 'G', 3: 'Y', 4: 'R' };

/** ChessBase marks a diagram in running text with this byte; it means nothing elsewhere. */
const DIAGRAM_MARK = String.fromCharCode(0x9e);

const squareName = (index: number): string | null =>
  index >= 0 && index < 64 ? `${'abcdefgh'[Math.floor(index / 8)]}${'12345678'[index % 8]}` : null;

const empty = (): NodeAnnotations => ({
  textBefore: [],
  textAfter: [],
  nags: [],
  squares: [],
  arrows: [],
});

function cleanText(raw: string): string {
  return raw.split(DIAGRAM_MARK).join('').replace(/\r\n?/g, '\n').trim();
}

export function decodeAnnotations(cba: Uint8Array, offset: number): DecodedAnnotations {
  const byNode = new Map<number, NodeAnnotations>();
  const skipped = new Map<number, number>();
  const issues: string[] = [];
  if (offset <= 0 || offset + HEADER_BYTES > cba.length) {
    return {
      byNode,
      skipped,
      issues: offset <= 0 ? [] : ['annotation offset is outside the file'],
    };
  }
  const count = u24be(cba, offset + 7) - 1;
  const size = u32be(cba, offset + 10);
  const end = Math.min(cba.length, offset + size);
  let at = offset + HEADER_BYTES;
  const node = (index: number): NodeAnnotations => {
    let entry = byNode.get(index);
    if (!entry) {
      entry = empty();
      byNode.set(index, entry);
    }
    return entry;
  };
  for (let read = 0; read < count && at + RECORD_HEADER_BYTES <= end; read += 1) {
    const index = i24be(cba, at) + 1;
    const type = u8(cba, at + 3);
    const recordSize = u16be(cba, at + 4);
    if (recordSize < RECORD_HEADER_BYTES) {
      issues.push(`annotation ${read} has an impossible size`);
      break;
    }
    const data = cba.subarray(at + RECORD_HEADER_BYTES, Math.min(end, at + recordSize));
    at += recordSize;
    if (index < 0) {
      issues.push(`annotation ${read} refers to a move before the game`);
      continue;
    }
    switch (type) {
      case TEXT_AFTER:
      case TEXT_BEFORE: {
        // Byte 0 is unused, byte 1 the language; every language is kept.
        const value = cleanText(decodeText(data.subarray(2)));
        if (!value) break;
        (type === TEXT_AFTER ? node(index).textAfter : node(index).textBefore).push(value);
        break;
      }
      case SYMBOLS: {
        for (const nag of data) if (nag > 0) node(index).nags.push(nag);
        break;
      }
      case SQUARES: {
        for (let i = 0; i + 1 < data.length; i += 2) {
          const square = squareName(u8(data, i + 1) - 1);
          if (square) node(index).squares.push(`${BRUSHES[u8(data, i)] ?? 'G'}${square}`);
        }
        break;
      }
      case ARROWS: {
        for (let i = 0; i + 2 < data.length; i += 3) {
          const from = squareName(u8(data, i + 1) - 1);
          const to = squareName(u8(data, i + 2) - 1);
          if (from && to) node(index).arrows.push(`${BRUSHES[u8(data, i)] ?? 'G'}${from}${to}`);
        }
        break;
      }
      case TIME_SPENT: {
        if (data.length >= 3)
          node(index).elapsedSeconds = u8(data, 0) * 3600 + u8(data, 1) * 60 + u8(data, 2);
        break;
      }
      case WHITE_CLOCK:
      case BLACK_CLOCK: {
        if (data.length >= 4) node(index).clockSeconds = Math.floor(u32be(data, 0) / 100);
        break;
      }
      default:
        skipped.set(type, (skipped.get(type) ?? 0) + 1);
    }
  }
  return { byNode, skipped, issues };
}
