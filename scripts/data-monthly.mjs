#!/usr/bin/env node
/**
 * The monthly data cycle (Phase 85).
 *
 *   node scripts/data-monthly.mjs              # what is live, what is published upstream, and the plan
 *   node scripts/data-monthly.mjs --build      # and build the candidate when the plan says so
 *   node scripts/data-monthly.mjs --publish    # and publish it as the next version, and advance the channel
 *   node scripts/data-monthly.mjs --publish --force-version 3   # build and publish now, whatever the plan
 *
 * The live version is read from the channel on the data mirror
 * (`channels/recent-theory-6m.json`); before the first monthly publish it is
 * the v2 manifest the catalog has always named. The plan is
 * `scripts/reference/monthly.mjs`: a rebuild happens when the publisher lists
 * a month newer than the live pack's newest, over the newest six published.
 *
 * `--publish` goes through `scripts/publish-data.mjs`, which adds a new
 * version directory and never touches an old one, and writes the channel.
 * `.github/workflows/data-monthly.yml` runs this with `--publish` once a
 * month; the owner chose that in Phase 85.
 *
 * Exit codes: 0 done (or nothing to do), 2 a rebuild is due and was not
 * asked for, 1 a failure.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { cachePaths } from './cache-paths.mjs';
import { planMonthly } from './reference/monthly.mjs';
import { LICHESS_BROADCAST, fetchChecksums } from './reference/sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIRROR = (
  process.env.KINGFISHER_PUBLIC_DATA_ROOT_URL ?? 'https://mardakurt.github.io/kingfisher-data'
).replace(/\/$/, '');
const CHANNEL = 'recent-theory-6m';
const PACK_ID = 'kingfisher-recent-theory-narrow';
const FALLBACK_MANIFEST = `${MIRROR}/reference-recent-v2/manifest.json`;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : null;
};

async function json(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: ROOT });
  if (result.status !== 0) throw new Error(`${command} ${args[0]} exited ${result.status}`);
}

async function main() {
  const channel = await json(`${MIRROR}/channels/${CHANNEL}.json`);
  const liveManifestUrl = channel ? `${MIRROR}/${channel.manifest}` : FALLBACK_MANIFEST;
  const live = await json(liveManifestUrl);
  const liveFiles = (live?.provenance?.upstream ?? []).map((entry) => entry.file);
  const liveVersion = Number(channel?.version ?? live?.version ?? 0);
  const upstream = [...(await fetchChecksums(LICHESS_BROADCAST)).keys()];

  console.log('Live');
  console.log(
    `  channel:  ${channel ? `${CHANNEL} → v${channel.version}` : 'none yet (v2 is the catalog’s pack)'}`,
  );
  console.log(`  manifest: ${liveManifestUrl}`);
  console.log(`  id:       ${live?.id ?? 'unreachable'}  version ${live?.version ?? '?'}`);
  console.log(`  months:   ${liveFiles.join(', ') || 'none'}`);

  const plan = planMonthly({ upstream, live: liveFiles, liveVersion });
  const forced = option('force-version');
  console.log('\nPlan');
  console.log(`  newest published: ${plan.months[0] ?? 'none'}`);
  console.log(`  window:           ${plan.months.join(', ')}`);
  console.log(`  ${plan.rebuild ? 'REBUILD' : 'NOTHING TO DO'}: ${plan.reason}`);
  if (forced) console.log(`  forced: version ${forced}, whatever the plan says`);

  const version = forced ?? String(plan.version);
  if (!plan.rebuild && !forced) return 0;
  if (!flag('build') && !flag('publish')) return 2;
  if (forced && Number(forced) <= liveVersion) {
    throw new Error(`Version ${forced} is not newer than the live v${liveVersion}.`);
  }

  const out = path.join(cachePaths.packs, `${PACK_ID}-v${version}`);
  if (existsSync(path.join(out, 'manifest.json'))) {
    console.log(`\n${out} already holds a build; it is published as it is.`);
  } else {
    run('node', [
      'scripts/build-reference-pack.mjs',
      '--pack',
      'recent-6m',
      '--version',
      version,
      '--out',
      out,
    ]);
  }
  const built = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  const builtMonths = built.provenance.upstream.map((entry) => entry.file);
  if (built.id !== PACK_ID || built.version !== version) {
    throw new Error(`The build is ${built.id} v${built.version}, not ${PACK_ID} v${version}.`);
  }
  if (builtMonths.join() !== plan.files.join()) {
    throw new Error(
      `The build read ${builtMonths.join(', ')}; the plan named ${plan.files.join(', ')}.`,
    );
  }
  console.log(
    `\nBuilt ${PACK_ID} v${version}: ${built.counts.games.toLocaleString()} games, ${built.counts.positions.toLocaleString()} positions.`,
  );
  if (!flag('publish')) return 0;

  run('node', [
    'scripts/publish-data.mjs',
    '--id',
    PACK_ID,
    '--version',
    version,
    '--from',
    out,
    '--dir',
    'recent',
    '--channel',
    CHANNEL,
    '--apply',
  ]);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
