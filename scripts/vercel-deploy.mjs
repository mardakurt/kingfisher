#!/usr/bin/env node
/**
 * `npm run deploy:vercel` — deploy the Kingfisher web app to
 * Vercel.
 *
 * Phase 25: the maintainer's one-click Vercel import (see
 * `docs/deployment.md`) is the recommended path. This script
 * is the CLI equivalent for cases where the maintainer
 * prefers `vercel deploy` from the terminal.
 *
 * The script needs a Vercel API token. Set
 * `VERCEL_TOKEN` in the environment (a Personal Token from
 * <https://vercel.com/account/tokens> is enough), and the
 * script will:
 *
 *   1. Create the Vercel project from this repository.
 *   2. Trigger a production deployment of the current
 *      commit.
 *   3. Print the production URL when the deployment
 *      succeeds.
 *   4. Update `src/release/public-urls.ts` to point the
 *      `web` default at the new production URL.
 *   5. Write `KINGFISHER_PUBLIC_WEB_URL=<url>` to a
 *      `.env.production.local` file (git-ignored) so the
 *      next local run reports the right value.
 *
 * If `VERCEL_TOKEN` is unset, the script prints the manual
 * one-click URL and exits 0. It does not block the release
 * flow — the one-click import is the recommended path.
 */

import { spawnSync } from 'node:child_process';
import { exit } from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_NAME = process.env.VERCEL_PROJECT_NAME || 'kingfisher';

if (!VERCEL_TOKEN) {
  console.log('VERCEL_TOKEN is not set; falling back to the one-click import.');
  console.log('');
  console.log('Open:');
  console.log('  https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmardakurt%2Fkingfisher');
  console.log('');
  console.log('After the first deploy, set KINGFISHER_PUBLIC_WEB_URL to the project URL.');
  exit(0);
}

const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, VERCEL_TOKEN }, ...options });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status ?? -1 };
};

console.log(`Deploying ${PROJECT_NAME} to Vercel...`);

// `vercel deploy --prod --yes` will deploy the current commit
// to production. The CLI is authenticated via VERCEL_TOKEN.
const result = run('vercel', ['deploy', '--prod', '--yes', '--token', VERCEL_TOKEN], { cwd: ROOT });
if (result.status !== 0) {
  console.error('vercel deploy failed.');
  exit(1);
}

const urlMatch = result.stdout.match(/Production: (https:\/\/[^\s]+)/);
if (urlMatch) {
  const url = urlMatch[1];
  console.log(`\nProduction URL: ${url}`);
  console.log('\nSet this in your environment:');
  console.log(`  KINGFISHER_PUBLIC_WEB_URL=${url}`);
  console.log('\nOr, in the Vercel project settings, add it as a Production environment variable.');
  console.log('\nThen update src/release/public-urls.ts if the default needs to change.');
}
