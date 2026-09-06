#!/usr/bin/env node
/**
 * Run electron-builder, with the one thing it cannot be told in a config file.
 *
 * electron-builder refuses an output directory whose path contains characters
 * a shell would treat specially, and reports it as "Invalid output directory"
 * without saying which character or which directory. A checkout under a path
 * with an `&` in it — this one — cannot write to `desktop/dist` at all.
 *
 * So the output directory is chosen here: `desktop/dist` when the repository
 * path allows it, and a directory beside the system temporary directory when
 * it does not. `KINGFISHER_DESKTOP_OUT` overrides both, and is exported so
 * that `npm run desktop:smoke -- --packaged` looks in the same place without
 * being told twice.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, '..');

/** The characters electron-builder rejects in an output path. */
const SHELL_SPECIAL = /[&|;<>()$`\\"' *?[\]{}~!#]/;

const chosen =
  process.env.KINGFISHER_DESKTOP_OUT ??
  (SHELL_SPECIAL.test(DESKTOP)
    ? path.join(tmpdir(), 'kingfisher-desktop-dist')
    : path.join(DESKTOP, 'dist'));

if (chosen !== path.join(DESKTOP, 'dist')) {
  console.log(`Output directory: ${chosen}`);
  if (!process.env.KINGFISHER_DESKTOP_OUT) {
    console.log('(the repository path contains a character electron-builder refuses)');
  }
  console.log('');
}

const result = spawnSync(
  'npx',
  ['electron-builder', ...process.argv.slice(2), `-c.directories.output=${chosen}`],
  { cwd: DESKTOP, stdio: 'inherit', env: { ...process.env, KINGFISHER_DESKTOP_OUT: chosen } },
);
process.exit(result.status ?? 1);
