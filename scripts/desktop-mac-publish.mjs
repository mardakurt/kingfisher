#!/usr/bin/env node
/**
 * `npm run release:mac:publish` — upload the signed, notarized
 * Kingfisher artifacts to a GitHub Release.
 *
 * The artifacts are the same ones the auto-update flow expects:
 *
 *   - Kingfisher-<version>-arm64.dmg        first-install + manual fallback
 *   - Kingfisher-<version>-arm64.zip        the update Sparkle downloads
 *   - appcast.xml                           the Sparkle feed, signed, from
 *                                           `release:mac:appcast`; every
 *                                           installed Kingfisher asks
 *                                           `…/releases/latest/download/appcast.xml`
 *   - latest-mac.yml                        the previous engine's feed, for
 *                                           the installed 1.1.0–1.1.6
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

import { appcastMismatch, summarizeAppcast } from './desktop-mac-appcast.mjs';
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
  'appcast.xml',
  'latest-mac.yml',
];
const missing = expected.filter((name) => !existsSync(join(distDir, name)));
if (missing.length) {
  console.error(
    `Missing artifacts in ${distDir}: ${missing.join(', ')}` +
      (missing.includes('appcast.xml')
        ? '\nRun npm run release:mac:appcast after notarising.'
        : ''),
  );
  exit(1);
}

/*
  The feed must describe the ZIP beside it — same name, same length — and be
  signed. A feed that names a different archive would send every installed
  Kingfisher after bytes that are not there.
*/
{
  const appcast = readFileSync(join(distDir, 'appcast.xml'), 'utf8');
  const summary = summarizeAppcast(appcast);
  const zipPath = join(distDir, `Kingfisher-${version}-arm64.zip`);
  const zipSize = readFileSync(zipPath).byteLength;
  const mismatch = appcastMismatch(summary, { tag, version, zipSize });
  if (mismatch) {
    console.error(`appcast.xml does not describe this release: ${mismatch}`);
    exit(1);
  }
  console.log(
    `appcast.xml: ${summary.title} · build ${summary.version} · ${summary.length} bytes · signed`,
  );
  /*
    The previous engine's feed, for the installed 1.1.0–1.1.7. The output
    directory keeps older builds' files, and a `latest-mac.yml` left there
    by an earlier release names that release: uploading it would offer
    every 1.1.x the wrong archive with the wrong digest.
  */
  const legacy = readFileSync(join(distDir, 'latest-mac.yml'), 'utf8');
  const legacyVersion = /^version:\s*(\S+)/m.exec(legacy)?.[1];
  const legacySha = /^sha512:\s*(\S+)/m.exec(legacy)?.[1];
  const zipSha512 = createHash('sha512').update(readFileSync(zipPath)).digest('base64');
  if (legacyVersion !== version || legacySha !== zipSha512) {
    console.error(
      `latest-mac.yml names ${legacyVersion ?? '?'} (sha512 ${legacySha?.slice(0, 12) ?? '?'}…), not this release's ${version} ZIP (${zipSha512.slice(0, 12)}…). Run npm run release:mac:appcast -- --zip <this ZIP>.`,
    );
    exit(1);
  }
  console.log(
    `latest-mac.yml: ${legacyVersion} · sha512 ${legacySha.slice(0, 12)}… (for 1.1.0–1.1.7)`,
  );
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

/* Build the release manifest from the files being published — always.
   The out dir is shared between releases, and "write it if absent" let
   the 1.2.1 manifest ride along on v1.2.2–v1.2.5, each naming 1.2.1.
   The manifest is for people; Sparkle reads only appcast.xml. */
const manifestPath = join(distDir, 'kingfisher-release-manifest.json');
{
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
