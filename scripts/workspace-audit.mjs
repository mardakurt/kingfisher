#!/usr/bin/env node
/**
 * `npm run workspace:audit` — sanity-check the Kingfisher local layout.
 *
 * Reports:
 *   - the canonical repo path and HEAD;
 *   - which cache directories exist under ~/Library/Caches/Kingfisher/;
 *   - any directory under the user's ~/Desktop/Projects/ that looks like a
 *     Kingfisher checkout or worktree left behind.
 *
 * The script is deliberately read-only. It never moves or deletes anything;
 * that is a manual operation, performed only after the maintainer has read
 * the report. It does not scan the entire home directory; the brief said
 * "do NOT scan the owner's entire home directory by default", and this
 * implementation honours that.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT_RAW = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// `new URL(...).pathname` returns a percent-encoded path. On filesystems
// that include spaces (the common Mac case) `git rev-parse` will refuse it,
// so decode once up front.
const ROOT = decodeURIComponent(ROOT_RAW);
const HOME = homedir();
const CACHE_ROOT = join(HOME, 'Library', 'Caches', 'Kingfisher');
const PROJECTS_DIR = join(HOME, 'Desktop', 'Projects');

const readText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

const gitHead = (cwd) => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
};

const isKingfisherCheckout = (path) => {
  const packageJson = join(path, 'package.json');
  if (!existsSync(packageJson)) return false;
  const text = readText(packageJson);
  if (!text) return false;
  return /"name"\s*:\s*"kingfisher"/.test(text);
};

const reportRepo = () => {
  const head = gitHead(ROOT);
  const manifest = JSON.parse(readText(join(ROOT, 'package.json')) ?? '{}');
  console.log('Canonical source repo');
  console.log(`  path: ${ROOT}`);
  console.log(`  HEAD: ${head ?? 'unknown'}`);
  console.log(`  version: ${manifest.version ?? 'unknown'}`);
  console.log('');
};

const reportCache = () => {
  console.log('External cache (~/Library/Caches/Kingfisher/)');
  if (!existsSync(CACHE_ROOT)) {
    console.log('  (does not exist yet)');
    console.log('');
    return;
  }
  for (const name of readdirSync(CACHE_ROOT).sort()) {
    const path = join(CACHE_ROOT, name);
    const stat = statSync(path);
    console.log(`  ${name}${stat.isDirectory() ? '/' : ''}`);
  }
  console.log('');
};

const reportSuspectProjects = () => {
  if (!existsSync(PROJECTS_DIR)) {
    console.log(`Suspect directories: ${PROJECTS_DIR} does not exist`);
    console.log('');
    return;
  }
  const found = [];
  for (const name of readdirSync(PROJECTS_DIR)) {
    if (name.startsWith('.')) continue;
    const path = join(PROJECTS_DIR, name);
    if (!statSync(path).isDirectory()) continue;
    if (isKingfisherCheckout(path)) {
      const head = gitHead(path);
      const isWorktree = existsSync(join(path, '.git')) && statSync(join(path, '.git')).isFile();
      found.push({
        path,
        head,
        worktree: isWorktree,
      });
    }
  }
  if (found.length === 0) {
    console.log('Suspect directories under ~/Desktop/Projects/');
    console.log('  (none — clean)');
    console.log('');
    return;
  }
  console.log('Suspect directories under ~/Desktop/Projects/');
  for (const entry of found) {
    console.log(`  ${entry.path}`);
    console.log(`    HEAD: ${entry.head ?? 'unknown'}`);
    console.log(`    worktree: ${entry.worktree ? 'yes (git pointer file present)' : 'no'}`);
  }
  console.log('');
};

const reportLargeInRepo = () => {
  console.log('Large suspicious directories inside the source repo');
  const suspicious = ['node_modules', '.next', '.engine-build', '.engine-fleet', '.packs'];
  for (const name of suspicious) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    const stat = statSync(path);
    if (!stat.isDirectory()) continue;
    console.log(`  ${name}/ — present (size unknown; should be ignored or external)`);
  }
  console.log('');
};

console.log(`Workspace audit — run by ${userInfo().username}`);
console.log('');
reportRepo();
reportCache();
reportSuspectProjects();
reportLargeInRepo();
