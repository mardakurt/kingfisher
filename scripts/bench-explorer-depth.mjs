#!/usr/bin/env node

/**
 * How deep a reference pack can actually answer.
 *
 * `bench:opening-depth` measures opening *names*, which stop where the naming
 * convention stops — around move eighteen even in the deepest published table.
 * This measures something else and more important: walk a real theoretical
 * line, and at each ply ask the pack what was played from here. A pack that
 * runs out at move ten is a pack that stops being a research tool exactly when
 * the research starts.
 *
 * Reported in plies throughout, with the full-move equivalent alongside, so a
 * "twenty moves deep" claim can never quietly become twenty plies.
 *
 *   node scripts/bench-explorer-depth.mjs
 *   node scripts/bench-explorer-depth.mjs --pack .packs/kingfisher-elite-otb
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { closeApp, loadApp } from './load-app.mjs';
import { THEORY_LINES } from './reference/theory-lines.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEPTHS = [10, 20, 30, 40];

function parseArgs(argv) {
  const packs = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--pack') packs.push(argv[++index]);
    else throw new Error(`Unknown option ${argv[index]}`);
  }
  return packs.length > 0 ? packs : ['public/reference/kingfisher-starter'];
}

/**
 * Replay every line through the application's own rules.
 *
 * An illegal move here is a broken benchmark, not a shallow pack, so it fails
 * the run rather than silently truncating the line it was meant to measure.
 */
function replay(app) {
  return THEORY_LINES.map((line) => {
    const moves = line.moves.trim().split(/\s+/);
    let position = app.chess.Position.initial();
    const keys = [];
    for (const [index, san] of moves.entries()) {
      const advanced = position.advanceSan(san);
      if (!advanced.ok) {
        throw new Error(
          `${line.name}: "${san}" at ply ${index + 1} is not legal.\n` +
            `  position ${position.fen}\n` +
            `  legal ${position
              .legalMoves()
              .map((move) => move.san)
              .join(' ')}`,
        );
      }
      // The key of the position the move was played *from*: an explorer answers
      // "what is played here", so a query at ply N reads the position after N.
      keys.push(app.fen.positionKey(position.fen));
      position = advanced.value.next;
    }
    keys.push(app.fen.positionKey(position.fen));
    return { ...line, plies: moves.length, keys, sans: moves };
  });
}

/**
 * Follow the pack's own most-played move for as long as it has one.
 *
 * The hand-written corpus is real theory for as long as a person can write it
 * down from memory; past that its continuations are legal rather than topical,
 * so a deep miss there can mean "the pack is shallow" or "nobody has played
 * this exact move order". This measures something with no authoring risk in it
 * at all: start from the position, take whatever the pack says is the most
 * common continuation, and count how far that can be repeated. It is the
 * literal experience of a player clicking the top row of the explorer.
 */
async function popularWalk(dir, manifest, app, limit = 60) {
  const rows = new Map();
  const shard = async (key) => {
    const index = app.pack.shardOf(key, manifest.shards.explorer);
    if (rows.has(index)) return rows.get(index);
    const file = path.join(dir, app.pack.chunkFile('explorer', index));
    const map = new Map();
    if (existsSync(file)) {
      for (const line of gunzipSync(readFileSync(file)).toString('utf8').split('\n')) {
        const separator = line.indexOf('|');
        if (separator > 0) map.set(line.slice(0, separator), line);
      }
    }
    rows.set(index, map);
    return map;
  };

  let position = app.chess.Position.initial();
  const line = [];
  for (let ply = 0; ply < limit; ply += 1) {
    const key = app.fen.positionKey(position.fen);
    const row = (await shard(key)).get(key);
    if (!row) break;
    const decoded = app.pack.decodeExplorerLine(row);
    const best = decoded?.moves?.[0];
    if (!best) break;
    const advanced = position.advanceSan(best.san);
    if (!advanced.ok) break;
    line.push(best.san);
    position = advanced.value.next;
  }
  return line;
}

/** Load only the shards the queried keys fall in. */
function loadShards(dir, manifest, keys, app) {
  const count = manifest.shards.explorer;
  const wanted = new Set([...keys].map((key) => app.pack.shardOf(key, count)));
  const rows = new Map();
  for (const shard of wanted) {
    const file = path.join(dir, app.pack.chunkFile('explorer', shard));
    if (!existsSync(file)) continue;
    for (const line of gunzipSync(readFileSync(file)).toString('utf8').split('\n')) {
      const separator = line.indexOf('|');
      if (separator < 1) continue;
      rows.set(line.slice(0, separator), line);
    }
  }
  return rows;
}

/**
 * Why a line stopped being answered, measured rather than guessed.
 *
 * A miss at ply thirty used to be unreadable: it could mean the pack is
 * shallow, or it could mean the hand-written continuation is a move nobody
 * has actually played. Those call for opposite responses — rebuild the pack,
 * or fix the corpus — and the benchmark was reporting one number for both.
 *
 * The parent position settles it without any authored judgement. At the ply
 * where the chain breaks, read the row for the position the move was played
 * *from*:
 *
 *  - the parent is missing too — the line had already left the pack, so this
 *    ply is not where anything happened;
 *  - the parent is there and lists the move — the pack saw games play it and
 *    chose not to keep the position after it. That is the pack's depth, and
 *    it is a real finding;
 *  - the parent is there and does not list the move — no game in this pack
 *    ever played it. That is the corpus being more obscure than the data, not
 *    the pack being shallow.
 */
function diagnose(line, rows, app) {
  let ply = 0;
  while (ply <= line.plies && rows.has(line.keys[ply])) ply += 1;
  if (ply > line.plies) return { reach: line.plies, verdict: 'complete', games: 0 };

  const parent = rows.get(line.keys[ply - 1]);
  if (!parent) return { reach: ply - 1, verdict: 'parent-missing', games: 0 };

  const san = line.sans[ply - 1];
  const decoded = app.pack.decodeExplorerLine(parent);
  const played = decoded?.moves?.find((move) => move.san === san);
  return played
    ? { reach: ply - 1, verdict: 'pruned', games: played.games ?? 0, san }
    : { reach: ply - 1, verdict: 'unplayed', games: 0, san };
}

const pct = (part, whole) => (whole === 0 ? '  n/a' : `${((part / whole) * 100).toFixed(1)}%`);

async function main() {
  const app = {
    fen: await loadApp(['/src/chess/fen.ts']),
    chess: await loadApp(['/src/chess/position.ts']),
    pack: await loadApp(['/src/reference/pack.ts']),
  };
  const lines = replay(app);
  console.log(`Kingfisher explorer depth — ${lines.length} hand-written theoretical lines`);
  console.log(
    `line length           median ${median(lines.map((line) => line.plies))} plies, ` +
      `shortest ${Math.min(...lines.map((line) => line.plies))}, ` +
      `longest ${Math.max(...lines.map((line) => line.plies))}`,
  );

  for (const relative of parseArgs(process.argv.slice(2))) {
    const dir = path.resolve(ROOT, relative);
    const manifestFile = path.join(dir, 'manifest.json');
    if (!existsSync(manifestFile)) {
      console.log(`\n${relative}\n  not built; skipped`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    const keys = new Set(lines.flatMap((line) => line.keys));
    const rows = loadShards(dir, manifest, keys, app);

    console.log(`\n${manifest.name} v${manifest.version}`);
    console.log(
      `  ${manifest.counts.games.toLocaleString()} games, ` +
        `${manifest.counts.positions.toLocaleString()} positions, ` +
        `declared depth ${manifest.maxPositionPly} plies`,
    );

    for (const plies of DEPTHS) {
      const eligible = lines.filter((line) => line.plies >= plies);
      const answered = eligible.filter((line) => rows.has(line.keys[plies]));
      console.log(
        `  at ${String(plies).padStart(2)} plies (${String(plies / 2).padStart(2)} moves)  ` +
          `${String(answered.length).padStart(2)}/${String(eligible.length).padEnd(2)}  ` +
          `${pct(answered.length, eligible.length)}`,
      );
    }

    // How far each line can be walked before the pack has nothing, which is
    // the number a player actually experiences — and, where it stops, why.
    const reach = lines.map((line) => ({ ...diagnose(line, rows, app), line }));
    const depths = reach.map((entry) => entry.reach);
    console.log(
      `  continuous answers    median ${median(depths)} plies, ` +
        `worst ${Math.min(...depths)}, best ${Math.max(...depths)}`,
    );

    const tally = { complete: 0, pruned: 0, unplayed: 0, 'parent-missing': 0 };
    for (const entry of reach) tally[entry.verdict] += 1;
    console.log(
      `  why they stop        ` +
        `${tally.pruned} pruned by the pack, ` +
        `${tally.unplayed} never played in it, ` +
        `${tally.complete} answered to the end`,
    );

    const shallow = reach
      .filter((entry) => entry.reach < 20 && entry.verdict !== 'complete')
      .sort((a, b) => a.reach - b.reach);
    for (const entry of shallow.slice(0, 6)) {
      const why =
        entry.verdict === 'pruned'
          ? `pruned after ${entry.san} (${entry.games} game${entry.games === 1 ? '' : 's'})`
          : `${entry.san} never played here`;
      console.log(`    ${entry.line.eco} ${entry.line.name} — ${entry.reach} plies, ${why}`);
    }

    const walk = await popularWalk(dir, manifest, app);
    console.log(
      `  most-played chain     ${walk.length} plies (${(walk.length / 2).toFixed(1)} moves)`,
    );
    console.log(
      `    ${walk
        .map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}.${san}` : san))
        .join(' ')}`,
    );
  }
  await closeApp();
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? 0);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await closeApp();
  process.exit(1);
});
