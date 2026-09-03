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
  imported_at   INTEGER NOT NULL
);

-- The movetext lives apart from what the list and the search read, exactly as
-- schema v3 does in IndexedDB, so a page of results never touches it.
CREATE TABLE IF NOT EXISTS game_content (
  game_id       INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  pgn           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  position_key  TEXT NOT NULL,
  game_id       INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply           INTEGER NOT NULL,
  move_uci      TEXT NOT NULL,
  move_san      TEXT NOT NULL,
  mover         TEXT NOT NULL,
  fen           TEXT,
  node_id       TEXT,
  pawn_skeleton TEXT,
  structure_signature TEXT,
  structure_claims TEXT,
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

  constructor(file) {
    this.#db = new DatabaseSync(file);
    this.#db.exec(SCHEMA);
    this.#db.exec(AFFECTED_POSITIONS_TABLE);
    this.#ensurePositionColumns();
    this.#db.exec(`
      CREATE INDEX IF NOT EXISTS positions_pawn_skeleton ON positions(pawn_skeleton)
        WHERE pawn_skeleton IS NOT NULL;
      CREATE INDEX IF NOT EXISTS positions_structure_signature ON positions(structure_signature)
        WHERE structure_signature IS NOT NULL;
    `);
    const aggregateCount = this.#db
      .prepare('SELECT COUNT(*) AS n FROM position_aggregates')
      .get().n;
    const positionCount = this.#db.prepare('SELECT COUNT(*) AS n FROM positions').get().n;
    if (aggregateCount === 0 && positionCount > 0) this.rebuildAggregates();
  }

  #ensurePositionColumns() {
    const columns = new Set(
      this.#db
        .prepare('PRAGMA table_info(positions)')
        .all()
        .map((row) => row.name),
    );
    for (const [name, type] of [
      ['fen', 'TEXT'],
      ['node_id', 'TEXT'],
      ['pawn_skeleton', 'TEXT'],
      ['structure_signature', 'TEXT'],
      ['structure_claims', 'TEXT'],
      ['year_key', 'INTEGER'],
      ['rating_key', 'INTEGER'],
      ['result_key', 'TEXT'],
    ]) {
      if (!columns.has(name)) this.#db.exec(`ALTER TABLE positions ADD COLUMN ${name} ${type}`);
    }
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
        opening, ply_count, imported_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const insertContent = this.#db.prepare(
      'INSERT OR REPLACE INTO game_content (game_id, pgn) VALUES (?,?)',
    );
    const insertPosition = this.#db.prepare(`
      INSERT INTO positions (
        position_key, game_id, ply, move_uci, move_san, mover, fen, node_id,
        pawn_skeleton, structure_signature, structure_claims,
        year_key, rating_key, result_key
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const findId = this.#db.prepare('SELECT id FROM games WHERE fingerprint = ?');
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
        );
        const id = findId.get(game.fingerprint).id;
        insertContent.run(id, entry.pgn ?? '');
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
          insertPosition.run(
            position.positionKey,
            id,
            position.ply,
            position.moveUci,
            position.moveSan,
            position.mover,
            position.fen ?? null,
            position.nodeId ?? null,
            position.pawnSkeleton ?? null,
            position.structureSignature ?? null,
            position.structureClaims ? JSON.stringify(position.structureClaims) : null,
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
    const { params, clause } = gameWhere(query);

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
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
    const offset = Math.max(Number(query.offset) || 0, 0);

    // One row over the page size answers "is there a next page" exactly,
    // without counting anything.
    const rows = this.#db
      .prepare(`SELECT * FROM games ${clause} ORDER BY ${column} ${direction} LIMIT ? OFFSET ?`)
      .all(...params, limit + 1, offset);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    let total = null;
    if (query.exactTotal) {
      total = this.#db.prepare(`SELECT COUNT(*) AS n FROM games ${clause}`).get(...params).n;
    }

    return { games: page.map(toSummary), hasMore, total, offset, limit };
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
        `SELECT position_key AS positionKey FROM positions
         WHERE pawn_skeleton IS NULL
         GROUP BY position_key
         LIMIT ?`,
      )
      .all(limit);
    return { positions: rows, remaining: this.unindexedCount() };
  }

  unindexedCount() {
    return this.#db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT position_key FROM positions WHERE pawn_skeleton IS NULL GROUP BY position_key
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
    const update = this.#db.prepare(
      `UPDATE positions SET
         pawn_skeleton = ?, structure_signature = ?, structure_claims = ?,
         fen = COALESCE(fen, ?)
       WHERE position_key = ? AND pawn_skeleton IS NULL`,
    );
    let updated = 0;
    this.#db.exec('BEGIN');
    try {
      for (const entry of entries) {
        updated += Number(
          update.run(
            String(entry.pawnSkeleton),
            entry.structureSignature ? String(entry.structureSignature) : null,
            entry.structureClaims ? JSON.stringify(entry.structureClaims) : null,
            entry.fen ? String(entry.fen) : null,
            String(entry.positionKey),
          ).changes,
        );
      }
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
    return { updated, remaining: this.unindexedCount() };
  }

  /** Deterministic structure search over persisted, inspectable identities. */
  searchStructures(query = {}) {
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    const where = [];
    const params = [];
    if (query.mode === 'exact-position') {
      where.push('p.position_key = ?');
      params.push(query.positionKey);
    } else if (query.mode === 'pawn-skeleton') {
      where.push('p.pawn_skeleton = ?');
      params.push(query.pawnSkeleton);
    } else if (query.mode === 'signature') {
      where.push('p.structure_signature = ?');
      params.push(query.structureSignature);
    } else {
      for (const claim of query.claims ?? []) {
        // Claims are stored as a JSON string array. Quoting the complete JSON
        // string avoids substring matches such as `open:c` vs `semi-open:c`.
        where.push('p.structure_claims LIKE ?');
        params.push(`%${JSON.stringify(String(claim))}%`);
      }
    }
    if (where.length === 0) return [];
    const order =
      query.sort === 'recent'
        ? 'g.year DESC, g.max_rating DESC'
        : query.sort === 'rating'
          ? 'g.max_rating DESC, g.year DESC'
          : `(p.position_key = ?) DESC, (p.pawn_skeleton = ?) DESC,
             (p.structure_signature = ?) DESC, g.max_rating DESC, g.year DESC`;
    if (query.sort !== 'recent' && query.sort !== 'rating') {
      params.push(query.positionKey, query.pawnSkeleton, query.structureSignature);
    }
    const rows = this.#db
      .prepare(
        // The join is one-to-one on the game id, so there is nothing to group:
        // a GROUP BY here only forces a temporary b-tree over every match.
        `SELECT p.*, g.* FROM positions p JOIN games g ON g.id = p.game_id
         WHERE ${where.join(' AND ')}
         ORDER BY ${order}
         LIMIT ?`,
      )
      .all(...params, limit);
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
    const { clause, params } = gameWhere(query);
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
        DELETE FROM position_aggregates;
        DELETE FROM position_filter_cache;
        DELETE FROM position_filter_total_cache;
        DELETE FROM position_filter_cache_keys;
      `);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      this.#db.exec(SCHEMA);
      throw error;
    }
    this.#db.exec(SCHEMA);
    return { deleted };
  }

  players(prefix, limit = 20) {
    return this.#db
      .prepare(
        `SELECT name, SUM(n) AS games FROM (
           SELECT white AS name, COUNT(*) AS n FROM games WHERE white_key LIKE ? GROUP BY white
           UNION ALL
           SELECT black AS name, COUNT(*) AS n FROM games WHERE black_key LIKE ? GROUP BY black
         ) GROUP BY name ORDER BY games DESC LIMIT ?`,
      )
      .all(`${prefix}%`, `${prefix}%`, limit);
  }
}

function gameWhere(query) {
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
    where.push('(white LIKE ? OR black LIKE ? OR event LIKE ? OR opening LIKE ?)');
    const like = `%${query.text}%`;
    params.push(like, like, like, like);
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
  if (query.eco) {
    where.push('eco LIKE ?');
    params.push(`${query.eco}%`);
  }
  if (query.opening) {
    where.push('opening LIKE ?');
    params.push(`%${query.opening}%`);
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
});
