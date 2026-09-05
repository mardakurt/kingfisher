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

import { zstdDecompressSync } from 'node:zlib';

const ZSTD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MASK = 0xfffffff0;
const SKIPPABLE_MAGIC = 0x184d2a50;

/** How much decompressed output is handed downstream at a time. */
const SLICE_BYTES = 256 * 1024;

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

function endOfFrame(buffer, start, partial = false) {
  /*
    `partial` is for the streaming splitter: a frame that runs past the end of
    what has arrived so far is not a corrupt archive, it is an archive still
    being downloaded. It answers `null` and is asked again with more bytes.
  */
  const short = (message) => {
    if (partial) return null;
    throw new Error(message);
  };
  let cursor = start + 4;
  if (cursor >= buffer.length) return short(`Truncated frame header at ${cursor}.`);
  const descriptor = buffer[cursor++];

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
    if (cursor + 3 > buffer.length) return short(`Truncated block header in frame at ${start}.`);
    const header = buffer.readUIntLE(cursor, 3);
    cursor += 3;
    const last = (header & 1) !== 0;
    const type = (header >> 1) & 3;
    const size = header >> 3;
    if (type === 3) throw new Error(`Reserved block type in frame at ${start}.`);
    cursor += type === 1 ? 1 : size; // RLE blocks store one byte, not `size`.
    if (cursor > buffer.length) return short(`Block in frame at ${start} runs past the file.`);
    if (last) break;
  }

  if (hasChecksum) cursor += 4;
  if (cursor > buffer.length) return short(`Checksum of frame at ${start} runs past the file.`);
  return cursor;
}

/**
 * Decompress a stream of seekable-zstd bytes, frame by frame.
 *
 * `zstdFrames` above needs the whole archive in memory, which is right for a
 * twenty-megabyte broadcast file and impossible for a thirty-gigabyte month of
 * the standard database. This walks the same frame headers incrementally,
 * decompressing each frame as it completes and dropping it — so peak memory is
 * one frame (about 4.7 MB compressed in these archives), not one archive.
 *
 * It exists because neither simpler thing works on these files. Piping straight
 * into `createZstdDecompress()` fails at byte zero on the leading skippable
 * frame; dropping only the frames *before* the first real one gets further and
 * then stops silently at the next skippable frame, because a decoder treats one
 * as the end of the stream. That failure produced a pack with 148 games in it
 * and exit code 0, which is why the frames are now counted rather than assumed.
 *
 * An async generator rather than a `Transform`, because backpressure is the
 * whole problem at this size: a Transform pushes whatever it has decoded and
 * relies on the consumer keeping up, and when the consumer is a PGN parser and
 * the producer is a network socket, the difference accumulates until the worker
 * runs out of heap. A generator only advances when something pulls from it.
 */
export async function* zstdFrameStream(source) {
  let held = Buffer.alloc(0);
  let frames = 0;

  for await (const chunk of source) {
    held = held.length > 0 ? Buffer.concat([held, chunk]) : Buffer.from(chunk);
    let offset = 0;
    for (;;) {
      if (offset + 8 > held.length) break;
      const magic = held.readUInt32LE(offset);
      if ((magic & SKIPPABLE_MASK) === SKIPPABLE_MAGIC) {
        const end = offset + 8 + held.readUInt32LE(offset + 4);
        if (end > held.length) break;
        offset = end;
        continue;
      }
      if (magic !== ZSTD_MAGIC) {
        throw new Error(`Not a zstd frame at ${offset}: magic 0x${magic.toString(16)}.`);
      }
      const end = endOfFrame(held, offset, true);
      if (end === null) break;
      const frame = held.subarray(offset, end);
      offset = end;
      frames += 1;
      /*
        Handed on in slices rather than as one buffer.

        A frame decompresses to roughly twenty-five megabytes, and the reader
        above it splits that into lines. V8 makes a substring a *view* on its
        parent, so every retained line kept the whole frame alive, and a worker
        scanning ninety million games grew by about five kilobytes per game
        until it ran out of heap at four gigabytes — with only a couple of
        thousand games actually kept. Slicing bounds what any one line can hold
        on to.
      */
      const decompressed = zstdDecompressSync(frame);
      for (let at = 0; at < decompressed.length; at += SLICE_BYTES) {
        yield decompressed.subarray(at, Math.min(at + SLICE_BYTES, decompressed.length));
      }
    }
    held = offset > 0 ? Buffer.from(held.subarray(offset)) : held;
  }

  // Anything left is a partial frame, which means a truncated download.
  if (held.length > 0) {
    throw new Error(`Archive ended mid-frame with ${held.length} bytes unread.`);
  }
  if (frames === 0) throw new Error('Archive contained no zstd frames.');
}
