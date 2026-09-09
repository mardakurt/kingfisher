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
  existsSync,
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
    months: 3,
    files: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--pack') args.pack = argv[++index];
    else if (flag === '--out') args.out = argv[++index];
    else if (flag === '--workers') args.workers = Number(argv[++index]);
    // A short run over the newest few archives, for checking a change to the
    // pipeline without waiting for the whole build.
    else if (flag === '--files') args.files = Number(argv[++index]);
    else if (flag === '--months') args.months = Number(argv[++index]);
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
  // Each verified upstream file has its own fingerprinted scan directory.
  // Completed scans survive interruption and are reused on subsequent builds.
  mkdirSync(work, { recursive: true });

  console.log(`Kingfisher reference pack: ${definition.name}`);
  console.log(`source   ${definition.source.name} (${definition.source.license.id})`);

  // --- 1. Acquire and verify the upstream archive.
  const digests = await fetchChecksums(definition.source);
  const all = definition.files(new Map(digests), args.months);
  const wanted = args.files > 0 ? all.slice(0, args.files) : all;
  console.log(`archives ${wanted.length} files`);
  const archives = [];
  for (const file of wanted) {
    const expected = digests.get(file);
    if (!expected) throw new Error(`${file} is not in the published digest list.`);
    if (definition.source.streaming) {
      /*
        Not downloaded. One month of the standard database is close to thirty
        gigabytes compressed, so the worker opens the URL and decodes it as it
        arrives. The published digest still identifies the archive — it is what
        the resume directory below is keyed on — and the reader hashes every compressed byte and refuses completion unless
        the digest matches, including after a resumed connection.
      */
      archives.push({
        file,
        url: new URL(file, definition.source.base).toString(),
        sha256: expected,
        streaming: true,
      });
      continue;
    }
    const got = await fetchVerified(definition.source, file, expected, CACHE, (progress) =>
      console.log(`  fetched ${progress.file} (${bytes(progress.bytes)})`),
    );
    archives.push(got);
  }

  // --- 2. Scan every archive in parallel into pre-sharded rows.
  const shards = definition.shards;
  // Supplied rather than read inside the worker, so a build is reproducible
  // from the same archives regardless of when the workers happen to start.
  definition.limits.thisYear = new Date().getFullYear();

  const scanned = await scan(archives, work, shards, definition.limits, args.workers);
  const inputs = scanned.directories;
  const shardInputs = (kind, shard) => inputs.map((dir) => path.join(dir, kind, `${shard}.txt`));
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
  const counts = { games: 0, openable: 0, positions: 0, players: 0 };
  for (let shard = 0; shard < shards.game; shard += 1) {
    const ids = new Set();
    for await (const id of rows(shardInputs('accepted', shard))) ids.add(id);
    counts.games += ids.size;
  }

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
      shardInputs('explorer', shard),
      definition.limits,
      recentSince,
      pack,
    );
    counts.positions += lines.length;
    emit('explorer', shard, lines);
  }
  for (let shard = 0; shard < shards.game; shard += 1) {
    const lines = await reduceGames(shardInputs('game', shard));
    counts.openable += lines.length;
    emit('game', shard, lines);
  }
  const people = await reducePlayers(
    inputs.map((dir) => path.join(dir, 'players')),
    shards.players,
    pack,
  );
  counts.players = people.identities;
  for (let shard = 0; shard < shards.players; shard += 1)
    emit('players', shard, people.lines[shard]);

  const playerGames = await reducePlayerGames(
    inputs.map((dir) => path.join(dir, 'playergames')),
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
    population: {
      gamesConsidered: scanned.seen,
      gamesRetainedBeforeDeduplication: scanned.kept,
      retainedBySpeed: scanned.retainedBySpeed,
      speeds: definition.limits.speeds ?? null,
      minRating: definition.limits.minRating,
      rejectedByReason: scanned.rejectedByReason,
      archiveMonths: wanted.map((file) => /\d{4}-\d{2}/.exec(file)?.[0]),
      buildImplementation: createHash('sha256')
        .update(readFileSync(fileURLToPath(import.meta.url)))
        .digest('hex'),
    },
    // A query at this depth needs the following move to have been scanned.
    // Keeping the unit and off-by-one rule in the manifest prevents UI and
    // reports from confusing full moves with plies.
    maxPositionPly: definition.limits.maxPly - 1,
    recentSince,
    shards,
    chunks,
    rawBytes,
    compressedBytes,
  };
  writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  /*
    Machine-readable build report. Written beside the manifest so every release
    has, by its own contents, the receipt for where its numbers came from. No
    paths leaked; everything is relative to the output directory or absolute
    upstream URLs already in the manifest.
  */
  const buildReport = {
    packId: definition.id,
    packVersion: definition.version,
    source: definition.source.name,
    license: definition.source.license.id,
    buildCommit: process.env.KINGFISHER_BUILD_COMMIT ?? null,
    buildDate: new Date().toISOString(),
    window: {
      firstYear: scanned.kept > 0 ? undefined : undefined,
      lastYear: scanned.maxYear,
      archiveMonths: wanted.map((file) => /\d{4}-\d{2}/.exec(file)?.[0]),
      speeds: definition.limits.speeds ?? null,
      minRating: definition.limits.minRating,
    },
    filter: {
      minPlies: definition.limits.minPlies,
      minGames: definition.limits.minGames,
      deepFromPly: definition.limits.deepFromPly ?? null,
      deepMinGames: definition.limits.deepMinGames ?? null,
      maxPly: definition.limits.maxPly,
      maxRating: definition.limits.maxRating,
      openRating: definition.limits.openRating,
      titles: definition.limits.titles,
      openTitles: definition.limits.openTitles,
      excludeOnline: definition.limits.excludeOnline ?? false,
    },
    inputGames: scanned.seen,
    acceptedGames: scanned.kept,
    rejectedGames: scanned.rejected,
    rejectedByReason: scanned.rejectedByReason,
    duplicates: scanned.duplicates,
    replayFailures: scanned.replayFailures,
    openedGames: scanned.opened,
    positions: counts.positions,
    players: counts.players,
    openableGames: counts.openable,
    fullGames: counts.openable,
    compressedBytes,
    rawBytes,
    chunks: chunks.length,
    maxPly: definition.limits.maxPly - 1,
    retainedBySpeed: scanned.retainedBySpeed,
  };
  writeFileSync(path.join(outDir, 'build-report.json'), `${JSON.stringify(buildReport, null, 2)}\n`);

  // Keep the incremental scan cache; it is derived data in .archive-cache.
  console.log(`games    ${counts.games.toLocaleString()} counted`);
  console.log(`openable ${counts.openable.toLocaleString()} full scores`);
  console.log(`positions${counts.positions.toLocaleString().padStart(10)}`);
  console.log(`players  ${counts.players.toLocaleString()}`);
  console.log(`chunks   ${chunks.length} — ${bytes(compressedBytes)} (${bytes(rawBytes)} raw)`);
  console.log(`written  ${path.relative(ROOT, outDir)}`);
  await closeApp();
}

/** The limits `scan.worker.mjs` reads. Everything else is applied on reduce. */
const SCAN_LIMITS = [
  'excludeOnline',
  'speeds',
  'maxPly',
  'maxRating',
  'minPlies',
  'minRating',
  'openRating',
  'openTitles',
  'thisYear',
  'titles',
];

/** Run the scan worker over every archive, at most `limit` at a time. */
function scan(archives, work, shards, limits, limit) {
  const implementation = ['scan.worker.mjs', 'pgn-stream.mjs', 'zstd-frames.mjs']
    .map((name) => readFileSync(new URL(`./reference/${name}`, import.meta.url), 'utf8'))
    .join('\n');
  const chessRoot = path.join(ROOT, 'src/chess');
  const rules = readdirSync(chessRoot, { recursive: true })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .sort()
    .map((file) => readFileSync(path.join(chessRoot, file), 'utf8'))
    .join('\n');
  const identity = readFileSync(path.join(ROOT, 'src/persistence/schema/migrations.ts'), 'utf8');
  /*
    Only the limits the scan itself applies. `minGames`, `topGames` and the
    rest are reduce-time thresholds, and fingerprinting them meant that tuning
    the size of a pack threw away an hour of parsing that would have produced
    byte-identical rows. Retuning a threshold is now a two-minute reduce.
  */
  const scanned = Object.fromEntries(
    SCAN_LIMITS.filter((key) => key in limits).map((key) => [key, limits[key]]),
  );
  const configuration = JSON.stringify({
    shards,
    limits: scanned,
    implementation,
    rules,
    identity,
  });
  const queue = archives.map((archive) => ({
    ...archive,
    directory: path.join(
      work,
      createHash('sha256')
        .update(archive.sha256 + configuration)
        .digest('hex'),
    ),
  }));
  const totals = {
    seen: 0,
    kept: 0,
    opened: 0,
    rejected: 0,
    rejectedByReason: {
      bad_result: 0,
      too_short: 0,
      non_standard_variant: 0,
      set_up_position: 0,
      missing_player: 0,
      missing_rating: 0,
      below_min_rating: 0,
      above_max_rating: 0,
      bot_match: 0,
      online_event: 0,
      duplicate: 0,
      illegal_moves: 0,
    },
    maxYear: 0,
    retainedBySpeed: {},
    directories: queue.map((item) => item.directory),
    duplicates: 0,
    replayFailures: 0,
  };
  const workerFile = new URL('./reference/scan.worker.mjs', import.meta.url);
  const workers = new Set();

  return new Promise((resolve, reject) => {
    let active = 0;
    let failed = false;
    const failure = (error) => {
      if (failed) return;
      failed = true;
      for (const worker of workers) void worker.terminate();
      reject(error);
    };
    const accumulate = (message) => {
      for (const [speed, count] of Object.entries(message.retainedBySpeed ?? {})) {
        totals.retainedBySpeed[speed] = (totals.retainedBySpeed[speed] ?? 0) + count;
      }
      for (const [reason, count] of Object.entries(message.rejectedByReason ?? {})) {
        totals.rejectedByReason[reason] = (totals.rejectedByReason[reason] ?? 0) + count;
      }
      totals.seen += message.seen;
      totals.kept += message.kept;
      totals.opened += message.opened;
      totals.maxYear = Math.max(totals.maxYear, message.maxYear);
      totals.rejected += message.rejected;
      totals.replayFailures += message.rejectedByReason?.illegal_moves ?? 0;
    };
    const pump = () => {
      if (failed) return;
      if (queue.length === 0 && active === 0) return resolve(totals);
      while (active < limit && queue.length > 0) {
        const archive = queue.shift();
        const marker = path.join(archive.directory, 'complete.json');
        if (existsSync(marker)) {
          accumulate(JSON.parse(readFileSync(marker, 'utf8')));
          console.log(`  reused  ${archive.file}`);
          continue;
        }
        // Only this archive's incomplete, fingerprinted temporary output.
        rmSync(archive.directory, { recursive: true, force: true });
        mkdirSync(archive.directory, { recursive: true });
        active += 1;
        const worker = new Worker(workerFile, {
          workerData: {
            // A streamed archive is opened by URL; a cached one by path.
            file: archive.streaming ? { url: archive.url, sha256: archive.sha256 } : archive.path,
            label: archive.file,
            outDir: archive.directory,
            shards,
            limits,
          },
          resourceLimits: { maxOldGenerationSizeMb: 4096 },
        });
        workers.add(worker);
        let reported = false;
        worker.on('message', (message) => {
          if (message.error) {
            failure(new Error(`${message.file}: ${message.error}`));
            return;
          }
          reported = true;
          accumulate(message);
          writeFileSync(marker, JSON.stringify(message));
          console.log(
            `  scanned ${path.basename(message.file)} — ${message.kept.toLocaleString()} kept`,
          );
        });
        worker.on('error', (error) => {
          failure(error);
        });
        worker.on('exit', (code) => {
          workers.delete(worker);
          active -= 1;
          if (code !== 0 || !reported)
            return failure(
              new Error(`${archive.file}: scan worker exited ${code} without a complete result.`),
            );
          pump();
        });
      }
      if (queue.length === 0 && active === 0) resolve(totals);
    };
    pump();
  });
}

async function* rows(file) {
  if (Array.isArray(file)) {
    for (const part of file) yield* rows(part);
    return;
  }
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
export async function reduceExplorer(file, limits, recentSince, pack) {
  const positions = new Map();
  for await (const row of rows(file)) {
    const [key, san, uci, result, rating, year, ply, gameId, strength, openable] = row.split('\t');
    const depth = Number(ply);
    if (depth >= limits.maxPly) continue;
    let entry = positions.get(key);
    if (!entry) {
      entry = { moves: new Map(), games: [], seen: new Set(), ply: depth };
      positions.set(key, entry);
    }
    // Transpositions reach one position at several depths; the shallowest is
    // the one the threshold should be judged against.
    if (depth < entry.ply) entry.ply = depth;
    if (entry.seen.has(gameId)) continue;
    entry.seen.add(gameId);
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
    if (openable === '1') {
      entry.games.push([Number(strength) || 0, gameId]);
      // Keep the strongest over the whole scan, not the first 64 encountered.
      entry.games.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
      entry.games.length = Math.min(entry.games.length, limits.topGames);
    }
  }

  const lines = [];
  for (const [key, entry] of positions) {
    const total = [...entry.moves.values()].reduce((sum, move) => sum + move.games, 0);
    if (total < requiredGames(limits, entry.ply)) continue;
    const moves = [...entry.moves.values()]
      .sort((a, b) => b.games - a.games || a.uci.localeCompare(b.uci))
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

/**
 * How many games a position needs before the pack carries it.
 *
 * A single threshold is the wrong shape. Near the start every position has
 * thousands of games and the number does nothing; past move twelve the tree
 * fans out faster than any archive fills it, and the same threshold is what
 * makes an explorer go blank exactly where preparation begins. So the
 * threshold falls with depth: common positions still have to be common, and a
 * deep position is kept on the strength of the games that reached it, because
 * at move eighteen two elite games *are* the theory.
 *
 * `deepFromPly` and `deepMinGames` are stated per pack and measured — see
 * `docs/data/reference-packs.md` for what each setting costs in megabytes.
 */
export function requiredGames(limits, ply) {
  if (limits.deepFromPly === undefined) return limits.minGames;
  return ply >= limits.deepFromPly ? limits.deepMinGames : limits.minGames;
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
    for await (const row of rows(dir.map((part) => path.join(part, `${shard}.txt`)))) {
      const [key, name, fide, title, year, elo, gameId] = row.split('\t');
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
          seen: new Set(),
        };
        byKey.set(key, player);
      }
      if (player.seen.has(gameId)) continue;
      player.seen.add(gameId);
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
    for await (const row of rows(dir.map((part) => path.join(part, `${shard}.txt`)))) {
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(async (error) => {
    console.error(error instanceof Error ? error.stack : error);
    await closeApp();
    process.exit(1);
  });
