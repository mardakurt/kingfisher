#!/usr/bin/env node
/**
 * Report the size of every consumer a normal clean development
 * workspace contains.
 *
 * Phase 28 sets a budget of 2.5 GB normal-clean / 3 GB hard ceiling.
 * The script is the *measurement*, not the gate. It walks the
 * directories the brief calls out — .git, node_modules, .next,
 * .packs, .archive-cache, .engine-build, .engine-fleet, public,
 * .real-scale — and prints a per-directory summary plus a top-N
 * inside each, so a developer can spot a runaway quickly.
 *
 * It deliberately does NOT inspect user data directories, tablebase
 * directories, or anything outside the project root. The brief is
 * explicit: those belong to a separate accounting.
 *
 * Usage:
 *   node scripts/size-report.mjs
 *   node scripts/size-report.mjs --top=20
 *   npm run size:report
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const topArg = argv.find((arg) => arg.startsWith('--top='));
const TOP_N = topArg ? Math.max(1, Number(topArg.slice('--top='.length))) : 10;

const SECTIONS = [
  '.git',
  'node_modules',
  '.next',
  '.packs',
  '.archive-cache',
  '.engine-build',
  '.engine-fleet',
  '.real-scale',
  'public',
  'desktop',
  'dist',
];

/*
 * Sections that are gitignored or otherwise expected to be cleaned
 * out of a normal workspace. The brief's "normal-clean" budget is
 * the size *without* these.
 */
const SECTIONS_GENERATED = new Set([
  'node_modules',
  '.next',
  '.packs',
  '.archive-cache',
  '.engine-build',
  '.engine-fleet',
  '.real-scale',
  'dist',
]);

/*
 * Files inside `desktop/` that are gitignored (per .gitignore). The
 * directory itself is committed; its build outputs are not.
 */
const DESKTOP_IGNORED = ['node_modules', 'web', 'dist', 'resources'];
function desktopPersistentBytes() {
  const desktopDir = path.join(ROOT, 'desktop');
  if (!existsSync(desktopDir)) return 0;
  let total = 0;
  const stack = [desktopDir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (DESKTOP_IGNORED.includes(entry.name)) continue;
      const entryPath = path.join(current, entry.name);
      try {
        const stat = statSync(entryPath);
        if (entry.isDirectory()) stack.push(entryPath);
        else total += stat.size;
      } catch {
        continue;
      }
    }
  }
  return total;
}

function fmt(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} kB`;
  return `${bytes} B`;
}

function totalOf(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      try {
        const stat = statSync(entryPath);
        if (entry.isDirectory()) {
          // Skip common transient dirs that are gitignored.
          if (entry.name === 'node_modules' && entryPath !== dir) continue;
          stack.push(entryPath);
        } else {
          total += stat.size;
        }
      } catch {
        continue;
      }
    }
  }
  return total;
}

function topN(dir, n) {
  if (!existsSync(dir)) return [];
  const stack = [dir];
  const top = [];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      try {
        const stat = statSync(entryPath);
        if (entry.isDirectory()) stack.push(entryPath);
        else top.push({ path: entryPath, size: stat.size });
      } catch {
        continue;
      }
    }
  }
  top.sort((a, b) => b.size - a.size);
  return top.slice(0, n);
}

const rows = SECTIONS.map((section) => {
  const full = path.join(ROOT, section);
  return { section, size: totalOf(full) };
});
const desktopPersistent = desktopPersistentBytes();
const total = rows.reduce((sum, row) => sum + row.size, 0);
const persistent =
  rows
    .filter((row) => row.section !== 'desktop' && !SECTIONS_GENERATED.has(row.section))
    .reduce((sum, row) => sum + row.size, 0) + desktopPersistent;

console.log(`Kingfisher project size report`);
console.log(`root   ${ROOT}`);
console.log(`total          ${fmt(total)}`);
console.log(`after clean     ${fmt(persistent)}  (.git, public, desktop minus ignored)`);
console.log(``);
console.log(`section                size         category`);
console.log(`-------                ----         --------`);
for (const row of rows) {
  const category = SECTIONS_GENERATED.has(row.section) ? 'gitignored' : 'persistent';
  console.log(`${row.section.padEnd(22)} ${fmt(row.size).padStart(10)}   ${category}`);
}
console.log(`desktop (committed)        ${fmt(desktopPersistent).padStart(10)}   persistent`);

console.log(``);
console.log(`Top ${TOP_N} files (across all sections)`);
const all = rows.flatMap((row) => topN(path.join(ROOT, row.section), TOP_N));
all.sort((a, b) => b.size - a.size);
for (const entry of all.slice(0, TOP_N)) {
  const relative = path.relative(ROOT, entry.path);
  console.log(`  ${fmt(entry.size).padStart(10)}  ${relative}`);
}

const BUDGET_NORMAL = 2.5e9;
const BUDGET_HARD = 3e9;
console.log(``);
console.log(`Budget: persistent <= ${fmt(BUDGET_NORMAL)} (hard ceiling ${fmt(BUDGET_HARD)})`);
if (persistent > BUDGET_HARD) {
  console.error(`PERSISTENT OVER HARD CEILING by ${fmt(persistent - BUDGET_HARD)}`);
  process.exit(2);
}
if (persistent > BUDGET_NORMAL) {
  console.warn(`PERSISTENT OVER NORMAL BUDGET by ${fmt(persistent - BUDGET_NORMAL)}`);
}
