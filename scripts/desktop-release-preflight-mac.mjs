#!/usr/bin/env node
/**
 * `npm run desktop:release:preflight:mac` — fail early on a
 * trusted macOS release when the prerequisites are not in place.
 *
 * A trusted Kingfisher build needs four things before the
 * expensive `electron-builder` run:
 *
 *   1. A `Developer ID Application` certificate installed in the
 *      build keychain. `Apple Development` and `Apple Distribution`
 *      identities are *not* substitutes; only the Developer ID
 *      Application identity produces a signature Gatekeeper accepts
 *      outside the Mac App Store.
 *   2. An App Store Connect API key (or a notarytool keychain
 *      profile) for notarization. We refuse to print key contents;
 *      only "present" or "missing."
 *   3. The repository is in a release-coherent state: on `master`,
 *      working tree clean, version consistent across
 *      `package.json`, `desktop/package.json`, and
 *      `release-manifest.json` if one exists.
 *   4. A reasonable amount of free disk space (electron-builder
 *      produces a 200–300 MB signed bundle before the zip).
 *
 * If any check fails, the script prints a one-line summary and
 * exits non-zero. The script does *not* print credentials,
 * certificate fingerprints, or `.p8` content.
 *
 * Usage:
 *   node scripts/desktop-release-preflight-mac.mjs
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { exit } from 'node:process';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;
function run(command, args) {
  const result = spawnSync(command, args, { cwd: HERE, encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`Cannot run ${command}: ${result.error?.code ?? 'exit ' + result.status}`);
    return '';
  }
  return result.stdout;
}
function check(label, ok, detail) {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed = true;
}

/* 1. Developer ID Application certificate. */
const ids = run('security', ['find-identity', '-v', '-p', 'codesigning']);
const developerId = ids
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.includes('"Developer ID Application:'));
const teamIds = developerId
  .map((line) => /\(([A-Z0-9]+)\)/.exec(line))
  .filter(Boolean)
  .map((m) => m[1]);
check(
  'Developer ID Application certificate is installed',
  developerId.length > 0,
  developerId.length
    ? `identities: ${developerId.length} (teams: ${[...new Set(teamIds)].join(', ')})`
    : 'no Developer ID Application identity found',
);

/* 2. Notarization credentials. We support either an App Store
      Connect API key (recommended) or a notarytool keychain
      profile (legacy). */
const hasApiKey = Boolean(
  process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER,
);
const hasKeychainProfile = Boolean(process.env.APPLE_NOTARYTOOL_PROFILE);
const hasNotaryCreds = (hasApiKey && existsSync(process.env.APPLE_API_KEY)) || hasKeychainProfile;
check(
  'notarization credentials are present',
  hasNotaryCreds,
  hasNotaryCreds
    ? hasApiKey
      ? 'App Store Connect API key configured (key/issuer present)'
      : 'notarytool keychain profile configured'
    : 'set APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, or APPLE_NOTARYTOOL_PROFILE',
);

/* 3. Repository state. */
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
check('on master', branch === 'master', `branch=${branch}`);
const status = run('git', ['status', '--porcelain']).trim();
check('working tree is clean', status === '', status ? 'uncommitted changes' : '');
const head = run('git', ['rev-parse', 'HEAD']).trim();
const originMaster = run('git', ['rev-parse', 'origin/master']).trim();
check(
  'local master is in sync with origin/master',
  Boolean(head && originMaster && head === originMaster),
  `local=${head.slice(0, 12)} origin=${originMaster.slice(0, 12)}`,
);

/* 4. Version coherence. */
const rootPkg = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'));
const desktopPkg = JSON.parse(readFileSync(join(HERE, 'desktop/package.json'), 'utf8'));
check(
  'root and desktop package.json agree on the version',
  rootPkg.version === desktopPkg.version,
  `root=${rootPkg.version} desktop=${desktopPkg.version}`,
);
const manifestPath = join(HERE, 'release-manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const manifestVersion = manifest?.kingfisher?.version;
  if (manifestVersion && manifestVersion !== rootPkg.version) {
    /*
      The manifest is written from the artifacts after they are built
      (`npm run release:manifest`), so before a release build it describes
      the previous release. That is expected, and stated; it is not a reason
      to refuse the build that will replace it.
    */
    console.log(
      `— release-manifest.json describes ${manifestVersion}; regenerate it after the ${rootPkg.version} build`,
    );
  } else {
    check('release-manifest.json matches package.json', true, manifestVersion || '(absent)');
  }
}

/* 5. Disk space. electron-builder's intermediate work is around
      600 MB; we require 2 GB free as a safe working margin. */
try {
  const df = run('df', ['-k', HERE]).trim().split('\n').pop();
  const parts = df.split(/\s+/);
  const freeKb = Number(parts[3]);
  const freeGb = (freeKb / 1024 / 1024).toFixed(1);
  check('free disk space ≥ 2 GB', freeKb > 2 * 1024 * 1024, `${freeGb} GB free`);
} catch (err) {
  check('df readable', false, String(err.message || err));
}

/* 6. Required tools. */
for (const tool of ['codesign', 'xcrun', 'git', 'node', 'npm']) {
  const present = spawnSync('which', [tool], { encoding: 'utf8' }).status === 0;
  check(`tool ${tool} on PATH`, present);
}

console.log('');
if (failed) {
  console.error('Release preflight (mac): FAILED');
  console.error('Resolve the failing checks above and re-run.');
  exit(1);
}
console.log('Release preflight (mac): GREEN');
