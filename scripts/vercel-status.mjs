#!/usr/bin/env node
/**
 * `npm run deploy:status` — answer "is production actually running master?"
 * for both Vercel projects.
 *
 * Reads:
 *   - `git rev-parse origin/master` for the local source of truth;
 *   - the Vercel REST API for each project's most recent successful
 *     production deployment.
 *
 * The Vercel CLI also exposes `vercel ls` / `vercel inspect`, but parsing
 * those is brittle across CLI versions. The API is stable, and the response
 * shape is documented; the script uses it directly.
 *
 * Authentication: a Personal Access Token (`VERCEL_TOKEN`), with the
 * `VERCEL_TEAM_ID` and `VERCEL_PROJECT_ID_LANDING` / `VERCEL_PROJECT_ID_STUDIO`
 * identifying the two projects. With nothing set, the script prints a
 * helpful "what to configure" message and exits 0 — never blocks.
 *
 * Output (one row per project):
 *
 *   Landing: up to date (f1336bd)
 *   Studio:  BEHIND master by 4 commits
 */

import { spawnSync } from 'node:child_process';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM = process.env.VERCEL_TEAM_ID ?? '';
const PROJECTS = [
  {
    label: 'Landing',
    id: process.env.VERCEL_PROJECT_ID_LANDING ?? '',
    url: 'kingfisher-chess.vercel.app',
  },
  {
    label: 'Studio',
    id: process.env.VERCEL_PROJECT_ID_STUDIO ?? '',
    url: 'kingfisher-roan.vercel.app',
  },
];

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
  console.log('Set VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID_LANDING,');
  console.log('and VERCEL_PROJECT_ID_STUDIO to enable this gate.');
  exit(0);
}

const fetchDeployment = async (projectId) => {
  if (!projectId) return null;
  const url = new URL(
    `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=1`,
  );
  if (TEAM) url.searchParams.set('teamId', TEAM);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!response.ok) {
    throw new Error(`Vercel API responded ${response.status} for ${projectId}`);
  }
  const body = await response.json();
  const deployment = body.deployments?.[0];
  if (!deployment) return null;
  const meta = deployment.meta?.githubCommitSha ?? null;
  return {
    sha: typeof meta === 'string' ? meta : null,
    state: deployment.state ?? 'UNKNOWN',
    url: deployment.url ?? null,
    created: deployment.createdAt ?? null,
  };
};

const commitCount = (() => {
  const result = spawnSync('git', ['rev-list', '--count', 'HEAD'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  return (result.stdout ?? '').trim();
})();

const fetchBehind = async (projectSha) => {
  if (!projectSha) return null;
  const result = spawnSync('git', ['rev-list', '--count', `${projectSha}..${HEAD_REV}`], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  return (result.stdout ?? '').trim();
};

const formatRow = (label, project, deployment, behind) => {
  if (!deployment)
    return `${label.padEnd(7)}: not configured (set VERCEL_PROJECT_ID_${label.toUpperCase()})`;
  if (!deployment.sha)
    return `${label.padEnd(7)}: deployment has no github commit (state=${deployment.state})`;
  if (deployment.sha === HEAD_REV)
    return `${label.padEnd(7)}: up to date (${deployment.sha.slice(0, 7)})`;
  return `${label.padEnd(7)}: BEHIND master by ${behind} commits (running ${deployment.sha.slice(0, 7)})`;
};

(async () => {
  const localCommits = Number.parseInt(commitCount, 10);
  console.log(
    `Local master HEAD: ${HEAD_REV.slice(0, 7)} (${Number.isFinite(localCommits) ? localCommits : '?'} commits)\n`,
  );
  for (const project of PROJECTS) {
    let deployment = null;
    let behind = '?';
    try {
      deployment = await fetchDeployment(project.id);
      const count = await fetchBehind(deployment?.sha);
      behind = count ?? '?';
    } catch (error) {
      console.error(`${project.label}: API error — ${error.message}`);
      continue;
    }
    console.log(formatRow(project.label, project, deployment, behind));
  }
})();
