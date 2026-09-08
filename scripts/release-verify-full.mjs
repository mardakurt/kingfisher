#!/usr/bin/env node
/**
 * `npm run release:verify:full` — the heavy local release certification.
 *
 * Includes everything the default `release:verify` does, plus the
 *   - full Playwright browser suite;
 *   - desktop smoke (against the packaged `Kingfisher.app` when present,
 *     or the unpackaged shell otherwise);
 *   - desktop chrome geometry check;
 *   - desktop restart / lifecycle check;
 *   - desktop engine fleet qualification.
 *
 * Run this on a release commit, not on every commit. Minutes on the local
 * machine are real — the Playwright suite is the same suite that used to
 * run for 20+ minutes in remote CI.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { exit } from 'node:process';

console.log('Kingfisher full local release gate');

const steps = [
  ['Default gate', ['npm', ['run', 'release:verify', '--', '--strict-format']]],
  ['Playwright browser suite', ['npx', ['playwright', 'test']]],
  ['Desktop smoke', ['npm', ['run', 'desktop:smoke']]],
  ['Desktop window chrome', ['npm', ['run', 'desktop:chrome']]],
  ['Desktop restart lifecycle', ['npm', ['run', 'desktop:restart']]],
  ['Desktop engine fleet', ['npm', ['run', 'desktop:engines']]],
];

let failed = false;
for (const [label, [cmd, args]] of steps) {
  console.log(`\n--- ${label} ---`);
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`✗ ${label} failed (exit ${result.status ?? 'signal'})`);
    failed = true;
    break;
  }
}

if (failed) {
  console.error('\nFull release gate: NOT GREEN');
  exit(1);
}

console.log('\nFull release gate: GREEN');
