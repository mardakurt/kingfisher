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
import { createRequire } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, '..');

/**
 * The characters electron-builder rejects in an output path.
 *
 * The backslash is excluded on Windows, where it is the path separator and
 * not a metacharacter: including it meant every Windows path matched, so the
 * build always diverted to the temporary directory and always printed a
 * message about a character the path did not contain.
 */
const SHELL_SPECIAL =
  process.platform === 'win32' ? /[&|;<>()$`"' *?[\]{}~!#]/ : /[&|;<>()$`\\"' *?[\]{}~!#]/;

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

/*
  electron-builder's own CLI, run under this Node.

  Not `npx`: npm's shims are `.cmd` files on Windows and, since the fix for
  CVE-2024-27980, Node refuses to spawn one without a shell — the first Windows
  packaging run got no further than `spawnSync npx ENOENT`. Resolving the CLI
  and running it directly needs no shell on any platform, which also means the
  arguments below can never be read as shell syntax.
*/
const require_ = createRequire(import.meta.url);
const builder = path.join(
  path.dirname(require_.resolve('electron-builder/package.json')),
  require_('electron-builder/package.json').bin['electron-builder'],
);

const result = spawnSync(
  process.execPath,
  [builder, ...process.argv.slice(2), `-c.directories.output=${chosen}`],
  { cwd: DESKTOP, stdio: 'inherit', env: { ...process.env, KINGFISHER_DESKTOP_OUT: chosen } },
);
process.exit(result.status ?? 1);
