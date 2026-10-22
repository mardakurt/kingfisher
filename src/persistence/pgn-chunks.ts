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
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
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
