#!/usr/bin/env node

/**
 * Turn the vendored ECO dataset into an index keyed by Kingfisher's own
 * canonical position identity.
 *
 * The point of doing this at build time rather than at runtime is not speed,
 * it is agreement. The dataset ships move sequences; Kingfisher looks things up
 * by `positionKey`. If the two were reconciled at runtime by a second
 * implementation of the rules, a disagreement between that implementation and
 * `src/chess/` would show up as an opening that is silently never recognised.
 * So the generator replays every line through the application's own
 * `Position`, and what it writes out is by construction the same key the game
 * tree will present when a user reaches that position.
 *
 * Lines the rules code rejects are reported and dropped, never guessed at.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeApp, loadApp } from './load-app.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = path.join(ROOT, 'data', 'openings');
const OUTPUT = path.join(ROOT, 'src', 'theory', 'opening-index.generated.ts');
const VOLUMES = ['a', 'b', 'c', 'd', 'e'];

/** Every SAN token of a `pgn` column, with the move numbers dropped. */
function movesOf(pgn) {
  return pgn
    .split(/\s+/)
    .filter((token) => token.length > 0 && !/^\d+\.(\.\.)?$/.test(token))
    .map((token) => token.replace(/^\d+\.(\.\.)?/, ''))
    .filter((token) => token.length > 0);
}

/**
 * `Family: Variation, Subvariation` split the way `OpeningInfo` wants it.
 *
 * The colon is the dataset's own documented convention, so this is reading a
 * structure rather than parsing prose. Everything after the first colon stays
 * together: splitting the commas as well would present "Najdorf Variation" and
 * "English Attack" as unrelated facts when the second only qualifies the first.
 */
function splitName(full) {
  const colon = full.indexOf(': ');
  if (colon === -1) return { name: full, variation: undefined };
  return { name: full.slice(0, colon), variation: full.slice(colon + 2) };
}

function readDataset() {
  const rows = [];
  for (const volume of VOLUMES) {
    const file = path.join(DATA, `${volume}.tsv`);
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const line of lines.slice(1)) {
      if (line.trim().length === 0) continue;
      const [eco, name, pgn] = line.split('\t');
      if (!eco || !name || !pgn) continue;
      rows.push({ eco: eco.trim(), full: name.trim(), pgn: pgn.trim() });
    }
  }
  return rows;
}

/** A stable fingerprint of the vendored files, so drift is detectable. */
function datasetDigest() {
  const hash = createHash('sha256');
  for (const file of readdirSync(DATA).sort()) {
    if (!file.endsWith('.tsv')) continue;
    hash.update(file);
    hash.update(readFileSync(path.join(DATA, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

async function main() {
  const { Position, positionKey } = await loadApp(['/src/chess/position.ts', '/src/chess/fen.ts']);

  const rows = readDataset();
  const entries = new Map();
  const rejected = [];
  let deepest = 0;

  for (const row of rows) {
    const moves = movesOf(row.pgn);
    let position = Position.initial();
    let failed = null;
    for (const san of moves) {
      const played = position.playSan(san);
      if (!played.ok) {
        failed = `${row.eco} ${row.full}: ${san} — ${played.error.message}`;
        break;
      }
      position = Position.fromTrustedFen(played.value.after);
    }
    if (failed) {
      rejected.push(failed);
      continue;
    }

    const key = positionKey(position.fen);
    deepest = Math.max(deepest, moves.length);
    const existing = entries.get(key);
    /*
      The dataset carries several rows per named opening so that common
      transpositions land on the same name. Two different names can also reach
      one position through different move orders, and when they do the shorter
      line is the one the dataset treats as canonical. Preferring it keeps the
      answer stable no matter which order the file happens to be read in.
    */
    if (!existing || moves.length < existing.plies) {
      const { name, variation } = splitName(row.full);
      entries.set(key, { eco: row.eco, name, variation, plies: moves.length, moves });
    }
  }

  const names = new Map();
  const nameList = [];
  const idFor = (value) => {
    if (!names.has(value)) {
      names.set(value, nameList.length);
      nameList.push(value);
    }
    return names.get(value);
  };

  const sorted = [...entries.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const packed = sorted.map(([key, entry]) => {
    const label = entry.variation ? `${entry.name}: ${entry.variation}` : entry.name;
    return `  '${key}': [${idFor(entry.eco)}, ${idFor(label)}, ${entry.plies}],`;
  });
  /*
    The move list, as well as the name.

    Classification only ever needed the position key, so the first version of
    this file threw the moves away. An opening *library* cannot: browsing to
    "Najdorf, English Attack" has to be able to put the line on the board, and
    recomputing it would mean shipping the TSV to the browser. Kept as SAN
    because that is what a reader wants to see beside the name.
  */
  const lines = sorted.map(([key, entry]) => `  '${key}': '${entry.moves.join(' ')}',`);

  const source = [
    '/**',
    ' * GENERATED FILE — do not edit.',
    ' *',
    ' * Written by `npm run openings:build` from the CC0 dataset vendored in',
    ' * `data/openings/`. Every key here was produced by replaying the dataset’s',
    ' * own move list through `src/chess/position.ts`, so it is the identity the',
    ' * running application computes rather than one derived independently.',
    ' *',
    ' * Values are `[ecoId, labelId, plies]` into `OPENING_LABELS`.',
    ' */',
    '',
    `export const OPENING_DATASET_DIGEST = '${datasetDigest()}';`,
    `export const OPENING_ENTRY_COUNT = ${sorted.length};`,
    `export const OPENING_DEEPEST_PLY = ${deepest};`,
    '',
    'export const OPENING_LABELS: readonly string[] = [',
    ...nameList.map((value) => `  ${JSON.stringify(value)},`),
    '];',
    '',
    'export const OPENING_POSITIONS: Readonly<Record<string, readonly [number, number, number]>> = {',
    ...packed,
    '};',
    '',
    '/** The dataset’s own shortest line to each position, in SAN. */',
    'export const OPENING_LINES: Readonly<Record<string, string>> = {',
    ...lines,
    '};',
    '',
  ].join('\n');

  writeFileSync(OUTPUT, source);

  console.log(`Kingfisher opening index`);
  console.log(`dataset rows        ${rows.length.toLocaleString()}`);
  console.log(`indexed positions   ${sorted.length.toLocaleString()}`);
  console.log(`distinct labels     ${nameList.length.toLocaleString()}`);
  console.log(`deepest known line  ${deepest} plies`);
  console.log(`rejected lines      ${rejected.length}`);
  for (const line of rejected.slice(0, 10)) console.log(`  ${line}`);
  console.log(`written             ${path.relative(ROOT, OUTPUT)}`);
}

main()
  .then(closeApp)
  .catch(async (error) => {
    console.error(error instanceof Error ? error.stack : error);
    await closeApp();
    process.exit(1);
  });
