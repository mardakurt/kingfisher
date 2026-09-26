#!/usr/bin/env node
/**
 * The search code the companion runs, generated from the application's own
 * TypeScript rather than written twice (Phase 85).
 *
 * The companion is plain Node and cannot import `src/`. The three modules it
 * needs — the material matcher, the route matcher and the compact line index
 * — have no value imports outside `src/search`, so their types are stripped
 * with Node's own `stripTypeScriptTypes` and the result written to
 * `companion/src/shared/`. `companion/src/shared.test.mjs` regenerates them
 * and fails if the committed copies differ, so an edit to the TypeScript that
 * is not regenerated cannot ship.
 *
 *   npm run companion:shared            # write
 *   npm run companion:shared -- --check # fail if out of date
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SHARED = ['material-query', 'route', 'line-index'];
const OUT = path.join(ROOT, 'companion', 'src', 'shared');

export function generate(name) {
  const source = readFileSync(path.join(ROOT, 'src', 'search', `${name}.ts`), 'utf8');
  for (const match of source.matchAll(/^import\s+(?!type\b)[^;]*from\s+'([^']+)'/gm)) {
    if (!match[1].startsWith('./')) {
      throw new Error(
        `${name}.ts has a value import from ${match[1]}; the companion cannot load it`,
      );
    }
  }
  const stripped = stripTypeScriptTypes(source, { mode: 'strip' })
    .replace(/from '\.\/([\w-]+)'/g, "from './$1.mjs'")
    // Node preserves the width of removed types with spaces (and occasionally
    // en spaces). Keep the generated modules diff-clean without changing any
    // executable text.
    .replace(/[\t \u2002]+$/gm, '');
  return (
    `// GENERATED from src/search/${name}.ts by \`npm run companion:shared\`. Do not edit.\n` +
    stripped
  );
}

// pathToFileURL, not `file://${argv[1]}`: a checkout whose path has a space
// or an ampersand is URL-encoded in import.meta.url, and the plain comparison
// made the script do nothing there — `--check` included — without a word.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  mkdirSync(OUT, { recursive: true });
  let stale = 0;
  for (const name of SHARED) {
    const file = path.join(OUT, `${name}.mjs`);
    const wanted = generate(name);
    let current = null;
    try {
      current = readFileSync(file, 'utf8');
    } catch {
      current = null;
    }
    if (current === wanted) continue;
    if (check) {
      console.error(`companion/src/shared/${name}.mjs is out of date`);
      stale += 1;
    } else {
      writeFileSync(file, wanted);
      console.log(`wrote companion/src/shared/${name}.mjs`);
    }
  }
  if (stale) process.exit(1);
}
