#!/usr/bin/env node

/**
 * Build a Kingfisher reference pack from an upstream open-data archive.
 *
 * The whole pipeline in one command: download, verify against the publisher's
 * own digests, decompress, parse, deduplicate, replay through Kingfisher's own
 * rules code, aggregate by position, build the player table, shard, compress
 * and write a manifest that names the licence and the exact upstream files the
 * pack was derived from.
 *
 * This exists so that Kingfisher's built-in data can be *rebuilt* rather than
 * inherited. A committed data file whose provenance is a story in a README is
 * a data file nobody can ever safely update.
 *
 *   node scripts/build-reference-pack.mjs --pack starter
 *   node scripts/build-reference-pack.mjs --pack elite --out /tmp/elite
 *
 * Packs are declared in `scripts/reference/packs.mjs`.
 */

import { createHash } from 'node:crypto';
import {
  createReadStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';

import { closeApp, loadApp } from './load-app.mjs';
import { PACK_DEFINITIONS } from './reference/packs.mjs';
import { fetchChecksums, fetchVerified } from './reference/sources.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = process.env.KINGFISHER_ARCHIVE_CACHE ?? path.join(ROOT, '.archive-cache');

function parseArgs(argv) {
  const args = {
    pack: 'starter',
    out: null,
    workers: Math.max(1, Math.min(8, cpus().length - 2)),
    files: 0,
    reuse: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--pack') args.pack = argv[++index];
    else if (flag === '--out') args.out = argv[++index];
    else if (flag === '--workers') args.workers = Number(argv[++index]);
    // A short run over the newest few archives, for checking a change to the
    // pipeline without waiting for the whole build.
    else if (flag === '--files') args.files = Number(argv[++index]);
    // Re-reduce the previous scan's rows with different thresholds, which is
    // the loop the size of a bundled pack is actually tuned in.
    else if (flag === '--reuse-scan') args.reuse = true;
    else throw new Error(`Unknown option ${flag}`);
  }
  return args;
}

const bytes = (value) =>
  value > 1e6 ? `${(value / 1e6).toFixed(1)} MB` : `${(value / 1e3).toFixed(0)} kB`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const definition = PACK_DEFINITIONS[args.pack];
  if (!definition) {
    throw new Error(
      `Unknown pack "${args.pack}". Known: ${Object.keys(PACK_DEFINITIONS).join(', ')}`,
    );
  }
  const outDir = args.out ? path.resolve(args.out) : path.join(ROOT, definition.output);
  const work = path.join(CACHE, `work-${definition.id}`);
  if (!args.reuse) rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  console.log(`Kingfisher reference pack: ${definition.name}`);
  console.log(`source   ${definition.source.name} (${definition.source.license.id})`);

  // --- 1. Acquire and verify the upstream archive.
  const digests = await fetchChecksums(definition.source);
  const all = definition.files(new Map(digests));
  const wanted = args.files > 0 ? all.slice(0, args.files) : all;
  console.log(`archives ${wanted.length} files`);
  const archives = [];
  for (const file of wanted) {
    const expected = digests.get(file);
    if (!expected) throw new Error(`${file} is not in the published digest list.`);
    const got = await fetchVerified(definition.source, file, expected, CACHE, (progress) =>
      console.log(`  fetched ${progress.file} (${bytes(progress.bytes)})`),
    );
    archives.push(got);
  }

  // --- 2. Scan every archive in parallel into pre-sharded rows.
  const shards = definition.shards;
  const scanned = args.reuse
    ? JSON.parse(readFileSync(path.join(work, 'scan.json'), 'utf8'))
    : await scan(archives, work, shards, definition.limits, args.workers);
  if (!args.reuse) writeFileSync(path.join(work, 'scan.json'), JSON.stringify(scanned));
  console.log(
    `scanned  ${scanned.seen.toLocaleString()} games, kept ${scanned.kept.toLocaleString()}` +
      `, rejected ${scanned.rejected.toLocaleString()}`,
  );

  // --- 3. Reduce each shard, encode, compress.
  mkdirSync(outDir, { recursive: true });
  for (const stale of readdirSync(outDir)) {
    if (stale.endsWith('.kfp.gz') || stale === 'manifest.json') rmSync(path.join(outDir, stale));
  }

  const pack = await loadApp(['/src/reference/pack.ts']);
  const chunks = [];
  let rawBytes = 0;
  let compressedBytes = 0;
  const counts = { games: scanned.kept, openable: 0, positions: 0, players: 0 };

  const emit = (kind, shard, lines) => {
    const raw = Buffer.from(lines.length > 0 ? lines.join('\n') + '\n' : '', 'utf8');
    const gz = gzipSync(raw, { level: 9 });
    const file = pack.chunkFile(kind, shard);
    writeFileSync(path.join(outDir, file), gz);
    rawBytes += raw.length;
    compressedBytes += gz.length;
    chunks.push({
      id: pack.chunkId(kind, shard),
      kind,
      shard,
      file,
      bytes: gz.length,
      sha256: createHash('sha256').update(gz).digest('hex'),
      entries: lines.length,
    });
  };

  const recentSince = scanned.maxYear - (definition.limits.recentYears - 1);
  for (let shard = 0; shard < shards.explorer; shard += 1) {
    const lines = await reduceExplorer(
      path.join(work, 'explorer', `${shard}.txt`),
      definition.limits,
      recentSince,
      pack,
    );
    counts.positions += lines.length;
    emit('explorer', shard, lines);
  }
  for (let shard = 0; shard < shards.game; shard += 1) {
    const lines = await reduceGames(path.join(work, 'game', `${shard}.txt`));
    counts.openable += lines.length;
    emit('game', shard, lines);
  }
  const people = await reducePlayers(path.join(work, 'players'), shards.players, pack);
  counts.players = people.identities;
  for (let shard = 0; shard < shards.players; shard += 1)
    emit('players', shard, people.lines[shard]);

  const playerGames = await reducePlayerGames(
    path.join(work, 'playergames'),
    shards.playergames,
    people.canonical,
    definition.limits,
    pack,
  );
  for (let shard = 0; shard < shards.playergames; shard += 1) {
    emit('playergames', shard, playerGames[shard]);
  }

  const manifest = {
    format: pack.PACK_FORMAT,
    id: definition.id,
    name: definition.name,
    description: definition.description,
    version: definition.version,
    builtAt: new Date().toISOString().slice(0, 10),
    license: definition.source.license,
    provenance: {
      source: definition.source.name,
      url: definition.source.page,
      retrieved: new Date().toISOString().slice(0, 10),
      transformation: definition.transformation,
      upstream: archives.map((archive) => ({ file: archive.file, sha256: archive.sha256 })),
    },
    counts,
    recentSince,
    shards,
    chunks,
    rawBytes,
    compressedBytes,
  };
  writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (!process.env.KINGFISHER_KEEP_WORK) rmSync(work, { recursive: true, force: true });
  console.log(`games    ${counts.games.toLocaleString()} counted`);
  console.log(`openable ${counts.openable.toLocaleString()} full scores`);
  console.log(`positions${counts.positions.toLocaleString().padStart(10)}`);
  console.log(`players  ${counts.players.toLocaleString()}`);
  console.log(`chunks   ${chunks.length} — ${bytes(compressedBytes)} (${bytes(rawBytes)} raw)`);
  console.log(`written  ${path.relative(ROOT, outDir)}`);
  await closeApp();
}

/** Run the scan worker over every archive, at most `limit` at a time. */
function scan(archives, work, shards, limits, limit) {
  const queue = [...archives];
  const totals = { seen: 0, kept: 0, opened: 0, rejected: 0, maxYear: 0 };
  const workerFile = new URL('./reference/scan.worker.mjs', import.meta.url);

  return new Promise((resolve, reject) => {
    let active = 0;
    let failed = false;
    const pump = () => {
      if (failed) return;
      if (queue.length === 0 && active === 0) return resolve(totals);
      while (active < limit && queue.length > 0) {
        const archive = queue.shift();
        active += 1;
        const worker = new Worker(workerFile, {
          workerData: { file: archive.path, outDir: work, shards, limits },
          resourceLimits: { maxOldGenerationSizeMb: 4096 },
        });
        worker.on('message', (message) => {
          if (message.error) {
            failed = true;
            reject(new Error(`${message.file}: ${message.error}`));
            return;
          }
          totals.seen += message.seen;
          totals.kept += message.kept;
          totals.opened += message.opened;
          if (message.maxYear > totals.maxYear) totals.maxYear = message.maxYear;
          totals.rejected += message.rejected;
          console.log(
            `  scanned ${path.basename(message.file)} — ${message.kept.toLocaleString()} kept`,
          );
        });
        worker.on('error', (error) => {
          failed = true;
          reject(error);
        });
        worker.on('exit', () => {
          active -= 1;
          pump();
        });
      }
    };
    pump();
  });
}

async function* rows(file) {
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    return;
  }
  if (size === 0) return;
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.length > 0) yield line;
  }
}

/**
 * Fold per-ply rows into one aggregate per position.
 *
 * Pruning happens here rather than in the scan, because whether a position is
 * worth keeping depends on how many games reached it across the whole archive,
 * which no single file knows.
 */
async function reduceExplorer(file, limits, recentSince, pack) {
  const positions = new Map();
  for await (const row of rows(file)) {
    const [key, san, uci, result, rating, year, ply, gameId, strength] = row.split('\t');
    if (Number(ply) >= limits.maxPly) continue;
    let entry = positions.get(key);
    if (!entry) {
      entry = { moves: new Map(), games: [] };
      positions.set(key, entry);
    }
    let move = entry.moves.get(uci);
    if (!move) {
      move = {
        san,
        uci,
        games: 0,
        white: 0,
        draws: 0,
        black: 0,
        sum: 0,
        rated: 0,
        lastYear: 0,
        recentGames: 0,
        recentWhite: 0,
        recentDraws: 0,
        recentBlack: 0,
      };
      entry.moves.set(uci, move);
    }
    const played = Number(year);
    const recent = played >= recentSince;
    move.games += 1;
    if (recent) move.recentGames += 1;
    if (result === '1-0') {
      move.white += 1;
      if (recent) move.recentWhite += 1;
    } else if (result === '1/2-1/2') {
      move.draws += 1;
      if (recent) move.recentDraws += 1;
    } else {
      move.black += 1;
      if (recent) move.recentBlack += 1;
    }
    const elo = Number(rating);
    if (elo > 0) {
      move.sum += elo;
      move.rated += 1;
    }
    if (played > move.lastYear) move.lastYear = played;
    /*
      Only games whose full score the pack carries: an id nothing can open is
      worse than a shorter list. Ranked by the strength of the game rather than
      its date, because "top games" in an explorer means the strongest evidence
      for the move, and a recent weak game is not that.
    */
    if (gameId && entry.games.length < limits.topGames * 8) {
      entry.games.push([Number(strength) || 0, gameId]);
    }
  }

  const lines = [];
  for (const [key, entry] of positions) {
    const total = [...entry.moves.values()].reduce((sum, move) => sum + move.games, 0);
    if (total < limits.minGames) continue;
    const moves = [...entry.moves.values()]
      .sort((a, b) => b.games - a.games)
      .slice(0, limits.maxMoves)
      .map((move) => ({
        san: move.san,
        uci: move.uci,
        games: move.games,
        white: move.white,
        draws: move.draws,
        black: move.black,
        averageRating: move.rated > 0 ? Math.round(move.sum / move.rated) : 0,
        lastYear: move.lastYear,
        recentGames: move.recentGames,
        recentWhite: move.recentWhite,
        recentDraws: move.recentDraws,
        recentBlack: move.recentBlack,
      }));
    const games = [...new Set(entry.games.sort((a, b) => b[0] - a[0]).map(([, id]) => id))].slice(
      0,
      limits.topGames,
    );
    lines.push(pack.encodeExplorerLine({ key, moves, games }));
  }
  lines.sort();
  return lines;
}

/** One line per game, with duplicates relayed into several broadcasts removed. */
async function reduceGames(file) {
  const seen = new Map();
  for await (const row of rows(file)) {
    const id = row.slice(0, row.indexOf('\t'));
    if (!seen.has(id)) seen.set(id, row);
  }
  return [...seen.values()].sort();
}

/**
 * Fold every appearance of a player into one identity.
 *
 * Two rules, and the difference between them is the whole of Kingfisher's
 * identity policy. Spellings are merged when the archive recorded the *same
 * FIDE identifier* against them — that is the source stating they are one
 * person, not this program guessing from a resemblance. Spellings that merely
 * look alike stay apart, however obvious the guess would be.
 *
 * The merged row is written under every spelling, so a game listing "Magnus
 * Carlsen" and one listing "Carlsen, Magnus" both reach the same career, while
 * `id` lets a search show one row rather than three.
 */
async function reducePlayers(dir, shardCount, pack) {
  const byKey = new Map();

  for (let shard = 0; shard < shardCount; shard += 1) {
    for await (const row of rows(path.join(dir, `${shard}.txt`))) {
      const [key, name, fide, title, year, elo] = row.split('\t');
      let player = byKey.get(key);
      if (!player) {
        player = {
          key,
          names: new Map(),
          fide: new Map(),
          titles: new Set(),
          games: 0,
          firstYear: 0,
          lastYear: 0,
          peakRating: 0,
          lastRating: 0,
          lastRatingYear: 0,
        };
        byKey.set(key, player);
      }
      accumulate(player, name, fide, title, year, elo);
    }
  }

  // --- Group spellings that the archive gave the same FIDE identifier.
  const groups = new Map();
  for (const player of byKey.values()) {
    const identifier = dominant(player.fide);
    const group = identifier ? `fide:${identifier}` : `key:${player.key}`;
    const bucket = groups.get(group);
    if (bucket) bucket.push(player);
    else groups.set(group, [player]);
  }

  const lines = Array.from({ length: shardCount }, () => []);
  for (const members of groups.values()) {
    // The spelling with the most games names the identity, and is its key.
    const primary = members.reduce((best, one) => (one.games > best.games ? one : best));
    const merged = {
      key: primary.key,
      names: new Map(),
      fide: new Map(),
      titles: new Set(),
      games: 0,
      firstYear: 0,
      lastYear: 0,
      peakRating: 0,
      lastRating: 0,
      lastRatingYear: 0,
    };
    for (const member of members) {
      merged.games += member.games;
      for (const [name, count] of member.names) {
        merged.names.set(name, (merged.names.get(name) ?? 0) + count);
      }
      for (const [id, count] of member.fide)
        merged.fide.set(id, (merged.fide.get(id) ?? 0) + count);
      for (const title of member.titles) merged.titles.add(title);
      if (member.firstYear > 0 && (merged.firstYear === 0 || member.firstYear < merged.firstYear)) {
        merged.firstYear = member.firstYear;
      }
      if (member.lastYear > merged.lastYear) merged.lastYear = member.lastYear;
      if (member.peakRating > merged.peakRating) merged.peakRating = member.peakRating;
      if (member.lastRatingYear >= merged.lastRatingYear && member.lastRating > 0) {
        merged.lastRatingYear = member.lastRatingYear;
        merged.lastRating = member.lastRating;
      }
    }

    const name = [...merged.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const fideId = dominant(merged.fide);
    for (const member of members) {
      lines[pack.shardOf(member.key, shardCount)].push(
        pack.encodePlayerLine({
          key: member.key,
          id: primary.key,
          name,
          fideId,
          title: bestTitle(merged.titles),
          games: merged.games,
          firstYear: merged.firstYear,
          lastYear: merged.lastYear,
          peakRating: merged.peakRating,
          lastRating: merged.lastRating,
        }),
      );
    }
  }

  for (const shard of lines) shard.sort();
  const canonical = new Map();
  for (const members of groups.values()) {
    const primary = members.reduce((best, one) => (one.games > best.games ? one : best));
    for (const member of members) canonical.set(member.key, primary.key);
  }
  return { lines, identities: groups.size, canonical };
}

function accumulate(player, name, fide, title, year, elo) {
  player.games += 1;
  player.names.set(name, (player.names.get(name) ?? 0) + 1);
  if (fide) player.fide.set(fide, (player.fide.get(fide) ?? 0) + 1);
  if (title) player.titles.add(title);
  const played = Number(year) || 0;
  if (played > 0) {
    if (player.firstYear === 0 || played < player.firstYear) player.firstYear = played;
    if (played > player.lastYear) player.lastYear = played;
  }
  const rating = Number(elo) || 0;
  if (rating > player.peakRating) player.peakRating = rating;
  if (rating > 0 && played >= player.lastRatingYear) {
    player.lastRatingYear = played;
    player.lastRating = rating;
  }
}

/**
 * The identifier a name was recorded with, when the archive is consistent.
 *
 * A name that appears with two different FIDE identifiers is two people
 * sharing a spelling, or one relay's typo. Either way the row keeps neither: a
 * wrong identifier is worse than an absent one, and both cases are rare.
 */
function dominant(counts) {
  if (counts.size !== 1) return '';
  return [...counts.keys()][0];
}

/** Titles a player has held, reduced to the highest — they never go down. */
const TITLE_ORDER = ['GM', 'IM', 'FM', 'CM', 'NM', 'WGM', 'WIM', 'WFM', 'WCM', 'WNM', 'LM', 'BOT'];
const bestTitle = (titles) => TITLE_ORDER.find((title) => titles.has(title)) ?? '';

/** Game lists follow the merge: every spelling of one player lists one career. */
async function reducePlayerGames(dir, shardCount, canonical, limits, pack) {
  const byIdentity = new Map();
  const aliases = new Map();

  for (let shard = 0; shard < shardCount; shard += 1) {
    for await (const row of rows(path.join(dir, `${shard}.txt`))) {
      const [key, year, gameId] = row.split('\t');
      const identity = canonical.get(key) ?? key;
      let list = byIdentity.get(identity);
      if (!list) {
        list = [];
        byIdentity.set(identity, list);
      }
      list.push([Number(year) || 0, gameId]);
      let spellings = aliases.get(identity);
      if (!spellings) {
        spellings = new Set();
        aliases.set(identity, spellings);
      }
      spellings.add(key);
    }
  }

  const lines = Array.from({ length: shardCount }, () => []);
  for (const [identity, list] of byIdentity) {
    const games = [...new Set(list.sort((a, b) => b[0] - a[0]).map(([, id]) => id))].slice(
      0,
      limits.gamesPerPlayer,
    );
    for (const key of aliases.get(identity) ?? [identity]) {
      lines[pack.shardOf(key, shardCount)].push(pack.encodePlayerGamesLine({ key, games }));
    }
  }
  for (const shard of lines) shard.sort();
  return lines;
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await closeApp();
  process.exit(1);
});
