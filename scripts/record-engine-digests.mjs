#!/usr/bin/env node
/**
 * Record the SHA-256 of every release asset in the engine catalogue.
 *
 *   npm run engines:digests            record anything missing
 *   npm run engines:digests -- --all   re-download and re-record everything
 *
 * Run when an engine is added or its version bumped. The result is committed,
 * and both installers refuse to install an asset whose digest is not in it —
 * so adding an engine is a deliberate act with a reviewable diff, rather than
 * a URL somebody typed.
 *
 * What a recorded digest proves is stated in `engine-catalogue.mjs`, and it is
 * narrower than people usually assume: byte-identity with what this project
 * downloaded once, not authenticity of the release.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { CATALOGUE, forPlatform } from './engine-catalogue.mjs';

const FILE = new URL('./engine-digests.json', import.meta.url);
const PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'];

const digests = JSON.parse(readFileSync(FILE, 'utf8'));
const all = process.argv.includes('--all');

const urls = new Map();
for (const entry of CATALOGUE) {
  if (entry.kind !== 'binary') continue;
  for (const platform of PLATFORMS) {
    const asset = forPlatform(entry, platform);
    if (asset) urls.set(asset.url, `${entry.id} (${platform})`);
  }
}

let recorded = 0;
for (const [url, label] of urls) {
  if (digests[url] && !all) {
    process.stdout.write(`have  ${label}\n`);
    continue;
  }
  process.stdout.write(`fetch ${label} — ${url}\n`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    process.stderr.write(`  FAILED ${response.status} ${response.statusText}\n`);
    process.exitCode = 1;
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  digests[url] = digest;
  recorded += 1;
  process.stdout.write(`  ${digest}  ${(bytes.length / 1e6).toFixed(1)} MB\n`);
}

const sorted = Object.fromEntries(Object.entries(digests).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(FILE, `${JSON.stringify(sorted, null, 2)}\n`);
process.stdout.write(`recorded ${recorded}, total ${Object.keys(sorted).length}\n`);
