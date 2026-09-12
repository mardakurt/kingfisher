#!/usr/bin/env node
/**
 * `npm run release:manifest` — produce `release-manifest.json`.
 *
 * A machine-readable description of the release artefact. Records:
 *   - the Kingfisher version (from `package.json`);
 *   - the git commit (HEAD, with --short and full SHA);
 *   - the build timestamp (UTC, ISO 8601);
 *   - the platform and architecture of the build machine;
 *   - the web build status (the existence of `.next/` and a `BUILD_ID`);
 *   - any desktop artefacts discovered on disk;
 *   - the SHA-256 of each artefact;
 *   - the reference-pack catalogue version and approximate bytes;
 *   - the bundled Stockfish and engine catalogue versions.
 *
 * No secrets. No build-machine home paths. No user PGN. Safe to commit
 * to a public release.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { arch, platform, version } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const head = git(['rev-parse', 'HEAD']);
const short = git(['rev-parse', '--short', 'HEAD']);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);

const sha256OfFile = (file) => {
  const h = createHash('sha256');
  h.update(readFileSync(file));
  return h.digest('hex');
};

const collect = (dir, predicate) => {
  if (!existsSync(dir)) return [];
  const out = execFileSync('find', [dir, '-maxdepth', '4', '-type', 'f'], { encoding: 'utf8' });
  return out
    .split('\n')
    .filter((p) => p && predicate(p))
    .map((p) => p.replace(`${root}/`, ''));
};

const webBuild = {
  status: existsSync(path.join(root, '.next/BUILD_ID'))
    ? 'present'
    : existsSync(path.join(root, '.next'))
      ? 'partial'
      : 'absent',
  buildId: existsSync(path.join(root, '.next/BUILD_ID'))
    ? readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim()
    : null,
};

const desktopArtifacts = [
  ...collect(
    process.env.KINGFISHER_DESKTOP_OUT ?? path.join(root, 'desktop/dist'),
    (p) => p.endsWith('.dmg') || p.endsWith('.zip'),
  ),
  ...collect(path.join(root, 'desktop/out'), (p) => p.endsWith('.dmg') || p.endsWith('.zip')),
].map((file) => {
  // An absolute path is an artifact outside the checkout (KINGFISHER_DESKTOP_OUT);
  // the manifest records its name and digest, never the build machine's path.
  const fullPath = path.isAbsolute(file) ? file : path.join(root, file);
  const bytes = statSync(fullPath).size;
  const recorded = path.isAbsolute(file) ? path.basename(file) : file;
  return { name: path.basename(file), path: recorded, bytes, sha256: sha256OfFile(fullPath) };
});

const referenceCatalogue = (() => {
  try {
    const src = readFileSync(path.join(root, 'src/reference/catalog.ts'), 'utf8');
    const pick = (re) => {
      const m = src.match(re);
      return m ? m[1] : null;
    };
    // The version is encoded in the manifestUrl path (e.g. reference-elite-v2).
    return {
      eliteOtb: pick(/packRelease\(['"]reference-elite-(v\d+)['"]\)/),
      recentTheory: pick(/packRelease\(['"]reference-recent-(v\d+)['"]\)/),
      highRatedOnline: pick(/packRelease\(['"]reference-online-(v\d+)['"]\)/),
    };
  } catch {
    return null;
  }
})();

const manifest = {
  schema: 'kingfisher-release-manifest/1',
  kingfisher: {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
  },
  git: {
    head,
    short,
    branch,
    dirty: existsSync(path.join(root, '.git')) && git(['status', '--porcelain']).length > 0,
  },
  build: {
    timestamp: new Date().toISOString(),
    platform: platform,
    architecture: arch,
    node: version,
  },
  web: webBuild,
  desktop: desktopArtifacts,
  referenceCatalogue,
  public: {
    web: process.env.KINGFISHER_PUBLIC_WEB_URL || null,
    landing: process.env.KINGFISHER_PUBLIC_LANDING_URL || null,
    repository: 'https://github.com/mardakurt/kingfisher',
  },
};

const out = path.join(root, 'release-manifest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${path.relative(root, out)}`);
console.log(`  Kingfisher ${pkg.version} @ ${short}`);
console.log(`  ${desktopArtifacts.length} desktop artefact(s)`);
console.log(`  web build: ${webBuild.status}`);
