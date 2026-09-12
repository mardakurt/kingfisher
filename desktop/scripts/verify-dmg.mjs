#!/usr/bin/env node
/**
 * Verify a Kingfisher DMG: the disk image a user actually opens.
 *
 * Mounts the image, walks the volume, and checks
 *
 *   - `hdiutil verify` passes, so a corrupt image never gets the green light;
 *   - the volume is named `Kingfisher` and carries a `.VolumeIcon.icns`;
 *   - the only visible root items are `Kingfisher.app` and an `Applications`
 *     link that resolves to `/Applications`;
 *   - the bundle inside is **launchable**: it carries the web server and the
 *     companion under `Resources/kingfisher/`, which every build from Phase 35
 *     to Phase 45 did not — those verified as DMGs and exited on launch;
 *   - `Info.plist` names the expected bundle id, version, build number and
 *     minimum macOS, and declares the `.pgn` document type;
 *   - the executable is `arm64` and nothing else;
 *   - the signature verifies, and the identity that made it is reported;
 *   - nothing ships that should not — no Finder duplicates (`name 2`), no
 *     `.DS_Store`, no test files, no `node_modules 2`.
 *
 * Runnable against any local DMG:
 *
 *   node desktop/scripts/verify-dmg.mjs path/to/Kingfisher-1.0.0-arm64.dmg \
 *     [--version 1.0.0] [--build 412] [--commit b77d3a2] [--arch arm64] [--json]
 *
 * and importable: `verifyDmg(path, options)` returns the same findings as
 * data, which is how `desktop:public:verify --full` checks the bytes a user
 * downloads and how `desktop:certify` checks the ones about to be published.
 *
 * The script never deletes the source DMG.
 */

import { execFile as execFileCb } from 'node:child_process';
import { inspectDesktopResources } from '../src/required-resources.mjs';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export const EXPECTED_BUNDLE = 'app.kingfisher.chess';
export const EXPECTED_VOLUME = 'Kingfisher';
export const EXPECTED_MIN_MACOS = '11.0';

async function run(cmd, args) {
  try {
    const { stdout, stderr } = await execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

async function plist(file, key) {
  const { code, stdout } = await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, file]);
  return code === 0 ? stdout.trim() : null;
}

/** Everything under `root`, relative, files and directories. */
function walk(root) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      out.push(path.relative(root, full));
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(full);
    }
  };
  visit(root);
  return out;
}

/**
 * Mount, check, unmount. Returns `{ ok, checks, facts }`; never throws for a
 * finding, only for a DMG that cannot be mounted at all.
 */
export async function verifyDmg(dmg, options = {}) {
  const {
    expectVersion = null,
    expectBuild = null,
    expectCommit = null,
    expectArch = 'arm64',
    expectBundle = EXPECTED_BUNDLE,
  } = options;
  const absolute = path.resolve(dmg);
  const checks = [];
  const facts = { dmg: absolute, bytes: statSync(absolute).size };
  const check = (label, ok, detail = '') => {
    checks.push({ label, ok, detail });
    return ok;
  };

  const verified = await run('hdiutil', ['verify', '-quiet', absolute]);
  if (!check('hdiutil verify', verified.code === 0, verified.stderr.trim() || 'image is sound')) {
    return { ok: false, checks, facts };
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kingfisher-dmg-verify-'));
  const attached = await run('hdiutil', [
    'attach',
    '-nobrowse',
    '-readonly',
    '-noverify',
    '-mountrandom',
    tmp,
    absolute,
  ]);
  if (attached.code !== 0) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(`hdiutil attach failed: ${attached.stderr.trim() || attached.code}`);
  }
  // The last line of stdout is `<device>\t<hint>\t<mount point>`.
  const mount = attached.stdout.trim().split('\n').pop().split('\t').pop().trim();

  try {
    // 1. The volume, as Finder shows it. `-mountrandom` makes the mount
    //    point's basename random, so the name has to be asked of the volume.
    const info = await run('diskutil', ['info', '-plist', mount]);
    const volumeName = /<key>VolumeName<\/key>\s*<string>([^<]*)<\/string>/.exec(info.stdout)?.[1];
    facts.volumeName = volumeName ?? null;
    check('volume name', volumeName === EXPECTED_VOLUME, `"${volumeName}"`);
    check('volume icon', existsSync(path.join(mount, '.VolumeIcon.icns')), '.VolumeIcon.icns');

    // 2. Visible root items.
    const visible = readdirSync(mount).filter((name) => !name.startsWith('.'));
    facts.visible = visible;
    check(
      'root layout',
      visible.length === 2 &&
        visible.includes('Kingfisher.app') &&
        visible.includes('Applications'),
      visible.join(', '),
    );
    const apps = visible.filter((name) => name.endsWith('.app'));
    check('exactly one application', apps.length === 1, apps.join(', '));
    const link = await run('readlink', [path.join(mount, 'Applications')]);
    check('Applications link', link.stdout.trim() === '/Applications', link.stdout.trim());

    // 3. The bundle is a whole application, not a shell with nothing to serve.
    const app = path.join(mount, 'Kingfisher.app');
    const resources = path.join(app, 'Contents', 'Resources', 'kingfisher');
    for (const resource of inspectDesktopResources(resources)) {
      check(`runtime: ${resource.path}`, resource.ok, `Resources/kingfisher/${resource.path}`);
    }
    const feed = path.join(app, 'Contents', 'Resources', 'app-update.yml');
    check(
      'update feed in the bundle',
      existsSync(feed) && /provider:\s*github/.test(readFileSync(feed, 'utf8')),
      'Resources/app-update.yml names the GitHub feed',
    );

    // 4. Info.plist.
    const infoPlist = path.join(app, 'Contents', 'Info.plist');
    const id = await plist(infoPlist, 'CFBundleIdentifier');
    const short = await plist(infoPlist, 'CFBundleShortVersionString');
    const build = await plist(infoPlist, 'CFBundleVersion');
    const minimum = await plist(infoPlist, 'LSMinimumSystemVersion');
    const name = await plist(infoPlist, 'CFBundleName');
    const types = await plist(infoPlist, 'CFBundleDocumentTypes');
    Object.assign(facts, { bundleId: id, version: short, build, minimumMacOS: minimum });
    check('bundle id', id === expectBundle, id ?? 'unreadable');
    check('bundle name', name === 'Kingfisher', name ?? 'unreadable');
    check('minimum macOS', minimum === EXPECTED_MIN_MACOS, minimum ?? 'unreadable');
    check(
      '.pgn document type declared',
      /pgn/.test(types ?? ''),
      types ? 'CFBundleDocumentTypes has pgn' : 'none',
    );
    if (expectVersion) check('marketing version', short === expectVersion, short ?? 'unreadable');
    else check('marketing version present', Boolean(short), short ?? 'unreadable');
    if (expectBuild !== null) {
      check('build number', String(build) === String(expectBuild), build ?? 'unreadable');
    }

    // The recorded identity, from the packaged package.json inside the asar.
    const asar = path.join(app, 'Contents', 'Resources', 'app.asar');
    const pkg = await run(process.execPath, [
      '-e',
      `const a=require(${JSON.stringify(resolveAsar())});process.stdout.write(a.extractFile(process.argv[1],'package.json').toString())`,
      asar,
    ]);
    let identity = null;
    try {
      identity = JSON.parse(pkg.stdout).kingfisher ?? null;
    } catch {
      identity = null;
    }
    facts.identity = identity;
    if (expectCommit) {
      const commit = identity?.commit ?? '';
      const agrees =
        commit.length >= 7 &&
        expectCommit.length >= 7 &&
        (commit.startsWith(expectCommit) || expectCommit.startsWith(commit));
      check('build commit', agrees, commit || 'unrecorded');
    }
    if (identity) {
      check(
        'build was not made from a dirty tree',
        identity.dirty !== true && identity.dirty !== 'true',
        String(identity.dirty),
      );
    }

    // 5. Architecture.
    const exe = path.join(app, 'Contents', 'MacOS', 'Kingfisher');
    const archs = (await run('lipo', ['-archs', exe])).stdout.trim();
    facts.architecture = archs;
    check('architecture', archs === expectArch, archs || 'unreadable');

    // 6. Signature. Verified strictly; the identity is reported, not asserted,
    //    because which identity is *correct* is the trust gate's question.
    const sig = await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
    check('signature verifies', sig.code === 0, sig.stderr.trim().split('\n').pop() ?? '');
    const detail = await run('codesign', ['-dvv', app]);
    const authority = /Authority=([^\n]+)/.exec(detail.stderr)?.[1] ?? null;
    const flags = /flags=([^\s]+)/.exec(detail.stderr)?.[1] ?? null;
    facts.signingAuthority = authority;
    facts.hardenedRuntime = /runtime/.test(flags ?? '');
    check('hardened runtime', facts.hardenedRuntime, flags ?? 'no flags');
    check('signed by a known identity', Boolean(authority), authority ?? 'unsigned');

    // 7. Nothing that should not ship.
    const everything = walk(app);
    const unwanted = everything.filter(
      (rel) =>
        /(^|\/)\.DS_Store$/.test(rel) ||
        /(^|\/)[^/]+ \d+(\.[^/]*)?$/.test(rel) || // "name 2", "name 3.txt"
        /\.test\.mjs$/.test(rel) ||
        /(^|\/)__fixtures__(\/|$)/.test(rel),
    );
    facts.fileCount = everything.length;
    check(
      'no unexpected files',
      unwanted.length === 0,
      unwanted.slice(0, 5).join(', ') || `${everything.length} entries`,
    );
  } finally {
    const detached = await run('hdiutil', ['detach', mount]);
    if (detached.code !== 0) await run('hdiutil', ['detach', '-force', mount]);
    rmSync(tmp, { recursive: true, force: true });
  }

  return { ok: checks.every((c) => c.ok), checks, facts };
}

/** `@electron/asar`, from wherever the desktop or root install put it. */
function resolveAsar() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    path.join(here, '..', 'node_modules', '@electron', 'asar'),
    path.join(here, '..', '..', 'node_modules', '@electron', 'asar'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return '@electron/asar';
}

function parseArgs(argv) {
  const args = {
    dmg: null,
    expectVersion: null,
    expectBuild: null,
    expectCommit: null,
    expectArch: 'arm64',
    json: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version') args.expectVersion = argv[++i];
    else if (arg === '--build') args.expectBuild = argv[++i];
    else if (arg === '--commit') args.expectCommit = argv[++i];
    else if (arg === '--arch') args.expectArch = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (!args.dmg) args.dmg = arg;
  }
  return args;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv);
  if (!args.dmg) {
    console.error(
      'usage: node desktop/scripts/verify-dmg.mjs <path.dmg> [--version X.Y.Z] [--build N] [--commit SHA] [--arch arm64] [--json]',
    );
    process.exit(2);
  }
  if (!existsSync(args.dmg)) {
    console.error(`✗ input: DMG not found at ${args.dmg}`);
    process.exit(1);
  }
  verifyDmg(args.dmg, args)
    .then((result) => {
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        for (const { label, ok, detail } of result.checks) {
          console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
        }
        console.log('');
        console.log(result.ok ? `DMG verified: ${result.facts.dmg}` : 'DMG verification FAILED');
      }
      process.exit(result.ok ? 0 : 1);
    })
    .catch((error) => {
      console.error(`✗ ${error.message}`);
      process.exit(1);
    });
}
