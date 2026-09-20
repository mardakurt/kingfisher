#!/usr/bin/env node
/**
 * `npm run deploy:status` — answer "is production actually running master?"
 *
 * One Vercel project (`kingfisher`) serves both public hostnames, and since
 * 2026-09-13 it is linked to `mardakurt/kingfisher` with `master` as the
 * production branch, so every push deploys. This script is the check that
 * the deployment Vercel promoted is the commit origin/master holds.
 *
 * Reads:
 *   - `git rev-parse origin/master` for the local source of truth;
 *   - the Vercel REST API for the project's most recent production
 *     deployment (the CLI's `vercel ls` output is brittle across versions).
 *
 * Authentication: `VERCEL_TOKEN`. The project and team ids come from
 * `.vercel/project.json` (written by `vercel link`), or from
 * `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` when set. With no token, the
 * script says what to configure and exits 0 — it never blocks.
 *
 * Output:
 *
 *   kingfisherchess.app: up to date (f1336bd)
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { needsWebBuild } from './vercel-build-scope.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const TOKEN = process.env.VERCEL_TOKEN;
const LINK = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../.vercel/project.json', import.meta.url), 'utf8'));
  } catch {
    return {};
  }
})();
const TEAM = process.env.VERCEL_TEAM_ID ?? LINK.orgId ?? '';
const PROJECT_ID = process.env.VERCEL_PROJECT_ID ?? LINK.projectId ?? '';
const PROJECTS = [{ label: 'kingfisherchess.app', id: PROJECT_ID, url: 'kingfisherchess.app' }];

const HEAD_REV = (() => {
  const result = spawnSync('git', ['rev-parse', 'origin/master'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  return (result.stdout ?? '').trim();
})();

if (!HEAD_REV) {
  console.error('Could not read origin/master. Are you inside a git checkout?');
  exit(1);
}

if (!TOKEN) {
  console.log('VERCEL_TOKEN is not set — skipping deployment status check.');
  console.log('Set VERCEL_TOKEN (a Vercel personal access token) to enable this gate;');
  console.log('the project and team ids are read from .vercel/project.json.');
  exit(0);
}

/**
 * The newest production deployments, newest first. Several rather than
 * one: a build the `ignoreCommand` skipped is recorded as a `CANCELED`
 * deployment in front of the one that is serving, and the answer to "is
 * production the latest commit?" needs both — what serves, and whether what
 * came after it was skipped on purpose.
 */
const fetchDeployments = async (projectId) => {
  if (!projectId) return null;
  const url = new URL(
    `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=8`,
  );
  if (TEAM) url.searchParams.set('teamId', TEAM);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!response.ok) {
    throw new Error(`Vercel API responded ${response.status} for ${projectId}`);
  }
  const body = await response.json();
  return (body.deployments ?? []).map((deployment) => {
    const meta = deployment.meta?.githubCommitSha ?? null;
    return {
      sha: typeof meta === 'string' ? meta : null,
      state: deployment.state ?? 'UNKNOWN',
      url: deployment.url ?? null,
      created: deployment.createdAt ?? null,
    };
  });
};

const commitCount = (() => {
  const result = spawnSync('git', ['rev-list', '--count', 'HEAD'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  return (result.stdout ?? '').trim();
})();

/**
 * Whether the commits since the deployed one changed anything the web build
 * reads. `vercel.json`'s `ignoreCommand` skips deployments for commits that
 * did not (docs, the browser suite, the desktop shell — see
 * `vercel-build-scope.mjs`), so the deployed commit is allowed to be older
 * than `origin/master` exactly when this says so. A commit git cannot reach
 * answers "changed": the skip is claimed only when it can be shown.
 */
const skippedOnPurpose = (projectSha) => {
  const result = spawnSync('git', ['diff', '--name-only', projectSha, HEAD_REV], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  if (result.status !== 0) return 'unknown';
  const changed = (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (changed.length === 0) return 'same';
  return needsWebBuild(changed) ? 'changed' : 'skipped';
};

/**
 * "up to date" means the commit is *serving*, not merely submitted.
 *
 * The newest production deployment is the one Vercel is building, and for
 * the minutes a build takes its commit is HEAD while the public origin still
 * serves the previous one. Phase 53 caught this row saying "up to date
 * (d52c3bd)" while `/engine/stockfish/manifest.json` on the live host was
 * still the deployment before — the gate in `after-a-fix.md` step 10 was
 * satisfiable by a build that had not finished, or had failed. So the state
 * is part of the answer: only `READY` is up to date; `BUILDING`, `QUEUED`
 * and `INITIALIZING` say so and ask for a re-run; `ERROR` and `CANCELED`
 * are a failure, printed as one and exiting non-zero.
 */
const formatRow = (label, project, deployments, behindOf) => {
  if (!deployments)
    return `${label}: not configured (no .vercel/project.json and no VERCEL_PROJECT_ID)`;
  const newest = deployments[0];
  if (!newest) return `${label}: no production deployment yet`;
  if (!newest.sha) return `${label}: deployment has no github commit (state=${newest.state})`;
  const newestShort = newest.sha.slice(0, 7);
  const servingIndex = deployments.findIndex((d) => d.state === 'READY' && d.sha);
  const serving = servingIndex === -1 ? null : deployments[servingIndex];
  if (serving?.sha === HEAD_REV) return `${label}: up to date (${serving.sha.slice(0, 7)})`;
  /*
    Builds the ignoreCommand skipped are recorded as CANCELED deployments in
    front of the one that serves. They are the intended path exactly when
    every deployment newer than the serving one is CANCELED and the commits
    since it change nothing the web build reads — the same rule the
    ignoreCommand applied. Anything else CANCELED is a failure.
  */
  if (
    serving &&
    servingIndex > 0 &&
    deployments.slice(0, servingIndex).every((d) => d.state === 'CANCELED') &&
    skippedOnPurpose(serving.sha) === 'skipped'
  ) {
    return `${label}: up to date (${serving.sha.slice(0, 7)}; the ${behindOf(serving.sha)} commit(s) since changed nothing the web build reads, so Vercel skipped them)`;
  }
  if (newest.state === 'ERROR' || newest.state === 'CANCELED') {
    process.exitCode = 1;
    return `${label}: deployment of ${newestShort} ${newest.state} — the live site still serves the previous deployment`;
  }
  if (newest.state !== 'READY') {
    return `${label}: ${newestShort} is ${newest.state} — not yet serving; re-run in a minute`;
  }
  if (skippedOnPurpose(newest.sha) === 'skipped') {
    return `${label}: up to date (${newestShort}; the ${behindOf(newest.sha)} commit(s) since changed nothing the web build reads, so Vercel skipped them)`;
  }
  return `${label}: BEHIND master by ${behindOf(newest.sha)} commits (running ${newestShort})`;
};

(async () => {
  const localCommits = Number.parseInt(commitCount, 10);
  console.log(
    `Local master HEAD: ${HEAD_REV.slice(0, 7)} (${Number.isFinite(localCommits) ? localCommits : '?'} commits)\n`,
  );
  for (const project of PROJECTS) {
    let deployments = null;
    try {
      deployments = await fetchDeployments(project.id);
    } catch (error) {
      console.error(`${project.label}: API error — ${error.message}`);
      continue;
    }
    const behindOf = (sha) => {
      const result = spawnSync('git', ['rev-list', '--count', `${sha}..${HEAD_REV}`], {
        encoding: 'utf8',
        cwd: ROOT,
      });
      return (result.stdout ?? '').trim() || '?';
    };
    console.log(formatRow(project.label, project, deployments, behindOf));
  }
})();
