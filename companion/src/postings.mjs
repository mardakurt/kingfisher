/**
 * The posting layout: a companion collection's position index at a twentieth
 * of the size (Phase 86).
 *
 * `docs/design/compact-position-postings.md` has the measurement. On 100,445
 * real games the position side of a collection was 3,257.7 MB — a row per ply
 * carrying the text key, UCI, SAN and mover, indexed six more ways, beside an
 * aggregate table nearly as large as the tail it aggregates — and the same
 * questions were answered identically from 179.9 MB of this:
 *
 *   postings(pos, game, ply, move)   one b-tree, clustered by position
 *
 * `pos` is the first eight bytes of SHA-256 of the canonical `positionKey()`,
 * so a position is still its identity and transpositions still meet; `move`
 * packs from, to and promotion into fifteen bits. SAN and the mover are not
 * stored: the position and the move determine both, and the rules code the
 * companion already ships (the import kit) derives SAN when a row is read.
 *
 * What a collection in this layout does **not** keep is the per-ply
 * structure columns (pawn skeleton, signature, claims). At the sizes this
 * layout is for, those questions are answered by the line index's move search
 * — measured equal to the replayed oracle at 10.7 million games — and the
 * structure routes say so instead of answering from nothing.
 *
 * Everything here is derived. The authoritative record is the game — its
 * PGN, in `game_content` — and every table in this file can be rebuilt from
 * the games: `game_plies` from the rows imported, the hot aggregates and the
 * filter cells from `postings`.
 */

import { createHash } from 'node:crypto';

export const POSTINGS_SCHEMA = 3;

/** The `schema_state` key that marks a collection as using this layout. */
export const LAYOUT_KEY = 'position_layout';
export const POSTINGS_LAYOUT = 'postings';

/**
 * A position with at least this many games keeps exact aggregates, so the
 * unfiltered explorer does not count its range on every visit. Below it the
 * clustered range is a handful of rows and is read directly. The threshold is
 * a speed decision only: both paths return the same numbers, and a position
 * that crosses it between rebuilds is simply read directly until the next.
 */
export const HOT_GAMES = 64;

/** Filtered-cell caches kept at once, as for the text schema's filter cache. */
const FILTER_CACHE_POSITIONS = 128;

/*
  A bulk load writes postings in import order, which is random in the hash.
  Inserting them straight into a clustered tree larger than memory — 700
  million rows at ten million games, on a machine with 18 GB — is a random
  read and write per row. So a bulk load appends them to 64 staging tables,
  one per range of the hash's top six bits, and `finishBulk` sorts each range
  into `postings` in ascending order and drops it: the tree is written once,
  densely, in key order, and each dropped range's pages are reused by the next,
  so the file never holds much more than the index plus one range.
*/
export const STAGE_PARTITIONS = 64;
const stageTable = (index) => `posting_stage_${String(index).padStart(2, '0')}`;
/** Signed 64-bit hash to its partition, in ascending signed order. */
export const partitionOf = (pos) => Number((BigInt(pos) >> 58n) + 32n);

export const POSTINGS_TABLES = `
CREATE TABLE IF NOT EXISTS postings (
  pos  INTEGER NOT NULL,
  game INTEGER NOT NULL,
  ply  INTEGER NOT NULL,
  move INTEGER NOT NULL,
  PRIMARY KEY (pos, game, ply)
) WITHOUT ROWID;

-- Per game, its postings in the order they were written: ply (2 bytes),
-- position hash (8 bytes) and move (2 bytes) each. Deleting a game, reading
-- what followed a position, and rebuilding the aggregates need nothing else.
CREATE TABLE IF NOT EXISTS game_plies (
  game  INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  plies BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS posting_aggregates (
  pos          INTEGER NOT NULL,
  move         INTEGER NOT NULL,
  games        INTEGER NOT NULL,
  white        INTEGER NOT NULL,
  draws        INTEGER NOT NULL,
  black        INTEGER NOT NULL,
  rating_total INTEGER NOT NULL,
  rating_count INTEGER NOT NULL,
  latest_year  INTEGER,
  PRIMARY KEY (pos, move)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS posting_filter_cells (
  pos        INTEGER NOT NULL,
  move       INTEGER NOT NULL,
  year_key   INTEGER NOT NULL,
  rating_key INTEGER NOT NULL,
  result_key TEXT NOT NULL,
  games      INTEGER NOT NULL,
  PRIMARY KEY (pos, move, year_key, rating_key, result_key)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS posting_filter_totals (
  pos        INTEGER NOT NULL,
  year_key   INTEGER NOT NULL,
  rating_key INTEGER NOT NULL,
  result_key TEXT NOT NULL,
  games      INTEGER NOT NULL,
  PRIMARY KEY (pos, year_key, rating_key, result_key)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS posting_filter_keys (
  pos       INTEGER PRIMARY KEY,
  last_used INTEGER NOT NULL
);
`;

const FILES = 'abcdefgh';
const PROMOTIONS = ['', 'n', 'b', 'r', 'q'];
const square = (text) => FILES.indexOf(text[0]) + (Number(text[1]) - 1) * 8;
const squareName = (index) => `${FILES[index % 8]}${Math.floor(index / 8) + 1}`;

/** from (6 bits) | to (6 bits) | promotion (3 bits). */
export function encodeMove(uci) {
  const text = String(uci);
  const promotion = PROMOTIONS.indexOf(text.slice(4));
  if (!/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(text) || promotion < 0) {
    throw new Error(`Not a UCI move: ${text}`);
  }
  return square(text.slice(0, 2)) | (square(text.slice(2, 4)) << 6) | (promotion << 12);
}

export function decodeMove(code) {
  const value = Number(code);
  return `${squareName(value & 63)}${squareName((value >> 6) & 63)}${PROMOTIONS[value >> 12]}`;
}

/** The first eight bytes of SHA-256 of the canonical key, as a signed 64-bit integer. */
export function positionHash(positionKey) {
  return createHash('sha256').update(String(positionKey)).digest().readBigInt64BE(0);
}

/** The side to move, from a canonical key's second field. */
const moverOf = (positionKey) => (String(positionKey).split(' ')[1] === 'b' ? 'b' : 'w');

const PLY_BYTES = 12;

export function packPlies(entries) {
  const buffer = Buffer.alloc(entries.length * PLY_BYTES);
  entries.forEach((entry, index) => {
    const offset = index * PLY_BYTES;
    buffer.writeUInt16BE(entry.ply, offset);
    buffer.writeBigInt64BE(entry.pos, offset + 2);
    buffer.writeUInt16BE(entry.move, offset + 10);
  });
  return buffer;
}

export function unpackPlies(blob) {
  const buffer = Buffer.from(blob);
  const entries = [];
  for (let offset = 0; offset + PLY_BYTES <= buffer.length; offset += PLY_BYTES) {
    entries.push({
      ply: buffer.readUInt16BE(offset),
      pos: buffer.readBigInt64BE(offset + 2),
      move: buffer.readUInt16BE(offset + 10),
    });
  }
  return entries;
}

export const readLayout = (db) => {
  try {
    return (
      db.prepare('SELECT value FROM schema_state WHERE key = ?').get(LAYOUT_KEY)?.value ?? null
    );
  } catch {
    return null;
  }
};

/**
 * The position index of a collection in the posting layout.
 *
 * `moveSan(positionKey, uci)` is the rules code's SAN, from the import kit;
 * it returns `null` for a move that is not legal in the position, which is
 * how a hash collision would show itself — such a row is left out and the
 * answer says so (`unverifiedMoves`), rather than another position's move
 * being shown as this one's.
 */
export class PostingIndex {
  #db;
  #moveSan;
  #sanMap;
  /** UCI → SAN per position, most recent last; see `#san`. */
  #sanCache = new Map();
  #statements = new Map();
  #bulk = false;

  constructor(db, { moveSan, sanMap } = {}) {
    this.#db = db;
    this.#moveSan = moveSan ?? null;
    this.#sanMap = sanMap ?? null;
    db.exec(POSTINGS_TABLES);
    /*
      An interrupted bulk load leaves postings staged, and a staged posting is
      invisible to every query. Finishing the merge is the resumption of that
      load, so it happens here rather than leaving the explorer to answer from
      part of the collection.
    */
    if (this.#stagedTables().length > 0) {
      this.finishBulk();
      db.exec('BEGIN');
      try {
        this.rebuildHot();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  }

  #stagedTables() {
    return this.#db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'posting\\_stage\\_%' ESCAPE '\\' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
  }

  /** Stage postings instead of inserting them; see `STAGE_PARTITIONS`. */
  beginBulk() {
    for (let index = 0; index < STAGE_PARTITIONS; index += 1) {
      this.#db.exec(
        `CREATE TABLE IF NOT EXISTS ${stageTable(index)} (
           pos INTEGER NOT NULL, game INTEGER NOT NULL, ply INTEGER NOT NULL, move INTEGER NOT NULL
         )`,
      );
    }
    this.#bulk = true;
  }

  /**
   * Sort every staged range into `postings`, in ascending order, one range
   * per transaction so an interruption resumes at the next range. The caller
   * rebuilds the hot aggregates afterwards (`GameDatabase.endBulk`).
   */
  finishBulk({ onProgress = null } = {}) {
    this.#bulk = false;
    const tables = this.#stagedTables();
    const outer = this.#db.isTransaction;
    tables.forEach((table, index) => {
      if (!outer) this.#db.exec('BEGIN');
      try {
        this.#db.exec(`
          INSERT OR IGNORE INTO postings (pos, game, ply, move)
          SELECT pos, game, ply, move FROM ${table} ORDER BY pos, game, ply;
          DROP TABLE ${table};
        `);
        if (!outer) this.#db.exec('COMMIT');
      } catch (error) {
        if (!outer) this.#db.exec('ROLLBACK');
        throw error;
      }
      onProgress?.({ merged: index + 1, total: tables.length });
    });
    this.#statements.clear();
    return tables.length;
  }

  /**
   * Open the index of a collection that uses this layout, or make an empty
   * collection use it. A collection that already holds games in the row
   * layout is never switched here: that is `migrateToPostings`.
   */
  static open(db, { create = false, moveSan, sanMap } = {}) {
    if (readLayout(db) === POSTINGS_LAYOUT) return new PostingIndex(db, { moveSan, sanMap });
    if (!create) return null;
    if (db.prepare('SELECT 1 FROM games LIMIT 1').get()) {
      throw new Error(
        'This collection already holds games in the row layout; convert it rather than switching it.',
      );
    }
    const index = new PostingIndex(db, { moveSan, sanMap });
    db.prepare('INSERT OR REPLACE INTO schema_state (key, value) VALUES (?, ?)').run(
      LAYOUT_KEY,
      POSTINGS_LAYOUT,
    );
    return index;
  }

  setMoveSan(moveSan, sanMap = null) {
    this.#moveSan = moveSan;
    this.#sanMap = sanMap;
    this.#sanCache.clear();
  }

  #prepare(sql) {
    let statement = this.#statements.get(sql);
    if (!statement) {
      statement = this.#db.prepare(sql);
      this.#statements.set(sql, statement);
    }
    return statement;
  }

  /*
    SAN through the rules code. With the kit's `sanMap`, one move generation
    per position serves every move of it, and the last 1,024 positions are
    kept, so a board walked back and forth does not regenerate. The map holds
    only legal moves, so a move absent from it is exactly a move the rules
    reject — the same `null` `moveSan` gives.
  */
  #san(positionKey, uci) {
    if (this.#sanMap) {
      let map = this.#sanCache.get(positionKey);
      if (map) {
        this.#sanCache.delete(positionKey);
      } else {
        map = this.#sanMap(positionKey);
        if (this.#sanCache.size >= 1024) {
          this.#sanCache.delete(this.#sanCache.keys().next().value);
        }
      }
      this.#sanCache.set(positionKey, map);
      return map.get(uci) ?? null;
    }
    if (!this.#moveSan) {
      throw new Error(
        'This collection keeps the compact position index, which reads moves through the ' +
          "rules code, and the companion's import kit is not loaded.",
      );
    }
    return this.#moveSan(positionKey, uci);
  }

  // ── Writing ──────────────────────────────────────────────────────────

  /**
   * One game's positions, already reduced to one row per (position, move) by
   * the caller — the same invariant the row layout keeps, so every count
   * agrees with it. `game` carries the result, year and maximum rating the hot
   * aggregates need; `maintain` is false inside a bulk load, which rebuilds
   * them once at its end.
   */
  add(gameId, positions, game, { maintain = true } = {}) {
    const insertPosting = this.#prepare(
      'INSERT OR IGNORE INTO postings (pos, game, ply, move) VALUES (?, ?, ?, ?)',
    );
    const insert = this.#bulk
      ? {
          run: (pos, ...rest) =>
            this.#prepare(
              `INSERT INTO ${stageTable(partitionOf(pos))} (pos, game, ply, move) VALUES (?, ?, ?, ?)`,
            ).run(pos, ...rest),
        }
      : insertPosting;
    const entries = [];
    const touched = new Set();
    for (const position of positions) {
      const entry = {
        ply: Number(position.ply),
        pos: positionHash(position.positionKey),
        move: encodeMove(position.moveUci),
      };
      entries.push(entry);
      insert.run(entry.pos, gameId, entry.ply, entry.move);
      touched.add(entry.pos);
    }
    this.#prepare('INSERT OR REPLACE INTO game_plies (game, plies) VALUES (?, ?)').run(
      gameId,
      packPlies(entries),
    );
    if (!maintain) return touched;
    const isHot = this.#prepare('SELECT 1 FROM posting_aggregates WHERE pos = ? LIMIT 1');
    const bump = this.#prepare(`
      INSERT INTO posting_aggregates (
        pos, move, games, white, draws, black, rating_total, rating_count, latest_year
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(pos, move) DO UPDATE SET
        games = games + 1,
        white = white + excluded.white,
        draws = draws + excluded.draws,
        black = black + excluded.black,
        rating_total = rating_total + excluded.rating_total,
        rating_count = rating_count + excluded.rating_count,
        latest_year = CASE
          WHEN latest_year IS NULL OR excluded.latest_year > latest_year THEN excluded.latest_year
          ELSE latest_year
        END`);
    const rating = typeof game.maxRating === 'number' ? game.maxRating : null;
    for (const entry of entries) {
      if (!isHot.get(entry.pos)) continue;
      bump.run(
        entry.pos,
        entry.move,
        game.result === '1-0' ? 1 : 0,
        game.result === '1/2-1/2' ? 1 : 0,
        game.result === '0-1' ? 1 : 0,
        rating ?? 0,
        rating === null ? 0 : 1,
        game.year ?? null,
      );
    }
    this.dropFilterCells(touched);
    return touched;
  }

  /**
   * Remove games' postings. Called before the game rows are deleted; the hot
   * rows each removed posting belonged to are recounted from what remains,
   * which keeps `latest_year` exact after its maximum leaves.
   */
  remove(gameIds) {
    const plies = this.#prepare('SELECT plies FROM game_plies WHERE game = ?');
    const drop = this.#prepare('DELETE FROM postings WHERE pos = ? AND game = ? AND ply = ?');
    const dropPlies = this.#prepare('DELETE FROM game_plies WHERE game = ?');
    const affected = new Map();
    for (const gameId of gameIds) {
      const row = plies.get(gameId);
      if (!row) continue;
      for (const entry of unpackPlies(row.plies)) {
        drop.run(entry.pos, gameId, entry.ply);
        affected.set(`${entry.pos}|${entry.move}`, entry);
      }
      dropPlies.run(gameId);
    }
    const isHot = this.#prepare('SELECT 1 FROM posting_aggregates WHERE pos = ? LIMIT 1');
    const touched = new Set();
    for (const entry of affected.values()) {
      touched.add(entry.pos);
      if (isHot.get(entry.pos)) this.#recountHot(entry.pos, entry.move);
    }
    this.dropFilterCells(touched);
    return touched;
  }

  #recountHot(pos, move) {
    this.#prepare('DELETE FROM posting_aggregates WHERE pos = ? AND move = ?').run(pos, move);
    this.#prepare(
      `
      INSERT INTO posting_aggregates (
        pos, move, games, white, draws, black, rating_total, rating_count, latest_year
      )
      SELECT p.pos, p.move, COUNT(*),
             SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END),
             SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END),
             SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END),
             COALESCE(SUM(g.max_rating), 0), COUNT(g.max_rating), MAX(g.year)
        FROM postings p JOIN games g ON g.id = p.game
       WHERE p.pos = ? AND p.move = ?
       GROUP BY p.pos, p.move`,
    ).run(pos, move);
  }

  /** Every hot aggregate, from the postings. Transaction is the caller's. */
  rebuildHot() {
    this.#db.exec(`
      DELETE FROM posting_aggregates;
      INSERT INTO posting_aggregates (
        pos, move, games, white, draws, black, rating_total, rating_count, latest_year
      )
      SELECT p.pos, p.move, COUNT(*),
             SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END),
             SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END),
             SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END),
             COALESCE(SUM(g.max_rating), 0), COUNT(g.max_rating), MAX(g.year)
        FROM postings p JOIN games g ON g.id = p.game
       WHERE p.pos IN (SELECT pos FROM postings GROUP BY pos HAVING COUNT(*) >= ${HOT_GAMES})
       GROUP BY p.pos, p.move;
      DELETE FROM posting_filter_cells;
      DELETE FROM posting_filter_totals;
      DELETE FROM posting_filter_keys;
    `);
  }

  dropFilterCells(positions) {
    const cells = this.#prepare('DELETE FROM posting_filter_cells WHERE pos = ?');
    const totals = this.#prepare('DELETE FROM posting_filter_totals WHERE pos = ?');
    const keys = this.#prepare('DELETE FROM posting_filter_keys WHERE pos = ?');
    for (const pos of positions) {
      cells.run(pos);
      totals.run(pos);
      keys.run(pos);
    }
  }

  clear() {
    this.#db.exec(`
      DELETE FROM postings;
      DELETE FROM game_plies;
      DELETE FROM posting_aggregates;
      DELETE FROM posting_filter_cells;
      DELETE FROM posting_filter_totals;
      DELETE FROM posting_filter_keys;
    `);
  }

  // ── Reading ──────────────────────────────────────────────────────────

  /**
   * Rows of `{ move, games, … }` into the explorer's shape, SAN derived and
   * checked. A move the rules code does not accept in this position cannot
   * belong to it; it is left out and counted.
   */
  #shape(positionKey, rows) {
    const mover = moverOf(positionKey);
    let unverified = 0;
    const moves = [];
    for (const row of rows) {
      const uci = decodeMove(row.move);
      const san = this.#san(positionKey, uci);
      if (san === null) {
        unverified += 1;
        continue;
      }
      moves.push({ ...row, uci, san, mover });
    }
    return { moves, unverified };
  }

  /** The same answer `GameDatabase.explore` gives from the row layout. */
  explore(positionKey, limit, filters) {
    const pos = positionHash(positionKey);
    const filtered =
      filters.minRating || filters.maxRating || filters.sinceYear || filters.untilYear;
    if (filters.player) return this.#explorePlayer(positionKey, pos, limit, filters);
    if (filtered) return this.#exploreFiltered(positionKey, pos, limit, filters);
    return this.#exploreUnfiltered(positionKey, pos, limit);
  }

  #exploreUnfiltered(positionKey, pos, limit) {
    const hot = this.#prepare('SELECT 1 FROM posting_aggregates WHERE pos = ? LIMIT 1').get(pos);
    const rows = hot
      ? this.#prepare(
          `SELECT move, games, white, draws, black, rating_total, rating_count, latest_year
             FROM posting_aggregates WHERE pos = ?`,
        ).all(pos)
      : this.#prepare(
          `SELECT p.move AS move, COUNT(*) AS games,
                  SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END) AS white,
                  SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END) AS draws,
                  SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END) AS black,
                  COALESCE(SUM(g.max_rating), 0) AS rating_total,
                  COUNT(g.max_rating) AS rating_count, MAX(g.year) AS latest_year
             FROM postings p JOIN games g ON g.id = p.game
            WHERE p.pos = ? GROUP BY p.move`,
        ).all(pos);
    const { moves, unverified } = this.#shape(positionKey, rows);
    // The row layout's totals are the sums over its moves; so are these.
    const totals = moves.reduce(
      (sum, row) => ({
        games: sum.games + row.games,
        white: sum.white + row.white,
        draws: sum.draws + row.draws,
        black: sum.black + row.black,
      }),
      { games: 0, white: 0, draws: 0, black: 0 },
    );
    moves.sort((a, b) => b.games - a.games || (a.uci < b.uci ? -1 : 1));
    return {
      moves: moves.slice(0, limit).map((row) => ({
        uci: row.uci,
        san: row.san,
        games: row.games,
        white: row.white,
        draws: row.draws,
        black: row.black,
        averageRating:
          row.rating_count > 0 ? Math.round(row.rating_total / row.rating_count) : undefined,
        lastPlayedYear: row.latest_year ?? undefined,
      })),
      totalGames: totals.games,
      white: totals.white,
      draws: totals.draws,
      black: totals.black,
      ...(unverified ? { unverifiedMoves: unverified } : {}),
    };
  }

  #ensureFilterCells(pos) {
    const now = Date.now();
    if (this.#prepare('SELECT 1 FROM posting_filter_keys WHERE pos = ?').get(pos)) {
      this.#prepare('UPDATE posting_filter_keys SET last_used = ? WHERE pos = ?').run(now, pos);
      return;
    }
    const inTransaction = this.#db.isTransaction;
    if (!inTransaction) this.#db.exec('BEGIN');
    try {
      this.#prepare(
        `
        INSERT INTO posting_filter_cells (pos, move, year_key, rating_key, result_key, games)
        SELECT p.pos, p.move, COALESCE(g.year, 0), COALESCE(g.max_rating, 0), g.result,
               COUNT(DISTINCT p.game)
          FROM postings p JOIN games g ON g.id = p.game
         WHERE p.pos = ?
         GROUP BY p.move, COALESCE(g.year, 0), COALESCE(g.max_rating, 0), g.result`,
      ).run(pos);
      this.#prepare(
        `
        INSERT INTO posting_filter_totals (pos, year_key, rating_key, result_key, games)
        SELECT p.pos, COALESCE(g.year, 0), COALESCE(g.max_rating, 0), g.result,
               COUNT(DISTINCT p.game)
          FROM postings p JOIN games g ON g.id = p.game
         WHERE p.pos = ?
         GROUP BY COALESCE(g.year, 0), COALESCE(g.max_rating, 0), g.result`,
      ).run(pos);
      this.#prepare('INSERT INTO posting_filter_keys (pos, last_used) VALUES (?, ?)').run(pos, now);
      // Read as BigInt: a hash read back as a Number loses its low bits and
      // would delete some other position's cells.
      const staleQuery = this.#prepare(
        `SELECT pos FROM posting_filter_keys ORDER BY last_used DESC LIMIT -1 OFFSET ${FILTER_CACHE_POSITIONS}`,
      );
      staleQuery.setReadBigInts(true);
      const stale = staleQuery.all();
      this.dropFilterCells(stale.map((row) => row.pos));
      if (!inTransaction) this.#db.exec('COMMIT');
    } catch (error) {
      if (!inTransaction) this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  #exploreFiltered(positionKey, pos, limit, filters) {
    this.#ensureFilterCells(pos);
    const where = ['pos = ?'];
    const params = [pos];
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
        `SELECT move, SUM(games) AS games,
                SUM(CASE WHEN result_key = '1-0' THEN games ELSE 0 END) AS white,
                SUM(CASE WHEN result_key = '1/2-1/2' THEN games ELSE 0 END) AS draws,
                SUM(CASE WHEN result_key = '0-1' THEN games ELSE 0 END) AS black,
                SUM(CASE WHEN rating_key > 0 THEN rating_key * games ELSE 0 END) * 1.0 /
                  NULLIF(SUM(CASE WHEN rating_key > 0 THEN games ELSE 0 END), 0) AS averageRating,
                NULLIF(MAX(year_key), 0) AS lastPlayedYear
           FROM posting_filter_cells WHERE ${clause} GROUP BY move`,
      )
      .all(...params);
    const totals = this.#db
      .prepare(
        `SELECT COALESCE(SUM(games), 0) AS games,
                SUM(CASE WHEN result_key = '1-0' THEN games ELSE 0 END) AS white,
                SUM(CASE WHEN result_key = '1/2-1/2' THEN games ELSE 0 END) AS draws,
                SUM(CASE WHEN result_key = '0-1' THEN games ELSE 0 END) AS black
           FROM posting_filter_totals WHERE ${clause}`,
      )
      .get(...params);
    return this.#result(positionKey, rows, totals, limit);
  }

  #explorePlayer(positionKey, pos, limit, filters) {
    const where = ['p.pos = ?'];
    const params = [pos];
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
    if (filters.playerColor === 'w') where.push('g.white_key = ?');
    else if (filters.playerColor === 'b') where.push('g.black_key = ?');
    else where.push('(g.white_key = ? OR g.black_key = ?)');
    params.push(filters.player);
    if (!filters.playerColor) params.push(filters.player);
    const clause = where.join(' AND ');
    const rows = this.#db
      .prepare(
        `SELECT p.move AS move, COUNT(*) AS games,
                SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END) AS white,
                SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END) AS draws,
                SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END) AS black,
                AVG(g.max_rating) AS averageRating, MAX(g.year) AS lastPlayedYear
           FROM postings p JOIN games g ON g.id = p.game
          WHERE ${clause} GROUP BY p.move`,
      )
      .all(...params);
    const totals = this.#db
      .prepare(
        `SELECT COUNT(DISTINCT p.game) AS games,
                SUM(CASE WHEN g.result = '1-0' THEN 1 ELSE 0 END) AS white,
                SUM(CASE WHEN g.result = '1/2-1/2' THEN 1 ELSE 0 END) AS draws,
                SUM(CASE WHEN g.result = '0-1' THEN 1 ELSE 0 END) AS black
           FROM postings p JOIN games g ON g.id = p.game WHERE ${clause}`,
      )
      .get(...params);
    return this.#result(positionKey, rows, totals, limit);
  }

  #result(positionKey, rows, totals, limit) {
    const { moves, unverified } = this.#shape(positionKey, rows);
    moves.sort((a, b) => b.games - a.games || (a.uci < b.uci ? -1 : 1));
    return {
      moves: moves.slice(0, limit).map((row) => ({
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
      ...(unverified ? { unverifiedMoves: unverified } : {}),
    };
  }

  /** Game rows reaching a position, strongest and latest first. */
  gamesAt(positionKey, limit) {
    return this.#prepare(
      `SELECT g.* FROM postings p JOIN games g ON g.id = p.game
        WHERE p.pos = ?
        GROUP BY g.id
        ORDER BY g.max_rating DESC, g.year DESC
        LIMIT ?`,
    ).all(positionHash(positionKey), limit);
  }

  /**
   * The occurrences of a position with their games, for the exact-position
   * search: one row per posting, as the row layout returns one per row, and
   * ordered as it orders them — rating then year, or year then rating for
   * "recent" (unknown counts as 0, as the row layout's keys do).
   */
  rowsAt(positionKey, limit, sort) {
    const order =
      sort === 'recent'
        ? 'COALESCE(g.year, 0) DESC, COALESCE(g.max_rating, 0) DESC'
        : 'COALESCE(g.max_rating, 0) DESC, COALESCE(g.year, 0) DESC';
    return this.#prepare(
      `SELECT g.*, p.ply AS ply, p.move AS move FROM postings p JOIN games g ON g.id = p.game
        WHERE p.pos = ? ORDER BY ${order} LIMIT ?`,
    ).all(positionHash(positionKey), limit);
  }

  /** As `GameDatabase.continuationsAt`, from each game's own plies. */
  continuationsAt(positionKey, games, plies) {
    const reached = this.#prepare(
      `SELECT p.game AS gameId, MIN(p.ply) AS ply
         FROM postings p JOIN games g ON g.id = p.game
        WHERE p.pos = ?
        GROUP BY p.game
        ORDER BY MAX(g.max_rating) DESC, MAX(g.year) DESC
        LIMIT ?`,
    ).all(positionHash(positionKey), games);
    const read = this.#prepare('SELECT plies FROM game_plies WHERE game = ?');
    return reached.map((row) => {
      const entries = unpackPlies(read.get(row.gameId)?.plies ?? Buffer.alloc(0))
        .filter((entry) => entry.ply >= row.ply && entry.ply < row.ply + plies)
        .sort((a, b) => a.ply - b.ply);
      return { gameId: String(row.gameId), moves: entries.map((entry) => decodeMove(entry.move)) };
    });
  }

  /** The diagnostics the row layout's `aggregateIntegrity` reports, for this layout. */
  integrity() {
    return this.#db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM postings
             WHERE pos IN (SELECT DISTINCT pos FROM posting_aggregates)) AS positions,
           (SELECT COALESCE(SUM(games), 0) FROM posting_aggregates) AS aggregatedPositions,
           (SELECT COUNT(*) FROM posting_aggregates) AS aggregateRows,
           (SELECT COUNT(*) FROM posting_filter_keys) AS filteredCacheKeys,
           (SELECT COUNT(*) FROM posting_filter_cells) AS filteredAggregateRows,
           (SELECT COUNT(*) FROM postings) AS postings`,
      )
      .get();
  }

  count() {
    return this.#prepare('SELECT COUNT(*) AS n FROM postings').get().n;
  }
}

/**
 * Convert a row-layout collection to the posting layout, in place.
 *
 * Forward-only and resumable, like the Phase 17 compaction: games are
 * converted in id order, a chunk per transaction, and the cursor is written
 * with the chunk, so an interruption resumes rather than restarts and never
 * leaves a game half-converted. The row tables are emptied only after every
 * game has its postings — and then checked: the posting count must equal the
 * row count it replaces, or the conversion stops before deleting anything.
 */
export function migrateToPostings(db, { chunk = 2_000, onProgress = null } = {}) {
  const CURSOR = 'postings_migration_cursor';
  db.exec(POSTINGS_TABLES);
  const readCursor = () =>
    Number(db.prepare('SELECT value FROM schema_state WHERE key = ?').get(CURSOR)?.value ?? 0);
  const writeCursor = db.prepare('INSERT OR REPLACE INTO schema_state (key, value) VALUES (?, ?)');
  if (readLayout(db) === POSTINGS_LAYOUT) return { converted: 0, alreadyDone: true };

  const total = db.prepare('SELECT COUNT(*) AS n FROM games').get().n;
  const gameIds = db.prepare('SELECT id FROM games WHERE id > ? ORDER BY id LIMIT ?');
  const rowsOf = db.prepare(
    'SELECT position_key AS positionKey, ply, move_uci AS moveUci FROM positions WHERE game_id = ? ORDER BY rowid',
  );
  const insert = db.prepare(
    'INSERT OR IGNORE INTO postings (pos, game, ply, move) VALUES (?, ?, ?, ?)',
  );
  const insertPlies = db.prepare('INSERT OR REPLACE INTO game_plies (game, plies) VALUES (?, ?)');
  let converted = 0;
  for (;;) {
    const after = readCursor();
    const ids = gameIds.all(after, chunk).map((row) => row.id);
    if (ids.length === 0) break;
    db.exec('BEGIN');
    try {
      for (const id of ids) {
        const entries = rowsOf.all(id).map((row) => ({
          ply: Number(row.ply),
          pos: positionHash(row.positionKey),
          move: encodeMove(row.moveUci),
        }));
        for (const entry of entries) insert.run(entry.pos, id, entry.ply, entry.move);
        insertPlies.run(id, packPlies(entries));
      }
      writeCursor.run(CURSOR, String(ids[ids.length - 1]));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    converted += ids.length;
    onProgress?.({ converted, total });
  }

  const rows = db.prepare('SELECT COUNT(*) AS n FROM positions').get().n;
  const postings = db.prepare('SELECT COUNT(*) AS n FROM postings').get().n;
  if (rows !== postings) {
    throw new Error(
      `Conversion stopped before removing anything: ${postings.toLocaleString()} postings for ` +
        `${rows.toLocaleString()} position rows.`,
    );
  }
  db.exec('BEGIN');
  try {
    new PostingIndex(db).rebuildHot();
    db.exec(`
      DROP TRIGGER IF EXISTS positions_aggregate_insert;
      DROP TRIGGER IF EXISTS positions_aggregate_delete;
      DELETE FROM positions;
      DELETE FROM position_aggregates;
      DELETE FROM position_filter_cache;
      DELETE FROM position_filter_total_cache;
      DELETE FROM position_filter_cache_keys;
    `);
    writeCursor.run(LAYOUT_KEY, POSTINGS_LAYOUT);
    db.prepare('DELETE FROM schema_state WHERE key = ?').run(CURSOR);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { converted, postings };
}
