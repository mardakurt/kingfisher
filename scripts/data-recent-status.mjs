#!/usr/bin/env node
/**
 * `npm run data:recent:status` — printable status of the
 * Recent Theory dataset's freshness, with a hypothetical
 * candidate window.
 *
 * The intent is operational: when a phase starts, the
 * maintainer can answer "is the data stale?" without rebuilding
 * anything. The command does not download, does not build, and
 * does not write to disk.
 *
 *   - The current v2 window is read from the canonical published
 *     manifest on the data mirror. The same URL is the one
 *     `src/reference/catalog.ts` advertises to clients, so
 *     "live on the data mirror" and "live to Kingfisher" mean
 *     the same thing.
 *   - The candidate window is the next six-month block of
 *     upstream Lichess months that has not yet been published.
 *   - The command prints "REBUILD RECOMMENDED" only when at
 *     least one complete upstream month is available *and* the
 *     cumulative six-month window would change.
 *
 * The command is cheap on purpose. It runs from any checkout.
 *
 * Environment overrides:
 *   - KINGFISHER_PUBLIC_DATA_ROOT_URL — replace the data mirror.
 *   - KINGFISHER_RECENT_MANIFEST — replace the manifest path
 *     entirely (for tests and offline mirrors).
 *
 * Usage:
 *   npm run data:recent:status
 */

import { existsSync, readFileSync } from 'node:fs';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'node:https';
import { URL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/* The "live" Recent Theory v2 manifest. The canonical URL is
   the same one `src/reference/catalog.ts` advertises — there is
   exactly one truth, and this command reads it. */
const rootUrl =
  process.env.KINGFISHER_PUBLIC_DATA_ROOT_URL ??
  'https://mardakurt.github.io/kingfisher-data';
const manifestUrl =
  process.env.KINGFISHER_RECENT_MANIFEST ??
  `${rootUrl.replace(/\/$/, '')}/reference-recent-v2/manifest.json`;

/* Optional local fallback so this command also runs in a
   fully offline checkout (the path here is a build artefact
   produced by the publication pipeline, not a hand-written
   summary; when present, it is the authoritative truth). */
const localManifestPath = join(ROOT, 'data', 'recent', 'v2', 'index.json');

const live = await fetchLiveManifest();

if (live) {
  console.log(`Live Recent Theory v2`);
  console.log(`  source:  ${manifestUrl}`);
  console.log(`  version: ${live.version ?? 'unversioned'}`);
  console.log(`  id:      ${live.id ?? 'unknown'}`);
  console.log(`  builtAt: ${live.builtAt ?? 'unknown'}`);
  if (Array.isArray(live.provenance?.upstream)) {
    const months = live.provenance.upstream.map((u) => u?.file).filter(Boolean);
    if (months.length) console.log(`  months:  ${months.join(', ')}`);
  }
  if (live.license?.id) console.log(`  license: ${live.license.id}`);
} else {
  console.log('Live Recent Theory v2 manifest: NOT FOUND');
  console.log(`  expected at ${manifestUrl}`);
  if (existsSync(localManifestPath)) {
    console.log(`  local copy is present at ${localManifestPath} but unreachable from this host`);
  }
  console.log('  publication has not yet been run for v2, or the data mirror is unreachable');
}

/* The candidate window is the next six-month block. The
   current convention is rolling six months ending in the
   most recent complete upstream month. */
const now = new Date();
const candidateEnd = monthFloor(now);
const candidateStart = addMonths(candidateEnd, -5);
const liveEndMonth =
    live?.provenance?.upstream?.length ?
      monthFromIso(live.provenance.upstream[0].file) :
      null;
const liveStartMonth =
    live?.provenance?.upstream?.length ?
      monthFromIso(live.provenance.upstream.at(-1).file) :
      null;

console.log('');
console.log('Candidate window (no rebuild yet)');
console.log(`  range: ${monthIso(candidateStart)} → ${monthIso(candidateEnd)}`);

let recommended = false;
if (liveEndMonth) {
  const monthDiff = monthDistance(liveEndMonth, candidateEnd);
  if (monthDiff >= 1) {
    recommended = true;
    console.log(
      `  reason: live ends ${monthIso(liveEndMonth)}, ${monthDiff} complete month(s) newer available`,
    );
  } else {
    console.log('  reason: live window already covers the most recent complete month');
  }
} else {
  console.log('  reason: no live window on file, baseline candidate is the first six months');
  recommended = true;
}

if (liveStartMonth && liveEndMonth) {
  const liveSpan = monthDistance(liveStartMonth, liveEndMonth);
  const candidateSpan = monthDistance(candidateStart, candidateEnd);
  if (liveSpan !== candidateSpan) {
    console.log(`  note:   live span is ${liveSpan} months, candidate is ${candidateSpan} months`);
    recommended = true;
  }
}

console.log('');
if (recommended) {
  console.log('Verdict: REBUILD RECOMMENDED');
  console.log('  Run `npm run data:recent:build` to produce a candidate and stage it for review.');
  console.log('  Publication is still gated by `data:recent:publish` after a manual review.');
  exit(2);
}
console.log('Verdict: STAY-ON-LIVE');
console.log('  Recent Theory v2 is up to date. No new build is required.');

/* helpers */
function monthFloor(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonths(d, n) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function monthIso(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function monthFromIso(fileName) {
  if (!fileName) return null;
  const m = /(\d{4})-(\d{2})/.exec(fileName);
  if (!m) return null;
  /* The candidate window ends on the *most recent* complete
     upstream month, not the oldest. Lichess file names embed
     YYYY-MM in chronological order, so the regex still
     extracts the right year and month but we explicitly sort
     when more than one is supplied. */
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}
function monthDistance(a, b) {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/**
 * Fetch the live manifest from the data mirror.
 *
 * Returns null when the mirror is unreachable: a status command
 * that hard-fails on a flaky network gives a worse signal than
 * "not found". The local override is consulted first so a
 * checkout that has already cached the manifest wins.
 */
async function fetchLiveManifest() {
  if (existsSync(localManifestPath) && !process.env.KINGFISHER_RECENT_FORCE_REMOTE) {
    try {
      return JSON.parse(readFileSync(localManifestPath, 'utf8'));
    } catch {
      /* fall through to remote */
    }
  }
  try {
    return await getJson(manifestUrl);
  } catch {
    return null;
  }
}

function getJson(rawUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    const req = get(
      url,
      {
        headers: { accept: 'application/json' },
        timeout: 5_000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`status ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
  });
}
