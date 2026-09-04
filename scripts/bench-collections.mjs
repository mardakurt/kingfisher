#!/usr/bin/env node
/**
 * What Phase 12's database operations actually cost.
 *
 * Copy, move, merge-preview, duplicate detection and classification backfill
 * are the operations a professional runs against a real archive, and every one
 * of them is a full pass over a collection. Claiming they "page and therefore
 * scale" is a claim about the shape of the code; this is a clock.
 *
 * Runs entirely in this process against the real `GameDatabase` class, with no
 * HTTP in between. The companion's transport is measured by `bench:sqlite`;
 * what is measured here is the work itself — the paging, the fingerprint
 * probes, the JSON the routes would carry — which is what dominates at scale.
 *
 *   npm run bench:collections -- 100000
 *
 * The generated databases land in a temporary directory and are removed.
 */

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { argv, exit } from 'node:process';

import { GameDatabase } from '../companion/src/database.mjs';

import { generateGames } from './generate-pgn.mjs';
import { closeApp, loadApp } from './load-app.mjs';

const COUNT = Number(argv[2] ?? 100_000);
/** Games per page, matching the collection port's own default. */
const PAGE = 200;

const ms = (value) => `${value.toFixed(0)} ms`;
const rate = (count, elapsed) => `${Math.round(count / (elapsed / 1000)).toLocaleString()}/s`;

function timed(label, work) {
  const started = performance.now();
  const result = work();
  const elapsed = performance.now() - started;
  return { label, elapsed, result };
}

async function main() {
  const { parsePgn } = await loadApp(['/src/chess/pgn/index.ts']);
  const { normalizeGame, indexGame } = await loadApp(['/src/persistence/prepare-game.ts']);
  const { classifyTree } = await loadApp(['/src/theory/classify-games.ts']);
  const { loadOpeningIndex } = await loadApp(['/src/theory/openings.ts']);
  const openings = await loadOpeningIndex();

  const directory = mkdtempSync(path.join(tmpdir(), 'kingfisher-bench-collections-'));
  const source = new GameDatabase(path.join(directory, 'source.sqlite'));
  const destination = new GameDatabase(path.join(directory, 'destination.sqlite'));

  console.log('Kingfisher collection-operation benchmark');
  console.log(`node ${process.version} · ${process.platform}-${process.arch}`);
  console.log(`${COUNT.toLocaleString()} games\n`);

  // --- Build the source ------------------------------------------------------
  const pgn = generateGames(COUNT);
  const parsed = parsePgn(pgn);
  const prepared = parsed.games.map((game) => {
    const base = normalizeGame(game.tree);
    const record = { ...base, ...classifyTree(openings, base.tree) };
    const positions = indexGame(record);
    return {
      game: {
        fingerprint: record.fingerprint,
        white: record.white,
        black: record.black,
        whiteKey: record.whiteKey,
        blackKey: record.blackKey,
        result: record.result,
        date: record.date,
        year: record.year,
        event: record.event,
        round: record.round,
        eco: record.eco,
        opening: record.opening,
        classification: record.classification,
        classifiedWith: record.classifiedWith,
        plyCount: positions.length,
        importedAt: record.importedAt,
      },
      pgn: record.normalizedPgn,
      positions,
    };
  });

  const imported = timed('import into the source', () => {
    for (let index = 0; index < prepared.length; index += 500) {
      source.insertGames(prepared.slice(index, index + 500));
    }
    return source.count();
  });
  console.log(
    `import              ${ms(imported.elapsed)}  ${rate(COUNT, imported.elapsed)}  ` +
      `${imported.result.toLocaleString()} games`,
  );
  console.log(
    `source on disk      ${(statSync(path.join(directory, 'source.sqlite')).size / 1_000_000).toFixed(1)} MB ` +
      `(plus WAL)\n`,
  );

  // --- Copy ------------------------------------------------------------------
  const copied = timed('copy every game', () => {
    let after = null;
    let written = 0;
    for (;;) {
      const page = source.exportPage(after, PAGE, null);
      if (page.games.length > 0) {
        const result = destination.insertGames(
          page.games.map((entry) => ({
            game: { ...entry.summary, plyCount: entry.plyCount ?? 0 },
            pgn: entry.pgn,
            positions: entry.positions,
          })),
        );
        written += result.imported;
      }
      if (page.nextAfter === null) break;
      after = page.nextAfter;
    }
    return written;
  });
  console.log(
    `copy ${COUNT.toLocaleString()} games`.padEnd(20) +
      `${ms(copied.elapsed)}  ${rate(COUNT, copied.elapsed)}  ` +
      `${copied.result.toLocaleString()} written`,
  );

  // --- Merge preview ---------------------------------------------------------
  const preview = timed('merge preview', () => {
    let after = null;
    let scanned = 0;
    let present = 0;
    for (;;) {
      const page = source.duplicateKeys(after, 1000);
      if (page.games.length === 0) break;
      scanned += page.games.length;
      const answer = destination.haveFingerprints(page.games.map((game) => game.fingerprint));
      present += answer.present.length;
      if (page.nextAfter === null) break;
      after = page.nextAfter;
    }
    return { scanned, present };
  });
  console.log(
    'merge preview'.padEnd(20) +
      `${ms(preview.elapsed)}  ${rate(preview.result.scanned, preview.elapsed)}  ` +
      `${preview.result.present.toLocaleString()} of ${preview.result.scanned.toLocaleString()} already present`,
  );

  // --- Duplicate detection ---------------------------------------------------
  const duplicates = timed('duplicate keys', () => {
    let after = null;
    let scanned = 0;
    const byFingerprint = new Map();
    for (const collection of [source, destination]) {
      after = null;
      for (;;) {
        const page = collection.duplicateKeys(after, 2000);
        if (page.games.length === 0) break;
        for (const game of page.games) {
          byFingerprint.set(game.fingerprint, (byFingerprint.get(game.fingerprint) ?? 0) + 1);
        }
        scanned += page.games.length;
        if (page.nextAfter === null) break;
        after = page.nextAfter;
      }
    }
    let groups = 0;
    for (const seen of byFingerprint.values()) if (seen > 1) groups += 1;
    return { scanned, groups };
  });
  console.log(
    'duplicate search'.padEnd(20) +
      `${ms(duplicates.elapsed)}  ${rate(duplicates.result.scanned, duplicates.elapsed)}  ` +
      `${duplicates.result.groups.toLocaleString()} groups over ${duplicates.result.scanned.toLocaleString()} games`,
  );

  // --- Classification backfill ----------------------------------------------
  /*
    Measured against the *destination*, whose rows were copied with their
    classification already attached — so this is the cost of a backfill finding
    nothing to do, which is the pass a user pays on every subsequent run and the
    one that has to stay cheap.
  */
  const remaining = timed('classification remaining', () =>
    destination.classificationRemaining(openings.digest),
  );
  console.log(
    'backfill scan'.padEnd(20) +
      `${ms(remaining.elapsed)}  ` +
      `${remaining.result.remaining.toLocaleString()} of ${remaining.result.total.toLocaleString()} unclassified`,
  );

  const page = timed('unclassified page', () =>
    destination.unclassifiedGames('a-different-digest', 500, null),
  );
  console.log(
    'backfill page (500)'.padEnd(20) +
      `${ms(page.elapsed)}  ${page.result.games.length} games with their position keys`,
  );

  // --- Player aggregation ----------------------------------------------------
  /*
    One player out of the pool the generator uses, so the number is the real
    cost of the profile's first page rather than the cost of finding nothing.
    Normalized the way the games store it, which is what the index holds.
  */
  const subject = 'carlsen, m';
  const aggregated = timed('player search', () =>
    source.search({ player: subject, limit: 500, exactTotal: true }),
  );
  console.log(
    'player aggregate'.padEnd(20) +
      `${ms(aggregated.elapsed)}  ` +
      `${(aggregated.result.total ?? 0).toLocaleString()} games for one player`,
  );

  /*
    --- Move (delete after copy) ---------------------------------------------

    Two batch sizes, because the difference between them is the reason
    `moveGames` buffers verified fingerprints instead of deleting once per read
    page. The cost is dominated by the fixed per-call price of rebuilding the
    explorer aggregates for every affected position, not by the number of
    games, so the per-game figure collapses as the batch grows.
  */
  for (const batch of [PAGE, 2_000]) {
    const removed = timed(`delete ${batch}`, () => {
      const page = source.duplicateKeys(null, batch);
      return source.deleteGamesByFingerprint(page.games.map((game) => game.fingerprint)).deleted;
    });
    console.log(
      `move: delete ${batch}`.padEnd(20) +
        `${ms(removed.elapsed)}  ` +
        `${(removed.elapsed / Math.max(1, removed.result)).toFixed(2)} ms/game  ` +
        `${removed.result.toLocaleString()} removed after verification`,
    );
  }

  source.close();
  destination.close();
  rmSync(directory, { recursive: true, force: true });
}

main()
  .then(closeApp)
  .catch(async (error) => {
    console.error(error instanceof Error ? error.stack : error);
    await closeApp();
    exit(1);
  });
