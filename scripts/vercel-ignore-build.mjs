#!/usr/bin/env node
/**
 * Vercel's `ignoreCommand`: exit 0 to skip the build, 1 to build.
 *
 * Vercel runs this in the cloned checkout with `VERCEL_GIT_PREVIOUS_SHA`
 * set to the commit of the previous deployment of this branch. The paths
 * that differ between that commit and `HEAD` decide, through
 * `vercel-build-scope.mjs`, whether the web build's inputs changed. Anything
 * that stops the question being answered — no previous commit, a shallow
 * clone that cannot reach it, git failing — answers "build": a deployment
 * nobody needed is a known, bounded cost; a stale site is not.
 *
 * The one thing this never does is skip a *first* production deployment or
 * one whose predecessor cannot be named.
 */
import { spawnSync } from 'node:child_process';

import { needsWebBuild } from './vercel-build-scope.mjs';

const previous = process.env.VERCEL_GIT_PREVIOUS_SHA ?? '';
const build = (reason) => {
  console.log(`build: ${reason}`);
  process.exit(1);
};

if (!previous) build('no previous deployment to compare with');

const diff = spawnSync('git', ['diff', '--name-only', previous, 'HEAD'], { encoding: 'utf8' });
if (diff.status !== 0)
  build(
    `git could not diff ${previous.slice(0, 7)}..HEAD (${(diff.stderr ?? '').trim() || 'shallow clone?'})`,
  );

const changed = diff.stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
if (changed.length === 0) build('nothing differs from the previous deployment (a redeploy)');
if (needsWebBuild(changed)) build(`web build inputs changed since ${previous.slice(0, 7)}`);

console.log(
  `skip: ${changed.length} changed path(s) since ${previous.slice(0, 7)}, none read by the web build:`,
);
for (const path of changed) console.log(`  ${path}`);
process.exit(0);
