#!/usr/bin/env node
/**
 * `npm run desktop:trust:verify` — combined trust gate.
 *
 * One command a maintainer runs against a packaged build before
 * tagging a release. The command wraps the four checks a
 * notarized 1.1.0 deliverable must pass:
 *
 *   1. Code signature is Developer ID Application, with secure
 *      timestamp and Hardened Runtime.
 *   2. Notarization ticket is stapled and validates offline.
 *   3. Gatekeeper (`spctl --assess`) accepts the deliverable.
 *   4. The DMG, if present, is signed, notarized, and stapled.
 *
 * This is the last gate the release pipeline runs before
 * publishing. A red verdict here means the release is *not*
 * trusted and the publish step is blocked.
 *
 * Usage:
 *   node scripts/desktop-trust-verify.mjs
 *   node scripts/desktop-trust-verify.mjs <path-to-Kingfisher.app>
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
  console.error(`No Kingfisher at ${target}. Run \`npm run desktop:dist\` first.`);
  exit(1);
}

console.log(`Trust gate: ${target}\n`);

let failed = false;
function step(label, ok, detail) {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed = true;
}

/* 1. Code signature. */
const signVerify = spawnSync('node', ['scripts/desktop-sign-verify.mjs', target], {
  cwd: HERE,
  encoding: 'utf8',
  env: process.env,
});
const signOk = signVerify.code === 0;
step(
  'code signature is Developer ID Application with Hardened Runtime',
  signOk,
  signOk ? 'sign:verify passed' : 'sign:verify failed — see output above',
);
if (signVerify.stdout) process.stdout.write(signVerify.stdout);
if (signVerify.stderr) process.stderr.write(signVerify.stderr);

/* 2. Notarization + Gatekeeper. */
const notaryVerify = spawnSync('node', ['scripts/desktop-notary-verify.mjs', target], {
  cwd: HERE,
  encoding: 'utf8',
  env: process.env,
});
const notaryOk = notaryVerify.code === 0;
step('notarization is accepted and ticket is stapled', notaryOk, notaryOk ? 'notary:verify passed' : 'notary:verify failed');
if (notaryVerify.stdout) process.stdout.write(notaryVerify.stdout);
if (notaryVerify.stderr) process.stderr.write(notaryVerify.stderr);

/* 3. DMG, if any, is itself notarized. */
const distDir = join(HERE, 'desktop', 'dist');
let dmg;
try {
  dmg = readdirSync(distDir).find((name) => name.endsWith('.dmg'));
} catch {
  dmg = null;
}
if (dmg) {
  const dmgPath = join(distDir, dmg);
  const dmgNotary = spawnSync('node', ['scripts/desktop-notary-verify.mjs', dmgPath], {
    cwd: HERE,
    encoding: 'utf8',
    env: process.env,
  });
  const dmgOk = dmgNotary.code === 0;
  step(`DMG ${basename(dmgPath)} is notarized`, dmgOk, dmgOk ? 'notarized' : 'failed');
  if (dmgNotary.stdout) process.stdout.write(dmgNotary.stdout);
  if (dmgNotary.stderr) process.stderr.write(dmgNotary.stderr);
  if (!dmgOk) failed = true;
} else {
  console.log('— No DMG found in desktop/dist; skipping DMG notarization check.');
}

console.log('');
if (failed) {
  console.error('Trust gate: NOT GREEN');
  exit(1);
}
console.log('Trust gate: GREEN');
