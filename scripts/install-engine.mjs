#!/usr/bin/env node
/**
 * Fetch the Stockfish WebAssembly builds into `public/engine/stockfish/`.
 *
 * The engine is not a dependency of this package: it is GPL-3.0 licensed and
 * about 15 MB, so it is downloaded on demand and kept out of version control.
 * The application degrades honestly when it is missing — the engine panel says
 * so and points here — rather than pretending to analyse.
 *
 *   node scripts/install-engine.mjs [--if-missing] [--full]
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TARGET_DIR = join(ROOT, 'public', 'engine', 'stockfish');
const CDN = 'https://unpkg.com/stockfish@18.0.8/bin';

/**
 * `lite-single` runs anywhere. `lite-mt` needs SharedArrayBuffer, which needs
 * cross-origin isolation (see next.config.ts); the provider picks at runtime.
 *
 * The two `full` builds carry Stockfish's full-size evaluation network — the
 * same network the native binary runs — and weigh 113 MB each against the
 * lite builds' 7 MB. They are what makes a browser-only user's analysis
 * comparable with a native one, and they are opt-in (`--full`, or
 * `KINGFISHER_ENGINE_FULL=1`) because two of them would add 226 MB to the
 * Mac application, whose users have native Stockfish 19 and no reason to
 * carry a second copy of the network. The web deployment asks for them
 * (`vercel.json`); the desktop build does not.
 */
const BUILDS = [
  {
    id: 'lite-single',
    label: 'Stockfish 18 Lite (single-threaded)',
    script: 'stockfish-18-lite-single.js',
    wasm: 'stockfish-18-lite-single.wasm',
    threads: false,
    network: 'lite',
  },
  {
    id: 'lite-mt',
    label: 'Stockfish 18 Lite (multi-threaded)',
    script: 'stockfish-18-lite.js',
    wasm: 'stockfish-18-lite.wasm',
    threads: true,
    network: 'lite',
  },
  {
    id: 'full-single',
    label: 'Stockfish 18 (single-threaded, full network)',
    script: 'stockfish-18-single.js',
    wasm: 'stockfish-18-single.wasm',
    threads: false,
    network: 'full',
  },
  {
    id: 'full-mt',
    label: 'Stockfish 18 (multi-threaded, full network)',
    script: 'stockfish-18.js',
    wasm: 'stockfish-18.wasm',
    threads: true,
    network: 'full',
  },
];

const ifMissing = process.argv.includes('--if-missing');
const wantFull = process.argv.includes('--full') || process.env.KINGFISHER_ENGINE_FULL === '1';

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
  if (ifMissing && (await exists(manifestPath))) {
    // `--if-missing` is satisfied by a lite-only manifest unless the full
    // network was asked for and is not there yet.
    if (!wantFull) return;
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (manifest.builds?.some((build) => build.network === 'full')) return;
    } catch {
      // An unreadable manifest is rewritten below.
    }
  }

  await mkdir(TARGET_DIR, { recursive: true });
  process.stdout.write('Installing Stockfish 18 (GPL-3.0-or-later) into public/engine…\n');

  const installed = [];
  for (const build of BUILDS) {
    if (build.network === 'full' && !wantFull) continue;
    try {
      await download(build.script);
      await download(build.wasm);
      const info = await stat(join(TARGET_DIR, build.wasm));
      installed.push({
        id: build.id,
        label: build.label,
        script: `/engine/stockfish/${build.script}`,
        threads: build.threads,
        network: build.network,
        bytes: info.size,
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
        engine: 'Stockfish 18',
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
