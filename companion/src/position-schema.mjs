/**
 * The compact position index, and the migration that reaches it.
 *
 * Phase 17 measured where a real collection's bytes go and found that 81% of
 * a database is the position index, that three of its columns repeat between
 * five and nine times over as text, and that a fourth — the FEN — is the
 * position key with two integers appended. `docs/performance/phase-17-storage.md`
 * has the table. On 60,469 games the compact form was 41.1% smaller with no
 * cost to the explorer.
 *
 * The saving is arithmetic, not cleverness:
 *
 *   4,435,492 rows carry   669,991 distinct claim sets
 *                          473,104 distinct signatures
 *                          844,675 distinct skeletons
 *
 * so each becomes an integer id into a table holding one copy of each value,
 * and `fen` becomes the two integers that the position key does not already
 * contain.
 *
 * ## Why this is not done when the database opens
 *
 * It rewrites the table holding 81% of somebody's data. On a 3.4 GB collection
 * that is a minute of work and needs the file's size again in free disk. A
 * database must open now, so migration is something a caller asks for, and
 * until it is asked for the reader works against whichever schema it found.
 * `positionSql()` is that reader: one branch, resolved once, so no query
 * carries a runtime conditional.
 *
 * ## Why it is chunked rather than one transaction
 *
 * One transaction over 4.4 million rows is atomic and simple, and it builds a
 * write-ahead log the size of the table before it commits — on the collections
 * where this migration is worth doing, that is the failure it is meant to
 * avoid. So it commits per chunk and records how far it reached. An interrupted
 * migration resumes; it never restarts, and it never leaves a row half-encoded,
 * because a chunk's rows are encoded and marked in the same transaction.
 */

import { statfsSync, statSync } from 'node:fs';

/**
 * Schema versions this module knows about.
 *
 * 1 — the text schema: `positions` carries fen, pawn_skeleton,
 *     structure_signature and structure_claims as text.
 * 2 — the compact schema: those four become three lookup ids and two integers.
 *
 * A database with no version recorded is version 1 if it has the text columns
 * and version 2 if it does not, which is what `detectSchemaVersion` decides.
 */
export const TEXT_SCHEMA = 1;
export const COMPACT_SCHEMA = 2;

/** Rows re-encoded per transaction. */
export const DEFAULT_CHUNK = 50_000;

/**
 * Measured on the Phase 17 collection: 4,435,492 positions re-encoded in 63
 * seconds, indexes included. Used only to estimate, and reported as an
 * estimate.
 */
const ROWS_PER_SECOND = 70_000;

const LOOKUPS = [
  ['pawn_skeletons', 'pawn_skeleton', 'pawn_skeleton_id'],
  ['structure_signatures', 'structure_signature', 'structure_signature_id'],
  ['structure_claim_sets', 'structure_claims', 'structure_claims_id'],
];

/** The tables and columns the compact schema adds. Idempotent to apply. */
export const COMPACT_TABLES = `
CREATE TABLE IF NOT EXISTS pawn_skeletons (
  id    INTEGER PRIMARY KEY,
  value TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS structure_signatures (
  id    INTEGER PRIMARY KEY,
  value TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS structure_claim_sets (
  id    INTEGER PRIMARY KEY,
  value TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS schema_state (
  key   TEXT PRIMARY KEY,
  value TEXT
) WITHOUT ROWID;
`;

const COMPACT_COLUMNS = [
  ['pawn_skeleton_id', 'INTEGER'],
  ['structure_signature_id', 'INTEGER'],
  ['structure_claims_id', 'INTEGER'],
  ['halfmove', 'INTEGER'],
  ['fullmove', 'INTEGER'],
  // Holds a FEN that is not its own position key plus two integers. Expected
  // to stay empty; it exists so the migration cannot be lossy for a row that
  // does not obey the rule the saving is built on.
  ['fen_literal', 'TEXT'],
];

/*
  The claims index is the one the text schema could not have.

  A claim search is `... LIKE '%"open:c"%'`, and a leading wildcard makes an
  index on the text useless — so `structure_claims` never had one, and the
  search scanned every position row. Under the compact schema the LIKE is
  confined to the lookup table and the positions side becomes an integer `IN`,
  which an index does help: measured on 11,303,059 positions, a claim search
  went from 3,399 ms to 2,312 ms, for 130 MB on a 4.8 GB collection.

  It is still the slowest search here, and the remaining cost is not the index
  — it is that a common claim matches a large fraction of 1.5 million claim
  sets and the result has to be ordered before it is cut to thirty. Making that
  cheap needs a claim-to-position table, which is a different change.
*/
const COMPACT_INDEXES = `
CREATE INDEX IF NOT EXISTS positions_pawn_skeleton_id
  ON positions(pawn_skeleton_id) WHERE pawn_skeleton_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS positions_structure_signature_id
  ON positions(structure_signature_id) WHERE structure_signature_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS positions_structure_claims_id
  ON positions(structure_claims_id) WHERE structure_claims_id IS NOT NULL;
`;

const columnNames = (db, table) =>
  new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name),
  );

/**
 * Which schema this file is on.
 *
 * Decided from the table, not from a version number, because a version number
 * can be written by a migration that then failed. The text columns being gone
 * is the fact; `user_version` is the label.
 */
export function detectSchemaVersion(db) {
  const columns = columnNames(db, 'positions');
  return columns.has('pawn_skeleton') ? TEXT_SCHEMA : COMPACT_SCHEMA;
}

/**
 * Split a FEN into the part the position key already holds and the part it
 * does not.
 *
 * Returns counters when the FEN really is `key + ' ' + halfmove + ' ' + fullmove`
 * and a literal otherwise, so a row that does not obey the rule survives
 * intact rather than being silently rebuilt into a different FEN.
 */
export function splitFen(fen, positionKey) {
  if (fen === null || fen === undefined || fen === '') {
    return { halfmove: null, fullmove: null, literal: null };
  }
  const text = String(fen);
  const fields = text.trim().split(/\s+/);
  if (fields.length === 6 && fields.slice(0, 4).join(' ') === positionKey) {
    const halfmove = Number(fields[4]);
    const fullmove = Number(fields[5]);
    if (
      Number.isInteger(halfmove) &&
      Number.isInteger(fullmove) &&
      halfmove >= 0 &&
      fullmove >= 0 &&
      // Round-trip or keep the literal: the reconstruction must be the same
      // string, not merely an equivalent position.
      `${positionKey} ${halfmove} ${fullmove}` === text
    ) {
      return { halfmove, fullmove, literal: null };
    }
  }
  return { halfmove: null, fullmove: null, literal: text };
}

/** Rebuild a FEN from what the compact row stores. The inverse of `splitFen`. */
export function joinFen({ positionKey, halfmove, fullmove, literal }) {
  if (literal !== null && literal !== undefined) return literal;
  if (halfmove === null || halfmove === undefined) return null;
  return `${positionKey} ${halfmove} ${fullmove}`;
}

/**
 * The SQL each schema needs to answer the same questions.
 *
 * Resolved once per open database rather than per query, so a read path names
 * `sql.pawnSkeleton` and carries no conditional of its own. The equality
 * fragments matter as much as the projections: filtering on `value` through
 * the join would read the text index the compact schema exists to remove, so
 * a skeleton or signature lookup resolves the text to its id first and then
 * matches an integer.
 */
export function positionSql(version) {
  if (version === COMPACT_SCHEMA) {
    return {
      compact: true,
      version,
      join: `LEFT JOIN pawn_skeletons ks ON ks.id = p.pawn_skeleton_id
             LEFT JOIN structure_signatures gs ON gs.id = p.structure_signature_id
             LEFT JOIN structure_claim_sets cs ON cs.id = p.structure_claims_id`,
      fen: `COALESCE(p.fen_literal, CASE WHEN p.halfmove IS NULL THEN NULL
              ELSE p.position_key || ' ' || p.halfmove || ' ' || p.fullmove END)`,
      pawnSkeleton: 'ks.value',
      structureSignature: 'gs.value',
      structureClaims: 'cs.value',
      skeletonIsNull: 'p.pawn_skeleton_id IS NULL',
      skeletonEquals: 'p.pawn_skeleton_id = (SELECT id FROM pawn_skeletons WHERE value = ?)',
      signatureEquals:
        'p.structure_signature_id = (SELECT id FROM structure_signatures WHERE value = ?)',
      claimLike:
        'p.structure_claims_id IN (SELECT id FROM structure_claim_sets WHERE value LIKE ?)',
    };
  }
  return {
    compact: false,
    version: TEXT_SCHEMA,
    join: '',
    fen: 'p.fen',
    pawnSkeleton: 'p.pawn_skeleton',
    structureSignature: 'p.structure_signature',
    structureClaims: 'p.structure_claims',
    skeletonIsNull: 'p.pawn_skeleton IS NULL',
    skeletonEquals: 'p.pawn_skeleton = ?',
    signatureEquals: 'p.structure_signature = ?',
    claimLike: 'p.structure_claims LIKE ?',
  };
}

const readState = (db, key) => {
  try {
    return db.prepare('SELECT value FROM schema_state WHERE key = ?').get(key)?.value ?? null;
  } catch {
    return null;
  }
};

const writeState = (db, key, value) => {
  db.prepare(
    'INSERT INTO schema_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value === null ? null : String(value));
};

/**
 * What the migration will cost, before any of it is paid.
 *
 * `sufficient` is the answer the caller wants; every other field is the
 * evidence for it, because "not enough disk" is only actionable if it says how
 * much and where.
 *
 * The temporary requirement is the file's own size again. The migration
 * itself writes in place, but reclaiming the space needs a VACUUM, and SQLite
 * builds a complete second copy of the database before replacing the original.
 * That is the peak, and it is the number to refuse on.
 */
export function migrationPreflight(db, file) {
  const positions = db.prepare('SELECT COUNT(*) AS n FROM positions').get().n;
  let currentBytes = 0;
  try {
    currentBytes = statSync(file).size;
  } catch {
    const pageCount = db.prepare('PRAGMA page_count').get().page_count ?? 0;
    const pageSize = db.prepare('PRAGMA page_size').get().page_size ?? 4096;
    currentBytes = pageCount * pageSize;
  }

  /*
    41.1% measured on the Phase 17 collection, applied to the whole file.
    Deliberately conservative in the direction that matters: the estimate is
    used to decide whether there is room, and under-promising the saving never
    causes a migration to start that should not have.
  */
  // Encoding grows the existing table before reclaiming it. The atomic DDL
  // and VACUUM also need a journal and a replacement file; one file's size
  // alone is not a safe bound, especially for a mostly unique population.
  const logicalBytes =
    db.prepare('PRAGMA page_count').get().page_count *
    db.prepare('PRAGMA page_size').get().page_size;
  currentBytes = Math.max(currentBytes, logicalBytes);
  const estimatedFinalBytes = Math.round(currentBytes * 0.59);
  const temporaryBytesRequired = currentBytes * 3;

  let freeBytes = null;
  try {
    const stats = statfsSync(file);
    freeBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    freeBytes = null;
  }

  // A tenth of the file, or 64 MB, whichever is larger: enough that a disk
  // which is merely exactly big enough is still refused.
  const headroomBytes = Math.max(64 * 1024 * 1024, Math.round(currentBytes * 0.1));
  const requiredBytes = temporaryBytesRequired + headroomBytes;
  const sufficient = freeBytes === null ? null : freeBytes >= requiredBytes;

  return {
    positions,
    currentBytes,
    estimatedFinalBytes,
    estimatedSavedBytes: currentBytes - estimatedFinalBytes,
    temporaryBytesRequired,
    headroomBytes,
    requiredBytes,
    freeBytes,
    sufficient,
    estimatedSeconds: Math.ceil(positions / ROWS_PER_SECOND),
  };
}

/** Where an interrupted migration got to, and whether one is needed at all. */
export function migrationStatus(db) {
  const version = detectSchemaVersion(db);
  if (version === COMPACT_SCHEMA) {
    const reclaiming = readState(db, 'compact_vacuum_pending') === '1';
    return {
      version,
      complete: !reclaiming,
      encoded: null,
      positions: null,
      resuming: reclaiming,
      reclaiming,
    };
  }
  const started = readState(db, 'compact_migration_started') !== null;
  const cursor = Number(readState(db, 'compact_migration_cursor') ?? 0);
  const positions = db.prepare('SELECT COUNT(*) AS n FROM positions').get().n;
  const encoded = started
    ? db.prepare('SELECT COUNT(*) AS n FROM positions WHERE rowid <= ?').get(cursor).n
    : 0;
  return { version, complete: false, encoded, positions, resuming: started && cursor > 0, cursor };
}

/**
 * Re-encode `positions` into the compact schema, resuming if a previous
 * attempt was interrupted.
 *
 * The order is the whole safety argument:
 *
 *   1. Add the new columns and the lookup tables. Cheap DDL, no row touched,
 *      and harmless to a database that never finishes the rest.
 *   2. Encode in chunks by rowid, committing each with the cursor that says it
 *      is done. A crash between chunks loses at most one chunk's work and no
 *      information, because the text columns are still there.
 *   3. Verify every encoded row reproduces its text.
 *   4. Only then drop the text columns and reclaim the space.
 *
 * Nothing is destroyed until step 3 has proved that nothing needs to be.
 */
export function migrateToCompact(db, options = {}) {
  const chunk = Math.max(1, Number(options.chunkSize) || DEFAULT_CHUNK);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const started = Date.now();

  if (detectSchemaVersion(db) === COMPACT_SCHEMA) {
    if (readState(db, 'compact_vacuum_pending') === '1') {
      db.exec('VACUUM');
      writeState(db, 'compact_vacuum_pending', null);
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      return { migrated: true, encoded: 0, elapsedMs: Date.now() - started, reclaimed: true };
    }
    return { migrated: false, reason: 'already-compact', encoded: 0, elapsedMs: 0 };
  }

  db.exec(COMPACT_TABLES);
  const columns = columnNames(db, 'positions');
  for (const [name, type] of COMPACT_COLUMNS) {
    if (!columns.has(name)) db.exec(`ALTER TABLE positions ADD COLUMN ${name} ${type}`);
  }
  writeState(db, 'compact_migration_started', String(started));
  // While paused the text schema remains writable. A changed earlier row
  // must be encoded again, including inserts that reuse a deleted rowid.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS compact_changed_update
    AFTER UPDATE OF position_key, fen, pawn_skeleton, structure_signature, structure_claims ON positions
    BEGIN
      UPDATE schema_state SET value = MIN(COALESCE(CAST(value AS INTEGER), 0), MAX(0, NEW.rowid - 1))
      WHERE key = 'compact_migration_cursor';
    END;
    CREATE TRIGGER IF NOT EXISTS compact_changed_insert AFTER INSERT ON positions
    BEGIN
      UPDATE schema_state SET value = MIN(COALESCE(CAST(value AS INTEGER), 0), MAX(0, NEW.rowid - 1))
      WHERE key = 'compact_migration_cursor';
    END;
  `);

  const intern = Object.fromEntries(
    LOOKUPS.map(([table]) => [
      table,
      {
        cache: new Map(),
        statement: db.prepare(
          `INSERT INTO ${table} (value) VALUES (?) ON CONFLICT(value) DO UPDATE SET value = value RETURNING id`,
        ),
      },
    ]),
  );
  const idFor = (table, value) => {
    if (value === null || value === undefined) return null;
    const text = String(value);
    const slot = intern[table];
    const hit = slot.cache.get(text);
    if (hit !== undefined) return hit;
    const id = slot.statement.get(text).id;
    // Bounded so a collection with millions of distinct values cannot turn the
    // migration into a memory problem; a miss past the cap costs one statement.
    if (slot.cache.size < 250_000) slot.cache.set(text, id);
    return id;
  };

  const total = db.prepare('SELECT COUNT(*) AS n FROM positions').get().n;
  const maxRowid = db.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM positions').get().n;
  const read = db.prepare(
    `SELECT rowid, position_key, fen, pawn_skeleton, structure_signature, structure_claims
       FROM positions WHERE rowid > ? ORDER BY rowid LIMIT ?`,
  );
  const write = db.prepare(
    `UPDATE positions SET
       pawn_skeleton_id = ?, structure_signature_id = ?, structure_claims_id = ?,
       halfmove = ?, fullmove = ?, fen_literal = ?
     WHERE rowid = ?`,
  );

  let cursor = Number(readState(db, 'compact_migration_cursor') ?? 0);
  const previouslyEncoded = db
    .prepare('SELECT COUNT(*) AS n FROM positions WHERE rowid <= ?')
    .get(cursor).n;
  let encoded = 0;

  while (cursor < maxRowid) {
    const rows = read.all(cursor, chunk);
    if (rows.length === 0) break;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) {
        const { halfmove, fullmove, literal } = splitFen(row.fen, row.position_key);
        write.run(
          idFor('pawn_skeletons', row.pawn_skeleton),
          idFor('structure_signatures', row.structure_signature),
          idFor('structure_claim_sets', row.structure_claims),
          halfmove,
          fullmove,
          literal,
          row.rowid,
        );
      }
      cursor = rows[rows.length - 1].rowid;
      writeState(db, 'compact_migration_cursor', cursor);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    encoded += rows.length;
    if (onProgress)
      onProgress({
        encoded,
        completed: previouslyEncoded + encoded,
        total,
        cursor,
        phase: 'encoding',
      });
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const mismatch = verifyEncoding(db);
    if (mismatch) {
      throw new Error(
        `compact migration verification failed at rowid ${mismatch.rowid}: ${mismatch.reason}`,
      );
    }

    if (onProgress) onProgress({ encoded, total, cursor, phase: 'reclaiming' });

    // DROP COLUMN refuses while an index names the column, so the text indexes
    // go first. Their compact replacements are created after, on columns that
    // now hold every value.
    db.exec(`
    DROP TRIGGER IF EXISTS compact_changed_update;
    DROP TRIGGER IF EXISTS compact_changed_insert;
    DROP INDEX IF EXISTS positions_pawn_skeleton;
    DROP INDEX IF EXISTS positions_structure_signature;
  `);
    for (const column of ['fen', 'pawn_skeleton', 'structure_signature', 'structure_claims']) {
      db.exec(`ALTER TABLE positions DROP COLUMN ${column}`);
    }
    db.exec(COMPACT_INDEXES);
    writeState(db, 'compact_migration_cursor', null);
    writeState(db, 'compact_migration_started', null);
    db.exec(`PRAGMA user_version = ${COMPACT_SCHEMA}`);
    writeState(db, 'compact_vacuum_pending', '1');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  // The columns are gone from the schema; the pages they occupied are not gone
  // from the file until this runs. It is the step that needs the free disk the
  // preflight asked for, and the step that produces the number the user was
  // promised.
  db.exec('VACUUM');
  writeState(db, 'compact_vacuum_pending', null);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

  return {
    migrated: true,
    encoded,
    positions: total,
    elapsedMs: Date.now() - started,
  };
}

/**
 * Prove each compact row reproduces the text it replaced.
 *
 * Compares against the text columns, which are still present — this runs
 * before they are dropped, and that ordering is the reason it can compare at
 * all. Returns the first row that disagrees, or null.
 */
export function verifyEncoding(db) {
  const columns = columnNames(db, 'positions');
  if (!columns.has('pawn_skeleton')) return null;
  const row = db
    .prepare(
      `SELECT p.rowid AS rowid,
              p.fen AS fen, p.position_key AS position_key,
              p.halfmove AS halfmove, p.fullmove AS fullmove, p.fen_literal AS fen_literal,
              p.pawn_skeleton AS was_skeleton, ks.value AS now_skeleton,
              p.structure_signature AS was_signature, gs.value AS now_signature,
              p.structure_claims AS was_claims, cs.value AS now_claims
         FROM positions p
         LEFT JOIN pawn_skeletons ks ON ks.id = p.pawn_skeleton_id
         LEFT JOIN structure_signatures gs ON gs.id = p.structure_signature_id
         LEFT JOIN structure_claim_sets cs ON cs.id = p.structure_claims_id
        WHERE p.pawn_skeleton IS NOT ks.value
           OR p.structure_signature IS NOT gs.value
           OR p.structure_claims IS NOT cs.value
           OR p.fen IS NOT COALESCE(p.fen_literal,
                CASE WHEN p.halfmove IS NULL THEN NULL
                     ELSE p.position_key || ' ' || p.halfmove || ' ' || p.fullmove END)
        LIMIT 1`,
    )
    .get();
  if (!row) return null;
  const reasons = [];
  if (row.was_skeleton !== row.now_skeleton) reasons.push('pawn skeleton');
  if (row.was_signature !== row.now_signature) reasons.push('structure signature');
  if (row.was_claims !== row.now_claims) reasons.push('structure claims');
  if (reasons.length === 0) reasons.push('fen');
  return { rowid: row.rowid, reason: reasons.join(', ') };
}
