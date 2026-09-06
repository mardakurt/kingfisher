/**
 * Opening a collection that is already on the disk.
 *
 * `/db/create` makes a collection inside the companion's own directory, from a
 * name. That is the whole of what the web version needs, because a browser
 * cannot hand anything a path. A desktop Kingfisher can — the user picks a file
 * in a native dialog — and this is what turns that choice into a resource key.
 *
 * ## Why this is not simply `register(path)`
 *
 * `PathRegistry`'s rule is that requests name a key and never a path, and this
 * route is the one exception to it. So the exception is made as narrow as it
 * can be made:
 *
 *   - the file must already exist, and be a file;
 *   - it is opened **read-only first** and inspected;
 *   - it is accepted only if it already *is* a Kingfisher collection — the
 *     `games` and `positions` tables, with the columns this code reads.
 *
 * That last check is the one doing the work. `GameDatabase`'s constructor runs
 * its schema DDL, which writes; pointing it at an arbitrary SQLite file would
 * modify a file the user never meant to open, and pointing it at something
 * that is not SQLite at all would be a confusing failure rather than a clear
 * one. Refusing before opening for writing means the worst case of a bad path
 * is a sentence, not a damaged file.
 *
 * An En Croissant database is deliberately refused here and named: it has its
 * own read-only routes, and Kingfisher never writes to it.
 */

import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import path from 'node:path';

export class AttachError extends Error {
  constructor(message, remedy = null) {
    super(message);
    this.name = 'AttachError';
    this.remedy = remedy;
  }
}

/** Tables and the columns of them this code cannot work without. */
const REQUIRED = {
  games: ['id', 'fingerprint', 'white', 'black', 'result'],
  positions: ['position_key', 'game_id', 'ply', 'move_uci'],
};

/**
 * Decide whether a file is a Kingfisher collection, without writing to it.
 *
 * Returns a description on success and throws `AttachError` — with a remedy
 * where there is one — on every other outcome.
 */
export function inspectCollection(file) {
  const absolute = path.resolve(String(file ?? ''));
  let stat;
  try {
    stat = statSync(absolute);
  } catch {
    throw new AttachError(`There is no file at ${absolute}.`);
  }
  if (!stat.isFile()) throw new AttachError(`${absolute} is not a file.`);

  let db;
  try {
    db = new DatabaseSync(absolute, { readOnly: true });
  } catch (error) {
    throw new AttachError(
      `${path.basename(absolute)} could not be opened as a database.`,
      error instanceof Error ? error.message : null,
    );
  }
  try {
    return describeCollection(db, absolute, stat);
  } catch (error) {
    if (error instanceof AttachError) throw error;
    /*
      SQLite does not read a file's header when it opens it — it reads it on
      the first statement. So "this is not a database at all" arrives here, in
      the middle of the inspection, rather than from the constructor above, and
      it is the commonest wrong file of the lot: somebody choosing a PGN.
    */
    throw new AttachError(
      `${path.basename(absolute)} could not be read as a database.`,
      error instanceof Error ? error.message : null,
    );
  } finally {
    db.close();
  }
}

/** What the file says about itself, once it is known to be readable. */
function describeCollection(db, absolute, stat) {
  const tables = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name),
  );
  /*
    Named rather than lumped in with "not a collection". Somebody opening an
    En Croissant database here has made a reasonable mistake, and the answer
    is a different route rather than a refusal.
  */
  if (tables.has('Games') && tables.has('Players') && !tables.has('games')) {
    throw new AttachError(
      `${path.basename(absolute)} is an En Croissant database.`,
      'Use Databases → Import from En Croissant, which reads it without writing to it.',
    );
  }
  for (const [table, columns] of Object.entries(REQUIRED)) {
    if (!tables.has(table)) {
      throw new AttachError(
        `${path.basename(absolute)} is not a Kingfisher collection.`,
        `It has no ${table} table. Kingfisher will not write its own schema into a database it did not create.`,
      );
    }
    const present = new Set(
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => row.name),
    );
    const missing = columns.filter((column) => !present.has(column));
    if (missing.length > 0) {
      throw new AttachError(
        `${path.basename(absolute)} has a ${table} table Kingfisher does not recognise.`,
        `Missing ${missing.join(', ')}.`,
      );
    }
  }
  const games = db.prepare('SELECT COUNT(*) AS count FROM games').get().count;
  return {
    path: absolute,
    name: path.basename(absolute).replace(/\.kingfisher\.sqlite$|\.(sqlite3?|db3?)$/i, ''),
    games,
    bytes: stat.size,
  };
}
