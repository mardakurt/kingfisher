/**
 * A SQLite-backed game database.
 *
 * IndexedDB was measured to 50,000 games and is fine there. This exists for the
 * collections where it is not: a million-game archive is an ordinary thing for
 * a serious player to own, and it wants a real query planner, real indexes, and
 * a file you can back up by copying it.
 *
 * Uses `node:sqlite`, which ships with Node 22+. That is the entire reason this
 * needs no dependency, and it is worth stating: the alternative was adding
 * better-sqlite3 and a native build step to a project that has kept its
 * dependency list to five packages.
 *
 * The schema mirrors the IndexedDB one on purpose — summaries separate from
 * movetext, positions indexed by canonical key — so the same repository
 * interface can sit on top of either.
 */

import { DatabaseSync } from 'node:sqlite';

import {
  CLAIM_INDEX_INDEXES,
  CLAIM_INDEX_TABLES,
  claimIndexReady,
  claimPlan,
  markClaimIndexReady,
  COMPACT_TABLES,
  detectSchemaVersion,
  migrateToCompact,
  migrationPreflight,
  migrationStatus,
  positionSql,
  splitFen,
} from './position-schema.mjs';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
  id            INTEGER PRIMARY KEY,
  fingerprint   TEXT NOT NULL UNIQUE,
  white         TEXT NOT NULL,
  black         TEXT NOT NULL,
  white_key     TEXT NOT NULL,
  black_key     TEXT NOT NULL,
  result        TEXT NOT NULL,
  date          TEXT,
  year          INTEGER,
  event         TEXT,
  site          TEXT,
  round         TEXT,
  white_rating  INTEGER,
  black_rating  INTEGER,
  max_rating    INTEGER,
  eco           TEXT,
  opening       TEXT,
  ply_count     INTEGER,
  imported_at   INTEGER NOT NULL,
  -- Kingfisher's own opening classification. Kept apart from the eco/opening
  -- columns, which are whatever the imported PGN declared and are never
  -- overwritten.
  classified_eco       TEXT,
  classified_name      TEXT,
  classified_variation TEXT,
  classified_ply       INTEGER,
  -- Digest of the opening index that last examined this game. Set whether or
  -- not a name was found, so "not looked at yet" stays distinguishable from
  -- "looked at, and this position is in no opening table".
  classified_with      TEXT
);

-- The movetext lives apart from what the list and the search read, exactly as
-- schema v3 does in IndexedDB, so a page of results never touches it.
CREATE TABLE IF NOT EXISTS game_content (
  game_id       INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  pgn           TEXT NOT NULL
);

/*
  The compact position index. A new collection is created in it directly; one
  that predates it keeps its text columns until somebody asks for the
  migration, and position-schema.mjs explains both halves of that.

  IF NOT EXISTS is what makes the two cases one statement: for an existing
  collection this does nothing at all, and detectSchemaVersion then finds the
  text columns still there.
*/
CREATE TABLE IF NOT EXISTS positions (
  position_key  TEXT NOT NULL,
  game_id       INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply           INTEGER NOT NULL,
  move_uci      TEXT NOT NULL,
  move_san      TEXT NOT NULL,
  mover         TEXT NOT NULL,
  node_id       TEXT,
  -- The FEN is the position key plus these two integers; fen_literal holds
  -- the rare FEN that is not, so nothing is lost to the rule.
  halfmove      INTEGER,
  fullmove      INTEGER,
  fen_literal   TEXT,
  -- Ids into the three lookup tables, each holding one copy of a value that
  -- repeated between five and nine times per row as text.
  pawn_skeleton_id INTEGER,
  structure_signature_id INTEGER,
  structure_claims_id INTEGER,
  year_key INTEGER,
  rating_key INTEGER,
  result_key TEXT
);

-- The unfiltered explorer is the companion's hottest ordinary query.  These
-- rows are factual reductions of positions + games, not a replacement for the
-- source records: filtered queries still use the normalized tables below.
CREATE TABLE IF NOT EXISTS position_aggregates (
  position_key       TEXT NOT NULL,
  move_uci           TEXT NOT NULL,
  move_san           TEXT NOT NULL,
  mover              TEXT NOT NULL,
  games              INTEGER NOT NULL,
  white_wins         INTEGER NOT NULL,
  draws              INTEGER NOT NULL,
  black_wins         INTEGER NOT NULL,
  rating_total       INTEGER NOT NULL,
  rating_count       INTEGER NOT NULL,
  latest_year        INTEGER,
  PRIMARY KEY (position_key, move_uci)
) WITHOUT ROWID;

-- A bounded, lazily populated exact cache for positions the player actually
-- researches. Values are exact year/rating cells, never buckets.
CREATE TABLE IF NOT EXISTS position_filter_cache (
  position_key TEXT NOT NULL,
  move_uci TEXT NOT NULL,
  move_san TEXT NOT NULL,
  mover TEXT NOT NULL,
  year_key INTEGER NOT NULL,
  rating_key INTEGER NOT NULL,
  result_key TEXT NOT NULL,
  games INTEGER NOT NULL,
  PRIMARY KEY (position_key, move_uci, year_key, rating_key, result_key)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS position_filter_cache_keys (
  position_key TEXT PRIMARY KEY,
  last_used INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS position_filter_total_cache (
  position_key TEXT NOT NULL,
  year_key INTEGER NOT NULL,
  rating_key INTEGER NOT NULL,
  result_key TEXT NOT NULL,
  games INTEGER NOT NULL,
  PRIMARY KEY (position_key, year_key, rating_key, result_key)
) WITHOUT ROWID;

/*
  A player is a row, not an aggregation.

  The player prefix lookup used to run two GROUP BY passes over the whole
  games table on every keystroke — 95 ms at 500,000 games, which is a search
  box that feels broken. Maintaining the counts on import turns the same
  question into an index range scan over a table with one row per name.

  name_key is the same normalized key games.white_key holds, so a prefix typed
  by a user matches the same way it always did.
*/
CREATE TABLE IF NOT EXISTS players (
  name_key      TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  games         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS players_games ON players(games DESC);

CREATE INDEX IF NOT EXISTS games_white_key   ON games(white_key);
CREATE INDEX IF NOT EXISTS games_black_key   ON games(black_key);
CREATE INDEX IF NOT EXISTS games_year        ON games(year);
CREATE INDEX IF NOT EXISTS games_result      ON games(result);
CREATE INDEX IF NOT EXISTS games_eco         ON games(eco);
CREATE INDEX IF NOT EXISTS games_max_rating  ON games(max_rating);
CREATE INDEX IF NOT EXISTS games_imported    ON games(imported_at);
CREATE INDEX IF NOT EXISTS positions_key     ON positions(position_key);
CREATE INDEX IF NOT EXISTS positions_game    ON positions(game_id);
CREATE INDEX IF NOT EXISTS filter_cache_position_year_rating
  ON position_filter_cache(position_key, year_key, rating_key);
CREATE INDEX IF NOT EXISTS filter_cache_position_rating_year
  ON position_filter_cache(position_key, rating_key, year_key);
CREATE INDEX IF NOT EXISTS filter_total_cache_position_year_rating
  ON position_filter_total_cache(position_key, year_key, rating_key);
CREATE INDEX IF NOT EXISTS filter_total_cache_position_rating_year
  ON position_filter_total_cache(position_key, rating_key, year_key);

CREATE TRIGGER IF NOT EXISTS positions_aggregate_insert
AFTER INSERT ON positions
BEGIN
  INSERT INTO position_aggregates (
    position_key, move_uci, move_san, mover, games, white_wins, draws,
    black_wins, rating_total, rating_count, latest_year
  )
  SELECT
    NEW.position_key, NEW.move_uci, NEW.move_san, NEW.mover, 1,
    CASE WHEN result = '1-0' THEN 1 ELSE 0 END,
    CASE WHEN result = '1/2-1/2' THEN 1 ELSE 0 END,
    CASE WHEN result = '0-1' THEN 1 ELSE 0 END,
    COALESCE(max_rating, 0), CASE WHEN max_rating IS NULL THEN 0 ELSE 1 END, year
  FROM games WHERE id = NEW.game_id
  ON CONFLICT(position_key, move_uci) DO UPDATE SET
    games = games + 1,
    white_wins = white_wins + excluded.white_wins,
    draws = draws + excluded.draws,
    black_wins = black_wins + excluded.black_wins,
    rating_total = rating_total + excluded.rating_total,
    rating_count = rating_count + excluded.rating_count,
    latest_year = CASE
      WHEN latest_year IS NULL OR excluded.latest_year > latest_year THEN excluded.latest_year
      ELSE latest_year
    END;
END;

-- Deletion is deliberately rebuilt for the affected move.  Imports are the
-- high-volume path and stay O(1) per position; deletion is rare, and rebuilding
-- one move is the simple way to keep latest_year exact after removing its max.
CREATE TRIGGER IF NOT EXISTS positions_aggregate_delete
AFTER DELETE ON positions
BEGIN
  DELETE FROM position_aggregates
  WHERE position_key = OLD.position_key AND move_uci = OLD.move_uci;

  INSERT INTO position_aggregates (
    position_key, move_uci, move_san, mover, games, white_wins, draws,
    black_wins, rating_total, rating_count, latest_year
  )
  SELECT
    p.position_key, p.move_uci, MIN(p.move_san), MIN(p.mover), COUNT(*),
    SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END),
    SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END),
    SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END),
    COALESCE(SUM(g.max_rating), 0), COUNT(g.max_rating), MAX(g.year)
  FROM positions p JOIN games g ON g.id = p.game_id
  WHERE p.position_key = OLD.position_key AND p.move_uci = OLD.move_uci
  GROUP BY p.position_key, p.move_uci;
END;
`;

const REBUILD_DERIVED = `
  DELETE FROM position_aggregates;
  INSERT INTO position_aggregates (
    position_key, move_uci, move_san, mover, games, white_wins, draws,
    black_wins, rating_total, rating_count, latest_year
  )
  SELECT
    p.position_key, p.move_uci, MIN(p.move_san), MIN(p.mover), COUNT(*),
    SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END),
    SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END),
    SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END),
    COALESCE(SUM(g.max_rating), 0), COUNT(g.max_rating), MAX(g.year)
  FROM positions p JOIN games g ON g.id = p.game_id
  GROUP BY p.position_key, p.move_uci;
  DELETE FROM position_filter_cache;
  DELETE FROM position_filter_total_cache;
  DELETE FROM position_filter_cache_keys;
`;

const AFFECTED_POSITIONS_TABLE = `
  CREATE TEMP TABLE IF NOT EXISTS affected_positions (
    position_key TEXT PRIMARY KEY
  ) WITHOUT ROWID;
`;

/**
 * Recompute derived rows for the affected positions only.
 *
 * Dropping every aggregate row for an affected position and reinserting from
 * the surviving normalized rows is exact for both outcomes: a position that
 * still has games gets recomputed totals, and a position whose last game just
 * left gets no rows back at all.
 */
const REBUILD_AFFECTED = `
  DELETE FROM position_aggregates
   WHERE position_key IN (SELECT position_key FROM affected_positions);
  INSERT INTO position_aggregates (
    position_key, move_uci, move_san, mover, games, white_wins, draws,
    black_wins, rating_total, rating_count, latest_year
  )
  SELECT
    p.position_key, p.move_uci, MIN(p.move_san), MIN(p.mover), COUNT(*),
    SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END),
    SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END),
    SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END),
    COALESCE(SUM(g.max_rating), 0), COUNT(g.max_rating), MAX(g.year)
  FROM positions p JOIN games g ON g.id = p.game_id
  WHERE p.position_key IN (SELECT position_key FROM affected_positions)
  GROUP BY p.position_key, p.move_uci;
  DELETE FROM position_filter_cache
   WHERE position_key IN (SELECT position_key FROM affected_positions);
  DELETE FROM position_filter_total_cache
   WHERE position_key IN (SELECT position_key FROM affected_positions);
  DELETE FROM position_filter_cache_keys
   WHERE position_key IN (SELECT position_key FROM affected_positions);
  DELETE FROM affected_positions;
`;

export class GameDatabase {
  #db;
  #file;
  #ftsAvailable = false;
  /** The SQL this file's schema needs, resolved once. See `positionSql`. */
  #sql;
  /** Lookup-table interning state, per table. See `#internId`. */
  #intern = new Map();
  /** Claim id by value, and the three statements that maintain the claim index. */
  #claimIds = new Map();
  #claimStatements = null;
  /** The claim lookup, and the two table counts the plan hint divides by. */
  #claimLookup = null;
  #totals = null;
  /** Whether a completed build said the claim index can be trusted. */
  #claimIndexReady = false;

  constructor(file) {
    this.#file = file;
    this.#db = new DatabaseSync(file);
    this.#db.exec(SCHEMA);
    // The lookup tables and the migration cursor. Created for both schemas: a
    // text-schema collection needs somewhere to record an interrupted
    // migration before it has anything to put in the lookups.
    this.#db.exec(COMPACT_TABLES);
    this.#db.exec(CLAIM_INDEX_TABLES);
    this.#db.exec(AFFECTED_POSITIONS_TABLE);
    this.#ensureGameColumns();
    this.#ensurePositionColumns();
    this.#sql = positionSql(detectSchemaVersion(this.#db));
    this.#ensurePositionIndexes();
    /*
      A collection with no claim sets has nothing to backfill, so it is
      complete by construction — and from here on `#indexClaimSet` keeps it
      that way, one statement per claim set the process has not seen. Every
      other collection needs the backfill before the fast plan is allowed.
    */
    if (
      this.#sql.compact &&
      !this.#db.prepare('SELECT 1 FROM structure_claim_sets LIMIT 1').get()
    ) {
      markClaimIndexReady(this.#db);
    }
    this.#claimIndexReady = claimIndexReady(this.#db);
    const hasAggregates = this.#db.prepare('SELECT 1 FROM position_aggregates LIMIT 1').get();
    if (!hasAggregates && this.#db.prepare('SELECT 1 FROM positions LIMIT 1').get())
      this.rebuildAggregates();
    this.#ensureSearchIndexes();
  }

  /**
   * The structure indexes, on whichever columns this file actually has.
   *
   * A partial index on a column the schema does not declare is a syntax error
   * at open time, so which two exist is decided by the detected schema rather
   * than by `IF NOT EXISTS` alone.
   */
  #ensurePositionIndexes() {
    if (this.#sql.compact) {
      this.#db.exec(`
        CREATE INDEX IF NOT EXISTS positions_pawn_skeleton_id
          ON positions(pawn_skeleton_id) WHERE pawn_skeleton_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS positions_structure_signature_id
          ON positions(structure_signature_id) WHERE structure_signature_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS positions_structure_claims_id
          ON positions(structure_claims_id) WHERE structure_claims_id IS NOT NULL;
      `);
      /*
        The rank index the ordered claim scan walks. Only under the compact
        schema, because it is only there that a claim search can reach the
        cheap plan at all — the text schema has no claim index to test
        membership against, and its claim search is a LIKE over every row.
      */
      this.#db.exec(CLAIM_INDEX_INDEXES);
      return;
    }
    this.#db.exec(`
      CREATE INDEX IF NOT EXISTS positions_pawn_skeleton ON positions(pawn_skeleton)
        WHERE pawn_skeleton IS NOT NULL;
      CREATE INDEX IF NOT EXISTS positions_structure_signature ON positions(structure_signature)
        WHERE structure_signature IS NOT NULL;
    `);
  }

  /**
   * The id a lookup table holds for a value, creating the row if it is new.
   *
   * One statement per distinct value and none per repeat, which is the point:
   * an import of four million positions carries under a million distinct
   * skeletons, signatures and claim sets between them. The cache is bounded so
   * that a pathological collection costs a statement rather than memory.
   */
  #internId(table, value) {
    if (value === null || value === undefined) return null;
    const text = String(value);
    let slot = this.#intern.get(table);
    if (!slot) {
      slot = {
        cache: new Map(),
        statement: this.#db.prepare(
          `INSERT INTO ${table} (value) VALUES (?)
             ON CONFLICT(value) DO UPDATE SET value = value RETURNING id`,
        ),
      };
      this.#intern.set(table, slot);
    }
    const hit = slot.cache.get(text);
    if (hit !== undefined) return hit;
    const id = slot.statement.get(text).id;
    if (slot.cache.size < 250_000) slot.cache.set(text, id);
    /*
      A claim set that is new *to this process* has its claims indexed here.

      Deliberately on the cache miss rather than on a genuinely new row: the
      member insert is `OR IGNORE` and therefore idempotent, so re-indexing a
      set a previous run already indexed costs one no-op statement per distinct
      value per process, and never costs one per position. That is what keeps
      this off the hot path — an import of four million positions carries under
      a million distinct claim sets, and repeats pay nothing.
    */
    if (table === 'structure_claim_sets') this.#indexClaimSet(id, text);
    return id;
  }

  /**
   * Record which claims a claim set contains.
   *
   * `claims.sets` is maintained here and only here, and only when the member
   * row was genuinely new — `changes` is what distinguishes that from the
   * idempotent re-run above. It is a plan hint; `claimPlan` explains what it
   * decides and why being wrong about it cannot change an answer.
   */
  #indexClaimSet(setId, json) {
    if (setId === null) return;
    let list;
    try {
      list = JSON.parse(json);
    } catch {
      return;
    }
    if (!Array.isArray(list)) return;
    this.#claimStatements ??= {
      claim: this.#db.prepare(
        `INSERT INTO claims (value) VALUES (?)
           ON CONFLICT(value) DO UPDATE SET value = value RETURNING id`,
      ),
      member: this.#db.prepare(
        'INSERT OR IGNORE INTO claim_set_members (claim_id, set_id) VALUES (?, ?)',
      ),
      count: this.#db.prepare('UPDATE claims SET sets = sets + 1 WHERE id = ?'),
    };
    for (const claim of list) {
      if (typeof claim !== 'string') continue;
      let claimId = this.#claimIds.get(claim);
      if (claimId === undefined) {
        claimId = this.#claimStatements.claim.get(claim).id;
        this.#claimIds.set(claim, claimId);
      }
      if (this.#claimStatements.member.run(claimId, setId).changes > 0) {
        this.#claimStatements.count.run(claimId);
      }
    }
  }

  /** Which position schema this collection is on, and how far a migration got. */
  schemaStatus() {
    return { ...migrationStatus(this.#db), file: this.#file, claimIndex: this.claimIndexStatus() };
  }

  /**
   * Whether a claim search on this collection is the fast one or the scan.
   *
   * Reported rather than inferred, because the difference is a factor of a
   * hundred on a large collection and the user is the one who has to decide
   * whether to spend a few minutes building it. `claims` and `sets` are what
   * it would cost and what it has done so far.
   */
  claimIndexStatus() {
    if (!this.#sql.compact) {
      return { ready: false, applicable: false, claims: 0, sets: 0, indexed: 0 };
    }
    return {
      ready: this.#claimIndexReady,
      applicable: true,
      claims: this.#db.prepare('SELECT COUNT(*) AS n FROM claims').get().n,
      sets: this.#db.prepare('SELECT COUNT(*) AS n FROM structure_claim_sets').get().n,
      indexed: this.#db.prepare('SELECT COUNT(DISTINCT set_id) AS n FROM claim_set_members').get()
        .n,
    };
  }

  /** What compacting would cost, before any of it is paid. */
  compactionPreflight() {
    return migrationPreflight(this.#db, this.#file);
  }

  /**
   * Compact this collection's position index.
   *
   * Refuses on insufficient disk rather than starting work that cannot finish,
   * because the failure it is guarding against is a half-written rebuild of
   * the table holding most of somebody's data. `force` exists for the caller
   * who has been shown the numbers and wants it anyway.
   */
  compactPositions(options = {}) {
    const preflight = this.compactionPreflight();
    if (preflight.sufficient !== true) {
      return {
        migrated: false,
        reason: preflight.sufficient === null ? 'unknown-free-disk' : 'insufficient-disk',
        preflight,
      };
    }
    try {
      const result = migrateToCompact(this.#db, options);
      return { ...result, preflight };
    } finally {
      // VACUUM can fail after the transactional schema cutover succeeded.
      // Readers must follow the committed schema even when reclaiming failed.
      this.#sql = positionSql(detectSchemaVersion(this.#db));
      this.#intern.clear();
      this.#ensurePositionIndexes();
    }
  }

  /**
   * The player table and the metadata index, built once for a database that
   * predates them.
   *
   * Both are derived entirely from `games`, so rebuilding is always safe and
   * a failure is never data loss — which is why a database whose SQLite build
   * lacks FTS5 simply goes without it and falls back to the LIKE scan rather
   * than refusing to open.
   */
  #ensureSearchIndexes() {
    const gameCount = this.#db.prepare('SELECT COUNT(*) AS n FROM games').get().n;

    const playerCount = this.#db.prepare('SELECT COUNT(*) AS n FROM players').get().n;
    if (playerCount === 0 && gameCount > 0) this.rebuildPlayers();

    try {
      /*
        §48: players, event, site and ECO — the fields somebody searches by
        name. Deliberately not the movetext: it is by far the largest column,
        indexing it would multiply the database size for a query nobody has
        asked for, and the position index already answers "which games reached
        this position" properly.

        `content=''` makes this a contentless index: it stores the terms and
        the rowid, not a second copy of the text.
      */
      this.#db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS games_fts USING fts5(
          white, black, event, site, eco, opening,
          content='', tokenize='unicode61'
        )
      `);
      this.#ftsAvailable = true;
    } catch {
      // An SQLite build without FTS5. The LIKE path still answers correctly,
      // just more slowly, and saying so beats refusing to open the database.
      this.#ftsAvailable = false;
      return;
    }

    const indexed = this.#db.prepare('SELECT COUNT(*) AS n FROM games_fts').get().n;
    if (indexed === 0 && gameCount > 0) this.rebuildSearchIndex();
  }

  /** Recount every player from `games`. */
  rebuildPlayers() {
    this.#db.exec('BEGIN');
    try {
      this.#db.exec('DELETE FROM players');
      this.#db.exec(`
        INSERT INTO players (name_key, name, games)
        SELECT name_key, MAX(name), SUM(n) FROM (
          SELECT white_key AS name_key, white AS name, COUNT(*) AS n
            FROM games GROUP BY white_key, white
          UNION ALL
          SELECT black_key AS name_key, black AS name, COUNT(*) AS n
            FROM games GROUP BY black_key, black
        ) GROUP BY name_key
      `);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Rebuild the metadata index from `games`. */
  rebuildSearchIndex() {
    if (!this.#ftsAvailable) return;
    this.#db.exec('BEGIN');
    try {
      this.#db.exec("INSERT INTO games_fts(games_fts) VALUES('delete-all')");
      this.#db.exec(`
        INSERT INTO games_fts (rowid, white, black, event, site, eco, opening)
        SELECT id, white, black, COALESCE(event, ''), COALESCE(site, ''),
               COALESCE(eco, ''), COALESCE(opening, '')
          FROM games
      `);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Classification columns, added to a collection that predates them.
   *
   * Same pattern as `#ensurePositionColumns`: the columns are declared in the
   * schema for a new file and added by ALTER for an old one, so a collection
   * created before Phase 12 opens and answers normally with every game simply
   * unclassified until the backfill visits it.
   */
  #ensureGameColumns() {
    const columns = new Set(
      this.#db
        .prepare('PRAGMA table_info(games)')
        .all()
        .map((row) => row.name),
    );
    for (const [name, type] of [
      ['classified_eco', 'TEXT'],
      ['classified_name', 'TEXT'],
      ['classified_variation', 'TEXT'],
      ['classified_ply', 'INTEGER'],
      ['classified_with', 'TEXT'],
    ]) {
      if (!columns.has(name)) this.#db.exec(`ALTER TABLE games ADD COLUMN ${name} ${type}`);
    }
    // Indexed only after the columns exist, which is why these are here rather
    // than in SCHEMA: SCHEMA runs before the ALTERs and would fail on an old
    // collection that has not been widened yet.
    this.#db.exec(`
      CREATE INDEX IF NOT EXISTS games_classified_eco ON games(classified_eco);
      CREATE INDEX IF NOT EXISTS games_classified_with ON games(classified_with);
    `);
  }

  /**
   * Widen `positions` to whatever its own schema is missing.
   *
   * Two eras of collection arrive here. One predates Phase 8 and is missing
   * structure columns entirely; one is mid-migration and has both sets. The
   * distinguishing column is `pawn_skeleton`: a file that has it is on the
   * text schema and is widened with the text columns, and a file that does not
   * is compact and is widened with the compact ones. Adding the other set to
   * either would be the one thing that makes `detectSchemaVersion` lie.
   */
  #ensurePositionColumns() {
    const columns = new Set(
      this.#db
        .prepare('PRAGMA table_info(positions)')
        .all()
        .map((row) => row.name),
    );
    const compact = !columns.has('pawn_skeleton');
    for (const [name, type] of [
      ['node_id', 'TEXT'],
      ['year_key', 'INTEGER'],
      ['rating_key', 'INTEGER'],
      ['result_key', 'TEXT'],
      ...(compact
        ? [
            ['halfmove', 'INTEGER'],
            ['fullmove', 'INTEGER'],
            ['fen_literal', 'TEXT'],
            ['pawn_skeleton_id', 'INTEGER'],
            ['structure_signature_id', 'INTEGER'],
            ['structure_claims_id', 'INTEGER'],
          ]
        : [
            ['fen', 'TEXT'],
            ['structure_signature', 'TEXT'],
            ['structure_claims', 'TEXT'],
          ]),
    ]) {
      if (!columns.has(name)) this.#db.exec(`ALTER TABLE positions ADD COLUMN ${name} ${type}`);
    }
    // The index is empty once migrated. Without it the claimed existence
    // check scanned every full position row on every database open.
    this.#db.exec(
      'CREATE INDEX IF NOT EXISTS positions_missing_result ON positions(game_id) WHERE result_key IS NULL',
    );
    // One-time migration for pre-Phase-8 collections. NULL is the marker; a
    // collection already migrated pays only the indexed existence check.
    if (this.#db.prepare('SELECT 1 FROM positions WHERE result_key IS NULL LIMIT 1').get()) {
      this.#db.exec(`
        UPDATE positions SET
          year_key = COALESCE((SELECT year FROM games WHERE games.id = positions.game_id), 0),
          rating_key = COALESCE((SELECT max_rating FROM games WHERE games.id = positions.game_id), 0),
          result_key = (SELECT result FROM games WHERE games.id = positions.game_id)
        WHERE result_key IS NULL;
      `);
    }
  }

  /**
   * Fold the write-ahead log back into the database file.
   *
   * WAL mode checkpoints on its own often enough for ordinary use, where a
   * transaction is a few hundred games. It does not keep up with a bulk import
   * of hundreds of thousands, and the log then grows beside a database that is
   * already tens of gigabytes — so a caller importing at that scale needs to be
   * able to ask, rather than watch a disk fill with a file SQLite intends to
   * discard. TRUNCATE rather than PASSIVE because reclaiming the space is the
   * entire point.
   */
  checkpoint() {
    this.#db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  /**
   * Seams for the claim-index tests, and for nothing else.
   *
   * The three of them exist because the claim index can only be tested against
   * states no caller can reach through the API: a collection whose index has
   * been removed, and the scan the index replaced. Named so that a reader
   * grepping for production callers finds none.
   */
  handleForTest() {
    return this.#db;
  }

  fileForTest() {
    return this.#file;
  }

  /** The claim search as it was before the index: a LIKE over every claim set. */
  searchStructuresByScanForTest(query) {
    const was = this.#claimIndexReady;
    this.#claimIndexReady = false;
    try {
      return this.searchStructures(query);
    } finally {
      this.#claimIndexReady = was;
    }
  }

  close() {
    this.#db.close();
  }

  count() {
    return this.#db.prepare('SELECT COUNT(*) AS n FROM games').get().n;
  }

  /** Rebuild the derived rows transactionally, for migration and repair. */
  rebuildAggregates() {
    this.#db.exec('BEGIN');
    try {
      this.#db.exec(REBUILD_DERIVED);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Cheap consistency facts for diagnostics and tests; no guessed repair. */
  aggregateIntegrity() {
    return this.#db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM positions) AS positions,
           (SELECT COALESCE(SUM(games), 0) FROM position_aggregates) AS aggregatedPositions,
           (SELECT COUNT(*) FROM position_aggregates) AS aggregateRows,
           (SELECT COUNT(*) FROM position_filter_cache_keys) AS filteredCacheKeys,
           (SELECT COUNT(*) FROM position_filter_cache) AS filteredAggregateRows`,
      )
      .get();
  }

  /**
   * Insert a batch inside one transaction.
   *
   * The batch is the unit of atomicity, as it is for the IndexedDB importer: a
   * cancelled import leaves whole games, never a summary whose moves are
   * missing. Duplicates are decided by the same fingerprint the browser
   * computes, so a game imported through either path is the same game.
   */
  insertGames(batch) {
    const insertGame = this.#db.prepare(`
      INSERT OR IGNORE INTO games (
        fingerprint, white, black, white_key, black_key, result, date, year,
        event, site, round, white_rating, black_rating, max_rating, eco,
        opening, ply_count, imported_at,
        classified_eco, classified_name, classified_variation, classified_ply,
        classified_with
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const insertContent = this.#db.prepare(
      'INSERT OR REPLACE INTO game_content (game_id, pgn) VALUES (?,?)',
    );
    const insertPosition = this.#sql.compact
      ? this.#db.prepare(`
          INSERT INTO positions (
            position_key, game_id, ply, move_uci, move_san, mover, node_id,
            halfmove, fullmove, fen_literal,
            pawn_skeleton_id, structure_signature_id, structure_claims_id,
            year_key, rating_key, result_key
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `)
      : this.#db.prepare(`
          INSERT INTO positions (
            position_key, game_id, ply, move_uci, move_san, mover, fen, node_id,
            pawn_skeleton, structure_signature, structure_claims,
            year_key, rating_key, result_key
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);
    const findId = this.#db.prepare('SELECT id FROM games WHERE fingerprint = ?');
    /*
      Maintained here rather than by a trigger: the import already runs inside
      one transaction, and a trigger would fire per row with no way to skip it
      during a bulk rebuild.
    */
    const bumpPlayer = this.#db.prepare(`
      INSERT INTO players (name_key, name, games) VALUES (?, ?, 1)
      ON CONFLICT(name_key) DO UPDATE SET games = games + 1, name = excluded.name
    `);
    const insertFts = this.#ftsAvailable
      ? this.#db.prepare(`
          INSERT INTO games_fts (rowid, white, black, event, site, eco, opening)
          VALUES (?,?,?,?,?,?,?)
        `)
      : null;
    const clearFilterCache = this.#db.prepare(
      'DELETE FROM position_filter_cache WHERE position_key = ?',
    );
    const clearFilterTotal = this.#db.prepare(
      'DELETE FROM position_filter_total_cache WHERE position_key = ?',
    );
    const clearFilterKey = this.#db.prepare(
      'DELETE FROM position_filter_cache_keys WHERE position_key = ?',
    );

    let imported = 0;
    let duplicates = 0;
    const touchedPositions = new Set();
    this.#db.exec('BEGIN');
    try {
      for (const entry of batch) {
        const game = entry.game;
        const existing = findId.get(game.fingerprint);
        if (existing) {
          duplicates += 1;
          continue;
        }
        const ratings = [game.whiteRating, game.blackRating].filter(
          (value) => typeof value === 'number',
        );
        insertGame.run(
          game.fingerprint,
          game.white,
          game.black,
          game.whiteKey,
          game.blackKey,
          game.result,
          game.date ?? null,
          game.year ?? null,
          game.event ?? null,
          game.site ?? null,
          game.round ?? null,
          game.whiteRating ?? null,
          game.blackRating ?? null,
          ratings.length ? Math.max(...ratings) : null,
          game.eco ?? null,
          game.opening ?? null,
          game.plyCount ?? null,
          game.importedAt ?? Date.now(),
          /*
            Classified by the browser during import, so a freshly imported
            collection needs no backfill pass at all. Absent when the client
            could not load the opening index; the backfill then finds these
            rows exactly as it finds a pre-Phase-12 collection's.
          */
          game.classification?.eco ?? null,
          game.classification?.name ?? null,
          game.classification?.variation ?? null,
          game.classification?.ply ?? null,
          game.classifiedWith ?? null,
        );
        const id = findId.get(game.fingerprint).id;
        insertContent.run(id, entry.pgn ?? '');
        bumpPlayer.run(game.whiteKey, game.white);
        bumpPlayer.run(game.blackKey, game.black);
        insertFts?.run(
          id,
          game.white,
          game.black,
          game.event ?? '',
          game.site ?? '',
          game.eco ?? '',
          game.opening ?? '',
        );
        /*
          One row per (game, position, move). The client indexer already
          collapses repetitions, but this is an HTTP boundary, and the
          invariant is what lets the trigger-maintained aggregates, the
          normalized scan and the exact filter cache all agree on a count.
        */
        const seen = new Set();
        for (const position of entry.positions ?? []) {
          const identity = `${position.positionKey}|${position.moveUci}`;
          if (seen.has(identity)) continue;
          seen.add(identity);
          touchedPositions.add(position.positionKey);
          const claims = position.structureClaims ? JSON.stringify(position.structureClaims) : null;
          const tail = this.#sql.compact
            ? (() => {
                const { halfmove, fullmove, literal } = splitFen(
                  position.fen ?? null,
                  position.positionKey,
                );
                return [
                  position.nodeId ?? null,
                  halfmove,
                  fullmove,
                  literal,
                  this.#internId('pawn_skeletons', position.pawnSkeleton ?? null),
                  this.#internId('structure_signatures', position.structureSignature ?? null),
                  this.#internId('structure_claim_sets', claims),
                ];
              })()
            : [
                position.fen ?? null,
                position.nodeId ?? null,
                position.pawnSkeleton ?? null,
                position.structureSignature ?? null,
                claims,
              ];
          insertPosition.run(
            position.positionKey,
            id,
            position.ply,
            position.moveUci,
            position.moveSan,
            position.mover,
            ...tail,
            game.year ?? 0,
            ratings.length ? Math.max(...ratings) : 0,
            game.result,
          );
        }
        imported += 1;
      }
      for (const key of touchedPositions) {
        clearFilterCache.run(key);
        clearFilterTotal.run(key);
        clearFilterKey.run(key);
      }
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
    return { imported, duplicates };
  }

  /**
   * Delete exact games in one transaction and rebuild exactly what changed.
   *
   * The per-row delete trigger re-aggregates a whole (position, move) group
   * for every cascaded row, so removing a thousand games from a popular
   * opening re-reads that group a thousand times. Suppressing the trigger and
   * rebuilding every derived row instead is correct but reads the entire
   * collection. This collects the affected position keys first, so the rebuild
   * reads only the positions the deletion could possibly have changed.
   */
  deleteGamesByFingerprint(fingerprints) {
    const remove = this.#db.prepare('DELETE FROM games WHERE fingerprint = ?');
    const collect = this.#db.prepare(
      `INSERT OR IGNORE INTO affected_positions (position_key)
       SELECT p.position_key FROM positions p
       JOIN games g ON g.id = p.game_id
       WHERE g.fingerprint = ?`,
    );
    let deleted = 0;
    this.#db.exec('DROP TRIGGER IF EXISTS positions_aggregate_delete');
    this.#db.exec('BEGIN');
    try {
      this.#db.exec('DELETE FROM affected_positions');
      for (const fingerprint of fingerprints) {
        collect.run(fingerprint);
        deleted += Number(remove.run(fingerprint).changes);
      }
      this.#db.exec(REBUILD_AFFECTED);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      this.#db.exec(SCHEMA);
      throw error;
    }
    this.#db.exec(SCHEMA);
    /*
      Rebuilt rather than decremented. Deletion is rare and already bulk,
      whereas getting a per-row decrement wrong leaves a player listed with a
      game count no game supports — a wrong answer that survives until
      somebody notices, which is worse than a slower delete.
    */
    if (deleted > 0) {
      this.rebuildPlayers();
      this.rebuildSearchIndex();
    }
    return { deleted };
  }

  /**
   * A page of summaries.
   *
   * `hasMore` rather than a total: see ADR 0014. A count over a filtered set
   * costs the same scan as the page itself, and callers overwhelmingly want to
   * know whether there is a next page, not how many pages there are. An exact
   * total is available on request and is honestly labelled when it is not.
   */
  search(query = {}) {
    const { params, clause } = gameWhere(query, { fts: this.#ftsAvailable });

    const SORTS = {
      importedAt: 'imported_at',
      date: 'date',
      white: 'white',
      black: 'black',
      rating: 'max_rating',
      opening: 'opening',
    };
    // Whitelisted, never interpolated from the request.
    const column = SORTS[query.sortBy] ?? 'imported_at';
    const direction = query.sortDirection === 'asc' ? 'ASC' : 'DESC';
    /*
      A total order, so paging is deterministic.

      Every sort column here has ties — a bulk import stamps hundreds of games
      with the same `imported_at` millisecond, and thousands share an opening
      or a rating. `ORDER BY` on its own leaves the order within a tie up to
      the query plan, which is how a game can appear on two pages of the same
      result and another on none. The primary key breaks every tie and is free:
      it is the rowid the row is already being read by.
    */
    const order = `${column} ${direction}, id ${direction}`;
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
    const offset = Math.max(Number(query.offset) || 0, 0);

    // One row over the page size answers "is there a next page" exactly,
    // without counting anything.
    const rows = query.text
      ? this.#pageByIdFirst(clause, params, order, limit, offset)
      : this.#db
          .prepare(`SELECT * FROM games ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`)
          .all(...params, limit + 1, offset);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    let total = null;
    if (query.exactTotal) {
      total = this.#db.prepare(`SELECT COUNT(*) AS n FROM games ${clause}`).get(...params).n;
    }

    return { games: page.map(toSummary), hasMore, total, offset, limit };
  }

  /**
   * The same page, fetched in two steps, for a text search.
   *
   * A common term matches a large fraction of a collection, and there is no
   * index that can order that set — SQLite builds a temp B-tree. `SELECT *`
   * makes it carry **every column of every matching row** through that sort to
   * return a hundred: on a real 60,469-game collection, "open" matches 17,566
   * games and the sort moved all of them.
   *
   * Selecting only the id makes each entry in the sort tiny; the hundred full
   * rows are then fetched by primary key. Measured on that collection, five
   * alternating runs of each on fresh connections:
   *
   *   "open"      23.3 ms → 7.1 ms      "sicilian"  16.9 ms → 6.4 ms
   *   "masters"    3.5 ms → 1.2 ms
   *
   * The rows and their order are identical — asserted, not assumed, in
   * `database.test.mjs`. Only the text path takes it: every other filter has
   * an index behind it and does not materialise anything like as much, and a
   * second round trip would cost more than it saved.
   *
   * Three plans that looked promising and were measured to be worse are
   * recorded in `docs/performance/phase-17-search.md`, so nobody tries them
   * again.
   */
  #pageByIdFirst(clause, params, order, limit, offset) {
    const ids = this.#db
      .prepare(`SELECT id FROM games ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, limit + 1, offset)
      .map((row) => row.id);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.#db
      .prepare(`SELECT * FROM games WHERE id IN (${placeholders}) ORDER BY ${order}`)
      .all(...ids);
  }

  content(id) {
    const row = this.#db.prepare('SELECT pgn FROM game_content WHERE game_id = ?').get(id);
    return row ? row.pgn : null;
  }

  /** Every move played from a canonical position, aggregated. */
  explore(positionKey, limit = 24, filters = {}) {
    const where = ['p.position_key = ?'];
    const params = [positionKey];
    if (filters.minRating) {
      where.push('g.max_rating >= ?');
      params.push(filters.minRating);
    }
    if (filters.maxRating) {
      where.push('g.max_rating <= ?');
      params.push(filters.maxRating);
    }
    if (filters.sinceYear) {
      where.push('g.year >= ?');
      params.push(filters.sinceYear);
    }
    if (filters.untilYear) {
      where.push('g.year <= ?');
      params.push(filters.untilYear);
    }
    if (filters.player) {
      if (filters.playerColor === 'w') where.push('g.white_key = ?');
      else if (filters.playerColor === 'b') where.push('g.black_key = ?');
      else where.push('(g.white_key = ? OR g.black_key = ?)');
      params.push(filters.player);
      if (!filters.playerColor) params.push(filters.player);
    }

    const filtered = where.length > 1;
    if (!filtered) return this.#exploreAggregated(positionKey, limit);
    if (!filters.player) return this.#exploreFilteredAggregated(positionKey, limit, filters);

    const clause = where.join(' AND ');
    const rows = this.#db
      .prepare(
        `SELECT p.move_uci AS uci, MIN(p.move_san) AS san, MIN(p.mover) AS mover,
                COUNT(*) AS games,
                SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END) AS white,
                SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END) AS draws,
                SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END) AS black,
                AVG(g.max_rating) AS averageRating,
                MAX(g.year) AS lastPlayedYear
         FROM positions p JOIN games g ON g.id = p.game_id
         WHERE ${clause}
         GROUP BY p.move_uci
         ORDER BY games DESC
         LIMIT ?`,
      )
      .all(...params, limit);

    const totals = this.#db
      .prepare(
        `SELECT COUNT(DISTINCT p.game_id) AS games,
                SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END) AS white,
                SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END) AS draws,
                SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END) AS black
         FROM positions p JOIN games g ON g.id = p.game_id
         WHERE ${clause}`,
      )
      .get(...params);

    return {
      moves: rows.map((row) => ({
        uci: row.uci,
        san: row.san,
        games: row.games,
        white: row.white ?? 0,
        draws: row.draws ?? 0,
        black: row.black ?? 0,
        averageRating: row.averageRating ? Math.round(row.averageRating) : undefined,
        lastPlayedYear: row.lastPlayedYear ?? undefined,
      })),
      totalGames: totals?.games ?? 0,
      white: totals?.white ?? 0,
      draws: totals?.draws ?? 0,
      black: totals?.black ?? 0,
    };
  }

  #exploreFilteredAggregated(positionKey, limit, filters) {
    this.#ensureFilterCache(positionKey);
    const where = ['position_key = ?'];
    const params = [positionKey];
    if (filters.minRating) {
      where.push('rating_key >= ?');
      params.push(filters.minRating);
    }
    if (filters.maxRating) {
      where.push('rating_key <= ? AND rating_key > 0');
      params.push(filters.maxRating);
    }
    if (filters.sinceYear) {
      where.push('year_key >= ?');
      params.push(filters.sinceYear);
    }
    if (filters.untilYear) {
      where.push('year_key <= ? AND year_key > 0');
      params.push(filters.untilYear);
    }
    const clause = where.join(' AND ');
    const rows = this.#db
      .prepare(
        `SELECT move_uci AS uci, MIN(move_san) AS san, MIN(mover) AS mover,
                SUM(games) AS games,
                SUM(CASE WHEN result_key = '1-0' THEN games ELSE 0 END) AS white,
                SUM(CASE WHEN result_key = '1/2-1/2' THEN games ELSE 0 END) AS draws,
                SUM(CASE WHEN result_key = '0-1' THEN games ELSE 0 END) AS black,
                SUM(CASE WHEN rating_key > 0 THEN rating_key * games ELSE 0 END) * 1.0 /
                  NULLIF(SUM(CASE WHEN rating_key > 0 THEN games ELSE 0 END), 0) AS averageRating,
                NULLIF(MAX(year_key), 0) AS lastPlayedYear
         FROM position_filter_cache
         WHERE ${clause}
         GROUP BY move_uci
         ORDER BY games DESC
         LIMIT ?`,
      )
      .all(...params, limit);
    const totals = this.#db
      .prepare(
        `SELECT COALESCE(SUM(games), 0) AS games,
                SUM(CASE WHEN result_key = '1-0' THEN games ELSE 0 END) AS white,
                SUM(CASE WHEN result_key = '1/2-1/2' THEN games ELSE 0 END) AS draws,
                SUM(CASE WHEN result_key = '0-1' THEN games ELSE 0 END) AS black
         FROM position_filter_total_cache WHERE ${clause}`,
      )
      .get(...params);
    return explorerResult(rows, totals);
  }

  #ensureFilterCache(positionKey) {
    const now = Date.now();
    if (
      this.#db
        .prepare('SELECT 1 FROM position_filter_cache_keys WHERE position_key = ?')
        .get(positionKey)
    ) {
      this.#db
        .prepare('UPDATE position_filter_cache_keys SET last_used = ? WHERE position_key = ?')
        .run(now, positionKey);
      return;
    }
    this.#db.exec('BEGIN');
    try {
      this.#db
        .prepare(
          `INSERT INTO position_filter_cache (
             position_key, move_uci, move_san, mover, year_key, rating_key, result_key, games
           )
           SELECT position_key, move_uci, MIN(move_san), MIN(mover),
                  COALESCE(year_key, 0), COALESCE(rating_key, 0), result_key,
                  COUNT(DISTINCT game_id)
           FROM positions WHERE position_key = ?
           GROUP BY position_key, move_uci, year_key, rating_key, result_key`,
        )
        .run(positionKey);
      this.#db
        .prepare(
          `INSERT INTO position_filter_total_cache (
             position_key, year_key, rating_key, result_key, games
           )
           SELECT position_key, COALESCE(year_key, 0), COALESCE(rating_key, 0), result_key,
                  COUNT(DISTINCT game_id)
           FROM positions WHERE position_key = ?
           GROUP BY position_key, year_key, rating_key, result_key`,
        )
        .run(positionKey);
      this.#db
        .prepare('INSERT INTO position_filter_cache_keys (position_key, last_used) VALUES (?, ?)')
        .run(positionKey, now);
      const stale = this.#db
        .prepare(
          `SELECT position_key FROM position_filter_cache_keys
           ORDER BY last_used DESC LIMIT -1 OFFSET 128`,
        )
        .all();
      const dropMoves = this.#db.prepare(
        'DELETE FROM position_filter_cache WHERE position_key = ?',
      );
      const dropTotals = this.#db.prepare(
        'DELETE FROM position_filter_total_cache WHERE position_key = ?',
      );
      const dropKey = this.#db.prepare(
        'DELETE FROM position_filter_cache_keys WHERE position_key = ?',
      );
      for (const row of stale) {
        dropMoves.run(row.position_key);
        dropTotals.run(row.position_key);
        dropKey.run(row.position_key);
      }
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  #exploreAggregated(positionKey, limit) {
    const rows = this.#db
      .prepare(
        `SELECT move_uci AS uci, move_san AS san, mover, games,
                white_wins AS white, draws, black_wins AS black,
                CASE WHEN rating_count > 0 THEN rating_total * 1.0 / rating_count END AS averageRating,
                latest_year AS lastPlayedYear
         FROM position_aggregates
         WHERE position_key = ?
         ORDER BY games DESC
         LIMIT ?`,
      )
      .all(positionKey, limit);
    const totals = this.#db
      .prepare(
        `SELECT COALESCE(SUM(games), 0) AS games,
                COALESCE(SUM(white_wins), 0) AS white,
                COALESCE(SUM(draws), 0) AS draws,
                COALESCE(SUM(black_wins), 0) AS black
         FROM position_aggregates WHERE position_key = ?`,
      )
      .get(positionKey);
    return {
      moves: rows.map((row) => ({
        uci: row.uci,
        san: row.san,
        games: row.games,
        white: row.white,
        draws: row.draws,
        black: row.black,
        averageRating: row.averageRating ? Math.round(row.averageRating) : undefined,
        lastPlayedYear: row.lastPlayedYear ?? undefined,
      })),
      totalGames: totals.games,
      white: totals.white,
      draws: totals.draws,
      black: totals.black,
    };
  }

  /** Games reaching a position, most recent first, for the model-game list. */
  gamesAtPosition(positionKey, limit = 12) {
    return this.#db
      .prepare(
        `SELECT g.* FROM positions p JOIN games g ON g.id = p.game_id
         WHERE p.position_key = ?
         GROUP BY g.id
         ORDER BY g.max_rating DESC, g.year DESC
         LIMIT ?`,
      )
      .all(positionKey, limit)
      .map(toSummary);
  }

  /**
   * What was played *after* this position, in the games that reached it.
   *
   * The explorer answers "what move came next", one ply at a time, which is
   * the right shape for browsing and the wrong shape for asking where the
   * pieces end up. `src/theory/opening-plans.ts` counts destinations by
   * replaying a game's continuation, and it needs the continuation.
   *
   * The position index already holds it: one row per (game, ply) carrying the
   * move played, so the continuation of a game is its own rows above the ply
   * it reached this position at. No movetext is parsed and no PGN is read —
   * this is the same index the explorer aggregates, asked a different question.
   *
   * A game that reaches the position twice — a repetition — contributes from
   * the *first* time, which is the one a reader means by "after this
   * position".
   */
  continuationsAt(positionKey, { games = 200, plies = 30 } = {}) {
    const reached = this.#db
      .prepare(
        `SELECT p.game_id AS gameId, MIN(p.ply) AS ply
           FROM positions p JOIN games g ON g.id = p.game_id
          WHERE p.position_key = ?
          GROUP BY p.game_id
          ORDER BY MAX(g.max_rating) DESC, MAX(g.year) DESC
          LIMIT ?`,
      )
      .all(positionKey, Math.max(1, Math.min(1000, games)));
    if (reached.length === 0) return [];

    const moves = this.#db.prepare(
      `SELECT p.move_uci AS uci FROM positions p
        WHERE p.game_id = ? AND p.ply >= ? AND p.ply < ?
        ORDER BY p.ply`,
    );
    return reached.map((row) => ({
      gameId: String(row.gameId),
      moves: moves
        .all(row.gameId, row.ply, row.ply + Math.max(1, Math.min(120, plies)))
        .map((move) => move.uci),
    }));
  }

  /**
   * A page of complete games, for copying to another collection.
   *
   * Everything the destination needs and nothing it does not: the summary, the
   * normalized movetext, and the position rows that were computed at import.
   * Shipping the positions rather than recomputing them at the far end is what
   * keeps a SQLite-to-SQLite copy from re-deriving structural identities that
   * are already stored and already correct — and it is what makes the copy of
   * a game byte-for-byte the same game, which is what a fingerprint asserts.
   *
   * Paged by id, and optionally narrowed by the same matcher the game list
   * uses, so "copy these search results" copies exactly what was on screen.
   */
  exportPage(after = null, limit = 200, query = null) {
    const parts = [];
    const params = [];
    if (query && Object.keys(query).length > 0) {
      const built = gameWhere(query, { fts: this.#ftsAvailable });
      parts.push(...built.where);
      params.push(...built.params);
    }
    if (after !== null && after !== undefined && String(after).length > 0) {
      parts.push('id > ?');
      params.push(Number(after));
    }
    const clause = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
    const rows = this.#db
      .prepare(`SELECT * FROM games ${clause} ORDER BY id LIMIT ?`)
      .all(...params, limit);
    if (rows.length === 0) return { games: [], nextAfter: null };

    const content = this.#db.prepare('SELECT pgn FROM game_content WHERE game_id = ?');
    const positions = this.#db.prepare(
      `SELECT p.position_key AS positionKey, p.ply, p.move_uci AS moveUci, p.move_san AS moveSan,
              p.mover, ${this.#sql.fen} AS fen, p.node_id AS nodeId,
              ${this.#sql.pawnSkeleton} AS pawnSkeleton,
              ${this.#sql.structureSignature} AS structureSignature,
              ${this.#sql.structureClaims} AS structureClaims
         FROM positions p ${this.#sql.join} WHERE p.game_id = ? ORDER BY p.ply`,
    );
    const games = rows.map((row) => ({
      summary: toSummary(row),
      plyCount: row.ply_count ?? null,
      pgn: content.get(row.id)?.pgn ?? null,
      positions: positions.all(row.id).map((position) => ({
        ...position,
        structureClaims: parseClaims(position.structure_claims ?? position.structureClaims),
      })),
    }));
    return { games, nextAfter: String(rows[rows.length - 1].id) };
  }

  /**
   * Which of these fingerprints this collection already holds.
   *
   * The primitive behind the merge preview, the move's post-copy verification
   * and cross-collection duplicate search. Answered from the unique index, in
   * chunks the caller chooses, so none of those three has to read a game.
   */
  haveFingerprints(fingerprints) {
    if (!Array.isArray(fingerprints) || fingerprints.length === 0) return { present: [] };
    const placeholders = fingerprints.map(() => '?').join(',');
    const rows = this.#db
      .prepare(`SELECT fingerprint FROM games WHERE fingerprint IN (${placeholders})`)
      .all(...fingerprints.map(String));
    return { present: rows.map((row) => row.fingerprint) };
  }

  /**
   * Metadata keys for duplicate detection across collections.
   *
   * Two keys per game because they answer different questions. The fingerprint
   * is exact: same players, same moves, same movetext down to the comments, so
   * two games sharing one are interchangeable and removing either loses
   * nothing. The metadata key is coarser — players, date, event, round, result
   * — so two games sharing it but not the fingerprint are the same game
   * recorded twice with different annotations, which is a thing to show
   * somebody rather than a thing to resolve for them.
   */
  duplicateKeys(after = null, limit = 5000) {
    const params = [];
    let clause = '';
    if (after !== null && after !== undefined && String(after).length > 0) {
      clause = 'WHERE id > ?';
      params.push(Number(after));
    }
    const rows = this.#db
      .prepare(
        `SELECT id, fingerprint, white, black, date, event, round, result
           FROM games ${clause} ORDER BY id LIMIT ?`,
      )
      .all(...params, limit);
    if (rows.length === 0) return { games: [], nextAfter: null };
    return {
      games: rows.map((row) => ({
        id: String(row.id),
        fingerprint: row.fingerprint,
        white: row.white,
        black: row.black,
        date: row.date ?? undefined,
        event: row.event ?? undefined,
        round: row.round ?? undefined,
        result: row.result,
      })),
      nextAfter: String(rows[rows.length - 1].id),
    };
  }

  /**
   * Games this opening index has not looked at, oldest id first.
   *
   * Paged by id rather than by OFFSET, so a backfill over half a million games
   * costs one index seek per page instead of re-walking everything before it.
   * The position keys come back with the games: the client has the opening
   * table and the companion has the positions, and shipping the keys is far
   * cheaper than shipping half a megabyte of index the other way.
   *
   * `ply >= 2` because the row at ply n holds the position *before* ply n, so
   * ply 1 is the starting position and names nothing.
   */
  unclassifiedGames(digest, limit = 200, after = null, maxPly = 40) {
    const params = [];
    let clause = '(classified_with IS NULL OR classified_with <> ?)';
    params.push(String(digest));
    if (after !== null && after !== undefined && String(after).length > 0) {
      clause += ' AND id > ?';
      params.push(Number(after));
    }
    const rows = this.#db
      .prepare(`SELECT id FROM games WHERE ${clause} ORDER BY id LIMIT ?`)
      .all(...params, limit);
    if (rows.length === 0) return { games: [], nextAfter: null };

    /*
      One row per ply, plus the last row's FEN and move so the client can
      replay the single move that produces the game's final position. That
      position is the only main-line one no row is "before", and for a game
      that ends inside the opening it is the one that names it.
    */
    const keys = this.#db.prepare(
      `SELECT p.ply, MIN(p.position_key) AS positionKey, MIN(${this.#sql.fen}) AS fen,
              MIN(p.move_uci) AS moveUci
         FROM positions p
        WHERE p.game_id = ? AND p.ply <= ?
        GROUP BY p.ply
        ORDER BY p.ply`,
    );
    const games = rows.map((row) => {
      const plies = keys.all(row.id, maxPly + 1);
      const last = plies[plies.length - 1];
      return {
        id: String(row.id),
        positionKeys: plies.filter((entry) => entry.ply >= 2).map((entry) => entry.positionKey),
        ...(last && last.fen ? { finalFen: last.fen, finalMoveUci: last.moveUci } : {}),
      };
    });
    return { games, nextAfter: String(rows[rows.length - 1].id) };
  }

  classificationRemaining(digest) {
    const total = this.#db.prepare('SELECT COUNT(*) AS n FROM games').get().n;
    const done = this.#db
      .prepare('SELECT COUNT(*) AS n FROM games WHERE classified_with = ?')
      .get(String(digest)).n;
    return { remaining: Math.max(0, total - done), total, classified: done };
  }

  /**
   * Store classifications the browser computed.
   *
   * One transaction per page, exactly like `applyStructures`: the page is the
   * unit that either lands or does not, which is what makes a cancelled
   * backfill resumable rather than ambiguous. The companion writes what it is
   * given and derives no chess fact of its own.
   */
  applyClassification(entries) {
    const update = this.#db.prepare(
      `UPDATE games SET classified_eco = ?, classified_name = ?, classified_variation = ?,
                        classified_ply = ?, classified_with = ?
        WHERE id = ?`,
    );
    let updated = 0;
    this.#db.exec('BEGIN');
    try {
      for (const entry of entries) {
        const named = entry.classification ?? null;
        const result = update.run(
          named ? String(named.eco) : null,
          named ? String(named.name) : null,
          named && named.variation ? String(named.variation) : null,
          named ? Number(named.ply) : null,
          String(entry.classifiedWith),
          Number(entry.id),
        );
        updated += Number(result.changes ?? 0);
      }
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
    return { updated, ...this.classificationRemaining(entries[0]?.classifiedWith ?? '') };
  }

  /**
   * Distinct positions still missing their structural identity.
   *
   * Collections imported before the structure index existed carry NULL in
   * these columns, and re-importing every game to fix that would be absurd —
   * the games are already here and unchanged. What is missing is derivable,
   * and derivable from the position key alone.
   *
   * Distinct *keys*, not rows: a popular opening position appears in tens of
   * thousands of rows and its structure is identical in all of them, so the
   * expensive part is done once per position rather than once per game.
   */
  unindexedPositions(limit = 500) {
    const rows = this.#db
      .prepare(
        `SELECT p.position_key AS positionKey FROM positions p
         WHERE ${this.#sql.skeletonIsNull}
         GROUP BY p.position_key
         LIMIT ?`,
      )
      .all(limit);
    return { positions: rows, remaining: this.unindexedCount() };
  }

  unindexedCount() {
    return this.#db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT p.position_key FROM positions p
            WHERE ${this.#sql.skeletonIsNull} GROUP BY p.position_key
         )`,
      )
      .get().n;
  }

  /**
   * Write structural identities computed by the client.
   *
   * The companion has no chess rules — deliberately, since a second
   * implementation of them is a second thing that can be wrong. So the browser
   * computes the keys from the position key it was handed and posts them back,
   * and this only stores what it is told, for rows that still have nothing.
   *
   * `pawn_skeleton IS NULL` in the WHERE clause makes the whole operation
   * idempotent: a resumed or repeated backfill cannot overwrite a row that a
   * newer import has already indexed properly.
   */
  applyStructures(entries) {
    const update = this.#sql.compact
      ? this.#db.prepare(
          `UPDATE positions SET
             pawn_skeleton_id = ?, structure_signature_id = ?, structure_claims_id = ?,
             halfmove = COALESCE(halfmove, ?), fullmove = COALESCE(fullmove, ?),
             fen_literal = COALESCE(fen_literal, ?)
           WHERE position_key = ? AND pawn_skeleton_id IS NULL`,
        )
      : this.#db.prepare(
          `UPDATE positions SET
             pawn_skeleton = ?, structure_signature = ?, structure_claims = ?,
             fen = COALESCE(fen, ?)
           WHERE position_key = ? AND pawn_skeleton IS NULL`,
        );
    let updated = 0;
    this.#db.exec('BEGIN');
    try {
      for (const entry of entries) {
        const claims = entry.structureClaims ? JSON.stringify(entry.structureClaims) : null;
        const middle = this.#sql.compact
          ? (() => {
              const { halfmove, fullmove, literal } = splitFen(
                entry.fen ? String(entry.fen) : null,
                String(entry.positionKey),
              );
              return [
                this.#internId('pawn_skeletons', String(entry.pawnSkeleton)),
                this.#internId(
                  'structure_signatures',
                  entry.structureSignature ? String(entry.structureSignature) : null,
                ),
                this.#internId('structure_claim_sets', claims),
                halfmove,
                fullmove,
                literal,
              ];
            })()
          : [
              String(entry.pawnSkeleton),
              entry.structureSignature ? String(entry.structureSignature) : null,
              claims,
              entry.fen ? String(entry.fen) : null,
            ];
        updated += Number(update.run(...middle, String(entry.positionKey)).changes);
      }
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
    return { updated, remaining: this.unindexedCount() };
  }

  /**
   * Deterministic structure search over persisted, inspectable identities.
   *
   * Four modes and three orderings, and one of the twelve combinations was the
   * slowest thing in the product: a claim search on a large collection, at
   * 2,312 ms on 11.3 million positions. `#claimWhere` and `#searchRows` below
   * are where that was fixed; everything else here is unchanged.
   */
  searchStructures(query = {}) {
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    if (query.mode === 'exact-position') {
      return this.#searchRows(query, limit, ['p.position_key = ?'], [query.positionKey]);
    }
    if (query.mode === 'pawn-skeleton') {
      return this.#searchRows(query, limit, [this.#sql.skeletonEquals], [query.pawnSkeleton]);
    }
    if (query.mode === 'signature') {
      return this.#searchRows(
        query,
        limit,
        [this.#sql.signatureEquals],
        [query.structureSignature],
      );
    }
    return this.#searchByClaims(query, limit);
  }

  /**
   * The claim search, in whichever of two plans is cheaper for this claim.
   *
   * The seek plan is what this always was: find the matching positions, sort
   * them, cut to thirty. Its cost is the number of matches, which for a common
   * claim is millions.
   *
   * The scan plan walks `positions_rank` — the rank order the result is asked
   * for — testing each row for the claim, and stops at thirty. Its cost is
   * about `limit / selectivity`, which for a common claim is a few dozen rows.
   *
   * `claimPlan` chooses between them and explains the threshold. The important
   * property is that it chooses between two queries that return the same rows
   * in the same order: a wrong choice is slower and never different.
   */
  #searchByClaims(query, limit) {
    const claims = (query.claims ?? []).map((claim) => String(claim));
    if (claims.length === 0) return [];
    const membership = this.#claimWhere(claims);
    if (!membership) return [];
    if (membership.plan === 'seek') {
      return this.#searchRows(query, limit, [membership.sql], membership.params);
    }
    /*
      The relevance ordering leads with three terms the rank index cannot
      express — an exact position, then a shared skeleton, then a shared
      signature — so under that ordering the scan is the *last* of four passes
      rather than the only one. The first three each carry a selective equality
      the compact schema already indexes, so they are cheap, and taken in order
      they reproduce the ordering exactly. Ties beyond rating and year were
      arbitrary before and are arbitrary now.
    */
    const relevance = query.sort !== 'recent' && query.sort !== 'rating';
    const scan = () =>
      this.#searchRows(query, limit, [membership.sql], membership.params, {
        index: query.sort === 'recent' ? 'positions_recent' : 'positions_rank',
      });
    if (!relevance) return scan();

    const tiers = [
      { sql: 'p.position_key = ?', params: [query.positionKey] },
      { sql: this.#sql.skeletonEquals, params: [query.pawnSkeleton] },
      { sql: this.#sql.signatureEquals, params: [query.structureSignature] },
    ];
    const seen = new Set();
    const results = [];
    for (const tier of tiers) {
      if (tier.params[0] === undefined || tier.params[0] === null || tier.params[0] === '')
        continue;
      for (const row of this.#searchRows(
        query,
        limit,
        [membership.sql, tier.sql],
        [...membership.params, ...tier.params],
        { sort: 'rating' },
      )) {
        if (seen.has(row.position.id)) continue;
        seen.add(row.position.id);
        results.push(row);
        if (results.length >= limit) return results;
      }
    }
    for (const row of scan()) {
      if (seen.has(row.position.id)) continue;
      seen.add(row.position.id);
      results.push(row);
      if (results.length >= limit) break;
    }
    return results;
  }

  /**
   * The WHERE fragment that says "this position carries every one of these
   * claims", and which plan it should be run with.
   *
   * Under the compact schema this is `claim_set_members`: one seek per claim
   * rather than the LIKE scan over every claim set the text schema is stuck
   * with. `HAVING COUNT(*) = n` is what makes several claims an AND — a set
   * qualifies only by containing all of them.
   *
   * Returns null when a claim is not in the collection at all, which is a
   * result of none rather than a query worth running.
   */
  #claimWhere(claims) {
    if (!this.#sql.compact) {
      return {
        plan: 'seek',
        sql: claims.map(() => this.#sql.claimLike).join(' AND '),
        params: claims.map((claim) => `%${JSON.stringify(claim)}%`),
      };
    }
    /*
      Not built yet, or built and interrupted. Scanning is what this always
      did, and it is right; returning nothing because the index is empty would
      be a collection quietly claiming no game has that structure.
    */
    if (!this.#claimIndexReady) {
      return {
        plan: 'seek',
        sql: claims.map(() => this.#sql.claimLike).join(' AND '),
        params: claims.map((claim) => `%${JSON.stringify(claim)}%`),
      };
    }
    this.#claimLookup ??= this.#db.prepare('SELECT id, sets FROM claims WHERE value = ?');
    const rows = claims.map((claim) => this.#claimLookup.get(claim));
    if (rows.some((row) => row === undefined)) return null;

    const placeholders = claims.map(() => '?').join(', ');
    const sql =
      `p.structure_claims_id IN (SELECT set_id FROM claim_set_members WHERE claim_id IN (${placeholders})` +
      (claims.length > 1 ? ` GROUP BY set_id HAVING COUNT(*) = ${claims.length})` : ')');

    /*
      Several claims are an intersection, so the result is at most as large as
      the rarest of them; the rarest is therefore what the plan should be
      chosen on. Choosing on the commonest would send an intersection of two
      rare claims down the scan plan, which is the expensive mistake.
    */
    const rarest = Math.min(...rows.map((row) => row.sets));
    this.#totals ??= {};
    this.#totals.sets ??= this.#db
      .prepare('SELECT COUNT(*) AS n FROM structure_claim_sets')
      .get().n;
    this.#totals.positions ??= this.#db.prepare('SELECT COUNT(*) AS n FROM positions').get().n;
    return {
      plan: claimPlan({
        sets: rarest,
        totalSets: this.#totals.sets,
        totalPositions: this.#totals.positions,
        limit: 100,
      }),
      sql,
      params: rows.map((row) => row.id),
    };
  }

  /**
   * Run one structure query and shape its rows.
   *
   * `index` forces the rank index, which is what makes the ordered scan an
   * ordered scan: without it SQLite is free to pick the claim index and sort
   * afterwards, which is the plan being avoided. It is only ever passed for
   * the compact schema, where that index exists.
   */
  #searchRows(query, limit, where, params, { index = null, sort = query.sort } = {}) {
    /*
      The ordering reads the game's rating and year off the *position* row.

      `positions.rating_key` and `positions.year_key` are those two values,
      denormalised there for the filter cache — verified equal on every row of
      a real collection rather than assumed. Sorting on them means the join to
      `games` is needed for the thirty rows returned rather than for every row
      matched, and it is what lets an index satisfy the ORDER BY at all.
    */
    const order =
      sort === 'recent'
        ? 'p.year_key DESC, p.rating_key DESC'
        : sort === 'rating'
          ? 'p.rating_key DESC, p.year_key DESC'
          : `(p.position_key = ?) DESC, (${this.#sql.skeletonEquals}) DESC,
             (${this.#sql.signatureEquals}) DESC, p.rating_key DESC, p.year_key DESC`;
    const ordering =
      sort !== 'recent' && sort !== 'rating'
        ? [query.positionKey, query.pawnSkeleton, query.structureSignature]
        : [];
    const rows = this.#db
      .prepare(
        // The join is one-to-one on the game id, so there is nothing to group:
        // a GROUP BY here only forces a temporary b-tree over every match.
        `SELECT g.*, p.position_key, p.game_id, p.ply, p.move_uci, p.move_san, p.mover,
                p.node_id, ${this.#sql.fen} AS fen,
                ${this.#sql.pawnSkeleton} AS pawn_skeleton,
                ${this.#sql.structureSignature} AS structure_signature,
                ${this.#sql.structureClaims} AS structure_claims
           FROM positions p ${index ? `INDEXED BY ${index}` : ''} ${this.#sql.join}
           JOIN games g ON g.id = p.game_id
          WHERE ${where.join(' AND ')}
          ORDER BY ${order}
          LIMIT ?`,
      )
      .all(...params, ...ordering, limit);
    return rows.map((row) => ({
      game: toSummary(row),
      position: {
        id: `${row.game_id}:${row.ply}`,
        positionKey: row.position_key,
        gameId: String(row.game_id),
        ply: row.ply,
        moveUci: row.move_uci,
        moveSan: row.move_san,
        mover: row.mover,
        fen: row.fen ?? undefined,
        nodeId: row.node_id ?? undefined,
        pawnSkeleton: row.pawn_skeleton ?? undefined,
        structureSignature: row.structure_signature ?? undefined,
        structureClaims: parseClaims(row.structure_claims),
      },
      exactPosition: row.position_key === query.positionKey,
      samePawnSkeleton: row.pawn_skeleton === query.pawnSkeleton,
      sameSignature: row.structure_signature === query.structureSignature,
      sharedClaims: (query.claims ?? []).filter((claim) =>
        parseClaims(row.structure_claims).includes(claim),
      ).length,
    }));
  }

  /** Transactional deletion for an exact current game selection/filter. */
  deleteGamesMatching(query = {}) {
    /*
      The same matcher the list used. FTS prefix matching and LIKE substring
      matching do not select the same games, so asking one to choose what to
      show and the other what to delete would delete a different set from the
      one the user was looking at.
    */
    const { clause, params } = gameWhere(query, { fts: this.#ftsAvailable });
    const fingerprints = this.#db
      .prepare(`SELECT fingerprint FROM games ${clause}`)
      .all(...params)
      .map((row) => row.fingerprint);
    return this.deleteGamesByFingerprint(fingerprints);
  }

  /** Empty the collection. Truncation needs no per-position bookkeeping. */
  clear() {
    const deleted = this.count();
    this.#db.exec('DROP TRIGGER IF EXISTS positions_aggregate_delete');
    this.#db.exec('BEGIN');
    try {
      this.#db.exec(`
        DELETE FROM games;
        DELETE FROM players;
        DELETE FROM position_aggregates;
        DELETE FROM position_filter_cache;
        DELETE FROM position_filter_total_cache;
        DELETE FROM position_filter_cache_keys;
      `);
      if (this.#ftsAvailable) {
        this.#db.exec("INSERT INTO games_fts(games_fts) VALUES('delete-all')");
      }
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      this.#db.exec(SCHEMA);
      throw error;
    }
    this.#db.exec(SCHEMA);
    return { deleted };
  }

  /**
   * Players whose normalized name starts with a prefix, commonest first.
   *
   * A range scan over the players table rather than two aggregations over
   * every game. An empty prefix is the whole table ordered by game count,
   * which the players_games index answers directly.
   *
   * The bound is expressed as >= prefix AND < prefix + '\uffff' rather than
   * LIKE, so SQLite uses the primary key index for the range without needing
   * to know that the pattern has no leading wildcard.
   */
  players(prefix, limit = 20) {
    const key = String(prefix ?? '').toLowerCase();
    if (key === '') {
      return this.#db
        .prepare('SELECT name, games FROM players ORDER BY games DESC, name ASC LIMIT ?')
        .all(limit);
    }
    return this.#db
      .prepare(
        `SELECT name, games FROM players
          WHERE name_key >= ? AND name_key < ?
          ORDER BY games DESC, name ASC LIMIT ?`,
      )
      .all(key, `${key}\uffff`, limit);
  }
}

/**
 * An FTS5 MATCH expression from what a user typed.
 *
 * Every token is quoted and given a trailing prefix operator, so "carl kasp"
 * finds Carlsen against Kasparov and a stray quote or asterisk cannot become
 * syntax. Returns null when nothing usable is left, which sends the caller
 * back to the LIKE scan rather than matching everything.
 */
function ftsQuery(text) {
  const tokens = String(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"*`).join(' AND ');
}

function gameWhere(query, options = {}) {
  const where = [];
  const params = [];
  if (query.player) {
    if (query.playerColor === 'w') {
      where.push('white_key = ?');
      params.push(query.player);
    } else if (query.playerColor === 'b') {
      where.push('black_key = ?');
      params.push(query.player);
    } else {
      where.push('(white_key = ? OR black_key = ?)');
      params.push(query.player, query.player);
    }
  }
  if (query.text) {
    /*
      §48: the metadata index answers this in a single lookup, where the LIKE
      form was four leading-wildcard comparisons per row — a guaranteed full
      scan, 141 ms at 500,000 games. The LIKE path is kept for SQLite builds
      without FTS5 and for a query that tokenizes to nothing, because a slow
      correct answer beats a fast wrong one.
    */
    const match = options.fts ? ftsQuery(query.text) : null;
    if (match) {
      where.push('id IN (SELECT rowid FROM games_fts WHERE games_fts MATCH ?)');
      params.push(match);
    } else {
      where.push('(white LIKE ? OR black LIKE ? OR event LIKE ? OR opening LIKE ?)');
      const like = `%${query.text}%`;
      params.push(like, like, like, like);
    }
  }
  if (query.result) {
    where.push('result = ?');
    params.push(query.result);
  }
  if (query.fromYear) {
    where.push('year >= ?');
    params.push(query.fromYear);
  }
  if (query.toYear) {
    where.push('year <= ?');
    params.push(query.toYear);
  }
  if (query.minRating) {
    where.push('max_rating >= ?');
    params.push(query.minRating);
  }
  /*
    Both the declared tag and the computed classification, because a
    collection is very often a mix: games imported with an [ECO] tag, games
    imported without one and classified here, and games that have both. A
    search that consulted only one of the two would silently hide half of a
    normal archive.
  */
  if (query.eco) {
    where.push('(eco LIKE ? OR classified_eco LIKE ?)');
    params.push(`${query.eco}%`, `${query.eco}%`);
  }
  if (query.opening) {
    where.push('(opening LIKE ? OR classified_name LIKE ? OR classified_variation LIKE ?)');
    const like = `%${query.opening}%`;
    params.push(like, like, like);
  }
  return { where, params, clause: where.length ? `WHERE ${where.join(' AND ')}` : '' };
}

function explorerResult(rows, totals) {
  return {
    moves: rows.map((row) => ({
      uci: row.uci,
      san: row.san,
      games: row.games,
      white: row.white ?? 0,
      draws: row.draws ?? 0,
      black: row.black ?? 0,
      averageRating: row.averageRating ? Math.round(row.averageRating) : undefined,
      lastPlayedYear: row.lastPlayedYear ?? undefined,
    })),
    totalGames: totals?.games ?? 0,
    white: totals?.white ?? 0,
    draws: totals?.draws ?? 0,
    black: totals?.black ?? 0,
  };
}

function parseClaims(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((claim) => typeof claim === 'string') : [];
  } catch {
    return [];
  }
}

const toSummary = (row) => ({
  id: String(row.id),
  fingerprint: row.fingerprint,
  white: row.white,
  black: row.black,
  whiteKey: row.white_key,
  blackKey: row.black_key,
  playerKeys: row.white_key === row.black_key ? [row.white_key] : [row.white_key, row.black_key],
  result: row.result,
  date: row.date ?? undefined,
  year: row.year ?? undefined,
  event: row.event ?? undefined,
  site: row.site ?? undefined,
  round: row.round ?? undefined,
  whiteRating: row.white_rating ?? undefined,
  blackRating: row.black_rating ?? undefined,
  eco: row.eco ?? undefined,
  opening: row.opening ?? undefined,
  importedAt: row.imported_at,
  ...(row.classified_eco
    ? {
        classification: {
          eco: row.classified_eco,
          name: row.classified_name ?? '',
          ...(row.classified_variation ? { variation: row.classified_variation } : {}),
          ply: row.classified_ply ?? 0,
        },
      }
    : {}),
  ...(row.classified_with ? { classifiedWith: row.classified_with } : {}),
});
