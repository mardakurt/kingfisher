/**
 * Splitting a `.zst` file into its frames.
 *
 * Node's `ZstdDecompress` decodes concatenated zstd frames, but rejects the
 * *skippable* frames that the seekable-zstd writers interleave with them —
 * which is how lichess.org's open-database archives are produced, and why
 * piping one straight into `createZstdDecompress()` fails at byte zero with
 * `ZSTD_error_prefix_unknown`.
 *
 * Rather than shell out to a `zstd` binary the build machine may not have,
 * this walks the frame headers described in RFC 8878 §3.1 and reports where
 * each frame starts and ends. Walking block headers is arithmetic on lengths;
 * no entropy decoding happens here, so this cannot disagree with the real
 * decoder about the *contents* of a frame — only about where one stops, which
 * the format states explicitly.
 */

const ZSTD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MASK = 0xfffffff0;
const SKIPPABLE_MAGIC = 0x184d2a50;

const FCS_SIZES = [0, 2, 4, 8];
const DID_SIZES = [0, 1, 2, 4];

/**
 * Every frame in `buffer`, in order.
 *
 * Throws on anything that is not a valid frame sequence rather than guessing:
 * a truncated archive must fail the build, not silently produce a pack holding
 * half the games it claims.
 */
export function zstdFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 4 > buffer.length) throw new Error(`Truncated frame magic at ${offset}.`);
    const magic = buffer.readUInt32LE(offset);

    if ((magic & SKIPPABLE_MASK) === SKIPPABLE_MAGIC) {
      if (offset + 8 > buffer.length) throw new Error(`Truncated skippable header at ${offset}.`);
      const size = buffer.readUInt32LE(offset + 4);
      const end = offset + 8 + size;
      if (end > buffer.length) throw new Error(`Skippable frame at ${offset} runs past the file.`);
      frames.push({ start: offset, end, skippable: true });
      offset = end;
      continue;
    }

    if (magic !== ZSTD_MAGIC) {
      throw new Error(`Not a zstd frame at ${offset}: magic 0x${magic.toString(16)}.`);
    }
    const end = endOfFrame(buffer, offset);
    frames.push({ start: offset, end, skippable: false });
    offset = end;
  }

  return frames;
}

function endOfFrame(buffer, start) {
  let cursor = start + 4;
  const descriptor = readByte(buffer, cursor++);

  const fcsFlag = descriptor >> 6;
  const singleSegment = (descriptor & 0x20) !== 0;
  const hasChecksum = (descriptor & 0x04) !== 0;
  const didFlag = descriptor & 0x03;

  if ((descriptor & 0x08) !== 0) throw new Error(`Reserved bit set in frame at ${start}.`);

  if (!singleSegment) cursor += 1; // Window_Descriptor
  cursor += DID_SIZES[didFlag];
  // A zero FCS flag still means one byte of content size when there is a
  // single segment; otherwise the field is absent.
  cursor += fcsFlag === 0 ? (singleSegment ? 1 : 0) : FCS_SIZES[fcsFlag];

  for (;;) {
    if (cursor + 3 > buffer.length) throw new Error(`Truncated block header in frame at ${start}.`);
    const header = buffer.readUIntLE(cursor, 3);
    cursor += 3;
    const last = (header & 1) !== 0;
    const type = (header >> 1) & 3;
    const size = header >> 3;
    if (type === 3) throw new Error(`Reserved block type in frame at ${start}.`);
    cursor += type === 1 ? 1 : size; // RLE blocks store one byte, not `size`.
    if (cursor > buffer.length) throw new Error(`Block in frame at ${start} runs past the file.`);
    if (last) break;
  }

  if (hasChecksum) cursor += 4;
  if (cursor > buffer.length) throw new Error(`Checksum of frame at ${start} runs past the file.`);
  return cursor;
}

function readByte(buffer, at) {
  if (at >= buffer.length) throw new Error(`Truncated frame header at ${at}.`);
  return buffer[at];
}
