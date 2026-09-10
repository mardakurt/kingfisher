#!/usr/bin/env node
/**
 * Verify a Kingfisher DMG against the Phase 35 contract.
 *
 * The script mounts a DMG, walks the mounted volume, and checks:
 *
 *   - the volume name is `Kingfisher`,
 *   - the volume carries a `.VolumeIcon.icns`,
 *   - the only visible root item is `Kingfisher.app`,
 *   - the `Applications` symlink resolves to `/Applications`,
 *   - the embedded `Info.plist` matches the expected bundle id and
 *     version (when supplied), and the architecture is `arm64`.
 *
 * It is runnable against any local DMG:
 *
 *   node desktop/scripts/verify-dmg.mjs path/to/Kingfisher-1.1.0-arm64.dmg
 *
 * `hdiutil verify` is run before the structural checks so a corrupt
 * image never gets the green light.
 *
 * The script never deletes the source DMG. Cleanup is the caller's
 * job: a CI run mounts a copy, a developer's interactive run mounts
 * the original. Both should leave the system in the same shape.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { exec as execCb } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';

const exec = promisify(execCb);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const EXPECTED_BUNDLE = 'app.kingfisher.chess';
const EXPECTED_VOLUME = 'Kingfisher';

function parseArgs(argv) {
  const args = { dmg: null, expectVersion: null, expectArch: 'arm64' };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version') args.expectVersion = argv[++i];
    else if (arg === '--arch') args.expectArch = argv[++i];
    else if (!args.dmg) args.dmg = arg;
  }
  return args;
}

function die(label, message) {
  console.error(`✗ ${label}: ${message}`);
  process.exit(1);
}

function ok(label, message = '') {
  console.log(`✓ ${label}${message ? ` — ${message}` : ''}`);
}

async function runCapture(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function hdiutilVerify(dmg) {
  const { code, stderr } = await runCapture('hdiutil', ['verify', '-quiet', dmg]);
  if (code !== 0) {
    die('hdiutil verify', stderr.trim() || `exit ${code}`);
  }
  ok('hdiutil verify', 'image is structurally sound');
}

async function hdiutilAttach(dmg) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kingfisher-dmg-verify-'));
  const { code, stdout, stderr } = await runCapture('hdiutil', [
    'attach',
    '-nobrowse',
    '-readonly',
    '-noverify',
    '-mountrandom',
    tmp,
    dmg,
  ]);
  if (code !== 0) {
    rmSync(tmp, { recursive: true, force: true });
    die('hdiutil attach', stderr.trim() || `exit ${code}`);
  }
  // The last line of stdout is the mount point, e.g. `/Volumes/Kingfisher`.
  const mount = stdout.trim().split('\n').pop().split('\t').pop().trim();
  return { mount, tmp };
}

async function hdiutilDetach(mount) {
  const { code, stderr } = await runCapture('hdiutil', ['detach', mount]);
  if (code !== 0) {
    die('hdiutil detach', stderr.trim() || `exit ${code}`);
  }
}

async function listVisible(mount) {
  // `ls -A` skips the dotfiles Finder would hide; we *do* still
  // want to confirm `.VolumeIcon.icns` is present, so the
  // visibility check is two passes.
  const { stdout: visible } = await exec(`ls -1 "${mount}"`);
  return visible.split('\n').filter(Boolean);
}

async function readVolumeName(mount) {
  // The Finder- and shell-visible name is the basename of the mount.
  return path.basename(mount);
}

async function resolveSymlink(mount, name) {
  const { stdout, code } = await exec(`readlink "${path.join(mount, name)}"`);
  if (code !== 0) return null;
  return stdout.trim();
}

async function readInfoPlist(mount) {
  // Use the system `defaults` reader rather than bundling a parser.
  // The plist is well-formed when the toolchain produced it; if it
  // isn't, the verifier fails before this point on the .app layout.
  const plist = path.join(mount, 'Kingfisher.app', 'Contents', 'Info.plist');
  if (!existsSync(plist)) return null;
  const fields = [
    'CFBundleIdentifier',
    'CFBundleShortVersionString',
    'CFBundleVersion',
    'CFBundleExecutable',
    'CFBundleName',
    'LSMinimumSystemVersion',
  ];
  const result = {};
  for (const field of fields) {
    try {
      const { stdout } = await exec(`defaults read "${path}" "${field}"`);
      result[field] = stdout.trim();
    } catch {
      result[field] = null;
    }
  }
  return result;
}

async function readArchitecture(mount) {
  // The .app's `MacOS/<exe>` Mach-O is the source of truth for the
  // architecture. A `lipo -archs` on the file answers in one call.
  const exe = path.join(mount, 'Kingfisher.app', 'Contents', 'MacOS', 'Kingfisher');
  if (!existsSync(exe)) return null;
  try {
    const { stdout } = await exec(`lipo -archs "${exe}"`);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.dmg) {
    console.error(
      'usage: node desktop/scripts/verify-dmg.mjs <path-to.dmg> [--version X.Y.Z] [--arch arm64|x64]',
    );
    process.exit(2);
  }
  if (!existsSync(args.dmg)) {
    die('input', `DMG not found at ${args.dmg}`);
  }
  const absolute = path.resolve(args.dmg);
  ok('input', `${absolute}`);

  await hdiutilVerify(absolute);
  const { mount, tmp } = await hdiutilAttach(absolute);
  try {
    // 1. Volume name.
    const name = await readVolumeName(mount);
    if (name !== EXPECTED_VOLUME) {
      die('volume name', `expected "${EXPECTED_VOLUME}", got "${name}"`);
    }
    ok('volume name', `"${name}"`);

    // 2. Volume icon present.
    const icns = path.join(mount, '.VolumeIcon.icns');
    if (!existsSync(icns)) {
      die('volume icon', `no .VolumeIcon.icns at the mounted root (${icns})`);
    }
    ok('volume icon', 'present at root');

    // 3. Visible root items.
    const visible = await listVisible(mount);
    const expected = ['Kingfisher.app', 'Applications'];
    const unexpected = visible.filter((name) => !expected.includes(name));
    if (unexpected.length) {
      die('root layout', `unexpected visible items: ${unexpected.join(', ')}`);
    }
    if (!visible.includes('Kingfisher.app')) {
      die('root layout', 'Kingfisher.app is missing');
    }
    if (!visible.includes('Applications')) {
      die('root layout', 'Applications link is missing');
    }
    ok('root layout', 'Kingfisher.app + Applications only');

    // 4. Applications symlink.
    const link = await resolveSymlink(mount, 'Applications');
    if (link !== '/Applications') {
      die('Applications link', `expected /Applications, got ${link}`);
    }
    ok('Applications link', '/Applications');

    // 5. Info.plist contents.
    const plist = await readInfoPlist(mount);
    if (!plist) {
      die('Info.plist', 'not found inside Kingfisher.app');
    }
    if (plist.CFBundleIdentifier !== EXPECTED_BUNDLE) {
      die('bundle id', `expected ${EXPECTED_BUNDLE}, got ${plist.CFBundleIdentifier}`);
    }
    ok('bundle id', plist.CFBundleIdentifier);
    if (args.expectVersion && plist.CFBundleShortVersionString !== args.expectVersion) {
      die(
        'short version',
        `expected ${args.expectVersion}, got ${plist.CFBundleShortVersionString}`,
      );
    }
    if (plist.CFBundleShortVersionString) {
      ok('short version', plist.CFBundleShortVersionString);
    }
    if (plist.CFBundleName && plist.CFBundleName !== 'Kingfisher') {
      die('bundle name', `expected Kingfisher, got ${plist.CFBundleName}`);
    }
    if (plist.CFBundleName) {
      ok('bundle name', plist.CFBundleName);
    }

    // 6. Architecture.
    const arch = await readArchitecture(mount);
    if (!arch) {
      die('architecture', 'could not read Mach-O archs');
    }
    if (args.expectArch && !arch.split(' ').includes(args.expectArch)) {
      die('architecture', `expected ${args.expectArch}, got ${arch}`);
    }
    ok('architecture', arch);

    console.log('');
    console.log(`DMG verified: ${absolute}`);
  } finally {
    await hdiutilDetach(mount);
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
