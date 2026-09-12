#!/usr/bin/env node
/**
 * `npm run release:mac:publish` — upload the signed, notarized
 * Kingfisher artifacts to a GitHub Release.
 *
 * The artifacts are the same ones the auto-update flow expects:
 *
 *   - Kingfisher-<version>-arm64.dmg        first-install + manual fallback
 *   - Kingfisher-<version>-arm64.zip        auto-update payload
 *   - latest-mac.yml                        electron-builder's update feed
 *   - kingfisher-release-manifest.json      human-readable release manifest
 *   - SHA256SUMS                            digests for cross-checking
 *
 * Uploads use `gh release upload` so the only credential needed
 * is `GH_TOKEN` (or the same `gh` CLI auth used for `gh release
 * create`). The script does not talk to the GitHub API directly.
 *
 * Usage:
 *   node scripts/desktop-mac-publish.mjs <tag> [<release-title>]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { exit } from 'node:process';

import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
if (!tag) {
  console.error('Usage: node scripts/desktop-mac-publish.mjs <tag> [<title>]');
  exit(1);
}
const title = process.argv[3] || tag;

// The build's output directory: `desktop/dist`, or wherever build.mjs was
// told (or chose, for a checkout path electron-builder refuses) to write.
const distDir = resolve(process.env.KINGFISHER_DESKTOP_OUT ?? join(HERE, 'desktop', 'dist'));
const versionMatch = /^v?(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)$/.exec(tag);
if (!versionMatch) {
  console.error(`Tag ${tag} does not look like a semver version.`);
  exit(1);
}
const version = versionMatch[1];

const expected = [
  `Kingfisher-${version}-arm64.dmg`,
  `Kingfisher-${version}-arm64.zip`,
  'latest-mac.yml',
];
const missing = expected.filter((name) => !existsSync(join(distDir, name)));
if (missing.length) {
  console.error(`Missing artifacts in ${distDir}: ${missing.join(', ')}`);
  exit(1);
}

/* Build SHA256SUMS for the artifacts. */
const sums = [];
for (const name of expected) {
  const path = join(distDir, name);
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  const bytes = readFileSync(path).byteLength;
  sums.push(`${hash}  ${name}  ${bytes}`);
}
const sumPath = join(distDir, 'SHA256SUMS');
writeFileSync(sumPath, sums.join('\n') + '\n');
console.log(`Wrote ${sumPath}`);

/* Build a release manifest in the kingfisher format if one is not
   present. The release manifest is what `update-service.mjs`'s
   preflight parser consumes for the staging path. */
const manifestPath = join(distDir, 'kingfisher-release-manifest.json');
if (!existsSync(manifestPath)) {
  const pkg = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'));
  const manifest = {
    schema: 'kingfisher-runtime-release-manifest/1',
    kingfisher: {
      name: pkg.name,
      version,
      tag,
    },
    htmlUrl: `https://github.com/mardakurt/kingfisher/releases/tag/${tag}`,
    publishedAt: new Date().toISOString(),
    desktop: expected
      .filter((n) => n.endsWith('.dmg') || n.endsWith('.zip'))
      .map((n) => {
        const hash = createHash('sha256')
          .update(readFileSync(join(distDir, n)))
          .digest('hex');
        return {
          name: n,
          arch: 'arm64',
          sha256: hash,
          bytes: readFileSync(join(distDir, n)).byteLength,
          url: `https://github.com/mardakurt/kingfisher/releases/download/${tag}/${n}`,
        };
      }),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifestPath}`);
}

/* Confirm the release exists, otherwise create it. */
const releaseList = spawnSync(
  'gh',
  ['release', 'list', '--json', 'tagName', '--jq', '.[].tagName'],
  {
    encoding: 'utf8',
  },
);
if (releaseList.status !== 0) {
  console.error('Could not list GitHub releases. Is `gh` authed?');
  exit(1);
}
const existing = releaseList.stdout.split('\n').map((s) => s.trim());
if (!existing.includes(tag)) {
  console.log(`Creating GitHub release ${tag}…`);
  const create = spawnSync(
    'gh',
    ['release', 'create', tag, '--title', title, '--notes', `Kingfisher ${version}`],
    { encoding: 'utf8', stdio: 'inherit' },
  );
  if (create.status !== 0) {
    console.error('Release create failed.');
    exit(1);
  }
}

/* Upload artifacts. */
const files = expected.map((n) => join(distDir, n)).concat([sumPath, manifestPath]);
console.log(`Uploading ${files.length} artifacts to ${tag}…`);
const upload = spawnSync('gh', ['release', 'upload', tag, ...files, '--clobber'], {
  encoding: 'utf8',
  stdio: 'inherit',
});
if (upload.status !== 0) {
  console.error('Upload failed.');
  exit(1);
}
console.log(`Release ${tag} published.`);
