#!/usr/bin/env node
/**
 * `npm run publish:site` — push the marketing site to the public
 * data mirror.
 *
 * The landing page and the public reference data live in the
 * SAME repository (mardakurt/kingfisher-data), which is also the
 * GitHub Pages site that the application fetches reference-pack
 * manifests and chunks from. Phase 24 discovered that the
 * Phase 23 procedure used `rsync --delete`, which is a *data loss*
 * hazard — a typo or a misconfigured include list would silently
 * wipe hundreds of megabytes of published reference data.
 *
 * This script is built to make that impossible.
 *
 *   - It only ever touches the explicit allow-list of paths:
 *     `index.html`, `assets/`, `manifest.webmanifest`, `robots.txt`,
 *     `README.md` and `.nojekyll`.
 *   - It REFUSES to remove a path it did not create, and refuses
 *     to remove a `reference-*` directory under any circumstances.
 *   - It does a `--dry-run` by default. Pass `--apply` to push for
 *     real. Pass `--diff` to see exactly what would change.
 *
 * The maintainer (or the next agent) is expected to be the only
 * thing in the loop that decides "this is the new landing, and
 * it is OK to push". The script makes the operation safe; the
 * decision stays human.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAGE = process.env.KINGFISHER_DATA_STAGE || '/tmp/kingfisher-data-stage';
const APPLY = process.argv.includes('--apply');
const DIFF = process.argv.includes('--diff');
const REMOTE =
  process.env.KINGFISHER_DATA_REMOTE || 'https://github.com/mardakurt/kingfisher-data.git';

// The exact set of paths the landing deployment is allowed to
// modify. Anything else in the data repository is the data's
// problem, not the landing's.
const ALLOWED = new Set([
  'index.html',
  'assets',
  'manifest.webmanifest',
  'robots.txt',
  'README.md',
  '.nojekyll',
]);

// Paths the landing deployment is NEVER allowed to touch, even
// by accident. A `reference-*` directory in the data repo is
// hundreds of megabytes of pack data; deleting one would
// brick the application for every user mid-install.
const PROTECTED = [/^reference(-elite-v\d+|-recent-v\d+|-online-v\d+|-starter)?(\/|$)/];

const walk = (dir) => {
  const out = execFileSync('find', [dir, '-mindepth', '1'], { encoding: 'utf8' });
  return out.split('\n').filter((p) => p && p !== dir);
};

const execFileSync = (cmd, args, options) =>
  spawnSync(cmd, args, { encoding: 'utf8', ...options }).stdout;

const safeRead = (path) => {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
};

const syncPath = (rel, op) => {
  const local = join(ROOT, 'marketing', rel);
  const remote = join(STAGE, rel);
  if (op === 'remove') {
    if (existsSync(remote)) {
      console.log(`  - remove ${rel}`);
      if (APPLY) rmSync(remote, { recursive: true, force: true });
    }
    return;
  }
  if (!existsSync(local)) {
    syncPath(rel, 'remove');
    return;
  }
  const lstat = statSync(local);
  if (lstat.isDirectory()) {
    mkdirSync(remote, { recursive: true });
    for (const child of readdirSync(local)) {
      syncPath(join(rel, child), op);
    }
    return;
  }
  const existing = safeRead(remote);
  const next = readFileSync(local);
  if (!existing || !existing.equals(next)) {
    console.log(`  ${op === 'copy' ? '+' : '~'} ${rel}`);
    if (APPLY) writeFileSync(remote, next);
  }
};

import { readdirSync } from 'node:fs';

if (!existsSync(STAGE)) {
  console.error(`Stage directory ${STAGE} does not exist. Clone the data repo there first.`);
  process.exit(1);
}

// Sanity check: the stage is the kingfisher-data repository.
const remote = safeRead(join(STAGE, '.git', 'config'));
if (!remote || !String(remote).includes('kingfisher-data')) {
  console.error(`Stage ${STAGE} does not look like the kingfisher-data repository. Aborting.`);
  process.exit(1);
}

// 1) Walk the marketing directory and collect the allow-list.
const marketingDir = join(ROOT, 'marketing');
if (!existsSync(marketingDir)) {
  console.error(`Marketing directory ${marketingDir} does not exist.`);
  process.exit(1);
}

const marketingEntries = new Set();
for (const path of walk(marketingDir)) {
  const rel = relative(marketingDir, path);
  const top = rel.split('/')[0];
  if (!ALLOWED.has(top)) {
    console.error(`Refusing to deploy: marketing/${rel} is not in the allow-list.`);
    console.error(`Add it to ALLOWED in scripts/publish-site.mjs after a security review.`);
    process.exit(1);
  }
  marketingEntries.add(rel);
}

// 2) Verify no protected path is touched in the stage.
for (const path of walk(STAGE)) {
  const rel = relative(STAGE, path);
  if (PROTECTED.some((re) => re.test(rel))) {
    // data, leave alone
    continue;
  }
  if (!marketingEntries.has(rel) && existsSync(join(marketingDir, rel))) {
    // already handled by the allow-list check above
    continue;
  }
  if (!marketingEntries.has(rel)) {
    // It exists in stage but not in marketing. Refuse to delete
    // it; the human is the only one who can remove a path the
    // landing does not own.
    if (rel === '.git' || rel === '.nojekyll' || rel === 'README.md') continue;
    console.error(`Refusing to delete ${rel} from the data repository.`);
    console.error(`This path is not in the marketing allow-list and may belong to a`);
    console.error(`reference pack or a non-landing artefact. Remove it by hand if it`);
    console.error(`really is stale, or extend ALLOWED in scripts/publish-site.mjs.`);
    process.exit(1);
  }
}

// 3) Apply or dry-run the sync.
console.log(APPLY ? 'Applying site deployment (real push):' : 'Dry-run site deployment:');
for (const rel of marketingEntries) {
  syncPath(rel, 'copy');
}
if (DIFF || !APPLY) {
  console.log('\nNo changes were pushed. Pass --apply to push for real.');
  process.exit(0);
}

// 4) Commit and push.
const commit = spawnSync(
  'git',
  [
    '-C',
    STAGE,
    'add',
    '--',
    'index.html',
    'assets',
    'manifest.webmanifest',
    'robots.txt',
    'README.md',
    '.nojekyll',
  ],
  { stdio: 'inherit' },
);
if (commit.status !== 0) {
  console.error('git add failed.');
  process.exit(1);
}
const staged = spawnSync('git', ['-C', STAGE, 'diff', '--cached', '--name-only'], {
  encoding: 'utf8',
}).stdout.trim();
if (!staged) {
  console.log('No changes staged. The landing is already up to date.');
  process.exit(0);
}
const message = `site: refresh the public landing page

Automated by scripts/publish-site.mjs (--apply). The script
only ever modifies the explicit allow-list (index.html,
assets/, manifest.webmanifest, robots.txt, README.md,
.nojekyll). Reference pack data is never touched.`;
const commitResult = spawnSync('git', ['-C', STAGE, 'commit', '-m', message], { stdio: 'inherit' });
if (commitResult.status !== 0) {
  console.error('git commit failed.');
  process.exit(1);
}
const push = spawnSync('git', ['-C', STAGE, 'push', REMOTE], { stdio: 'inherit' });
if (push.status !== 0) {
  console.error('git push failed.');
  process.exit(1);
}
console.log('\nSite deployment pushed. GitHub Pages will rebuild the site on the next deploy.');
