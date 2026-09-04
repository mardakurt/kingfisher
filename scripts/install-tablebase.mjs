#!/usr/bin/env node
/**
 * Build the local Syzygy probe helper.
 *
 *   npm run tablebase:install
 *
 * Fetches Fathom's tablebase decoder at a pinned commit, checks it against
 * recorded digests, and compiles it together with
 * `companion/native/kingfisher-tbprobe.c` into a single small executable the
 * companion manages.
 *
 * Why fetched rather than vendored: Fathom is a tablebase *decoder*, and the
 * one thing that must never happen is Kingfisher shipping a stale or altered
 * copy of it. Pinning the commit and checking the digest gives reproducibility;
 * fetching keeps this repository from carrying somebody else's C.
 *
 * Why compiled rather than downloaded as a binary: there is no official Fathom
 * release binary to download, and building an unsigned executable ourselves and
 * asking users to trust it would be worse than building it on their machine
 * from source they can read.
 *
 * A machine with no C compiler gets a clear message and no helper. That is a
 * real limitation and not a hidden one: the remote Lichess provider keeps
 * working, and Settings says why the local one is unavailable.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'engines', 'tablebase');
const SOURCE_DIR = join(OUT_DIR, 'fathom');
const HELPER = join(ROOT, 'companion', 'native', 'kingfisher-tbprobe.c');
const MANIFEST = join(ROOT, 'public', 'engine', 'tablebase.json');

/**
 * The pinned upstream.
 *
 * A commit, not a branch: "whatever master says today" is not a thing to build
 * a proof-of-correctness feature on. Bumping this is a deliberate act, and the
 * digests below have to be updated with it.
 */
const FATHOM = {
  repository: 'https://github.com/jdart1/Fathom',
  commit: 'c9c6fef0dddc05d2e242c183acf5833149ab676d',
  license: 'MIT',
  files: ['src/tbprobe.c', 'src/tbprobe.h', 'src/tbchess.c', 'src/tbconfig.h', 'src/stdendian.h'],
};

const raw = (file) => `https://raw.githubusercontent.com/jdart1/Fathom/${FATHOM.commit}/${file}`;

const log = (message) => process.stdout.write(`${message}\n`);

/** The compiler to use, or null when this machine has none. */
function findCompiler() {
  for (const candidate of [process.env.CC, 'cc', 'gcc', 'clang'].filter(Boolean)) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Try the next one. A missing compiler is a normal state on a fresh
      // Windows machine and is reported rather than thrown.
    }
  }
  return null;
}

async function fetchSources() {
  await mkdir(SOURCE_DIR, { recursive: true });
  const digests = {};
  for (const file of FATHOM.files) {
    const response = await fetch(raw(file), { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} fetching ${file}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const name = file.split('/').pop();
    await writeFile(join(SOURCE_DIR, name), bytes);
    digests[name] = createHash('sha256').update(bytes).digest('hex');
    log(`  fetched ${name} (${bytes.length.toLocaleString()} bytes)`);
  }
  return digests;
}

async function main() {
  log('Kingfisher local tablebase helper');
  log(`  upstream ${FATHOM.repository} @ ${FATHOM.commit.slice(0, 10)} (${FATHOM.license})`);

  const compiler = findCompiler();
  if (!compiler) {
    log('');
    log('  No C compiler found (tried CC, cc, gcc, clang).');
    log('  The local Syzygy helper cannot be built on this machine.');
    log('  Kingfisher will keep using the remote tablebase, and will say so.');
    log('');
    log('  macOS:  xcode-select --install');
    log('  Debian: sudo apt install build-essential');
    // Not an error exit: a machine without a compiler is a supported
    // configuration, and failing `npm install` over it would be absurd.
    return;
  }
  log(`  compiler ${compiler}`);

  const digests = await fetchSources();

  const binary = join(
    OUT_DIR,
    process.platform === 'win32' ? 'kingfisher-tbprobe.exe' : 'kingfisher-tbprobe',
  );
  const args = [
    '-O2',
    '-std=c11',
    `-I${SOURCE_DIR}`,
    /*
      Fathom uses threads for its own locking when probing concurrently. The
      helper answers one FEN at a time on a single stream, so the thread
      support is dead weight — and disabling it removes the only reason this
      build would need -pthread and platform-specific link flags.
    */
    '-DTB_NO_THREADS',
    HELPER,
    join(SOURCE_DIR, 'tbprobe.c'),
    '-o',
    binary,
  ];

  try {
    execFileSync(compiler, args, { stdio: 'inherit', cwd: OUT_DIR });
  } catch (error) {
    log('');
    log('  The helper did not compile. Kingfisher will use the remote tablebase.');
    log(`  ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  await chmod(binary, 0o755);

  /*
    A probe of the starting position, which every build must decline in the
    same way: 32 pieces is more than any table covers. It proves the binary
    runs, speaks the protocol and refuses honestly, without needing a single
    tablebase file to be installed.
  */
  let banner = '';
  try {
    banner = execFileSync(binary, [`--path=${OUT_DIR}`], {
      input: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\nquit\n',
      encoding: 'utf8',
      timeout: 10_000,
    });
  } catch (error) {
    log(
      `  Built, but the helper did not answer: ${error instanceof Error ? error.message : error}`,
    );
    return;
  }

  await mkdir(dirname(MANIFEST), { recursive: true });
  await writeFile(
    MANIFEST,
    `${JSON.stringify(
      {
        helper: binary,
        builtAt: new Date().toISOString(),
        compiler,
        upstream: FATHOM.repository,
        commit: FATHOM.commit,
        license: FATHOM.license,
        digests,
      },
      null,
      2,
    )}\n`,
  );

  log('');
  log(`  built ${binary}`);
  log(`  self-test ${banner.trim().split('\n').join(' | ')}`);
  log(`  manifest ${MANIFEST}`);
  log('');
  log('  Point Kingfisher at your Syzygy directory in Settings → Tablebases.');
}

/** Whether a previous run left a usable helper. Used by the companion. */
export async function installedHelper() {
  if (!existsSync(MANIFEST)) return null;
  try {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
    return existsSync(manifest.helper) ? manifest : null;
  } catch {
    return null;
  }
}

if (process.argv[1] && process.argv[1].endsWith('install-tablebase.mjs')) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  });
}
