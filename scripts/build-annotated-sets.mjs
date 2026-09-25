#!/usr/bin/env node
/**
 * Public-domain annotated games, transcribed from the books they were
 * published in (Phase 85).
 *
 * Each set is one book: the e-text is downloaded from where it is published,
 * checked against the SHA-256 recorded here, and read by
 * `src/annotated/descriptive-book.ts`, which resolves every descriptive move
 * against Kingfisher's own rules and keeps the author's notes word for word.
 * A book in which any game fails to transcribe is not written at all; the
 * refusals are printed.
 *
 * Writes `public/data/annotated/<id>.pgn` and `public/data/annotated/catalog.json`.
 *
 *   node scripts/build-annotated-sets.mjs           # download, transcribe, write
 *   node scripts/build-annotated-sets.mjs --check   # the committed files are what the books give
 *
 * Why a book and why this one: `docs/data/historical-games-audit.md` names
 * transcription from public-domain books as the way to ship historical games
 * with provenance for every one. *Chess Fundamentals* was published in 1921;
 * its author died in 1942; it is in the public domain in the United States and
 * in every country whose term is life plus seventy years or less.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { cachePaths } from './cache-paths.mjs';
import { closeApp, loadApp } from './load-app.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'data', 'annotated');
const CATALOG = path.join(OUT_DIR, 'catalog.json');

export const BOOKS = [
  {
    id: 'capablanca-chess-fundamentals-1921',
    title: 'Chess Fundamentals',
    author: 'J. R. Capablanca',
    year: 1921,
    edition: 'Project Gutenberg eBook #33870, released 2010-10-18',
    url: 'https://www.gutenberg.org/cache/epub/33870/pg33870.txt',
    sha256: '86f8bbe769853ddac506c65f6b4fb2e78cb5f00761e6bee06c4d7a415b042639',
    rights:
      'Public domain: published 1921; the author died in 1942. The game scores are facts; the notes are the author’s, out of copyright. Transcribed from the Project Gutenberg e-text, with Project Gutenberg’s licence and trademark text removed as its licence requires of a redistribution that does not use its name as a mark.',
  },
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function source(book) {
  const dir = path.join(cachePaths.archives, 'annotated');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${book.id}.txt`);
  if (!existsSync(file)) {
    const response = await fetch(book.url);
    if (!response.ok) throw new Error(`${book.url}: HTTP ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = readFileSync(file);
  const digest = sha256(bytes);
  if (digest !== book.sha256) {
    throw new Error(
      `${book.title}: the e-text's SHA-256 is ${digest}, not the recorded ${book.sha256}. ` +
        `The publisher changed the file; read the change before recording a new digest.`,
    );
  }
  return bytes.toString('utf8');
}

async function main() {
  const check = process.argv.includes('--check');
  const { transcribeBook } = await loadApp(['/src/annotated/descriptive-book.ts']);
  const catalog = { format: 'kingfisher-annotated-sets', version: 1, sets: [] };
  const outputs = [];
  let failed = false;

  for (const book of BOOKS) {
    const text = await source(book);
    const result = transcribeBook(text, book);
    if (result.refused.length > 0) {
      failed = true;
      for (const refused of result.refused) {
        console.error(
          `${book.title}, Game ${refused.number} (${refused.heading}): ${refused.reason}`,
        );
      }
      continue;
    }
    const pgn = result.games.map((game) => game.pgn).join('\n');
    const file = `${book.id}.pgn`;
    outputs.push([path.join(OUT_DIR, file), pgn]);
    catalog.sets.push({
      id: book.id,
      title: book.title,
      author: book.author,
      year: book.year,
      edition: book.edition,
      source: book.url,
      sourceSha256: book.sha256,
      rights: book.rights,
      file,
      sha256: sha256(Buffer.from(pgn, 'utf8')),
      games: result.games.length,
      notes: result.games.reduce((sum, game) => sum + (game.pgn.match(/\}/g)?.length ?? 0), 0),
      players: [...new Set(result.games.flatMap((game) => [game.white, game.black]))].sort(),
    });
    console.log(`${book.title}: ${result.games.length} games transcribed, none refused.`);
  }
  await closeApp();
  if (failed) {
    console.error('A book with a refused game is not written.');
    process.exit(1);
  }
  outputs.push([CATALOG, `${JSON.stringify(catalog, null, 2)}\n`]);

  if (check) {
    let drift = false;
    for (const [file, content] of outputs) {
      const committed = existsSync(file) ? readFileSync(file, 'utf8') : null;
      if (committed !== content) {
        drift = true;
        console.error(`${path.relative(ROOT, file)} is not what the books give.`);
      }
    }
    if (drift) process.exit(1);
    console.log('The committed annotated sets are what the books give.');
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [file, content] of outputs) writeFileSync(file, content);
  console.log(`Wrote ${outputs.length} files to ${path.relative(ROOT, OUT_DIR)}.`);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeApp();
  process.exit(1);
});
