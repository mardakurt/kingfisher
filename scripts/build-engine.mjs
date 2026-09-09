#!/usr/bin/env node
/**
 * Build an engine from its own source, and record what was built.
 *
 * Phase 18's fleet workflow downloads binaries the engine projects published.
 * That is the better provenance where it exists, and where it does not the
 * platform row was simply empty — which is why an Apple Silicon Kingfisher
 * offered five native engines and an Intel one offered two.
 *
 * This closes that, under conditions strict enough that the result is worth
 * something:
 *
 *   the project's own repository
 *     → an exact tag, which must still resolve to the recorded commit
 *     → an unpatched checkout
 *     → a declared build command, as argv and never as a shell string
 *     → a SHA-256 of what came out
 *     → and a record of the compiler, its version, the flags and the machine
 *
 * The provenance file is the deliverable, as much as the binary is. A binary
 * with no record of where it came from is exactly what this project refuses to
 * put in front of a chess judgement.
 *
 *   node scripts/build-engine.mjs                     # every engine for this platform
 *   node scripts/build-engine.mjs --engine berserk    # one
 *   node scripts/build-engine.mjs --out .engine-build --keep
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { SOURCES, sourcesFor } from './engine-sources.mjs';
import { cachePaths } from './cache-paths.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLATFORM = `${process.platform}-${process.arch}`;

function parseArgs(list) {
  /*
   * Phase 29 (PART BC): the default engine build output is the
   * external `engineBuild` cache path. The CLI flag still works
   * for one-off builds inside the project; passing `--out
   * .engine-build` is a no-op because `.engine-build` is
   * gitignored and now the user should use `--out <custom>`.
   */
  const args = {
    engine: null,
    out: cachePaths.engineBuild,
    keep: false,
    platform: PLATFORM,
  };
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === '--engine') args.engine = list[++i];
    else if (list[i] === '--out') args.out = path.resolve(list[++i]);
    else if (list[i] === '--keep') args.keep = true;
    else if (list[i] === '--platform') args.platform = list[++i];
  }
  return args;
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Run a command as argv. Never a shell string: nothing here interpolates. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${result.status}\n` +
        `${(result.stderr ?? '').split('\n').slice(-25).join('\n')}`,
    );
  }
  return result.stdout ?? '';
}

/** What compiled this, and which version of it. Recorded, never assumed. */
function compilerFacts(source) {
  const command = source.build.command === 'cargo' ? 'cargo' : (process.env.CC ?? 'cc');
  try {
    const version = run(command, ['--version']).split('\n')[0].trim();
    return { compiler: command, compilerVersion: version };
  } catch {
    return { compiler: command, compilerVersion: 'unknown' };
  }
}

/**
 * Check out one tag, and refuse if it is not the commit that was recorded.
 *
 * A tag can be moved; the whole point of recording a commit beside it is that
 * moving it is then visible. This is the check that makes "built from tag 14"
 * a claim rather than a hope.
 */
function checkout(source, into) {
  rmSync(into, { recursive: true, force: true });
  mkdirSync(path.dirname(into), { recursive: true });
  run('git', ['clone', '--depth', '1', '--branch', source.tag, source.repository, into]);
  const head = run('git', ['rev-parse', 'HEAD'], { cwd: into }).trim();
  if (head !== source.commit) {
    throw new Error(
      `${source.name}: tag ${source.tag} is now ${head}, not the recorded ${source.commit}. ` +
        'Refusing to build a moved tag. If the move is legitimate, record the new commit deliberately.',
    );
  }
  // Nothing is patched, and this is where that is enforced rather than assumed.
  const dirty = run('git', ['status', '--porcelain'], { cwd: into }).trim();
  if (dirty) throw new Error(`${source.name}: the checkout is not clean:\n${dirty}`);
  return head;
}

function buildOne(source, args) {
  const started = Date.now();
  const workspace = path.join(args.out, 'src', source.id);
  const commit = checkout(source, workspace);

  const extra = source.build.arch?.[args.platform] ?? [];
  const cwd = path.join(workspace, source.build.cwd ?? '.');
  const buildArgs = [...source.build.args, ...extra];
  run(source.build.command, buildArgs, {
    cwd,
    env: { ...process.env, ...(source.build.env ?? {}) },
  });

  const produced = path.join(workspace, source.binary);
  if (!existsSync(produced)) {
    throw new Error(`${source.name}: the build finished but produced no ${source.binary}.`);
  }
  const binaries = path.join(args.out, 'bin');
  mkdirSync(binaries, { recursive: true });
  const destination = path.join(
    binaries,
    `${source.id}${process.platform === 'win32' ? '.exe' : ''}`,
  );
  copyFileSync(produced, destination);
  chmodSync(destination, 0o755);

  return {
    id: source.id,
    name: source.name,
    version: source.version,
    license: source.license,
    repository: source.repository,
    tag: source.tag,
    commit,
    builtBy: 'kingfisher',
    patched: false,
    platform: args.platform,
    targetArch: process.arch,
    buildCommand: [source.build.command, ...buildArgs].join(' '),
    ...compilerFacts(source),
    network: source.network ?? [],
    binary: destination,
    bytes: statSync(destination).size,
    sha256: sha256(destination),
    elapsedMs: Date.now() - started,
    builtAt: new Date().toISOString(),
    host: `${process.platform}-${process.arch} node ${process.version}`,
  };
}

function main() {
  const args = parseArgs(argv.slice(2));
  console.log('Kingfisher engine build');
  console.log(`node ${process.version} · ${args.platform}\n`);

  const wanted = args.engine
    ? SOURCES.filter((source) => source.id === args.engine)
    : sourcesFor(args.platform);

  if (wanted.length === 0) {
    console.log(
      args.engine
        ? `No engine source is declared with the id ${args.engine}.`
        : `No engine source declares a build for ${args.platform}.`,
    );
    // Not a failure. A platform with nothing declared is a platform this
    // project has not claimed anything about, which is the honest state.
    writeFileSync(path.join(args.out, 'build-provenance.json'), '[]');
    return 0;
  }

  mkdirSync(args.out, { recursive: true });
  const records = [];
  const failures = [];
  for (const source of wanted) {
    process.stdout.write(`${source.name.padEnd(22)} ${source.tag} … `);
    try {
      const record = buildOne(source, args);
      records.push(record);
      console.log(
        `built in ${(record.elapsedMs / 1000).toFixed(0)} s · ` +
          `${(record.bytes / 1e6).toFixed(1)} MB · ${record.sha256.slice(0, 16)}…`,
      );
    } catch (error) {
      failures.push({ id: source.id, error: String(error?.message ?? error) });
      console.log('FAILED');
      console.log(
        `  ${String(error?.message ?? error)
          .split('\n')
          .join('\n  ')}`,
      );
    }
  }

  const provenance = path.join(args.out, 'build-provenance.json');
  writeFileSync(provenance, `${JSON.stringify(records, null, 2)}\n`);
  console.log(`\nProvenance: ${path.relative(ROOT, provenance)}`);

  if (!args.keep) {
    rmSync(path.join(args.out, 'src'), { recursive: true, force: true });
  }
  if (failures.length > 0) {
    console.log(`\n${failures.length} of ${wanted.length} failed to build.`);
    return 1;
  }
  console.log(`\n${records.length} of ${wanted.length} built.`);
  return 0;
}

try {
  exit(main());
} catch (error) {
  console.error(error);
  exit(1);
}
