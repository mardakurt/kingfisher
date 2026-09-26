import { describe, expect, it } from 'vitest';

import { decodeAnnotations } from './annotations';

/** A .cba block: 14-byte header (count at 7, size at 10), then records. */
function block(records: readonly { index: number; type: number; data: number[] }[]): Uint8Array {
  const body = records.flatMap(({ index, type, data }) => {
    const position = index - 1; // stream index, -1 = the game as a whole
    const size = 6 + data.length;
    return [
      (position >> 16) & 0xff,
      (position >> 8) & 0xff,
      position & 0xff,
      type,
      (size >> 8) & 0xff,
      size & 0xff,
      ...data,
    ];
  });
  const total = 14 + body.length;
  const count = records.length + 1;
  const header = [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    (count >> 16) & 0xff,
    (count >> 8) & 0xff,
    count & 0xff,
    0,
    0,
    0,
    0,
  ];
  header[10] = (total >>> 24) & 0xff;
  header[11] = (total >>> 16) & 0xff;
  header[12] = (total >>> 8) & 0xff;
  header[13] = total & 0xff;
  // One leading byte so the block starts at a positive offset, as in a file.
  return Uint8Array.from([0, ...header, ...body]);
}

describe('ChessBase annotations', () => {
  it('keeps what a PGN can hold and counts every other type by its byte', () => {
    const cba = block([
      { index: 1, type: 0x03, data: [1, 14] }, // ! and +=
      { index: 1, type: 0x04, data: [3, 1 + 8 * 4 + 4] }, // yellow e5
      { index: 2, type: 0x22, data: [1, 2, 3] }, // a type Kingfisher has no field for
      { index: 3, type: 0x22, data: [4] },
      { index: 3, type: 0x18, data: [0] },
    ]);
    const decoded = decodeAnnotations(cba, 1);
    expect(decoded.byNode.get(1)).toMatchObject({ nags: [1, 14], squares: ['Ye5'] });
    expect([...decoded.skipped.entries()].sort()).toEqual([
      [0x18, 1],
      [0x22, 2],
    ]);
    expect(decoded.issues).toEqual([]);
  });
});
