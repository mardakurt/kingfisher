#!/usr/bin/env node
/** Remove only named rebuildable outputs. Never follow links into other trees. */
import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { developmentPaths } from './development-cache.mjs';

export const LOCAL_OUTPUTS = [
  '.next',
  'out',
  'dist',
  'test-results',
  'playwright-report',
  '.playwright-mcp',
  'desktop/web',
  'desktop/dist',
  'desktop/resources',
];
export function cleanDevelopment(root, { dryRun = false } = {}) {
  const base = realpathSync(root);
  for (const relative of LOCAL_OUTPUTS) {
    const target = path.join(base, relative);
    if (!existsSync(target)) continue;
    // A symlinked desktop parent must not turn cleanup into external deletion.
    const parent = realpathSync(path.dirname(target));
    if (parent !== base && !parent.startsWith(base + path.sep))
      throw new Error(`Refusing external parent: ${relative}`);
    console.log(`${dryRun ? 'Would remove' : 'Removing'} ${target}`);
    if (!dryRun) rmSync(target, { recursive: !lstatSync(target).isSymbolicLink(), force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  if (process.argv.includes('--cache')) {
    // Explicit category selection prevents a typo in CACHE_DIR from deleting a home or disk.
    const category = process.argv.find((a) => a.startsWith('--category='))?.split('=')[1];
    if (!category || !['archives', 'dataBuilds', 'engineBuilds', 'fleet'].includes(category)) {
      console.log('Cache paths (no files removed):', developmentPaths);
      console.log(
        'Prune a disposable category with --category=archives|dataBuilds|engineBuilds|fleet --delete. Stop builds using that category first.',
      );
    } else {
      const target = developmentPaths[category];
      console.log(`Cache category ${category}: ${target}`);
      // Require the standard category leaf. Custom per-category paths can be pruned manually.
      const leaves = {
        archives: 'archives',
        dataBuilds: 'data-builds',
        engineBuilds: 'engine-builds',
        fleet: process.env.KINGFISHER_CACHE_DIR ? 'engine-tests' : 'tests',
      };
      if (path.basename(target) !== leaves[category])
        throw new Error('Refusing nonstandard cache path; inspect and prune it manually.');
      if (process.argv.includes('--delete')) rmSync(target, { recursive: true, force: true });
    }
  } else cleanDevelopment(root, { dryRun: process.argv.includes('--dry-run') });
}
