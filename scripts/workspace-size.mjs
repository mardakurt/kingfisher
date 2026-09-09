#!/usr/bin/env node
/** Whole-workspace guard; symlinks are counted as links, never followed. */
import { lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function inspectWorkspace(root) {
  const rows = [];
  function walk(relative) {
    const full = path.join(root, relative);
    const stat = lstatSync(full);
    if (!stat.isDirectory()) {
      rows.push({ path: relative, bytes: stat.size });
      return stat.size;
    }
    return readdirSync(full).reduce((n, entry) => n + walk(path.join(relative, entry)), 0);
  }
  const bytes = walk('');
  // Compiler caches and dependency binaries can legitimately exceed 100 MB.
  // They remain in the total budget, but not the individual data-file guard.
  const large = rows.filter(
    (row) =>
      row.bytes > 100_000_000 &&
      !row.path.split(path.sep).includes('node_modules') &&
      !row.path.startsWith(`.git${path.sep}`) &&
      !row.path.startsWith(`.next${path.sep}cache${path.sep}`),
  );
  const publicBytes = rows
    .filter((r) => r.path.startsWith(`public${path.sep}`))
    .reduce((n, r) => n + r.bytes, 0);
  const failures = [
    ...(bytes > 3_000_000_000 ? [`Workspace exceeds 3 GB: ${bytes} bytes`] : []),
    ...(publicBytes > 100_000_000 ? [`Public assets exceed 100 MB: ${publicBytes} bytes`] : []),
    ...large.map((r) => `File exceeds 100 MB: ${r.path} (${r.bytes} bytes)`),
  ];
  return {
    bytes,
    publicBytes,
    failures,
    largest: rows.sort((a, b) => b.bytes - a.bytes).slice(0, 20),
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectWorkspace(fileURLToPath(new URL('..', import.meta.url)));
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
}
