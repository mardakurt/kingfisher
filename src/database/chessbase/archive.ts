/**
 * Reading a ChessBase archive (.cbv).
 *
 * A .cbv is the database's files packed into one: an 8-byte header, a
 * directory of 173-byte entries (a 128-byte name, then the entry's offset,
 * packed size and unpacked size as 32-bit little-endian, and the same again as
 * 64-bit), then each file's data. A file is stored as blocks, each
 * `[u16 length][u16 check][u8 method]` and `length - 1` bytes of payload.
 *
 * Nobody documents the format; this reader was derived by reading archives
 * ChessBase wrote and checking every recovered file against its declared
 * size, and — for the entity files, whose layout is fixed — against the same
 * file stored raw in another archive (`archive.test.ts`). Two block methods
 * are understood:
 *
 *   0  stored — the payload is the file.
 *   1  an LZ77 variant: a 16-bit little-endian flag word covers the next
 *      sixteen items, most significant bit first, a clear bit is a literal
 *      byte and a set bit a token `b0 b1`. With n = b0 >> 4 and
 *      f = (b0 & 15) | (b1 << 4):
 *        n = 0      a run of byte b1, (b0 & 15) + 3 long
 *        n = 1      a run of the next byte, f + 19 long
 *        n = 2      a copy of (next byte + 16) bytes from f + 3 back
 *        n = 3–15   a copy of n bytes from f + 3 back
 *
 *   2  a static Huffman code over bytes: a 16-bit big-endian count of the
 *      bytes it holds, then for each byte value 0–255 a 4-bit code length and
 *      the code itself, then the coded bytes, all most significant bit first.
 *   3  method 2 wrapped around method 1: the Huffman stage yields an LZ
 *      stream, and the count is that stream's length.
 *
 * Files are packed in blocks of 61,440 bytes of plain data; the last block is
 * shorter. The 16-bit field after a block's length is not understood — it is
 * neither a checksum of the payload nor of the plain data under any common
 * scheme — and is not checked. What is checked is stronger: every block must
 * unpack to exactly the size the directory declares, and every LZ stream must
 * be consumed to its last byte.
 *
 * The whole format was derived from archives ChessBase wrote (TWIC's weekly
 * CBV issues, 2016–2026), and confirmed by reading one of 8,895 games back
 * and comparing every game's moves, result and date with the PGN the same
 * publisher issued: all 8,895 agree (`docs/data/chessbase-archive-format.md`).
 */

import { u16le, u32le } from './bytes';

const HEADER_BYTES = 8;
const NAME_BYTES = 128;
const BLOCK_HEADER_BYTES = 5;
const BLOCK_BYTES = 61440;

export interface ArchiveEntry {
  readonly name: string;
  readonly offset: number;
  readonly packedBytes: number;
  readonly bytes: number;
  readonly methods: readonly number[];
}

export interface ArchiveListing {
  readonly entries: readonly ArchiveEntry[];
  /** Methods used anywhere in the archive; anything past 1 cannot be read. */
  readonly methods: readonly number[];
}

export class ArchiveError extends Error {}

const ascii = (bytes: Uint8Array): string => {
  let end = 0;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  return new TextDecoder('windows-1252').decode(bytes.subarray(0, end));
};

function* blocks(data: Uint8Array): IterableIterator<{ method: number; payload: Uint8Array }> {
  let at = 0;
  while (at + BLOCK_HEADER_BYTES <= data.length) {
    const length = u16le(data, at);
    if (length < 1) throw new ArchiveError('a block with no method byte');
    const method = data[at + 4]!;
    const end = at + 4 + length;
    if (end > data.length) throw new ArchiveError('a block runs past the end of its file');
    yield { method, payload: data.subarray(at + BLOCK_HEADER_BYTES, end) };
    at = end;
  }
}

export function listArchive(archive: Uint8Array): ArchiveListing {
  if (archive.length < HEADER_BYTES) throw new ArchiveError('too short to be an archive');
  const count = u16le(archive, 2);
  const entrySize = u16le(archive, 4);
  if (
    entrySize < NAME_BYTES + 12 ||
    count === 0 ||
    HEADER_BYTES + count * entrySize > archive.length
  )
    throw new ArchiveError('not a ChessBase archive');
  const entries: ArchiveEntry[] = [];
  const methods = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const at = HEADER_BYTES + index * entrySize;
    const name = ascii(archive.subarray(at, at + NAME_BYTES));
    const offset = u32le(archive, at + NAME_BYTES);
    const packedBytes = u32le(archive, at + NAME_BYTES + 4);
    const bytes = u32le(archive, at + NAME_BYTES + 8);
    if (offset + packedBytes > archive.length)
      throw new ArchiveError(`${name} runs past the end of the archive`);
    const used: number[] = [];
    for (const block of blocks(archive.subarray(offset, offset + packedBytes))) {
      if (!used.includes(block.method)) used.push(block.method);
      methods.add(block.method);
    }
    entries.push({ name, offset, packedBytes, bytes, methods: used });
  }
  return { entries, methods: [...methods].sort() };
}

/** Method 1, as described above. Throws when the stream is inconsistent with itself. */
export function inflateBlock(payload: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let written = 0;
  let at = 0;
  const copy = (distance: number, length: number): void => {
    if (distance > written) throw new ArchiveError('a copy from before the start of the file');
    for (let i = 0; i < length && written < expected; i += 1) {
      out[written] = out[written - distance]!;
      written += 1;
    }
  };
  const fill = (value: number, length: number): void => {
    for (let i = 0; i < length && written < expected; i += 1) out[written++] = value;
  };
  while (written < expected && at + 1 < payload.length) {
    const flags = payload[at]! | (payload[at + 1]! << 8);
    at += 2;
    for (let bit = 15; bit >= 0 && written < expected && at < payload.length; bit -= 1) {
      if ((flags & (1 << bit)) === 0) {
        out[written++] = payload[at++]!;
        continue;
      }
      if (at + 1 >= payload.length) throw new ArchiveError('a token cut short');
      const b0 = payload[at]!;
      const b1 = payload[at + 1]!;
      at += 2;
      const kind = b0 >> 4;
      const field = (b0 & 15) | (b1 << 4);
      if (kind === 0) fill(b1, (b0 & 15) + 3);
      else if (kind === 1) {
        if (at >= payload.length) throw new ArchiveError('a run cut short');
        fill(payload[at++]!, field + 19);
      } else if (kind === 2) {
        if (at >= payload.length) throw new ArchiveError('a copy cut short');
        copy(field + 3, payload[at++]! + 16);
      } else copy(field + 3, kind);
    }
  }
  if (written !== expected)
    throw new ArchiveError(`unpacked ${written} bytes where ${expected} were declared`);
  if (at !== payload.length)
    throw new ArchiveError(`${payload.length - at} bytes of a packed block were never read`);
  return out;
}

/**
 * Method 2: a static Huffman code, then the coded bytes.
 *
 * The code is read into a binary trie (two Int32Arrays: the child for a 0
 * bit and for a 1 bit, leaves holding the byte value) so decoding walks one
 * bit at a time without building strings.
 */
export function huffmanBlock(payload: Uint8Array): Uint8Array {
  if (payload.length < 2) throw new ArchiveError('a Huffman block with no header');
  const expected = (payload[0]! << 8) | payload[1]!;
  let bit = 16;
  const totalBits = payload.length * 8;
  const readBit = (): number => {
    if (bit >= totalBits) throw new ArchiveError('a Huffman block ended early');
    const value = (payload[bit >> 3]! >> (7 - (bit & 7))) & 1;
    bit += 1;
    return value;
  };
  // At most 511 nodes for 256 leaves; -1 marks no child, values >= 0 in `leaf`.
  const zero = new Int32Array(512).fill(-1);
  const one = new Int32Array(512).fill(-1);
  const leaf = new Int32Array(512).fill(-1);
  let nodes = 1;
  for (let symbol = 0; symbol < 256; symbol += 1) {
    const length = (readBit() << 3) | (readBit() << 2) | (readBit() << 1) | readBit();
    if (length === 0) continue;
    let node = 0;
    for (let i = 0; i < length; i += 1) {
      const branch = readBit() === 0 ? zero : one;
      if (leaf[node] !== -1) throw new ArchiveError('a Huffman code is not prefix-free');
      if (branch[node] === -1) {
        if (nodes >= 512) throw new ArchiveError('a Huffman table with too many nodes');
        branch[node] = nodes;
        nodes += 1;
      }
      node = branch[node]!;
    }
    if (zero[node] !== -1 || one[node] !== -1 || leaf[node] !== -1)
      throw new ArchiveError('a Huffman code is not prefix-free');
    leaf[node] = symbol;
  }
  const out = new Uint8Array(expected);
  for (let written = 0; written < expected; written += 1) {
    let node = 0;
    while (leaf[node] === -1) {
      const next = readBit() === 0 ? zero[node]! : one[node]!;
      if (next === -1) throw new ArchiveError('a Huffman code with no symbol');
      node = next;
    }
    out[written] = leaf[node]!;
  }
  return out;
}

export function extractEntry(archive: Uint8Array, entry: ArchiveEntry): Uint8Array {
  const out = new Uint8Array(entry.bytes);
  let written = 0;
  for (const block of blocks(archive.subarray(entry.offset, entry.offset + entry.packedBytes))) {
    if (block.method === 0) {
      out.set(block.payload.subarray(0, entry.bytes - written), written);
      written += Math.min(block.payload.length, entry.bytes - written);
    } else if (block.method === 1) {
      // A file is packed in blocks of 61,440 bytes; the last one is shorter.
      const part = inflateBlock(block.payload, Math.min(BLOCK_BYTES, entry.bytes - written));
      out.set(part, written);
      written += part.length;
    } else if (block.method === 2) {
      const part = huffmanBlock(block.payload);
      out.set(part.subarray(0, entry.bytes - written), written);
      written += Math.min(part.length, entry.bytes - written);
    } else if (block.method === 3) {
      const stream = huffmanBlock(block.payload);
      const part = inflateBlock(stream, Math.min(BLOCK_BYTES, entry.bytes - written));
      out.set(part, written);
      written += part.length;
    } else {
      throw new ArchiveError(
        `${entry.name} is packed with method ${block.method}, which Kingfisher cannot read yet`,
      );
    }
  }
  if (written !== entry.bytes)
    throw new ArchiveError(`${entry.name}: unpacked ${written} of ${entry.bytes} bytes`);
  return out;
}

/** Every file of the archive, keyed by lower-case extension, or a reason it cannot be read. */
export function unpackArchive(
  archive: Uint8Array,
): { ok: true; name: string; files: Map<string, Uint8Array> } | { ok: false; reason: string } {
  let listing: ArchiveListing;
  try {
    listing = listArchive(archive);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  const unreadable = listing.methods.filter((method) => method > 3);
  if (unreadable.length)
    return {
      ok: false,
      reason: `this archive is packed with compression method${unreadable.length > 1 ? 's' : ''} ${unreadable.join(' and ')}, which Kingfisher does not know; open it in ChessBase or Fritz and use the .cbh files instead`,
    };
  const files = new Map<string, Uint8Array>();
  let name = '';
  try {
    for (const entry of listing.entries) {
      const dot = entry.name.lastIndexOf('.');
      if (dot < 0) continue;
      const extension = entry.name.slice(dot + 1).toLowerCase();
      if (extension === 'cbh') name = entry.name.slice(0, dot);
      files.set(extension, extractEntry(archive, entry));
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  if (!files.has('cbh') || !files.has('cbg'))
    return { ok: false, reason: 'the archive holds no database' };
  return { ok: true, name, files };
}
