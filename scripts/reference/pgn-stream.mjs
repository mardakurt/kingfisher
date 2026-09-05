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
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { createGunzip, zstdDecompressSync } from 'node:zlib';

import { zstdFrames, zstdFrameStream } from './zstd-frames.mjs';

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
  /*
    A remote archive is never written to disk and never held whole in memory.

    The broadcast archives are tens of megabytes and the frame-by-frame path
    below suits them. The Lichess standard database is a different animal —
    close to thirty gigabytes per month — so `{ url }` sources are piped
    straight from the socket through a streaming zstd decoder. Backpressure is
    the pipe's: the decoder stops pulling when the reader stops consuming, so
    peak memory is a few buffers rather than a month of chess.
  */
  if (typeof file === 'object' && file !== null && typeof file.url === 'string') {
    /*
      One pipeline, not a generator wrapping a decoder. Async iteration over a
      stream that is still being written ends as soon as its buffer drains, and
      a thirty-gigabyte archive then terminated after a few tens of thousands of
      games with no error anywhere — a build that *succeeded* and wrote a pack a
      fraction of the right size, which is the worst way for this to fail.
      Piping keeps it to one stream, so backpressure and errors both belong to it.
    */
    const out = new PassThrough();
    void (async () => {
      try {
        const response = await fetch(file.url, file.init);
        if (!response.ok) throw new Error(`${file.url} → HTTP ${response.status}`);
        if (!response.body) throw new Error(`${file.url} returned no body.`);
        await pipeline(Readable.fromWeb(response.body), zstdFrameStream, out);
      } catch (error) {
        out.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return out;
  }
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
 *
 * `accept(tags)` decides from the headers alone whether a game is wanted,
 * before its movetext is tokenised. On the broadcast archives that saves
 * nothing worth having. On the Lichess standard database it is the difference
 * between a feasible build and an infeasible one: a month holds about ninety
 * million games and a high-rated pack keeps roughly one in two hundred and
 * fifty, so tokenising every game would spend almost all of the build tearing
 * apart movetext nothing will ever read. Rejected games are still scanned to
 * their blank line — that is how the next game is found — but nothing is
 * built from them.
 */
export async function* readGames(file, { accept } = {}) {
  const lines = createInterface({ input: bytesOf(file), crlfDelay: Infinity });

  let tags = {};
  let movetext = [];
  let inMoves = false;
  let wanted = true;

  for await (const line of lines) {
    if (!inMoves) {
      const tag = TAG.exec(line);
      if (tag) {
        tags[tag[1]] = tag[2].replace(/\\(["\\])/g, '$1').replace(/[\t\r\n]/g, ' ');
        continue;
      }
      if (line.trim().length === 0) continue;
      inMoves = true;
      wanted = accept ? accept(tags) !== false : true;
      if (wanted) movetext.push(line);
      continue;
    }
    if (line.trim().length === 0) {
      if (wanted) yield { tags, moves: sanTokens(movetext.join('\n')) };
      tags = {};
      movetext = [];
      inMoves = false;
      wanted = true;
      continue;
    }
    if (wanted) movetext.push(line);
  }

  if (inMoves && wanted) yield { tags, moves: sanTokens(movetext.join('\n')) };
}

/**
 * Yield each game's raw PGN text, tags and movetext together, unparsed.
 *
 * `readGames` above answers "what moves were played", which is what building a
 * pack needs. This answers "what did the file actually say", which is what
 * feeding the application's own PGN importer needs — the importer takes PGN
 * text, and reassembling text from stripped SAN tokens would measure a
 * round-trip this pipeline invented rather than the archive as published.
 *
 * Same streaming guarantees and the same end-of-game rule as `readGames`.
 */
export async function* readGameTexts(file) {
  const lines = createInterface({ input: bytesOf(file), crlfDelay: Infinity });

  let block = [];
  let inMoves = false;

  for await (const line of lines) {
    if (!inMoves) {
      if (line.trim().length === 0) continue;
      block.push(line);
      if (!TAG.test(line)) inMoves = true;
      continue;
    }
    if (line.trim().length === 0) {
      yield block.join('\n');
      block = [];
      inMoves = false;
      continue;
    }
    block.push(line);
  }

  if (block.length > 0) yield block.join('\n');
}
