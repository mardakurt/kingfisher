/**
 * The native file workflows a browser cannot offer.
 *
 * A browser can be handed a file. It cannot be handed a *path*, which is the
 * difference that matters here: a SQLite collection is opened in place by the
 * companion, a Syzygy directory is scanned, an engine binary is executed. All
 * three need a path the user chose, and the companion's rule — requests name a
 * key, never a path — is what makes that safe. This module is where a person's
 * choice becomes such a key.
 *
 * Nothing here reads a file the user did not pick in a dialog or drop on the
 * window. There is no "open this path" entry point, deliberately: it would be
 * the one call that turns the renderer into a filesystem.
 */

import { readFile, stat as statFile } from 'node:fs/promises';
import path from 'node:path';

/** Extensions Kingfisher will open, by what they are. */
export const PGN_EXTENSIONS = ['pgn'];
export const DATABASE_EXTENSIONS = ['sqlite', 'db', 'db3', 'sqlite3'];

/** The largest PGN read into memory for the renderer. */
export const MAX_PGN_BYTES = 256 * 1024 * 1024;

export const isPgnPath = (file) =>
  PGN_EXTENSIONS.includes(path.extname(String(file)).slice(1).toLowerCase());

export const isDatabasePath = (file) =>
  DATABASE_EXTENSIONS.includes(path.extname(String(file)).slice(1).toLowerCase());

/**
 * Read a PGN the user chose.
 *
 * The size limit is not a guess about what people import: the companion
 * streams a large archive from disk, and this path is the *other* one — a game
 * or a tournament handed straight to the renderer's own parser, which holds it
 * in memory. A gigabyte arriving that way is a tab that stops responding, so
 * the cap fails with a sentence naming the file and pointing at the importer.
 */
export async function readPgn(file, { maxBytes = MAX_PGN_BYTES, stat = statFile } = {}) {
  const info = await stat(file);
  if (info.size > maxBytes) {
    throw new Error(
      `${path.basename(file)} is ${(info.size / 1e6).toFixed(0)} MB. ` +
        `Files over ${(maxBytes / 1e6).toFixed(0)} MB should go through Databases → Import, ` +
        'which streams them instead of holding them in memory.',
    );
  }
  return { path: file, name: path.basename(file), text: await readFile(file, 'utf8') };
}

/**
 * A bounded, de-duplicated list of recently opened documents.
 *
 * Kept as data rather than as a menu so that it can be tested, and so that the
 * renderer and the macOS "Open Recent" menu are reading the same list rather
 * than two lists that drift.
 */
export class RecentDocuments {
  #entries = [];
  #limit;

  constructor(limit = 12, initial = []) {
    this.#limit = limit;
    for (const entry of initial) this.add(entry);
  }

  add(file) {
    const absolute = path.resolve(String(file));
    this.#entries = [absolute, ...this.#entries.filter((entry) => entry !== absolute)].slice(
      0,
      this.#limit,
    );
    return this.list();
  }

  remove(file) {
    const absolute = path.resolve(String(file));
    this.#entries = this.#entries.filter((entry) => entry !== absolute);
    return this.list();
  }

  clear() {
    this.#entries = [];
    return this.list();
  }

  list() {
    return this.#entries.map((file) => ({
      path: file,
      name: path.basename(file),
      kind: isDatabasePath(file) ? 'database' : 'pgn',
    }));
  }
}

/**
 * Files named on the command line that Kingfisher should open.
 *
 * Windows and Linux deliver a double-clicked document as an argument; macOS
 * sends `open-file` instead. Both end up here. Everything that is not a file
 * Kingfisher opens is dropped rather than guessed at — an Electron argv
 * carries switches, and `--inspect` is not a chess game.
 */
export function openableFromArgv(argv) {
  return argv
    .slice(1)
    .filter((arg) => typeof arg === 'string' && !arg.startsWith('-'))
    .filter((arg) => isPgnPath(arg) || isDatabasePath(arg));
}
