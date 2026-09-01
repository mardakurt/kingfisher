#!/usr/bin/env node
/**
 * Fetch the Stockfish WebAssembly builds into `public/engine/stockfish/`.
 *
 * The engine is not a dependency of this package: it is GPL-3.0 licensed and
 * about 15 MB, so it is downloaded on demand and kept out of version control.
 * The application degrades honestly when it is missing — the engine panel says
 * so and points here — rather than pretending to analyse.
 *
 *   node scripts/install-engine.mjs [--if-missing]
 */

import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TARGET_DIR = join(ROOT, 'public', 'engine', 'stockfish');
const CDN = 'https://unpkg.com/stockfish@17.1.0/src';

/**
 * `lite-single` runs anywhere. `lite-mt` needs SharedArrayBuffer, which needs
 * cross-origin isolation (see next.config.ts); the provider picks at runtime.
 */
const BUILDS = [
  {
    id: 'lite-single',
    label: 'Stockfish 17.1 Lite (single-threaded)',
    script: 'stockfish-17.1-lite-single-03e3232.js',
    wasm: 'stockfish-17.1-lite-single-03e3232.wasm',
    threads: false,
  },
  {
    id: 'lite-mt',
    label: 'Stockfish 17.1 Lite (multi-threaded)',
    script: 'stockfish-17.1-lite-51f59da.js',
    wasm: 'stockfish-17.1-lite-51f59da.wasm',
    threads: true,
  },
];

const ifMissing = process.argv.includes('--if-missing');

async function exists(path) {
  try {
    const info = await stat(path);
    return info.size > 0;
  } catch {
    return false;
  }
}

async function download(name) {
  const destination = join(TARGET_DIR, name);
  if (await exists(destination)) {
    process.stdout.write(`  · ${name} (already present)\n`);
    return;
  }

  const url = `${CDN}/${name}`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`${response.status} ${response.statusText} while fetching ${url}`);
  }

  const temporary = `${destination}.partial`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  await rm(destination, { force: true });
  const { rename } = await import('node:fs/promises');
  await rename(temporary, destination);

  const info = await stat(destination);
  process.stdout.write(`  ✓ ${name} (${(info.size / 1e6).toFixed(1)} MB)\n`);
}

async function main() {
  const manifestPath = join(TARGET_DIR, 'manifest.json');
  if (ifMissing && (await exists(manifestPath))) return;

  await mkdir(TARGET_DIR, { recursive: true });
  process.stdout.write('Installing Stockfish 17.1 (GPL-3.0-or-later) into public/engine…\n');

  const installed = [];
  for (const build of BUILDS) {
    try {
      await download(build.script);
      await download(build.wasm);
      installed.push({
        id: build.id,
        label: build.label,
        script: `/engine/stockfish/${build.script}`,
        threads: build.threads,
      });
    } catch (error) {
      process.stdout.write(`  ! ${build.id} unavailable: ${error.message}\n`);
    }
  }

  if (installed.length === 0) {
    process.stdout.write(
      '\nNo engine builds could be downloaded. The application still runs; the\n' +
        'engine panel will report that analysis is unavailable.\n',
    );
    process.exitCode = ifMissing ? 0 : 1;
    return;
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        engine: 'Stockfish 17.1',
        license: 'GPL-3.0-or-later',
        source: 'https://www.npmjs.com/package/stockfish (nmrugg/stockfish.js)',
        installedAt: new Date().toISOString(),
        builds: installed,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`\nReady: ${installed.map((b) => b.id).join(', ')}\n`);
}

main().catch((error) => {
  process.stderr.write(`Engine install failed: ${error.message}\n`);
  process.exitCode = 1;
});
