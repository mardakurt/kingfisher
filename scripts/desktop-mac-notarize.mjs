#!/usr/bin/env node
/**
 * `npm run release:mac:notarize` — submit a packaged Kingfisher
 * build to Apple's notary service and staple the ticket.
 *
 * The submission uses one of two paths, decided by which
 * credentials are set:
 *
 *   - **App Store Connect API key** (preferred):
 *       APPLE_API_KEY=path/to/AuthKey_XXXXXXXXXX.p8
 *       APPLE_API_KEY_ID=XXXXXXXXXX
 *       APPLE_API_ISSUER=uuid-…
 *     This is the most CI-friendly path because there is no
 *     password or 2FA prompt. The key file must be present on
 *     the build host.
 *
 *   - **notarytool keychain profile** (legacy):
 *       APPLE_NOTARYTOOL_PROFILE=kingfisher
 *     Set up once with `xcrun notarytool store-credentials`.
 *
 * On success the ticket is stapled to the .app (and to the .dmg
 * if one is present in `desktop/dist`).
 *
 * Usage:
 *   node scripts/desktop-mac-notarize.mjs [<path-to-Kingfisher.app>]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { exit } from 'node:process';

import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2]
  ? resolve(process.argv[2])
  : join(HERE, 'desktop', 'dist', 'mac-arm64', 'Kingfisher.app');

if (!existsSync(target)) {
  console.error(`No Kingfisher at ${target}.`);
  exit(1);
}

const hasApiKey = Boolean(
  process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER,
);
const hasKeychainProfile = Boolean(process.env.APPLE_NOTARYTOOL_PROFILE);
if (!hasApiKey && !hasKeychainProfile) {
  console.error('No notarization credentials set.');
  console.error('Set APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, or APPLE_NOTARYTOOL_PROFILE.');
  exit(1);
}

const notaryArgs = [
  'notarytool',
  'submit',
  target,
  '--wait',
  '--output-format',
  'json',
];
if (hasApiKey) {
  notaryArgs.push(
    '--key',
    process.env.APPLE_API_KEY,
    '--key-id',
    process.env.APPLE_API_KEY_ID,
    '--issuer',
    process.env.APPLE_API_ISSUER,
  );
} else {
  notaryArgs.push('--keychain-profile', process.env.APPLE_NOTARYTOOL_PROFILE);
}

console.log(`Submitting ${target} to Apple notary service…`);
const submit = spawnSync('xcrun', notaryArgs, { encoding: 'utf8' });
if (submit.status !== 0) {
  console.error('Submission failed.');
  console.error(submit.stderr || submit.stdout);
  exit(1);
}
const result = JSON.parse(submit.stdout || '{}');
const id = result.id;
const status = result.status;
console.log(`Submission ${id}: ${status}`);
if (status !== 'Accepted') {
  console.error('Notarization was not accepted.');
  const logArgs = ['notarytool', 'log', id];
  if (hasApiKey) {
    logArgs.push(
      '--key',
      process.env.APPLE_API_KEY,
      '--key-id',
      process.env.APPLE_API_KEY_ID,
      '--issuer',
      process.env.APPLE_API_ISSUER,
    );
  } else {
    logArgs.push('--keychain-profile', process.env.APPLE_NOTARYTOOL_PROFILE);
  }
  const log = spawnSync('xcrun', logArgs, { encoding: 'utf8' });
  console.error(log.stdout);
  exit(1);
}

/* Staple the ticket. */
console.log('Stapling ticket…');
const staple = spawnSync('xcrun', ['stapler', 'staple', target], { encoding: 'utf8' });
if (staple.status !== 0) {
  console.error('Stapling failed.');
  console.error(staple.stderr);
  exit(1);
}
console.log('Stapled.');

/* If a DMG is present, notarize it as well. */
const distDir = join(HERE, 'desktop', 'dist');
let dmg;
try {
  dmg = readdirSync(distDir).find((name) => name.endsWith('.dmg'));
} catch {
  dmg = null;
}
if (dmg) {
  const dmgPath = join(distDir, dmg);
  console.log(`Notarizing DMG ${basename(dmgPath)}…`);
  const dmgArgs = ['notarytool', 'submit', dmgPath, '--wait', '--output-format', 'json'];
  if (hasApiKey) {
    dmgArgs.push(
      '--key',
      process.env.APPLE_API_KEY,
      '--key-id',
      process.env.APPLE_API_KEY_ID,
      '--issuer',
      process.env.APPLE_API_ISSUER,
    );
  } else {
    dmgArgs.push('--keychain-profile', process.env.APPLE_NOTARYTOOL_PROFILE);
  }
  const dmgSubmit = spawnSync('xcrun', dmgArgs, { encoding: 'utf8' });
  if (dmgSubmit.status !== 0) {
    console.error('DMG submission failed.');
    exit(1);
  }
  const dmgStaple = spawnSync('xcrun', ['stapler', 'staple', dmgPath], { encoding: 'utf8' });
  if (dmgStaple.status !== 0) {
    console.error('DMG stapling failed.');
    exit(1);
  }
  console.log('DMG notarized and stapled.');
}

/* Verify the result. */
console.log('Verifying…');
const verify = spawnSync('node', ['scripts/desktop-notary-verify.mjs', target], {
  cwd: HERE,
  encoding: 'utf8',
  stdio: 'inherit',
});
process.exit(verify.status ?? 1);
