/**
 * The streaming frame splitter.
 *
 * These archives interleave skippable frames with real ones, which is what the
 * seekable-zstd writers do and what lichess.org publishes. Two simpler things
 * fail on them, and the second failed *quietly*: piping into
 * `createZstdDecompress()` dies at byte zero on the leading skippable frame,
 * and dropping only the frames before the first real one stops at the end of
 * that frame with no error — producing a pack holding 148 games and exiting 0.
 *
 * So the assertions here are as much about failing loudly as about decoding:
 * a truncated archive must break the build rather than shorten the pack.
 */

import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { zstdCompressSync } from 'node:zlib';

import { zstdFrames, zstdFrameStream } from './zstd-frames.mjs';

/** A skippable frame carrying `payload`, as a seekable writer emits. */
function skippable(payload = Buffer.alloc(4)) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(0x184d2a50, 0);
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

/** Feed `bytes` through the splitter in chunks of `size`, collecting output. */
async function split(bytes, size = 7) {
  const chunks = [];
  for (let at = 0; at < bytes.length; at += size) chunks.push(bytes.subarray(at, at + size));
  const out = [];
  const sink = async function* (source) {
    for await (const chunk of source) out.push(Buffer.from(chunk));
  };
  await pipeline(Readable.from(chunks), zstdFrameStream, sink);
  return Buffer.concat(out).toString('utf8');
}

describe('streaming a seekable-zstd archive', () => {
  const one = zstdCompressSync(Buffer.from('first frame\n'));
  const two = zstdCompressSync(Buffer.from('second frame\n'));
  const three = zstdCompressSync(Buffer.from('third frame\n'));

  it('decodes every real frame and drops the skippable ones between them', async () => {
    const archive = Buffer.concat([skippable(), one, skippable(), two, skippable(), three]);
    // The buffered parser agrees about the shape…
    expect(zstdFrames(archive).filter((f) => !f.skippable)).toHaveLength(3);
    // …and the streaming one returns all of it, not just the first frame.
    expect(await split(archive)).toBe('first frame\nsecond frame\nthird frame\n');
  });

  it('does not stop at the first skippable frame that follows real data', async () => {
    // The exact shape that failed silently: real, skippable, real.
    expect(await split(Buffer.concat([one, skippable(), two]))).toBe('first frame\nsecond frame\n');
  });

  it('is indifferent to where the chunk boundaries fall', async () => {
    const archive = Buffer.concat([skippable(), one, skippable(Buffer.alloc(64)), two]);
    for (const size of [1, 3, 8, 9, 64, 4096]) {
      expect(await split(archive, size), `chunk size ${size}`).toBe('first frame\nsecond frame\n');
    }
  });

  it('fails a truncated archive instead of returning what it managed to read', async () => {
    const archive = Buffer.concat([skippable(), one, two]);
    const cut = archive.subarray(0, archive.length - 4);
    await expect(split(cut)).rejects.toThrow(/ended mid-frame/);
  });

  it('fails an archive with no frames at all', async () => {
    await expect(split(skippable())).rejects.toThrow(/no zstd frames/);
  });

  it('refuses bytes that are not a frame rather than skipping to the next one', async () => {
    await expect(split(Buffer.concat([one, Buffer.from('not a frame at all!!')]))).rejects.toThrow(
      /Not a zstd frame/,
    );
  });
});
