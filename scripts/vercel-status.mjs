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
    return `${label}: not configured (no .vercel/project.json and no VERCEL_PROJECT_ID)`;
  if (!deployment.sha)
    return `${label}: deployment has no github commit (state=${deployment.state})`;
  if (deployment.sha === HEAD_REV) return `${label}: up to date (${deployment.sha.slice(0, 7)})`;
  return `${label}: BEHIND master by ${behind} commits (running ${deployment.sha.slice(0, 7)})`;
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
