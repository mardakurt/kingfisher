#!/usr/bin/env node
/**
 * One-time migration: move the existing .real-scale/ inside the
 * project to the external user-cache directory.
 *
 * The .real-scale/ folder is a 5+ GB SQLite database produced by
 * `node scripts/bench-real-scale.mjs`. It is gitignored but it
 * bloats the project workspace. Phase 29 moves it to the OS user
 * cache (default `~/Library/Caches/Kingfisher/real-scale` on macOS,
 * `~/.cache/kingfisher/real-scale` on Linux, `%LOCALAPPDATA%\Kingfisher\Cache\real-scale`
 * on Windows) so a normal project clone stays small.
 *
 * Safe to run multiple times. The migration is a `mv`, not a copy.
 * After it runs, set `KINGFISHER_REAL_SCALE_DIR` to the new path
 * before invoking `bench-real-scale` or any tooling that reads
 * the file.
 *
 *   node scripts/migrate-external-cache.mjs              # default location
 *   KINGFISHER_REAL_SCALE_DIR=/some/where node scripts/migrate-external-cache.mjs
 */
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { realScale: externalDir } = await import('./cache-paths.mjs').then((m) => m.cachePaths);
const sourceDir = path.join(ROOT, '.real-scale');

if (!existsSync(sourceDir)) {
  console.log(`No .real-scale/ at ${sourceDir} — nothing to migrate.`);
  process.exit(0);
}
const stat = statSync(sourceDir);
if (!stat.isDirectory()) {
  console.error(`${sourceDir} is not a directory; refusing to migrate.`);
  process.exit(1);
}

mkdirSync(externalDir, { recursive: true });
const entries = ['real.sqlite', 'result.json'];
let moved = 0;
for (const entry of entries) {
  const from = path.join(sourceDir, entry);
  if (!existsSync(from)) continue;
  const to = path.join(externalDir, entry);
  if (existsSync(to)) {
    console.log(`Skip ${entry}: already exists at ${to}`);
    continue;
  }
  renameSync(from, to);
  console.log(`Moved ${entry} → ${to}`);
  moved += 1;
}

if (moved > 0) {
  try {
    const { rmdirSync } = await import('node:fs');
    rmdirSync(sourceDir);
    console.log(`Removed empty ${sourceDir}`);
  } catch (error) {
    console.log(`Left ${sourceDir} in place (not empty or remove failed)`);
  }
}

console.log('');
console.log(`External real-scale path: ${externalDir}`);
console.log(`Run future commands with: KINGFISHER_REAL_SCALE_DIR=${externalDir}`);