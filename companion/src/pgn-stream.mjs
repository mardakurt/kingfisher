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

import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

import { zstdFrameStream } from './zstd-frames.mjs';

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
  if (typeof file === 'object' && file !== null && typeof file.url === 'string') {
    return Readable.from(zstdFrameStream(resumableBytes(file)));
  }
  const source = createReadStream(file);
  if (file.endsWith('.zst')) return Readable.from(zstdFrameStream(source));
  return file.endsWith('.gz') ? source.pipe(createGunzip()) : source;
}

/** How many times a dropped download is picked up again before giving up. */
const RESUME_ATTEMPTS = 8;

/**
 * The bytes of a remote archive, picking the download up again if it drops.
 *
 * A month of the standard database is a forty-five minute download, and
 * connections that live that long do not always survive: undici reports the
 * failure as `TypeError: terminated` partway through, and without this the
 * build loses the whole archive rather than the last few seconds of it.
 *
 * Resumption is a `Range` request from the byte already delivered, so nothing
 * is re-downloaded and — because the frame splitter downstream is counting
 * bytes into frames — nothing may be delivered twice either. A server that will
 * not honour the range is treated as a failure rather than restarted silently,
 * since replaying from zero would corrupt the frame the splitter is midway
 * through.
 */
export async function* resumableBytes(file) {
  let delivered = 0;
  let total = null;
  let validator = null;
  const hash = createHash('sha256');
  for (let attempt = 0; ; attempt += 1) {
    const headers = new Headers(file.init?.headers);
    if (delivered > 0) {
      headers.set('Range', `bytes=${delivered}-`);
      if (validator) headers.set('If-Range', validator);
    }
    let response;
    try {
      response = await fetch(file.url, { ...file.init, headers });
      if (!response.ok || !response.body) throw new Error(`Archive HTTP ${response.status}`);
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
      if (delivered > 0 && (response.status !== 206 || !range || Number(range[1]) !== delivered)) {
        throw new Error(`Archive would not resume exactly from byte ${delivered}.`);
      }
      const size = range
        ? Number(range[3])
        : Number(response.headers.get('content-length')) || null;
      if (total !== null && size !== total)
        throw new Error('Archive length changed during resume.');
      total = size;
      const currentValidator =
        response.headers.get('etag') ?? response.headers.get('last-modified');
      if (validator && currentValidator !== validator)
        throw new Error('Archive changed during resume.');
      validator = currentValidator;
      for await (const chunk of Readable.fromWeb(response.body)) {
        delivered += chunk.length;
        hash.update(chunk);
        yield chunk;
      }
      if (total !== null && delivered !== total)
        throw new Error('Archive ended before its stated length.');
      break;
    } catch (error) {
      await response?.body?.cancel().catch(() => {});
      if (attempt >= RESUME_ATTEMPTS - 1 || file.init?.signal?.aborted) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, file.retryDelayMs ?? 2000 * (attempt + 1)),
      );
    }
  }
  const actual = hash.digest('hex');
  if (file.sha256 && actual !== file.sha256) throw new Error(`Archive SHA-256 mismatch: ${actual}`);
}

/**
 * A standalone copy of a string, sharing nothing with the buffer it came from.
 *
 * Lines arrive as views onto the chunk they were split out of, and a tag value
 * kept from one holds that whole chunk alive. At a quarter of a megabyte per
 * chunk and hundreds of thousands of retained games, that is gigabytes of
 * archive being kept for a few kilobytes of player names. Only the games that
 * are actually wanted pay this, which is a fraction of a percent of them.
 */
const detach = (value) => Buffer.from(value, 'utf8').toString('utf8');

/** The same tags, holding nothing but themselves. */
const detached = (tags) => {
  const copy = {};
  for (const key of Object.keys(tags)) copy[key] = detach(tags[key]);
  return copy;
};

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
  const input = bytesOf(file);
  const lines = createInterface({ input, crlfDelay: Infinity });

  let tags = {};
  let movetext = [];
  let inMoves = false;
  let wanted = true;

  try {
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
        if (wanted) yield { tags: detached(tags), moves: sanTokens(movetext.join('\n')) };
        tags = {};
        movetext = [];
        inMoves = false;
        wanted = true;
        continue;
      }
      if (wanted) movetext.push(line);
    }

    if (inMoves && wanted) yield { tags: detached(tags), moves: sanTokens(movetext.join('\n')) };
  } finally {
    lines.close();
    input.destroy();
  }
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
  const input = bytesOf(file);
  const lines = createInterface({ input, crlfDelay: Infinity });

  let block = [];
  let inMoves = false;

  try {
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
  } finally {
    lines.close();
    input.destroy();
  }
}
