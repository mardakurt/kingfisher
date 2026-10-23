/**
 * A PGN file as a sequence of pieces, each ending where a game ends.
 *
 * The import worker read a chosen file with `Blob.text()`: the whole file as
 * one string. A browser's longest string is a few hundred million characters,
 * so a file of the size a person downloads from a database site — a year of a
 * federation's games, a monthly dump — failed before the first game was
 * stored, and the only way to import it was the Mac application's companion.
 * Read in pieces, the size of the file stops mattering to the parser: each
 * piece is a few megabytes of whole games, and the games it holds are stored
 * before the next is read.
 *
 * A piece ends just before a line that opens a new game's tag section, so no
 * game is ever split between two parsers.
 */

/** Bytes read to decide a file's encoding before it is decoded. */
export const ENCODING_PROBE_BYTES = 1 << 20;

export type PgnEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

/**
 * The encoding a PGN file was written in, from its first bytes.
 *
 * PGN predates UTF-8 and says nothing about it, and files exported on
 * Windows — ChessBase's among them — are commonly Windows-1252. Decoded as
 * UTF-8, every accented byte became U+FFFD: "Müller" was stored as "M�ller",
 * with nothing to say a name had been lost. A byte-order mark names the
 * encoding outright; otherwise text that is valid UTF-8 is UTF-8 (plain
 * ASCII is both), and anything else is read as Windows-1252, which gives
 * every byte a character and is what such files are.
 */
export function detectPgnEncoding(bytes: Uint8Array): PgnEncoding {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  try {
    // `stream` so a character cut by the end of the probe is not an error.
    new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
    return 'utf-8';
  } catch {
    return 'windows-1252';
  }
}

/** Characters gathered before looking for a place to cut. */
export const PGN_PIECE_CHARS = 4_000_000;

/**
 * Where `text` can be cut so that everything before is whole games: the start
 * of the last line opening a tag section after a blank line, or -1.
 */
export function lastGameBoundary(text: string): number {
  // `[Event` is how nearly every PGN opens a game; any tag after a blank line
  // is the general rule, for files that leave Event out.
  const event = text.lastIndexOf('\n[Event ');
  if (event > 0) return event + 1;
  const match = /\n[ \t]*\r?\n(?=[ \t]*\[)/g;
  let last = -1;
  for (let found = match.exec(text); found; found = match.exec(text)) {
    last = found.index + found[0].length;
  }
  return last > 0 ? last : -1;
}

export async function* pgnPieces(
  source: string | Blob,
  pieceChars: number = PGN_PIECE_CHARS,
): AsyncGenerator<string> {
  if (typeof source === 'string') {
    yield source;
    return;
  }
  const reader = source.stream().getReader();
  try {
    // The first megabyte is read before anything is decoded, to choose how.
    const head: Uint8Array[] = [];
    let headBytes = 0;
    let ended = false;
    while (headBytes < ENCODING_PROBE_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        ended = true;
        break;
      }
      head.push(value);
      headBytes += value.length;
    }
    const probe = new Uint8Array(headBytes);
    let offset = 0;
    for (const chunk of head) {
      probe.set(chunk, offset);
      offset += chunk.length;
    }
    const decoder = new TextDecoder(detectPgnEncoding(probe));
    let buffer = '';
    const chunks = async function* (): AsyncGenerator<Uint8Array> {
      yield* head;
      if (ended) return;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    };
    for await (const value of chunks()) {
      buffer += decoder.decode(value, { stream: true });
      // A read can bring far more than one piece (a whole small file, at
      // once); it is cut into as many as it holds.
      while (buffer.length >= pieceChars) {
        let cut = lastGameBoundary(buffer.slice(0, pieceChars));
        // One game longer than a piece: cut after it, wherever it ends.
        if (cut <= 0) cut = lastGameBoundary(buffer);
        // No boundary anywhere yet: keep reading rather than cut a game.
        if (cut <= 0) break;
        yield buffer.slice(0, cut);
        buffer = buffer.slice(cut);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

/** A whole PGN file as text, in the encoding it was written in. */
export async function readPgnText(source: Blob): Promise<string> {
  let text = '';
  for await (const piece of pgnPieces(source, Number.POSITIVE_INFINITY)) text += piece;
  return text;
}
