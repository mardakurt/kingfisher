#!/usr/bin/env node
/**
 * `npm run test:no-skips` — fail the gate if any test code uses a
 * skip construct.
 *
 * Phase 40 ships zero skipped automated tests as a hard
 * requirement. To prevent accidental regression the same gate
 * has to keep working: future commits that reintroduce
 * `test.skip(...)`, `describe.skip`, `xit(`, `xtest(`,
 * `test.todo`, `skipIf(`, etc. fail locally and in CI without
 * having to wait for `npm test`.
 *
 * The scan is purely static. Vitest's reporter already enforces
 * the runtime side (the test summary reports a non-zero
 * `skipped` count and the build fails); what this script adds is
 * a single-purpose check that runs in under a second and can be
 * called from `npm run check`, pre-commit hooks, and CI.
 *
 * Allowed escape hatches (explicitly named, not "skip"):
 *
 *   - The text "describe.skip" in a non-test file (for example,
 *     a comment that warns a future reader not to do it) — we
 *     scan only test/spec/config files below.
 *   - Comments in `docs/reports/` and other historical
 *     handovers — those describe skips that were already
 *     eliminated and stay there for context.
 *
 * Anything else fails.
 *
 * Usage:
 *   node scripts/test-no-skips.mjs
 *   npm run test:no-skips
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SCAN_DIRS = [
  'src',
  'companion',
  'scripts',
  'desktop',
  'e2e',
];

const SCAN_CONFIGS = [
  'vitest.config.mts',
  'playwright.config.ts',
];

/**
 * Patterns we treat as prohibited skips. The list is exhaustive
 * for the test runners Kingfisher uses (Vitest and Playwright).
 *
 * - `test.skip(...)`, `it.skip(...)`, `describe.skip(...)`:
 *   skip the test.
 * - `test.todo(...)`, `it.todo(...)`, `describe.todo(...)`:
 *   placeholders that count as a skip when the test runner
 *   reports `todo` together with `skipped`.
 * - `test.fixme(...)`, `it.fixme(...)`: pending tests that the
 *   runner excludes.
 * - `xit(...)`, `xdescribe(...)`, `xtest(...)`: explicit
 *   skip-prefixed forms.
 * - `test.skipIf(...)`, `test.runIf(...)`: conditional skip
 *   helpers. We treat any use as a violation because the
 *   fallback assertion belongs in a plain `if`/active test, not
 *   a runner-level branch.
 */
const SKIP_PATTERNS = [
  { re: /\btest\s*\.\s*skip\s*\(/g, name: 'test.skip' },
  { re: /\bit\s*\.\s*skip\s*\(/g, name: 'it.skip' },
  { re: /\bdescribe\s*\.\s*skip\s*\(/g, name: 'describe.skip' },
  /* Conditional references such as `condition ? describe : describe.skip`
     also count as skips — the runner sees the .skip either way.
     This pattern only fires when `.skip` is NOT followed by `(`
     so we do not double-flag the regular call form above. */
  { re: /\bdescribe\s*\.\s*skip\b(?!\s*\()/g, name: 'describe.skip-reference' },
  { re: /\btest\s*\.\s*skipIf\s*\(/g, name: 'test.skipIf' },
  { re: /\btest\s*\.\s*runIf\s*\(/g, name: 'test.runIf' },
  { re: /\btest\s*\.\s*todo\s*\(/g, name: 'test.todo' },
  { re: /\bit\s*\.\s*todo\s*\(/g, name: 'it.todo' },
  { re: /\bdescribe\s*\.\s*todo\s*\(/g, name: 'describe.todo' },
  { re: /\btest\s*\.\s*fixme\s*\(/g, name: 'test.fixme' },
  { re: /\bit\s*\.\s*fixme\s*\(/g, name: 'it.fixme' },
  { re: /\bxit\s*\(/g, name: 'xit' },
  { re: /\bxdescribe\s*\(/g, name: 'xdescribe' },
  { re: /\bxtest\s*\(/g, name: 'xtest' },
];

const SKIP_LINE_PATTERN = /[\w$.]*skip[\w$.]*\s*\(/g;

const TEST_FILE_PATTERN = /\.(test|spec)\.(?:[cm]?[jt]s|[jt]sx?)$/i;

const SKIP_KEYWORDS = [
  'skip',
  'todo',
  'fixme',
  'xit',
  'xdescribe',
  'xtest',
  'skipIf',
  'runIf',
];

const SKIP_REPORT_LIMIT = 25;

function collectFiles(start) {
  const out = [];
  const stack = [start];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === 'playwright-report' ||
          entry.name === 'test-results' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === 'build'
        ) {
          continue;
        }
        stack.push(full);
      } else if (entry.isFile()) {
        if (TEST_FILE_PATTERN.test(entry.name)) out.push(full);
      }
    }
  }
  return out;
}

function scanContent(rel, content) {
  const violations = [];
  const seen = new Set();
  for (const { re, name } of SKIP_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content))) {
      const upto = content.slice(0, match.index);
      const lineStart = upto.lastIndexOf('\n') + 1;
      const lineEnd = content.indexOf('\n', match.index);
      const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim();
      // Allow documentation: a comment that warns about the
      // pattern but does not invoke it. A real call always has
      // an open paren immediately after the keyword, which is
      // what these regexes match.
      if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) continue;
      const key = `${rel}::${match.index}::${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({ file: rel, name, line });
    }
  }
  return violations;
}

function scanConfigContent(rel, content) {
  const violations = [];
  // Strip block + line comments before scanning config files.
  // The skip keyword must appear in executable code, not in a
  // explanation of why we don't use it.
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const kw of SKIP_KEYWORDS) {
    const re = new RegExp(`(?<![A-Za-z0-9_])${kw}(?![A-Za-z0-9_])`, 'g');
    let m;
    while ((m = re.exec(stripped))) {
      const upto = stripped.slice(0, m.index);
      const lineStart = upto.lastIndexOf('\n') + 1;
      const lineEnd = stripped.indexOf('\n', m.index);
      const line = stripped.slice(lineStart, lineEnd === -1 ? stripped.length : lineEnd).trim();
      violations.push({ file: rel, name: kw, line });
    }
  }
  return violations;
}

const violations = [];

for (const dir of SCAN_DIRS) {
  const full = join(ROOT, dir);
  if (!exists(full)) continue;
  for (const file of collectFiles(full)) {
    const content = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);
    violations.push(...scanContent(rel, content));
  }
}

for (const cfg of SCAN_CONFIGS) {
  const full = join(ROOT, cfg);
  if (!exists(full)) continue;
  const content = readFileSync(full, 'utf8');
  violations.push(...scanConfigContent(relative(ROOT, full), content));
}

if (violations.length === 0) {
  console.log('test:no-skips — OK');
  console.log('  No prohibited skip constructs found in test code or config.');
  process.exit(0);
}

console.error('test:no-skips — FAILED');
console.error(`  Found ${violations.length} prohibited skip construct(s):`);
const sample = violations.slice(0, SKIP_REPORT_LIMIT);
for (const v of sample) {
  console.error(`    ${v.file}  →  ${v.name}`);
  console.error(`      ${v.line}`);
}
if (violations.length > SKIP_REPORT_LIMIT) {
  console.error(`    ... and ${violations.length - SKIP_REPORT_LIMIT} more`);
}
console.error('');
console.error(
  '  Skipped automated tests are not allowed. Convert the test to an active deterministic assertion, or remove the misleading skipped test and add a real fallback test.',
);
process.exit(1);

function exists(p) {
  try {
    return statSync(p).isFile() || statSync(p).isDirectory();
  } catch {
    return false;
  }
}
