/**
 * The .cbh file: one 46-byte header record per game, after one 46-byte file
 * header. Game ids are 1-based; record `id` sits at byte `46 * id`.
 */

import { formatChessBaseDate, u16be, u24be, u32be, u8 } from './bytes';
import type { ChessBaseHeader } from './types';

export const HEADER_RECORD_BYTES = 46;

const RESULTS: Record<number, ChessBaseHeader['result']> = {
  0: '0-1',
  1: '1/2-1/2',
  2: '1-0',
  3: '*',
  4: '0-1',
  5: '1/2-1/2',
  6: '1-0',
  7: '*',
};

const ECO_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

/** `0` is unset, `1` is A00 … `500` is E99; values past that are Chess960 start positions. */
function decodeEco(value: number): { eco: string | null; chess960: boolean } {
  const code = value >> 7;
  if (code === 0) return { eco: null, chess960: false };
  if (code > 500) return { eco: null, chess960: true };
  const index = code - 1;
  const letter = ECO_LETTERS[Math.floor(index / 100)];
  if (!letter) return { eco: null, chess960: false };
  return { eco: `${letter}${String(index % 100).padStart(2, '0')}`, chess960: false };
}

export function headerCount(cbh: Uint8Array): number {
  return Math.max(0, Math.floor(cbh.length / HEADER_RECORD_BYTES) - 1);
}

export function readHeader(cbh: Uint8Array, id: number): ChessBaseHeader | null {
  const at = id * HEADER_RECORD_BYTES;
  if (id < 1 || at + HEADER_RECORD_BYTES > cbh.length) return null;
  const record = cbh.subarray(at, at + HEADER_RECORD_BYTES);
  const flags = u8(record, 0);
  const text = (flags & 0x02) !== 0;
  const deleted = (flags & 0x80) !== 0;
  if (text) {
    return {
      id,
      text,
      deleted,
      movesOffset: u32be(record, 1),
      annotationsOffset: 0,
      whiteId: -1,
      blackId: -1,
      tournamentId: u24be(record, 7),
      annotatorId: u24be(record, 13),
      sourceId: u24be(record, 10),
      date: null,
      result: '*',
      lineEvaluation: 0,
      round: u8(record, 16),
      subround: u8(record, 17),
      whiteElo: 0,
      blackElo: 0,
      eco: null,
      chess960: false,
      annotationFlags: u32be(record, 18),
      moves: 0,
    };
  }
  const { eco, chess960 } = decodeEco(u16be(record, 35));
  return {
    id,
    text,
    deleted,
    movesOffset: u32be(record, 1),
    annotationsOffset: u32be(record, 5),
    whiteId: u24be(record, 9),
    blackId: u24be(record, 12),
    tournamentId: u24be(record, 15),
    annotatorId: u24be(record, 18),
    sourceId: u24be(record, 21),
    date: formatChessBaseDate(u24be(record, 24)),
    result: RESULTS[u8(record, 27)] ?? '*',
    lineEvaluation: u8(record, 28),
    round: u8(record, 29),
    subround: u8(record, 30),
    whiteElo: u16be(record, 31),
    blackElo: u16be(record, 33),
    eco,
    chess960,
    annotationFlags: u32be(record, 39),
    moves: u8(record, 45),
  };
}
