/**
 * Byte-level readers for the ChessBase file family.
 *
 * The .cbh and .cbg files are big-endian; the entity files (.cbp, .cbt, .cbc,
 * .cbs, .cbe) are little-endian. Both conventions live here so a reader names
 * which one it means at every call and never guesses.
 */

export const u8 = (bytes: Uint8Array, offset: number): number => bytes[offset] ?? 0;

export const u16be = (bytes: Uint8Array, offset: number): number =>
  (u8(bytes, offset) << 8) | u8(bytes, offset + 1);

export const u24be = (bytes: Uint8Array, offset: number): number =>
  (u8(bytes, offset) << 16) | (u8(bytes, offset + 1) << 8) | u8(bytes, offset + 2);

export const u32be = (bytes: Uint8Array, offset: number): number =>
  ((u8(bytes, offset) << 24) >>> 0) +
  ((u8(bytes, offset + 1) << 16) | (u8(bytes, offset + 2) << 8) | u8(bytes, offset + 3));

export const u16le = (bytes: Uint8Array, offset: number): number =>
  u8(bytes, offset) | (u8(bytes, offset + 1) << 8);

export const u32le = (bytes: Uint8Array, offset: number): number =>
  (u8(bytes, offset) |
    (u8(bytes, offset + 1) << 8) |
    (u8(bytes, offset + 2) << 16) |
    (u8(bytes, offset + 3) << 24)) >>>
  0;

export const i32le = (bytes: Uint8Array, offset: number): number => u32le(bytes, offset) | 0;

/** Signed 24-bit big-endian, used by annotation positions (-1 = the whole game). */
export const i24be = (bytes: Uint8Array, offset: number): number => {
  const value = u24be(bytes, offset);
  return value >= 0x800000 ? value - 0x1000000 : value;
};

/**
 * A ChessBase date: day in bits 0–4, month in 5–8, year in 9–20, each `0`
 * when unknown. Rendered the way PGN wants an incomplete date.
 */
export function formatChessBaseDate(value: number): string | null {
  const day = value & 31;
  const month = (value >> 5) & 15;
  const year = (value >> 9) & 4095;
  if (year === 0 && month === 0 && day === 0) return null;
  const yyyy = year === 0 ? '????' : String(year).padStart(4, '0');
  const mm = month === 0 ? '??' : String(month).padStart(2, '0');
  const dd = day === 0 ? '??' : String(day).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

const windows1252 = new TextDecoder('windows-1252');
const utf8Strict = new TextDecoder('utf-8', { fatal: true });

/**
 * A fixed-width, zero-terminated string field.
 *
 * ChessBase wrote single-byte text — ISO-8859-1 on paper, Windows-1252 in
 * practice, since the program runs on Windows and the two differ only in
 * the 0x80–0x9F range where 1252 has the characters people actually type.
 * Whatever follows the terminator inside the field is uninitialised memory
 * and is never read.
 */
export function fixedString(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const limit = Math.min(offset + length, bytes.length);
  while (end < limit && bytes[end] !== 0) end += 1;
  return windows1252.decode(bytes.subarray(offset, end)).trim();
}

/**
 * Free text of a known length: UTF-8 when the bytes are valid UTF-8 (newer
 * databases carry it), Windows-1252 otherwise. A comment is never dropped
 * for its encoding.
 */
export function text(bytes: Uint8Array): string {
  try {
    return utf8Strict.decode(bytes);
  } catch {
    return windows1252.decode(bytes);
  }
}
