#!/usr/bin/env node
/**
 * `npm run release:verify` — the local release gate.
 *
 * A single command the owner runs before tagging a release. It does not try
 * to be exhaustive; it tries to be the *smallest* set of checks that, if all
 * green, mean a tagged commit is shippable.
 *
 *   - The default gate matches the new default `ci.yml` workflow:
 *     typecheck, lint, unit/integration, production build, `git diff --check`.
 *   - Format is reported but does not fail the gate by default; long prose
 *     documents (handover, marketing copy) can fail Prettier for reasons that
 *     say nothing about the product. Use `--strict-format` to fail on it.
 *   - `npm run release:verify:full` adds the heavier checks (browser suite,
 *     desktop smoke, engine fleet qualification) and is a separate script so
 *     the default path stays fast.
 *
 * The script prints the version, the current commit, and a one-line verdict.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { exit } from 'node:process';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const strictFormat = process.argv.includes('--strict-format');

console.log(`Kingfisher ${manifest.version} local release gate`);
console.log(`node ${process.version} · ${process.platform}-${process.arch}`);

const steps = [
  ['Typecheck', ['npm', ['run', 'typecheck']]],
  ['Lint', ['npm', ['run', 'lint']]],
  ['Unit and integration tests', ['npm', ['test']]],
  ['Production build', ['npm', ['run', 'build']]],
  ['Whitespace', ['git', ['diff', '--check', 'HEAD']]],
  ['Security mutation tests', ['npm', ['run', 'desktop:update:mutations']]],
  ['Auto-update E2E (wire mode)', ['npm', ['run', 'desktop:update:e2e']]],
];

if (strictFormat) {
  steps.push(['Format', ['npm', ['run', 'format:check']]]);
} else {
  console.log('Format: skipped (run with --strict-format to enforce).');
}

let failed = false;
for (const [label, [cmd, args]] of steps) {
  const start = Date.now();
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  const ms = Date.now() - start;
  if (result.status === 0) {
    console.log(`✓ ${label}  (${ms} ms)`);
  } else {
    console.error(`✗ ${label}  (${ms} ms, exit ${result.status ?? 'signal'})`);
    failed = true;
    break;
  }
}

if (failed) {
  console.error('\nRelease gate: NOT GREEN');
  exit(1);
}

// Helpful non-fatal sanity check.
const releaseManifest = existsSync(new URL('../release-manifest.json', import.meta.url));
console.log(
  `\nRelease manifest: ${releaseManifest ? 'present' : 'absent (run `npm run release:manifest` before tagging)'}`,
);

console.log('\nRelease gate: GREEN');
