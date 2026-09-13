#!/usr/bin/env node
/**
 * `npm run publish:release-manifest` prepares a runtime manifest locally.
 * It does not upload anything. The public download descriptor is the source
 * of truth; a historical build manifest must never select an older release.
 * Actual GitHub release publication uses `release:mac:publish`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const descriptor = JSON.parse(
  readFileSync(new URL('../src/release/macos-download.json', import.meta.url), 'utf8'),
);
if (!descriptor.version || !descriptor.url || !descriptor.sha256 || !(descriptor.bytes > 0)) {
  throw new Error('The public macOS descriptor is incomplete.');
}
const manifest = {
  schema: 'kingfisher-runtime-release-manifest/1',
  kingfisher: { name: 'kingfisher', version: descriptor.version },
  htmlUrl: descriptor.releasePage,
  publishedAt: descriptor.publishedAt,
  desktop: [
    {
      name: descriptor.filename,
      arch: descriptor.architecture,
      sha256: descriptor.sha256,
      bytes: descriptor.bytes,
      url: descriptor.url,
    },
  ],
};
const out = new URL('../kingfisher-release-manifest.json', import.meta.url);
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${fileURLToPath(out)} for ${descriptor.version}; nothing uploaded.`);
