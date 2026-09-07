/**
 * The claim index, and the two ways it can be wrong.
 *
 * It can return the wrong rows, and it can return no rows. The second is the
 * one worth being frightened of: a claim search against an index that was
 * never built does not fail, it comes back empty, and an empty result is
 * exactly what "no game in this collection has that structure" looks like. So
 * the fallback has its own tests, and the equivalence tests below compare the
 * fast plan against the scan the index replaced rather than against a stored
 * expectation — if both were wrong in the same way, a comparison of the two
 * would say nothing.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { GameDatabase } from './database.mjs';
import {
  buildClaimIndex,
  claimIndexReady,
  claimPlan,
  CLAIM_INDEX_KEY,
} from './position-schema.mjs';

const workspace = mkdtempSync(path.join(tmpdir(), 'kingfisher-claims-'));
let counter = 0;
const fresh = () => new GameDatabase(path.join(workspace, `claims-${counter++}.sqlite`));

/** Positions carrying chosen claims, at chosen ratings, in a chosen year. */
const game = (index, claims, rating, year) => ({
  game: {
    fingerprint: `fp-${index}`,
    white: `White ${index}`,
    black: `Black ${index}`,
    whiteKey: `white ${index}`,
    blackKey: `black ${index}`,
    result: '1-0',
    date: `${year}.01.01`,
    year,
    event: 'Test',
    site: 'Test',
    round: '1',
    whiteRating: rating,
    blackRating: rating - 10,
    plyCount: claims.length,
    importedAt: year,
  },
  pgn: '[Event "Test"]\n\n1. e4 *',
  positions: claims.map((set, ply) => ({
    positionKey: `key-${index}-${ply}`,
    ply,
    moveUci: 'e2e4',
    moveSan: 'e4',
    mover: 'w',
    pawnSkeleton: `skeleton-${ply % 3}`,
    structureSignature: `signature-${ply % 2}`,
    structureClaims: set,
  })),
});

/** A collection where one claim is very common and one is very rare. */
function populated(games = 200) {
  const db = fresh();
  const entries = [];
  for (let i = 0; i < games; i += 1) {
    const common = ['open-d', 'w-bishop-pair'];
    const rare = i === 7 ? ['mat-q+1r-2b', 'open-d'] : [];
    entries.push(
      game(
        i,
        rare.length ? [common, rare] : [common, ['open-e']],
        2000 + (i % 500),
        2000 + (i % 25),
      ),
    );
  }
  db.insertGames(entries);
  return db;
}

const search = (db, claims, extra = {}) =>
  db.searchStructures({
    mode: 'claims',
    claims,
    positionKey: '',
    pawnSkeleton: '',
    structureSignature: '',
    limit: 30,
    ...extra,
  });

const ids = (rows) => rows.map((row) => row.position.id);

describe('the claim index', () => {
  it('is complete from the start for a collection created with it', () => {
    const db = fresh();
    expect(claimIndexReady(db.handleForTest())).toBe(true);
    db.insertGames([game(1, [['open-d']], 2400, 2020)]);
    expect(claimIndexReady(db.handleForTest())).toBe(true);
  });

  it('records which claim sets contain a claim as games are imported', () => {
    const db = populated(40);
    const handle = db.handleForTest();
    const rows = handle
      .prepare(
        `SELECT c.value, c.sets, COUNT(m.set_id) AS actual
           FROM claims c LEFT JOIN claim_set_members m ON m.claim_id = c.id
          GROUP BY c.id ORDER BY c.value`,
      )
      .all();
    expect(rows.length).toBeGreaterThan(0);
    // The maintained counter and the rows it counts must not drift apart.
    for (const row of rows) expect(row.sets, row.value).toBe(row.actual);
  });

  /*
    The equivalence that matters. Both plans are exercised deliberately — the
    common claim takes the ordered scan and the rare one takes the seek — and
    each is compared against the LIKE scan the index replaced, on the same
    collection, for the same query.
  */
  it('returns exactly what scanning returns, under both plans and all three sorts', () => {
    const db = populated(300);
    for (const claims of [['open-d'], ['mat-q+1r-2b'], ['open-d', 'mat-q+1r-2b']]) {
      for (const sort of ['closest', 'rating', 'recent']) {
        const indexed = search(db, claims, { sort });
        const scanned = db.searchStructuresByScanForTest({
          mode: 'claims',
          claims,
          positionKey: '',
          pawnSkeleton: '',
          structureSignature: '',
          limit: 30,
          sort,
        });
        expect(ids(indexed), `${claims.join('+')} / ${sort}`).toEqual(ids(scanned));
      }
    }
  });

  it('orders by rating and year exactly as the games table would', () => {
    const db = populated(300);
    const rows = search(db, ['open-d'], { sort: 'rating' });
    const ratings = rows.map((row) =>
      Math.max(row.game.whiteRating ?? 0, row.game.blackRating ?? 0),
    );
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  it('treats several claims as an intersection, not a union', () => {
    const db = populated(300);
    const both = search(db, ['open-d', 'mat-q+1r-2b']);
    expect(both.length).toBeGreaterThan(0);
    for (const row of both) {
      expect(row.position.structureClaims).toContain('open-d');
      expect(row.position.structureClaims).toContain('mat-q+1r-2b');
    }
    expect(both.length).toBeLessThan(search(db, ['open-d']).length);
  });

  it('finds nothing for a claim no position carries, without scanning for it', () => {
    const db = populated(20);
    expect(search(db, ['w-passed-a'])).toEqual([]);
  });
});

describe('when the index is not there', () => {
  /*
    The failure this fallback exists for, reproduced exactly: a collection with
    claim sets and no claim index. Without the fallback the search returns
    nothing, which reads as "no such structure here" rather than as "not
    indexed yet".
  */
  it('falls back to scanning rather than returning nothing', () => {
    const db = populated(60);
    const handle = db.handleForTest();
    const expected = search(db, ['open-d']).length;
    expect(expected).toBeGreaterThan(0);

    handle.exec(
      `DELETE FROM claim_set_members; DELETE FROM claims;
       DELETE FROM schema_state WHERE key = '${CLAIM_INDEX_KEY}';`,
    );
    const reopened = new GameDatabase(db.fileForTest());
    expect(claimIndexReady(reopened.handleForTest())).toBe(false);
    expect(
      reopened.searchStructures({
        mode: 'claims',
        claims: ['open-d'],
        positionKey: '',
        pawnSkeleton: '',
        structureSignature: '',
        limit: 30,
      }).length,
    ).toBe(expected);
  });

  it('is usable again, and identical, once the backfill has run', () => {
    const db = populated(60);
    const before = ids(search(db, ['open-d']));
    const handle = db.handleForTest();
    handle.exec(
      `DELETE FROM claim_set_members; DELETE FROM claims;
       DELETE FROM schema_state WHERE key = '${CLAIM_INDEX_KEY}';
       DELETE FROM schema_state WHERE key = 'claim_index_cursor';`,
    );
    const result = buildClaimIndex(handle);
    expect(result.done).toBe(true);
    expect(result.total).toBeGreaterThan(0);
    expect(claimIndexReady(handle)).toBe(true);

    const reopened = new GameDatabase(db.fileForTest());
    expect(
      ids(
        reopened.searchStructures({
          mode: 'claims',
          claims: ['open-d'],
          positionKey: '',
          pawnSkeleton: '',
          structureSignature: '',
          limit: 30,
        }),
      ),
    ).toEqual(before);
  });

  /*
    A build that stops halfway must not look finished. It is the state that
    produces a wrong *empty* answer, so the flag is written by the end of the
    loop and by nothing else.
  */
  it('does not mark itself complete when it ran out of budget', () => {
    const db = populated(400);
    const handle = db.handleForTest();
    handle.exec(
      `DELETE FROM claim_set_members; DELETE FROM claims;
       DELETE FROM schema_state WHERE key = '${CLAIM_INDEX_KEY}';
       DELETE FROM schema_state WHERE key = 'claim_index_cursor';`,
    );
    const partial = buildClaimIndex(handle, { chunk: 1, budgetMs: 0 });
    expect(partial.done).toBe(false);
    expect(partial.indexed).toBeLessThan(partial.total);
    expect(claimIndexReady(handle)).toBe(false);

    // And resuming finishes it, from the cursor rather than from the start.
    const finished = buildClaimIndex(handle);
    expect(finished.done).toBe(true);
    expect(finished.indexed).toBe(partial.total - partial.indexed);
    expect(claimIndexReady(handle)).toBe(true);
  });
});

describe('choosing a plan', () => {
  it('scans for a common claim and seeks for a rare one', () => {
    const totals = { totalSets: 45_979, totalPositions: 248_102, limit: 30 };
    expect(claimPlan({ sets: 12_384, ...totals })).toBe('scan');
    expect(claimPlan({ sets: 1, ...totals })).toBe('seek');
  });

  it('moves its threshold with the size of the collection', () => {
    // The same 0.5% claim: worth scanning in a big collection, not in a small one.
    expect(claimPlan({ sets: 50, totalSets: 10_000, totalPositions: 50_000, limit: 30 })).toBe(
      'seek',
    );
    expect(
      claimPlan({ sets: 5_000, totalSets: 1_000_000, totalPositions: 11_300_000, limit: 30 }),
    ).toBe('scan');
  });

  it('says seek when it knows nothing', () => {
    expect(claimPlan({ sets: 10, totalSets: 0, totalPositions: 0, limit: 30 })).toBe('seek');
  });
});

describe('the plan the fast path actually gets', () => {
  /*
    The optimisation is invisible to a correctness test — both plans return the
    same rows, which is the property the design rests on — so losing it would
    not fail anything above. This asserts the plan itself: an ordered walk of
    the rank index, with no temporary b-tree, which is the difference between
    reading thirty rows and sorting several million.
  */
  const planFor = (db, sql, params) =>
    db
      .handleForTest()
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...params)
      .map((row) => row.detail)
      .join(' | ');

  it('walks the rank index and sorts nothing, for a common claim', () => {
    const db = populated(300);
    const claim = db.handleForTest().prepare('SELECT id FROM claims WHERE value = ?').get('open-d');
    const plan = planFor(
      db,
      `SELECT g.id FROM positions p INDEXED BY positions_rank JOIN games g ON g.id = p.game_id
        WHERE p.structure_claims_id IN (SELECT set_id FROM claim_set_members WHERE claim_id = ?)
        ORDER BY p.rating_key DESC, p.year_key DESC LIMIT 30`,
      [claim.id],
    );
    expect(plan).toContain('SCAN p USING INDEX positions_rank');
    expect(plan).not.toContain('TEMP B-TREE');
  });

  it('has an index for the recency ordering too', () => {
    const db = populated(60);
    const claim = db.handleForTest().prepare('SELECT id FROM claims WHERE value = ?').get('open-d');
    const plan = planFor(
      db,
      `SELECT g.id FROM positions p INDEXED BY positions_recent JOIN games g ON g.id = p.game_id
        WHERE p.structure_claims_id IN (SELECT set_id FROM claim_set_members WHERE claim_id = ?)
        ORDER BY p.year_key DESC, p.rating_key DESC LIMIT 30`,
      [claim.id],
    );
    expect(plan).toContain('SCAN p USING INDEX positions_recent');
    expect(plan).not.toContain('TEMP B-TREE');
  });

  it('finds the claim index seek rather than a scan of every claim set', () => {
    const db = populated(60);
    const claim = db.handleForTest().prepare('SELECT id FROM claims WHERE value = ?').get('open-d');
    const plan = planFor(db, 'SELECT set_id FROM claim_set_members WHERE claim_id = ?', [claim.id]);
    expect(plan).toContain('claim_set_members USING');
    expect(plan).not.toContain('SCAN structure_claim_sets');
  });
});

describe('the invariant the ordering rests on', () => {
  /*
    The claim search orders by `positions.rating_key` and `positions.year_key`
    rather than by the game's own columns, which is what lets an index satisfy
    the ORDER BY. That is only the same ordering if the denormalised copies
    really are the game's rating and year — so this asserts it, after the three
    things that write to either table.
  */
  const drift = (db) =>
    db
      .handleForTest()
      .prepare(
        `SELECT COUNT(*) AS n FROM positions p JOIN games g ON g.id = p.game_id
          WHERE p.rating_key IS NOT COALESCE(g.max_rating, 0)
             OR p.year_key IS NOT COALESCE(g.year, 0)`,
      )
      .get().n;

  it('holds after an import', () => {
    const db = populated(120);
    expect(drift(db)).toBe(0);
  });

  it('holds after games are deleted', () => {
    const db = populated(120);
    db.deleteGamesByFingerprint(['fp-3', 'fp-4', 'fp-5']);
    expect(drift(db)).toBe(0);
  });

  it('holds after a second import into the same collection', () => {
    const db = populated(60);
    db.insertGames([game(9001, [['open-d']], 2800, 2024)]);
    expect(drift(db)).toBe(0);
    const top = search(db, ['open-d'], { sort: 'rating' })[0];
    expect(Math.max(top.game.whiteRating ?? 0, top.game.blackRating ?? 0)).toBe(2800);
  });
});

describe('what opening a collection costs', () => {
  /*
    The rank indexes are only useful to the ordered scan, which only runs once
    the claim index exists. Creating them on open cost 51.7 seconds on a 5.3 GB
    collection that might never have one — and, worse, their presence gave the
    planner a rank scan for the *unindexed* fallback which it then had to sort
    anyway: 78 s against the 40 s the same query took before they existed.

    So a collection that has claim sets and no claim index must come back from
    `new GameDatabase(...)` with neither rank index, and building the index is
    what creates them.
  */
  const indexes = (db) =>
    new Set(
      db
        .handleForTest()
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'positions'")
        .all()
        .map((row) => row.name),
    );

  it('creates the rank indexes for a new collection, where they are free', () => {
    const db = fresh();
    expect(indexes(db).has('positions_rank')).toBe(true);
    expect(indexes(db).has('positions_recent')).toBe(true);
  });

  it('does not build them on opening a collection that has no claim index', () => {
    const db = populated(60);
    const handle = db.handleForTest();
    handle.exec(
      `DROP INDEX IF EXISTS positions_rank; DROP INDEX IF EXISTS positions_recent;
       DELETE FROM claim_set_members; DELETE FROM claims;
       DELETE FROM schema_state WHERE key = '${CLAIM_INDEX_KEY}';`,
    );
    const reopened = new GameDatabase(db.fileForTest());
    expect(claimIndexReady(reopened.handleForTest())).toBe(false);
    expect(indexes(reopened).has('positions_rank')).toBe(false);
    expect(indexes(reopened).has('positions_recent')).toBe(false);
    // And it still answers, by scanning.
    expect(
      reopened.searchStructures({
        mode: 'claims',
        claims: ['open-d'],
        positionKey: '',
        pawnSkeleton: '',
        structureSignature: '',
        limit: 30,
      }).length,
    ).toBeGreaterThan(0);
  });

  it('builds them as part of building the claim index', () => {
    const db = populated(60);
    const handle = db.handleForTest();
    handle.exec(
      `DROP INDEX IF EXISTS positions_rank; DROP INDEX IF EXISTS positions_recent;
       DELETE FROM claim_set_members; DELETE FROM claims;
       DELETE FROM schema_state WHERE key = '${CLAIM_INDEX_KEY}';
       DELETE FROM schema_state WHERE key = 'claim_index_cursor';`,
    );
    expect(buildClaimIndex(handle).done).toBe(true);
    expect(indexes(db).has('positions_rank')).toBe(true);
    expect(indexes(db).has('positions_recent')).toBe(true);
  });
});

describe('the ordering the ordered scan is given', () => {
  /*
    The defect this catches cost 74,351 ms on 11.3 million positions.

    An ordered index scan is only cheap while the ORDER BY *is* the index's
    order. The relevance ordering leads with three terms the rank index cannot
    express, so asking the scan for it forced the index walk and then sorted
    every matched row anyway — the worst of both plans. The tiers supply those
    three terms; what is left is exactly rating then year.

    Asserted on the plan, because both orderings return the same rows and no
    correctness test can see the difference.
  */
  it('never asks the rank index for an ordering it cannot give', () => {
    const db = populated(300);
    const plans = [];
    const handle = db.handleForTest();
    const original = handle.prepare.bind(handle);
    handle.prepare = (sql) => {
      if (
        sql.includes('INDEXED BY positions_rank') ||
        sql.includes('INDEXED BY positions_recent')
      ) {
        plans.push(sql);
      }
      return original(sql);
    };
    for (const sort of ['closest', 'rating', 'recent']) {
      db.searchStructures({
        mode: 'claims',
        claims: ['open-d'],
        positionKey: '',
        pawnSkeleton: '',
        structureSignature: '',
        sort,
        limit: 30,
      });
    }
    handle.prepare = original;
    expect(plans.length).toBeGreaterThan(0);
    for (const sql of plans) {
      // The forced-index query must never carry the relevance prefix.
      expect(sql).not.toContain('position_key = ?) DESC');
      expect(sql).toMatch(
        /ORDER BY\s+p\.(rating_key|year_key) DESC, p\.(year_key|rating_key) DESC/,
      );
    }
  });
});
