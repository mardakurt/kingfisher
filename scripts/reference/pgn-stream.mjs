/**
 * Streaming reader for the compressed PGN archives Kingfisher builds packs from.
 *
 * The archives are tens of megabytes compressed and hundreds decompressed, so
 * nothing here holds a file in memory: the zstd frame is decoded as a stream,
 * split on newlines, and yielded one game at a time. A build machine with 8 GB
 * can therefore process the whole 1.19-million-game broadcast archive.
 *
 * This is deliberately a *header and movetext* reader, not a PGN parser. It
 * does not build a tree, does not read variations, and does not interpret the
 * moves — the application's own rules code does that, on the SAN tokens this
 * hands back. Reimplementing chess here is the one thing that would let a pack
 * disagree with the program that reads it.
 */

import { createReadStream, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { createGunzip, zstdDecompressSync } from 'node:zlib';

import { zstdFrames } from './zstd-frames.mjs';

const TAG = /^\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/;

/** Drop comments, NAGs, variations and move numbers; keep the SAN tokens. */
export function sanTokens(movetext) {
  let text = movetext;
  // Comments first: they can contain anything, including parentheses.
  text = text.replace(/\{[^}]*\}/g, ' ');
  text = text.replace(/;[^\n]*/g, ' ');
  // Variations, innermost outwards. Broadcast PGN has none, but archives vary.
  let previous;
  do {
    previous = text;
    text = text.replace(/\([^()]*\)/g, ' ');
  } while (text !== previous);
  text = text.replace(/\$\d+/g, ' ');
  text = text.replace(/\d+\.(\.\.)?/g, ' ');

  const moves = [];
  for (const token of text.split(/\s+/)) {
    if (token.length === 0) continue;
    if (token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') continue;
    // Strip check, mate and annotation glyphs the rules code does not need.
    const san = token.replace(/[+#?!]+$/, '');
    if (san.length === 0) continue;
    moves.push(san);
  }
  return moves;
}

/**
 * A byte stream of the file's contents, whatever it is wrapped in.
 *
 * `.zst` is decoded frame by frame rather than piped, because the archives
 * carry skippable frames the streaming decoder rejects. One frame's output at
 * a time keeps the peak allocation to tens of megabytes on a file that is
 * hundreds decompressed.
 */
function bytesOf(file) {
  if (file.endsWith('.zst')) {
    const buffer = readFileSync(file);
    const frames = zstdFrames(buffer).filter((frame) => !frame.skippable);
    return Readable.from(
      (async function* decode() {
        for (const frame of frames) {
          yield zstdDecompressSync(buffer.subarray(frame.start, frame.end));
        }
      })(),
    );
  }
  const source = createReadStream(file);
  return file.endsWith('.gz') ? source.pipe(createGunzip()) : source;
}

/**
 * Yield `{ tags, moves }` for every game in a `.pgn`, `.pgn.gz` or `.pgn.zst`.
 *
 * A game ends at the first blank line after its movetext started, which is the
 * PGN export-format rule and what every generator in this pipeline emits.
 */
export async function* readGames(file) {
  const lines = createInterface({ input: bytesOf(file), crlfDelay: Infinity });

  let tags = {};
  let movetext = [];
  let inMoves = false;

  for await (const line of lines) {
    if (!inMoves) {
      const tag = TAG.exec(line);
      if (tag) {
        tags[tag[1]] = tag[2].replace(/\\(["\\])/g, '$1');
        continue;
      }
      if (line.trim().length === 0) continue;
      inMoves = true;
      movetext.push(line);
      continue;
    }
    if (line.trim().length === 0) {
      yield { tags, moves: sanTokens(movetext.join(' ')) };
      tags = {};
      movetext = [];
      inMoves = false;
      continue;
    }
    movetext.push(line);
  }

  if (inMoves) yield { tags, moves: sanTokens(movetext.join(' ')) };
}
