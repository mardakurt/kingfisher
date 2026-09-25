#!/usr/bin/env node
/**
 * `npm run publish:data` — push a reference pack to the public
 * data mirror.
 *
 * The reference data and the landing page live in the same
 * repository (mardakurt/kingfisher-data). Phase 23's handover
 * uses one rsync for both, which is unsafe. This script is the
 * dedicated, narrow, safe data path:
 *
 *   - It only ever adds a *new* `reference-<id>-v<n>/` directory
 *     under the explicit pack id and version on the command line.
 *   - It REFUSES to remove, replace, or modify any existing
 *     `reference-*` directory under any circumstances. Older
 *     versions stay on the mirror forever; a build that targets
 *     v1 keeps working after v2 ships.
 *   - It only ever writes the `README.md` if the operator passes
 *     `--update-readme`.
 *
 * The deploy is one command:
 *
 *   npm run publish:data -- --id kingfisher-elite-otb --version 3 \
 *     --from .packs/kingfisher-elite-otb
 *
 * Add `--apply` to push to the remote; without it the script
 * only stages the change locally.
 *
 * Phase 85: `--channel <name>` also writes `channels/<name>.json`,
 * the one mutable file on the mirror — which version of a pack is
 * current, and where its manifest is. An installed Kingfisher reads
 * it to find a newer version than the one it has
 * (`src/reference/manager.ts`). It only ever moves forward, and only
 * ever names a directory this same publish added.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { channelFor, monthOf } from './reference/monthly.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAGE = process.env.KINGFISHER_DATA_STAGE || '/tmp/kingfisher-data-stage';
const REMOTE =
  process.env.KINGFISHER_DATA_REMOTE || 'https://github.com/mardakurt/kingfisher-data.git';
const APPLY = process.argv.includes('--apply');
const UPDATE_README = process.argv.includes('--update-readme');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
};

const packId = arg('id');
const version = arg('version');
const from = arg('from');
/**
 * Override the target directory name. The default strips the
 * `kingfisher-` prefix from the pack id; existing published
 * directories used a shorter form (e.g. `reference-recent-v1`
 * rather than `reference-recent-theory-v1`) and the override is
 * what keeps the new pack on the same path the catalog already
 * advertises.
 */
const dirOverride = arg('dir');
/** Phase 85: the channel file to advance to this version. */
const channel = arg('channel');
if (channel !== null && !/^[a-z][a-z0-9-]{0,63}$/.test(channel)) {
  console.error(`Invalid channel name: ${channel}`);
  process.exit(1);
}

if (!packId || !version || !from) {
  console.error(
    'Usage: publish:data --id <pack-id> --version <n> --from <local-dir> [--apply] [--update-readme]',
  );
  process.exit(1);
}

if (!/^[a-z][a-z0-9_-]{0,127}$/.test(packId)) {
  console.error(`Invalid pack id: ${packId}`);
  process.exit(1);
}
if (!/^\d+$/.test(version)) {
  console.error(`Version must be a non-negative integer: ${version}`);
  process.exit(1);
}
if (!existsSync(from)) {
  console.error(`Source directory does not exist: ${from}`);
  process.exit(1);
}

const targetName = dirOverride
  ? `reference-${dirOverride.replace(/^reference-/, '')}-v${version}`
  : `reference-${packId.replace(/^kingfisher-/, '')}-v${version}`;
const target = join(STAGE, targetName);

if (!existsSync(STAGE)) {
  console.error(`Stage directory ${STAGE} does not exist. Clone the data repo there first.`);
  process.exit(1);
}

// Sanity check: stage is kingfisher-data.
const cfg = readFileSync(join(STAGE, '.git', 'config'), 'utf8');
if (!cfg.includes('kingfisher-data')) {
  console.error(`Stage ${STAGE} does not look like the kingfisher-data repository. Aborting.`);
  process.exit(1);
}

// The pack must include a manifest.
const manifestSrc = join(from, 'manifest.json');
if (!existsSync(manifestSrc)) {
  console.error(`Source ${from} does not contain a manifest.json`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
if (manifest.id !== packId || String(manifest.version) !== String(version)) {
  console.error(
    `The pack says it is ${manifest.id} v${manifest.version}; this publish names ${packId} v${version}.`,
  );
  process.exit(1);
}

if (existsSync(target)) {
  console.error(`Target ${targetName} already exists. Reference pack versions are immutable;`);
  console.error(`either choose a new version number or remove the directory by hand if it`);
  console.error(`really is a corrupted publish.`);
  process.exit(1);
}

console.log(APPLY ? 'Applying data publish (real push):' : 'Dry-run data publish:');
console.log(`  + ${targetName}/`);

if (APPLY) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(from)) {
    cpSync(join(from, entry), join(target, entry), { recursive: true });
  }
}

let channelPath = null;
if (channel) {
  channelPath = join('channels', `${channel}.json`);
  const absolute = join(STAGE, channelPath);
  const previous = existsSync(absolute) ? JSON.parse(readFileSync(absolute, 'utf8')) : null;
  const next = channelFor({
    id: packId,
    version,
    directory: targetName,
    months: (manifest.provenance?.upstream ?? [])
      .map((entry) => monthOf(entry.file))
      .filter(Boolean),
    builtAt: manifest.builtAt,
    previous,
  });
  console.log(`  ~ ${channelPath} → v${version}${previous ? ` (from v${previous.version})` : ''}`);
  if (APPLY) {
    mkdirSync(join(STAGE, 'channels'), { recursive: true });
    writeFileSync(absolute, `${JSON.stringify(next, null, 2)}\n`);
  }
}

// Optionally refresh the README. NEVER overwrite the existing
// README without --update-readme.
if (UPDATE_README) {
  const readme = join(STAGE, 'README.md');
  if (!existsSync(readme)) {
    console.error('--update-readme passed but README.md is missing in stage.');
    process.exit(1);
  }
  console.log('  ~ README.md (update-readme)');
  if (APPLY) {
    // The README is hand-maintained; the operator is expected to
    // open it and add the new pack themselves. The script only
    // records that a refresh was requested.
  }
}

if (!APPLY) {
  console.log('\nNo changes were pushed. Pass --apply to push for real.');
  process.exit(0);
}

const add = spawnSync(
  'git',
  ['-C', STAGE, 'add', '--', targetName, ...(channelPath ? [channelPath] : [])],
  { stdio: 'inherit' },
);
if (add.status !== 0) {
  console.error('git add failed.');
  process.exit(1);
}

const message = `data: publish ${packId} v${version}`;
const commit = spawnSync('git', ['-C', STAGE, 'commit', '-m', message], { stdio: 'inherit' });
if (commit.status !== 0) {
  console.error('git commit failed.');
  process.exit(1);
}

const push = spawnSync('git', ['-C', STAGE, 'push', REMOTE], { stdio: 'inherit' });
if (push.status !== 0) {
  console.error('git push failed.');
  process.exit(1);
}
console.log(`\nData publish pushed: ${targetName}/`);
