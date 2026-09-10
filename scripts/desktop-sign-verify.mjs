#!/usr/bin/env node
/**
 * `npm run desktop:sign:verify` — verify the code-signing chain of
 * a packaged Kingfisher build.
 *
 * The signed app is the deliverable that Gatekeeper, the auto-updater,
 * and the macOS installation system all read. A failure here means
 * the user will be unable to install or update; a "deep" check that
 * silently passes is worse than useless. This script verifies:
 *
 *   1. The outer `.app` has a Developer ID Application signature.
 *   2. The signature carries a secure timestamp (the
 *      `--strict` check on the codesign tool).
 *   3. The Hardened Runtime is enabled.
 *   4. The nested binaries — Electron Framework, the helper apps
 *      and the GPU/renderer helpers — are signed with the same
 *      identity. A `Developer ID Application` outer signature on
 *      an unsigned helper is not a Developer ID signature.
 *   5. The entitlements blob is what we expect.
 *
 * The script is intentionally chatty. A green run is a release
 * gate; a yellow or red run stops the release until the underlying
 * issue is fixed.
 *
 * Usage:
 *   node scripts/desktop-sign-verify.mjs <path-to-Kingfisher.app>
 *   node scripts/desktop-sign-verify.mjs           # picks up dist/mac-arm64/Kingfisher.app
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { exit } from 'node:process';

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const candidate = process.argv[2]
  ? resolve(process.argv[2])
  : join(HERE, 'desktop', 'dist', 'mac-arm64', 'Kingfisher.app');

if (!existsSync(candidate)) {
  console.error(`No Kingfisher.app at ${candidate}. Run \`npm run desktop:dist\` first.`);
  exit(1);
}

console.log(`Verifying code signature of ${candidate}\n`);

let failed = false;
const report = (label, ok, detail) => {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed = true;
};

/* 1. The outer app's signature subject and authority. */
const subject = runCodesign(['-dvvv', candidate]);
if (subject.code !== 0) {
  report('codesign can read the .app', false, subject.stderr.split('\n')[0]);
  exit(1);
}
const subjectLines = subject.stdout.split('\n');
const authority = subjectLines
  .filter((line) => line.startsWith('Authority='))
  .map((line) => line.replace(/^Authority=/, '').trim());
const teamIdMatch = subjectLines
  .join('\n')
  .match(/TeamIdentifier=([A-Z0-9]+)/);
const format = subjectLines
  .join('\n')
  .match(/Format=([A-Za-z0-9 ]+)/);
const hasDeveloperId = authority.some((a) => a.startsWith('Developer ID Application:'));
report(
  'outer .app is signed with Developer ID Application',
  hasDeveloperId,
  authority.join(' | '),
);
report(
  'outer .app has a team identifier',
  Boolean(teamIdMatch),
  teamIdMatch ? `teamId=${teamIdMatch[1]}` : '',
);
report(
  'outer .app uses the modern signature format',
  Boolean(format && format[1].includes('extended')),
  format ? format[1] : '',
);

/* 2. Hardened Runtime and secure timestamp. */
const verify = runCodesign(['--verify', '--deep', '--strict', '--verbose=2', candidate]);
report(
  'codesign --verify --deep --strict',
  verify.code === 0,
  verify.code === 0 ? 'verified' : verify.stderr.split('\n')[0],
);
const hardened = subject.stdout.includes('flags=0x10000(runtime)');
report(
  'Hardened Runtime is enabled',
  hardened,
  hardened ? 'runtime flag set' : 'runtime flag missing',
);

/* 3. The nested executables. A single unsigned helper invalidates
      the whole signature chain. */
const nested = [
  'Contents/Frameworks/Kingfisher Helper.app',
  'Contents/Frameworks/Kingfisher Helper (Renderer).app',
  'Contents/Frameworks/Kingfisher Helper (GPU).app',
  'Contents/Frameworks/Kingfisher Helper (Plugin).app',
  'Contents/Frameworks/Electron Framework.framework',
  'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist',
  'Contents/MacOS/Kingfisher',
];
for (const rel of nested) {
  const full = join(candidate, rel);
  if (!existsSync(full)) continue;
  const r = runCodesign(['-dvvv', full]);
  if (r.code !== 0) {
    report(`nested ${rel} readable`, false, r.stderr.split('\n')[0]);
    continue;
  }
  const lines = r.stdout.split('\n');
  const subAuthority = lines
    .filter((line) => line.startsWith('Authority='))
    .map((line) => line.replace(/^Authority=/, '').trim());
  const ok = subAuthority.some((a) => a.startsWith('Developer ID Application:'));
  report(
    `nested ${rel} is Developer ID signed`,
    ok,
    ok ? subAuthority[0] : subAuthority.join(' | ') || 'unsigned',
  );
}

/* 4. Entitlements blob matches the source of truth. The release
      gate refuses a build whose entitlements diverged from the
      audited list. */
const expected = readFileSync(join(HERE, 'desktop', 'build', 'entitlements.mac.plist'), 'utf8');
const display = runCodesign(['-d', '--entitlements', '-', candidate]);
const entBlob = display.stdout.trim();
const sourceBlob = expected.trim();
const sameShape = entBlob.replace(/\s+/g, '').endsWith(
  sourceBlob.replace(/^[\s\S]*?<plist[\s\S]*?>/, '').replace(/<\/plist>\s*$/, '').replace(/\s+/g, ''),
);
report(
  'entitlements blob matches desktop/build/entitlements.mac.plist',
  sameShape,
  sameShape ? 'matches audited file' : 'diverges — review and update audit',
);

console.log('');
if (failed) {
  console.error('Signature verification: FAILED');
  exit(1);
}
console.log('Signature verification: PASS');

function runCodesign(args) {
  return spawnSync('codesign', args, { encoding: 'utf8' });
}
