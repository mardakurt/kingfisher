#!/usr/bin/env node
/**
 * `npm run puzzles:build` — the tactics puzzle set, from the Lichess puzzle
 * database (CC0, https://database.lichess.org/#puzzles).
 *
 * The full export holds about six million puzzles in 300 MB of zstd. Kingfisher
 * ships a curated subset small enough to sit in the application and work
 * offline: puzzles whose rating has settled (deviation ≤ 90), that players
 * rated well (popularity ≥ 80) and that enough people played (≥ 300), taken
 * evenly across 100-point rating bands from 400 to 3099. Which puzzles fill a
 * band is decided by a hash of their id, not by their order in the file, so
 * the selection is reproducible from the same export and not biased towards
 * the oldest puzzles.
 *
 * Every selected puzzle is replayed through Kingfisher's own rules
 * (`src/training/puzzles.ts`, which goes through `src/chess/position.ts`), and
 * one that does not play is dropped and counted rather than shipped.
 *
 * Usage:
 *   node scripts/build-puzzles.mjs --archive <lichess_db_puzzle.csv.zst> \
 *        [--last-modified "<HTTP date>"] [--per-band 1000]
 *   node scripts/build-puzzles.mjs --check   # verify the committed shards
 *
 * The archive is read from disk rather than streamed, so its SHA-256 can be
 * recorded; the publisher does not post one for this file, and the manifest
 * says so.
 */

import { createHash } from 'node:crypto';
import {
  createReadStream,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { zstdFrameStream } from '../companion/src/zstd-frames.mjs';
import { closeApp, loadApp } from './load-app.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, 'public', 'data', 'puzzles');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const SOURCE_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';

export const FILTER = {
  maxDeviation: 90,
  minPopularity: 80,
  minPlays: 300,
  minRating: 400,
  maxRating: 3099,
};
const BAND = 100;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const argument = (name) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};

async function check() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const { puzzleFromRow, puzzleLine } = await loadApp(['/src/training/puzzles.ts']);
  let failures = 0;
  let rows = 0;
  for (const band of manifest.bands) {
    const bytes = readFileSync(path.join(OUT_DIR, band.file));
    const digest = sha256(bytes);
    const shard = JSON.parse(bytes.toString('utf8'));
    const count = shard.length;
    rows += count;
    // Every puzzle, through the rules: the digest proves the bytes, this proves they play.
    for (const row of shard) {
      const line = puzzleLine(puzzleFromRow(row));
      if (!line.ok) {
        failures += 1;
        console.error(`✗ ${line.reason}`);
      }
    }
    if (digest !== band.sha256 || count !== band.count) {
      failures += 1;
      console.error(`✗ ${band.file}: digest ${digest.slice(0, 12)} count ${count}`);
    }
  }
  if (rows !== manifest.totals.shipped) {
    failures += 1;
    console.error(`✗ manifest says ${manifest.totals.shipped} puzzles, shards hold ${rows}`);
  }
  await closeApp();
  if (failures) process.exit(1);
  console.log(
    `✓ ${manifest.bands.length} shards, ${rows} puzzles, digests match the manifest, every puzzle plays`,
  );
}

async function* lines(file) {
  let rest = '';
  const decoder = new TextDecoder();
  for await (const chunk of zstdFrameStream(createReadStream(file, { highWaterMark: 1 << 20 }))) {
    rest += decoder.decode(chunk, { stream: true });
    let at;
    while ((at = rest.indexOf('\n')) !== -1) {
      yield rest.slice(0, at);
      rest = rest.slice(at + 1);
    }
  }
  if (rest) yield rest;
}

async function build() {
  const archive = argument('--archive');
  if (!archive) throw new Error('--archive <lichess_db_puzzle.csv.zst> is required');
  const perBand = Number(argument('--per-band') ?? 1000);
  const spare = 60;

  const archiveDigest = sha256(readFileSync(archive));
  console.log(`archive sha256 ${archiveDigest}`);

  // Per band, the `perBand + spare` puzzles with the smallest id hash.
  const bands = new Map();
  let rows = 0;
  let eligible = 0;
  let header = null;
  for await (const line of lines(archive)) {
    if (!line) continue;
    if (header === null) {
      header = line.split(',');
      if (header[0] !== 'PuzzleId' || header[1] !== 'FEN' || header[2] !== 'Moves') {
        throw new Error(`Unexpected header: ${line}`);
      }
      continue;
    }
    rows += 1;
    const f = line.split(',');
    const rating = Number(f[3]);
    const deviation = Number(f[4]);
    const popularity = Number(f[5]);
    const plays = Number(f[6]);
    if (
      !(rating >= FILTER.minRating && rating <= FILTER.maxRating) ||
      !(deviation <= FILTER.maxDeviation) ||
      !(popularity >= FILTER.minPopularity) ||
      !(plays >= FILTER.minPlays)
    )
      continue;
    eligible += 1;
    const band = Math.floor(rating / BAND) * BAND;
    const hash = createHash('sha1').update(f[0]).digest('hex');
    let held = bands.get(band);
    if (!held) bands.set(band, (held = []));
    if (held.length >= perBand + spare && hash >= held[held.length - 1].hash) continue;
    const game = (f[8] ?? '').replace('https://lichess.org/', '');
    held.push({
      hash,
      row: [f[0], f[1], f[2], rating, deviation, popularity, plays, f[7] ?? '', f[9] ?? '', game],
    });
    held.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
    if (held.length > perBand + spare) held.pop();
    if (rows % 1_000_000 === 0) console.log(`${rows.toLocaleString()} rows read`);
  }
  console.log(`${rows.toLocaleString()} rows, ${eligible.toLocaleString()} eligible`);

  const { puzzleFromRow, puzzleLine } = await loadApp(['/src/training/puzzles.ts']);
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const written = [];
  const themes = {};
  let rejected = 0;
  const rejections = [];
  for (const band of [...bands.keys()].sort((a, b) => a - b)) {
    const keep = [];
    for (const { row } of bands.get(band)) {
      if (keep.length >= perBand) break;
      const line = puzzleLine(puzzleFromRow(row));
      if (!line.ok) {
        rejected += 1;
        if (rejections.length < 20) rejections.push(line.reason);
        continue;
      }
      keep.push(row);
      for (const theme of row[7].split(' ').filter(Boolean))
        themes[theme] = (themes[theme] ?? 0) + 1;
    }
    keep.sort((a, b) => a[3] - b[3] || (a[0] < b[0] ? -1 : 1));
    const file = `r${String(band).padStart(4, '0')}.json`;
    const text = `${JSON.stringify(keep)}\n`;
    writeFileSync(path.join(OUT_DIR, file), text);
    written.push({
      band,
      file,
      count: keep.length,
      bytes: Buffer.byteLength(text),
      sha256: sha256(text),
    });
  }
  await closeApp();

  const manifest = {
    name: 'Kingfisher tactics puzzles',
    source: 'Lichess puzzle database',
    url: SOURCE_URL,
    licence: 'CC0-1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceLastModified: argument('--last-modified') ?? null,
    archiveSha256: archiveDigest,
    archiveDigestNote:
      'Computed by this build; the publisher does not post a digest for this file.',
    builtAt: new Date().toISOString().slice(0, 10),
    filter: { ...FILTER, perBand, selection: 'smallest sha1(PuzzleId) within each 100-point band' },
    totals: {
      sourceRows: rows,
      eligible,
      shipped: written.reduce((sum, band) => sum + band.count, 0),
      rejectedByRules: rejected,
    },
    rejections,
    themes: Object.fromEntries(Object.entries(themes).sort((a, b) => b[1] - a[1])),
    bands: written,
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `wrote ${manifest.totals.shipped} puzzles in ${written.length} shards (${rejected} refused by the rules)`,
  );
  const stray = readdirSync(OUT_DIR).filter(
    (name) => name !== 'manifest.json' && !written.some((band) => band.file === name),
  );
  if (stray.length) throw new Error(`Unexpected files in ${OUT_DIR}: ${stray.join(', ')}`);
}

(process.argv.includes('--check') ? check() : build()).catch((error) => {
  console.error(error);
  process.exit(1);
});
