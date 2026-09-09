#!/usr/bin/env node
/**
 * One-time migration: move the project's in-tree heavy cache
 * directories to the external user-cache location.
 *
 * Phase 29 (PART AY-AZ, BA-BC) demands that the project workspace
 * stay small. A normal `git clone` should not need to download
 * five-plus gigabytes of upstream Lichess archives, candidate pack
 * builds, or the engine fleet. Every directory this script moves
 * is already gitignored, so it does not bloat git history; the
 * issue is purely on-disk development comfort.
 *
 * Targets and their default external paths:
 *
 *   .archive-cache → archiveCache
 *   .packs         → packs
 *   .engine-build  → engineBuild
 *   .engine-fleet  → engineFleet
 *   .real-scale    → realScale  (already migrated by the previous
 *                                 step; this script tolerates the
 *                                 "nothing to do" case)
 *
 * Each can be overridden by its KINGFISHER_*_DIR environment
 * variable. The script is a `mv`, not a copy; it does not waste
 * disk. If the destination already has files, the source file is
 * kept (we never overwrite user data).
 *
 * Usage:
 *   node scripts/migrate-external-cache.mjs
 *   node scripts/migrate-external-cache.mjs --only archiveCache
 *   KINGFISHER_PACKS_DIR=/some/where node scripts/migrate-external-cache.mjs
 *
 * The first run prints a summary of where the bytes went. Re-runs
 * are safe.
 */
import { existsSync, mkdirSync, renameSync, rmdirSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { cachePaths } = await import('./cache-paths.mjs');

const argv = process.argv.slice(2);
const onlyArg = argv.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;

const TARGETS = [
  { source: '.archive-cache', external: cachePaths.archiveCache, label: 'archiveCache' },
  { source: '.packs', external: cachePaths.packs, label: 'packs' },
  { source: '.engine-build', external: cachePaths.engineBuild, label: 'engineBuild' },
  { source: '.engine-fleet', external: cachePaths.engineFleet, label: 'engineFleet' },
  { source: '.real-scale', external: cachePaths.realScale, label: 'realScale' },
];

let totalMoved = 0;
let totalSkipped = 0;

for (const target of TARGETS) {
  if (only && !only.has(target.label)) continue;
  const sourceDir = path.join(ROOT, target.source);
  if (!existsSync(sourceDir)) {
    console.log(`Skip ${target.source}: does not exist`);
    totalSkipped += 1;
    continue;
  }
  const stat = statSync(sourceDir);
  if (!stat.isDirectory()) {
    console.error(`Refuse ${target.source}: not a directory`);
    continue;
  }
  const entries = readdirSync(sourceDir);
  if (entries.length === 0) {
    try {
      rmdirSync(sourceDir);
      console.log(`Removed empty ${sourceDir}`);
    } catch {
      console.log(`Left empty ${sourceDir}`);
    }
    continue;
  }
  mkdirSync(target.external, { recursive: true });
  let moved = 0;
  let kept = 0;
  for (const entry of entries) {
    const from = path.join(sourceDir, entry);
    const to = path.join(target.external, entry);
    if (existsSync(to)) {
      kept += 1;
      continue;
    }
    try {
      const entryStat = statSync(from);
      if (entryStat.isDirectory()) {
        // Recursive move. Node's fs.cpSync with recursive:true
        // is the safe cross-platform equivalent. We do not have
        // to copy through Node; a rename works if the destination
        // is on the same filesystem. Use cp+rm as the safe path
        // because rename across mount points can fail.
        const { cpSync } = await import('node:fs');
        cpSync(from, to, { recursive: true });
        // Best-effort cleanup of the source subtree.
        const { rmSync } = await import('node:fs');
        rmSync(from, { recursive: true, force: true });
      } else {
        renameSync(from, to);
      }
      moved += 1;
    } catch (error) {
      console.error(`Failed to move ${from} -> ${to}: ${error.message}`);
    }
  }
  totalMoved += moved;
  totalSkipped += kept;
  console.log(`${target.source} → ${target.external}: moved=${moved} kept=${kept}`);
  if (moved > 0 || kept === 0) {
    try {
      rmdirSync(sourceDir);
      console.log(`Removed empty ${sourceDir}`);
    } catch {
      /* not empty or not removable */
    }
  }
}

console.log('');
console.log(`Total moved: ${totalMoved}, kept (already at destination): ${totalSkipped}`);
console.log('External paths summary:');
for (const target of TARGETS) {
  console.log(`  ${target.label.padEnd(14)} ${target.external}`);
}
