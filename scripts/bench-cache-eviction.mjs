#!/usr/bin/env node
/**
 * Cache eviction benchmark runner.
 *
 * Forks vitest with the cache-eviction benchmark and writes the
 * JSON report to docs/benchmark-reports/.
 *
 * Usage:
 *   node scripts/bench-cache-eviction.mjs
 *
 * The benchmark itself lives in
 * `scripts/bench-cache-eviction.test.ts` so it can use the
 * project's `@/` aliases and run inside vitest.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const reportDir = resolve(repoRoot, 'docs/benchmark-reports');
mkdirSync(reportDir, { recursive: true });

const args = ['run', 'scripts/bench-cache-eviction.test.ts', '--reporter=verbose'];
const child = spawn('npx', ['vitest', ...args], {
  cwd: repoRoot,
  stdio: ['inherit', 'pipe', 'inherit'],
});

let output = '';
child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});

child.on('close', (code) => {
  const match = output.match(/CACHE-EVICTION-BENCH\s*\{[\s\S]*?\n\}/);
  if (!match) {
    console.error('Cache eviction benchmark did not produce a JSON report.');
    process.exitCode = code ?? 1;
    return;
  }
  const json = match[0].replace(/^CACHE-EVICTION-BENCH\s*/, '');
  const timestamp = new Date().toISOString();
  const out = [
    '# Cache eviction benchmark report',
    '',
    `Generated: ${timestamp}`,
    '',
    '```json',
    json,
    '```',
    '',
  ].join('\n');
  const outFile = resolve(reportDir, 'phase-31-cache-eviction.md');
  writeFileSync(outFile, out, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Cache eviction benchmark written to ${outFile}`);
});
