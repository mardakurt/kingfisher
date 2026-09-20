#!/usr/bin/env node
/**
 * Vercel's `ignoreCommand`: exit 0 to skip the build, 1 to build.
 *
 * Vercel runs this in the cloned checkout with `VERCEL_GIT_PREVIOUS_SHA`
 * set to the commit of the previous deployment of this branch. The paths
 * that differ between that commit and `HEAD` decide, through
 * `vercel-build-scope.mjs`, whether the web build's inputs changed.
 *
 * Two ways to learn those paths, tried in order:
 *
 *   1. `git diff --name-only <previous> HEAD` — which works in a checkout
 *      with history and does not on Vercel: `.vercelignore` strips `.git`
 *      before this runs, and the first deployment with this command (da268c5)
 *      logged "Could not access 'dbe93d9…'" and built.
 *   2. GitHub's compare API for the repository Vercel names in
 *      `VERCEL_GIT_REPO_OWNER` / `VERCEL_GIT_REPO_SLUG`, which answers for a
 *      public repository without a token and lists the changed files.
 *
 * Anything that stops the question being answered — no previous commit, both
 * sources failing, a compare too large to list fully — answers "build": a
 * deployment nobody needed is a known, bounded cost; a stale site is not.
 * A first production deployment is never skipped.
 */
import { spawnSync } from 'node:child_process';

import { needsWebBuild } from './vercel-build-scope.mjs';

const previous = process.env.VERCEL_GIT_PREVIOUS_SHA ?? '';
const head = process.env.VERCEL_GIT_COMMIT_SHA ?? 'HEAD';
const build = (reason) => {
  console.log(`build: ${reason}`);
  process.exit(1);
};

if (!previous) build('no previous deployment to compare with');

/** Changed paths from git, or null when git cannot answer here. */
function fromGit() {
  const diff = spawnSync('git', ['diff', '--name-only', previous, 'HEAD'], { encoding: 'utf8' });
  if (diff.status !== 0) {
    console.log(
      `git could not diff ${previous.slice(0, 7)}..HEAD (${(diff.stderr ?? '').trim() || 'no history'})`,
    );
    return null;
  }
  return diff.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Changed paths from GitHub's compare API, or null when it cannot answer. */
async function fromGitHub() {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const repo = process.env.VERCEL_GIT_REPO_SLUG;
  if (!owner || !repo || head === 'HEAD') {
    console.log('GitHub compare: repository or commit not named in the environment');
    return null;
  }
  const url = `https://api.github.com/repos/${owner}/${repo}/compare/${previous}...${head}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'kingfisher-vercel-ignore' },
    });
    if (!response.ok) {
      console.log(`GitHub compare answered ${response.status}`);
      return null;
    }
    const body = await response.json();
    const files = Array.isArray(body.files) ? body.files : null;
    // The API lists at most 300 files; a compare past that is not fully known.
    if (!files || files.length >= 300) {
      console.log('GitHub compare did not list every changed file');
      return null;
    }
    // A renamed file changes two paths; both are inputs.
    return files.flatMap((file) =>
      file.previous_filename ? [file.filename, file.previous_filename] : [file.filename],
    );
  } catch (error) {
    console.log(`GitHub compare failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const changed = fromGit() ?? (await fromGitHub());
if (changed === null) build(`the changes since ${previous.slice(0, 7)} could not be listed`);
if (changed.length === 0) build('nothing differs from the previous deployment (a redeploy)');
if (needsWebBuild(changed)) build(`web build inputs changed since ${previous.slice(0, 7)}`);

console.log(
  `skip: ${changed.length} changed path(s) since ${previous.slice(0, 7)}, none read by the web build:`,
);
for (const path of changed) console.log(`  ${path}`);
process.exit(0);
