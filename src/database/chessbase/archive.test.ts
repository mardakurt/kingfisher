/**
 * The .cbv reader against blocks ChessBase wrote.
 *
 * The packed blocks are the tournament, source, annotation and flags entries
 * of a TWIC archive (event names and a publisher record — facts, not games),
 * each with the file it unpacks to. Between them they use methods 0, 1 and 3.
 * Method 2 has no small real specimen — ChessBase reserves it for the moves
 * file, which is always tens of kilobytes — so it is exercised by a coder
 * written here from the format description, and its real-archive check is
 * recorded in `docs/data/chessbase-archive-format.md`.
 */
import { describe, expect, it } from 'vitest';

import { readTournaments } from './entities';
import { fixtureBytes } from './fixtures';
import { ArchiveError, huffmanBlock, inflateBlock, listArchive, unpackArchive } from './archive';

const packed = (name: string) => fixtureBytes(`archive/twic1600-${name}.packed`);
const plain = (name: string) => fixtureBytes(`archive/twic1600-${name}.plain`);

/** A directory + data image around given packed entries, as ChessBase lays one out. */
function buildArchive(
  entries: readonly { name: string; packed: Uint8Array; bytes: number }[],
): Uint8Array {
  const ENTRY = 173;
  const header = new Uint8Array(8);
  header[0] = 8;
  header[2] = entries.length;
  header[4] = ENTRY;
  header[6] = 3;
  const directory = new Uint8Array(entries.length * ENTRY);
  let offset = 8 + directory.length;
  const chunks: Uint8Array[] = [header, directory];
  entries.forEach((entry, index) => {
    const at = index * ENTRY;
    directory.set(new TextEncoder().encode(entry.name), at);
    const view = new DataView(directory.buffer, at + 128);
    view.setUint32(0, offset, true);
    view.setUint32(4, entry.packed.length, true);
    view.setUint32(8, entry.bytes, true);
    chunks.push(entry.packed);
    offset += entry.packed.length;
  });
  const out = new Uint8Array(offset);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

describe('packed blocks ChessBase wrote', () => {
  it.each([
    ['cba', 0],
    ['flags', 0],
    ['cbs', 1],
    ['cbt', 3],
  ])('unpacks the %s entry (method %i) byte for byte', (name, method) => {
    const archive = buildArchive([
      { name: `x.${name}`, packed: packed(name), bytes: plain(name).length },
    ]);
    const listing = listArchive(archive);
    expect(listing.entries[0]!.methods).toEqual([method]);
    const result = unpackArchive(
      buildArchive([
        { name: 'x.cbh', packed: packed('cba'), bytes: 26 },
        { name: 'x.cbg', packed: packed('cba'), bytes: 26 },
        { name: `x.${name}`, packed: packed(name), bytes: plain(name).length },
      ]),
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.files.get(name)).toEqual(plain(name));
  });

  it('reads the tournament index it unpacked as tournaments', () => {
    const tournaments = readTournaments(plain('cbt'));
    expect(tournaments.count).toBe(54);
    expect(tournaments.records[0]).toMatchObject({
      title: 'SuperUnited CRO Rapid 2025',
      place: 'Zagreb CRO',
    });
  });

  it('refuses a stream that stops short of the declared size', () => {
    const block = packed('cbt');
    const payload = block.subarray(5, block.length - 40);
    expect(() => inflateBlock(huffmanBlock(payload).subarray(0, 4000), 5378)).toThrow(ArchiveError);
  });

  it('refuses a stream that leaves bytes unread', () => {
    const stream = inflateBlock; // method 1 grammar
    const short = packed('cbs').subarray(5);
    const longer = new Uint8Array(short.length + 3);
    longer.set(short);
    expect(() => stream(longer, 168)).toThrow(/never read/);
  });
});

/** Method 2 written from the description in `archive.ts`: a table of lengths and codes, then codes. */
function huffmanEncode(data: Uint8Array, codes: ReadonlyMap<number, string>): Uint8Array {
  let bits = `${data.length.toString(2).padStart(16, '0')}`;
  for (let symbol = 0; symbol < 256; symbol += 1) {
    const code = codes.get(symbol) ?? '';
    bits += code.length.toString(2).padStart(4, '0') + code;
  }
  for (const byte of data) bits += codes.get(byte)!;
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i += 1)
    if (bits[i] === '1') out[i >> 3] = out[i >> 3]! | (0x80 >> (i & 7));
  return out;
}

describe('method 2', () => {
  const codes = new Map<number, string>([
    [0x41, '0'],
    [0x42, '10'],
    [0x43, '110'],
    [0x00, '111'],
  ]);
  const data = new TextEncoder().encode('ABACABA\0\0CAB');

  it('decodes what a static Huffman coder of the described shape produces', () => {
    expect(huffmanBlock(huffmanEncode(data, codes))).toEqual(data);
  });

  it('refuses a table that is not prefix-free', () => {
    const broken = new Map(codes);
    broken.set(0x44, '11');
    expect(() => huffmanBlock(huffmanEncode(data, broken))).toThrow(/prefix-free/);
  });

  it('refuses a block that ends before its declared count', () => {
    const encoded = huffmanEncode(data, codes);
    expect(() => huffmanBlock(encoded.subarray(0, encoded.length - 1))).toThrow(/ended early/);
  });
});

describe('the archive as a whole', () => {
  it('refuses bytes that are not an archive', () => {
    expect(unpackArchive(new TextEncoder().encode('[Event "?"]\n\n1. e4 *'))).toMatchObject({
      ok: false,
    });
  });

  it('names an unknown compression method rather than half-reading the file', () => {
    const block = new Uint8Array(packed('cba'));
    block[4] = 7;
    const result = unpackArchive(buildArchive([{ name: 'x.cbh', packed: block, bytes: 26 }]));
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('method 7') });
  });

  it('refuses an archive with no database in it', () => {
    const result = unpackArchive(
      buildArchive([{ name: 'x.ini', packed: packed('cba'), bytes: 26 }]),
    );
    expect(result).toMatchObject({ ok: false, reason: 'the archive holds no database' });
  });
});
