#!/usr/bin/env node
/**
 * Fetch the Sparkle release Kingfisher embeds, and nothing else.
 *
 * `desktop/sparkle.json` names one archive and its SHA-256. This downloads
 * it (or reuses a cached copy), refuses any bytes that do not hash to the
 * record, and unpacks it to `desktop/vendor/Sparkle/`:
 *
 *   Sparkle.framework/   what the bundle ships under Contents/Frameworks
 *   bin/                 generate_appcast, sign_update, generate_keys —
 *                        the release tools, used by scripts/desktop-mac-appcast.mjs
 *
 * The framework's XPC services are removed. They exist for sandboxed
 * applications, and Kingfisher is not one (its entitlements are the five in
 * `desktop/build/entitlements.mac.plist`); Sparkle's own documentation says
 * to strip them in that case, and a service that is not there cannot be
 * signed wrongly or notarised with the wrong entitlements.
 *
 * Idempotent: a vendor directory whose `.version` matches the record is
 * left alone. `--force` refetches.
 *
 *   node desktop/scripts/fetch-sparkle.mjs [--force]
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, '..');
export const RECORD = JSON.parse(readFileSync(path.join(DESKTOP, 'sparkle.json'), 'utf8'));
export const VENDOR = path.join(DESKTOP, 'vendor', 'Sparkle');
export const FRAMEWORK = path.join(VENDOR, 'Sparkle.framework');
export const TOOLS = path.join(VENDOR, 'bin');

/** The archive cache, beside the other reproducible downloads. */
const CACHE = path.join(DESKTOP, '..', '.archive-cache', 'sparkle');

function lstatSafe(file) {
  try {
    return lstatSync(file);
  } catch {
    return null;
  }
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** True when the vendored copy is the recorded release, with the pieces the build needs. */
export function isVendored() {
  try {
    const version = readFileSync(path.join(VENDOR, '.version'), 'utf8').trim();
    return (
      version === RECORD.version &&
      existsSync(path.join(FRAMEWORK, 'Versions', 'B', 'Sparkle')) &&
      existsSync(path.join(FRAMEWORK, 'Versions', 'B', 'Autoupdate')) &&
      existsSync(path.join(FRAMEWORK, 'Versions', 'B', 'Updater.app')) &&
      !existsSync(path.join(FRAMEWORK, 'Versions', 'B', 'XPCServices')) &&
      !lstatSafe(path.join(FRAMEWORK, 'XPCServices')) &&
      existsSync(path.join(TOOLS, 'generate_appcast')) &&
      existsSync(path.join(TOOLS, 'sign_update'))
    );
  } catch {
    return false;
  }
}

async function download(url, to) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(path.dirname(to), { recursive: true });
  writeFileSync(to, bytes);
}

export async function fetchSparkle({ force = false, log = console.log } = {}) {
  if (!force && isVendored()) {
    log(`Sparkle ${RECORD.version} is vendored at ${VENDOR}`);
    return VENDOR;
  }
  const archive = path.join(CACHE, path.basename(new URL(RECORD.url).pathname));
  if (!existsSync(archive) || sha256(archive) !== RECORD.sha256) {
    log(`downloading ${RECORD.url}`);
    await download(RECORD.url, archive);
  }
  const digest = sha256(archive);
  if (digest !== RECORD.sha256) {
    rmSync(archive, { force: true });
    throw new Error(
      `Sparkle archive digest mismatch:\n  expected ${RECORD.sha256}\n  got      ${digest}\n` +
        'The download is discarded. If Sparkle was deliberately upgraded, change desktop/sparkle.json first.',
    );
  }
  log(`verified ${path.basename(archive)} · sha256 ${digest}`);

  const staging = path.join(tmpdir(), `kingfisher-sparkle-${process.pid}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  execFileSync('tar', ['-xJf', archive, '-C', staging]);
  const framework = path.join(staging, 'Sparkle.framework');
  const tools = path.join(staging, 'bin');
  for (const required of [
    path.join(framework, 'Versions', 'B', 'Sparkle'),
    path.join(framework, 'Versions', 'B', 'Autoupdate'),
    path.join(framework, 'Versions', 'B', 'Updater.app', 'Contents', 'MacOS', 'Updater'),
    path.join(tools, 'generate_appcast'),
    path.join(tools, 'sign_update'),
    path.join(tools, 'generate_keys'),
  ]) {
    if (!existsSync(required)) throw new Error(`The Sparkle archive lacks ${required}`);
  }
  // Not sandboxed: the XPC services are not used, and are not shipped.
  rmSync(path.join(framework, 'Versions', 'B', 'XPCServices'), { recursive: true, force: true });
  // …and the top-level symlink that would otherwise dangle at it.
  rmSync(path.join(framework, 'XPCServices'), { force: true });
  // The framework's own Info.plist must agree with the record.
  const plist = execFileSync('plutil', [
    '-extract',
    'CFBundleShortVersionString',
    'raw',
    path.join(framework, 'Versions', 'B', 'Resources', 'Info.plist'),
  ])
    .toString()
    .trim();
  if (plist !== RECORD.version) {
    throw new Error(
      `The archive is Sparkle ${plist}; desktop/sparkle.json records ${RECORD.version}.`,
    );
  }

  rmSync(VENDOR, { recursive: true, force: true });
  mkdirSync(path.dirname(VENDOR), { recursive: true });
  mkdirSync(VENDOR, { recursive: true });
  // A copy, not a rename: the staging directory may be on another volume, and
  // the framework's symlinks (Versions/Current, the top-level names) must
  // arrive as symlinks — `verbatimSymlinks` is what keeps them so.
  const move = (from, to) => cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  move(framework, FRAMEWORK);
  move(tools, TOOLS);
  for (const name of ['LICENSE', 'CHANGELOG']) {
    if (existsSync(path.join(staging, name)))
      move(path.join(staging, name), path.join(VENDOR, name));
  }
  writeFileSync(path.join(VENDOR, '.version'), `${RECORD.version}\n`);
  rmSync(staging, { recursive: true, force: true });
  log(`Sparkle ${RECORD.version} vendored at ${VENDOR} (${readdirSync(VENDOR).join(', ')})`);
  return VENDOR;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fetchSparkle({ force: process.argv.includes('--force') }).catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
}
