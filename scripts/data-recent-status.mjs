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
 *   - The current v2 window is read from
 *     `data/recent/v2/index.json` (or whatever the live
 *     release manifest points to).
 *   - The candidate window is the next six-month block of
 *     upstream Lichess months that has not yet been published.
 *   - The command prints "REBUILD RECOMMENDED" only when at
 *     least one complete upstream month is available *and* the
 *     cumulative six-month window would change.
 *
 * The command is cheap on purpose. It runs from any checkout.
 *
 * Usage:
 *   npm run data:recent:status
 */

import { existsSync, readFileSync } from 'node:fs';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/* The "live" Recent Theory v2 manifest. The exact path is
   owned by `data/recent/v2/`; the maintainer updates it when
   they publish a new candidate. */
const manifestPath = join(ROOT, 'data', 'recent', 'v2', 'index.json');
const live = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;

if (live) {
  console.log(`Live Recent Theory v2`);
  console.log(`  version: ${live.version ?? 'unversioned'}`);
  console.log(`  source:  ${live.source ?? 'unknown'}`);
  console.log(`  range:   ${live.range?.start ?? '?'} → ${live.range?.end ?? '?'}`);
  if (live.publishedAt) {
    console.log(`  published: ${live.publishedAt}`);
  }
  if (live.months && Array.isArray(live.months)) {
    console.log(`  months:  ${live.months.join(', ')}`);
  }
} else {
  console.log('Live Recent Theory v2 manifest: NOT FOUND');
  console.log(`  expected at ${manifestPath}`);
  console.log('  publication has not yet been run for v2');
}

/* The candidate window is the next six-month block. The
   current convention is rolling six months ending in the
   most recent complete upstream month. */
const now = new Date();
const candidateEnd = monthFloor(now);
const candidateStart = addMonths(candidateEnd, -5);
const liveEndMonth = live?.range?.end ? monthFromIso(live.range.end) : null;
const liveStartMonth = live?.range?.start ? monthFromIso(live.range.start) : null;

console.log('');
console.log('Candidate window (no rebuild yet)');
console.log(`  range: ${monthIso(candidateStart)} → ${monthIso(candidateEnd)}`);

let recommended = false;
if (liveEndMonth) {
  const monthDiff = monthDistance(liveEndMonth, candidateEnd);
  if (monthDiff >= 1) {
    recommended = true;
    console.log(`  reason: live ends ${monthIso(liveEndMonth)}, ${monthDiff} complete month(s) newer available`);
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
function monthFromIso(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}
function monthDistance(a, b) {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}
