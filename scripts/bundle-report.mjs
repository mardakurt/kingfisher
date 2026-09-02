#!/usr/bin/env node
/**
 * What each route actually downloads before it can run.
 *
 * `next build` with Turbopack prints routes but not bytes, and the numbers
 * that matter for startup are not "all the JavaScript in the app" — they are
 * the script tags a given prerendered route emits, because those are what the
 * browser must fetch and evaluate before the workstation is usable. Anything
 * behind a dynamic import is absent from this list by definition, which is
 * exactly what makes the list a fair before/after measure of code splitting.
 *
 *   npm run build
 *   npm run bundle:report
 *
 * Sizes are on-disk bytes and the gzip length of the same file. The gzip
 * figure is the one that resembles the wire; the raw figure is the one that
 * resembles parse cost.
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit } from 'node:process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDirectory = path.join(root, '.next', 'server', 'app');
const staticDirectory = path.join(root, '.next', 'static');

if (!statSync(appDirectory, { throwIfNoEntry: false })) {
  console.error('No build found. Run `npm run build` first.');
  exit(1);
}

/** Cache: routes share most of their chunks, and gzip is not free. */
const measured = new Map();

function measure(chunk) {
  const cached = measured.get(chunk);
  if (cached) return cached;
  const file = path.join(root, '.next', chunk.replace(/^\/_next\//, ''));
  let sizes = { bytes: 0, gzip: 0 };
  try {
    const contents = readFileSync(file);
    sizes = { bytes: contents.byteLength, gzip: gzipSync(contents).byteLength };
  } catch {
    // A script the HTML references but the build did not emit is worth seeing
    // as zero rather than as a crash in a reporting script.
  }
  measured.set(chunk, sizes);
  return sizes;
}

const kb = (value) => `${(value / 1024).toFixed(1)} kB`;

const routes = readdirSync(appDirectory)
  .filter((entry) => entry.endsWith('.html') && !entry.startsWith('_'))
  .sort();

const rows = routes.map((entry) => {
  const html = readFileSync(path.join(appDirectory, entry), 'utf8');
  const chunks = [
    ...new Set([...html.matchAll(/\/_next\/(static\/[^"']+?\.js)/g)].map((m) => m[0])),
  ];
  const totals = chunks.reduce(
    (sum, chunk) => {
      const sizes = measure(chunk);
      return { bytes: sum.bytes + sizes.bytes, gzip: sum.gzip + sizes.gzip };
    },
    { bytes: 0, gzip: 0 },
  );
  return {
    route: `/${entry.replace(/\.html$/, '').replace(/^index$/, '')}`,
    chunks: chunks.length,
    ...totals,
  };
});

const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith('.js') ? [full] : [];
  });

const allChunks = walk(staticDirectory);
const shipped = allChunks.reduce((sum, file) => sum + statSync(file).size, 0);

console.log('\nKingfisher route bundle report');
console.log(`node ${process.version} · ${process.platform}-${process.arch}\n`);
const width = Math.max(...rows.map((row) => row.route.length), 'route'.length);
console.log(`${'route'.padEnd(width)}   scripts       raw      gzip`);
for (const row of rows) {
  console.log(
    `${row.route.padEnd(width)}   ${String(row.chunks).padStart(7)}  ${kb(row.bytes).padStart(9)}  ${kb(row.gzip).padStart(9)}`,
  );
}
if (rows.length === 0) {
  console.error('No prerendered routes found. Run `npm run build` first.');
  exit(1);
}

const initial = rows.reduce((worst, row) => (row.gzip > worst.gzip ? row : worst), rows[0]);
console.log(
  `\nheaviest route: ${initial.route} at ${kb(initial.gzip)} gzipped over ${initial.chunks} scripts`,
);
console.log(
  `client JavaScript emitted in total: ${kb(shipped)} across ${allChunks.length} files ` +
    '(includes every lazily loaded chunk)\n',
);
