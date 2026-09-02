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
  mover         TEXT NOT NULL
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

CREATE INDEX IF NOT EXISTS games_white_key   ON games(white_key);
CREATE INDEX IF NOT EXISTS games_black_key   ON games(black_key);
CREATE INDEX IF NOT EXISTS games_year        ON games(year);
CREATE INDEX IF NOT EXISTS games_result      ON games(result);
CREATE INDEX IF NOT EXISTS games_eco         ON games(eco);
CREATE INDEX IF NOT EXISTS games_max_rating  ON games(max_rating);
CREATE INDEX IF NOT EXISTS games_imported    ON games(imported_at);
CREATE INDEX IF NOT EXISTS positions_key     ON positions(position_key);
CREATE INDEX IF NOT EXISTS positions_game    ON positions(game_id);

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

export class GameDatabase {
  #db;

  constructor(file) {
    this.#db = new DatabaseSync(file);
    this.#db.exec(SCHEMA);
    const aggregateCount = this.#db
      .prepare('SELECT COUNT(*) AS n FROM position_aggregates')
      .get().n;
    const positionCount = this.#db.prepare('SELECT COUNT(*) AS n FROM positions').get().n;
    if (aggregateCount === 0 && positionCount > 0) this.rebuildAggregates();
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
      this.#db.exec(`
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
      `);
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
           (SELECT COUNT(*) FROM position_aggregates) AS aggregateRows`,
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
      INSERT INTO positions (position_key, game_id, ply, move_uci, move_san, mover)
      VALUES (?,?,?,?,?,?)
    `);
    const findId = this.#db.prepare('SELECT id FROM games WHERE fingerprint = ?');

    let imported = 0;
    let duplicates = 0;
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
        for (const position of entry.positions ?? []) {
          insertPosition.run(
            position.positionKey,
            id,
            position.ply,
            position.moveUci,
            position.moveSan,
            position.mover,
          );
        }
        imported += 1;
      }
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
    return { imported, duplicates };
  }

  /** Delete exact games and let foreign keys plus aggregate triggers do the rest. */
  deleteGamesByFingerprint(fingerprints) {
    const remove = this.#db.prepare('DELETE FROM games WHERE fingerprint = ?');
    let deleted = 0;
    this.#db.exec('BEGIN');
    try {
      for (const fingerprint of fingerprints) deleted += Number(remove.run(fingerprint).changes);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
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

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
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
