#!/usr/bin/env node
/**
 * `npm run publish:release-manifest` — push the runtime release
 * manifest to the public data mirror.
 *
 * Phase 34's "Check for Updates" reads
 * `<repository>/releases/latest/download/kingfisher-release-manifest.json`.
 * The manifest is a strict subset of the build manifest: only the
 * fields the runtime is allowed to read, plus a `publishedAt`
 * timestamp. The full build manifest (which contains local paths
 * and intermediate SHA-256s) never goes to the data mirror.
 *
 *   npm run publish:release-manifest
 *
 * The script reads `release-manifest.json` from the repository
 * root, strips it, and writes a single file to the data mirror.
 * It refuses to touch anything else.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = resolve(ROOT, 'release-manifest.json');

/**
 * The canonical repository, mirrored here so this script can run
 * under plain Node without going through the TypeScript loader.
 * Update in lockstep with `src/release/public-urls.ts` if the
 * repository ever moves.
 */
const REPOSITORY = 'https://github.com/mardakurt/kingfisher';

const source = JSON.parse(readFileSync(SRC, 'utf8'));

const desktop = Array.isArray(source.desktop) ? source.desktop : [];
const stripped = {
  schema: 'kingfisher-runtime-release-manifest/1',
  kingfisher: {
    name: source.kingfisher?.name ?? 'kingfisher',
    version: source.kingfisher?.version,
  },
  htmlUrl: `${REPOSITORY}/releases/tag/v${source.kingfisher?.version}`,
  publishedAt: new Date().toISOString(),
  desktop: desktop
    .filter((asset) => {
      if (!asset || typeof asset !== 'object') return false;
      if (typeof asset.name !== 'string') return false;
      if (typeof asset.sha256 !== 'string') return false;
      if (typeof asset.bytes !== 'number' || asset.bytes <= 0) return false;
      if (typeof asset.path !== 'string') return false;
      return /^Kingfisher-(\d+)\.(\d+)\.(\d+)-(arm64|x64)\.dmg$/.test(asset.name);
    })
    .map((asset) => ({
      name: asset.name,
      arch: /-arm64\.dmg$/.test(asset.name) ? 'arm64' : 'x64',
      sha256: asset.sha256,
      bytes: asset.bytes,
      url: `${REPOSITORY}/releases/download/v${source.kingfisher?.version}/${asset.name}`,
    })),
};

if (stripped.desktop.length === 0) {
  console.error('No desktop assets to publish.');
  process.exit(1);
}

const out = resolve(ROOT, 'kingfisher-release-manifest.json');
writeFileSync(out, JSON.stringify(stripped, null, 2));
console.log(`Wrote ${out}`);
console.log(`  schema   : ${stripped.schema}`);
console.log(`  version  : ${stripped.kingfisher.version}`);
console.log(`  desktop  : ${stripped.desktop.map((a) => a.arch).join(', ')}`);
console.log(`  bytes    : ${stripped.desktop.map((a) => a.bytes).join(', ')}`);
