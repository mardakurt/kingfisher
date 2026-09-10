#!/usr/bin/env node
/**
 * `npm run release:mac:sign` — sign a packaged Kingfisher build
 * with the Developer ID Application identity.
 *
 * electron-builder performs the signing as part of the
 * `desktop:dist` run when `CSC_LINK` and `CSC_KEY_PASSWORD` are
 * set, so this script is the manual fallback for builds that
 * need to be re-signed after the fact (e.g., the certificate was
 * rotated, or the .app was built before the credentials were
 * installed).
 *
 * What this script does:
 *   1. Resolves the `Developer ID Application` identity in the
 *      login keychain.
 *   2. Re-signs the bundle with a secure timestamp.
 *   3. Verifies the result via `desktop:sign:verify`.
 *
 * The script is deliberately narrow. It does not submit to
 * Apple's notary service; that is a separate step
 * (`npm run release:mac:notarize`).
 *
 * Usage:
 *   node scripts/desktop-mac-sign.mjs [<path-to-Kingfisher.app>]
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { exit } from 'node:process';

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2]
  ? resolve(process.argv[2])
  : join(HERE, 'desktop', 'dist', 'mac-arm64', 'Kingfisher.app');

if (!existsSync(target)) {
  console.error(`No Kingfisher at ${target}.`);
  exit(1);
}

const ids = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
const developerId = ids
  .split('\n')
  .map((line) => line.trim())
  .find((line) => line.includes('"Developer ID Application:'));
if (!developerId) {
  console.error('No Developer ID Application identity found. Install the certificate first.');
  console.error('See docs/release/apple-developer-id-setup.md.');
  exit(1);
}
const identity = developerId.match(/"([^"]+)"/)[1];
console.log(`Signing with: ${identity}`);

const signResult = spawnSync(
  'codesign',
  ['--force', '--deep', '--options', 'runtime', '--timestamp', '--sign', identity, target],
  { encoding: 'utf8', stdio: 'inherit' },
);
if (signResult.status !== 0) {
  console.error('codesign failed.');
  exit(1);
}
console.log('Signature applied. Verifying…');
const verify = spawnSync('node', ['scripts/desktop-sign-verify.mjs', target], {
  cwd: HERE,
  encoding: 'utf8',
  stdio: 'inherit',
});
process.exit(verify.status ?? 1);
