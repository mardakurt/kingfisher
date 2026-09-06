#!/usr/bin/env node
/**
 * Build the web application the way the desktop shell serves it.
 *
 * The desktop shell runs the same Next application the browser does — that is
 * the point of it, and the reason there is no second renderer, no second
 * router and no second copy of the chess code. What it cannot do is assume a
 * `node_modules` tree next to the server, so this produces Next's standalone
 * output and assembles the three pieces Next deliberately leaves to the
 * packager:
 *
 *   .next/standalone/          the server, and only the modules it reached
 *   .next/static/          →   .next/standalone/.next/static
 *   public/                →   .next/standalone/public
 *
 * The result lands in `desktop/app/`, which is what `electron-builder` packs.
 *
 * Cross-origin isolation is switched on for this build and not for the web
 * one. In a browser it is a deployment decision with a real cost — COEP
 * constrains what the page may embed — and Kingfisher leaves it to whoever
 * deploys. In the desktop shell there is nothing third-party to embed and the
 * shell owns the server, so the multi-threaded engine simply works.
 *
 *   node scripts/build-desktop-web.mjs
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const OUT = path.join(ROOT, 'desktop', 'web');

const size = (dir) => {
  let total = 0;
  const walk = (p) => {
    const stat = statSync(p);
    if (!stat.isDirectory()) {
      total += stat.size;
      return;
    }
    for (const entry of readdirSync(p)) walk(path.join(p, entry));
  };
  walk(dir);
  return total;
};

console.log('Building the desktop web bundle');
console.log(`node ${process.version} · ${process.platform}-${process.arch}\n`);

execFileSync('npx', ['next', 'build'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    KINGFISHER_DESKTOP_BUILD: '1',
    KINGFISHER_CROSS_ORIGIN_ISOLATION: '1',
  },
});

if (!existsSync(path.join(STANDALONE, 'server.js'))) {
  console.error(
    '\nNext produced no standalone server. That means `output: "standalone"` did not apply — ' +
      'check that next.config.ts still reads KINGFISHER_DESKTOP_BUILD.',
  );
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.dirname(OUT), { recursive: true });
cpSync(STANDALONE, OUT, { recursive: true });
cpSync(path.join(ROOT, '.next', 'static'), path.join(OUT, '.next', 'static'), { recursive: true });
cpSync(path.join(ROOT, 'public'), path.join(OUT, 'public'), { recursive: true });

console.log(`\nAssembled ${path.relative(ROOT, OUT)}`);
for (const part of ['server.js', '.next/static', 'public']) {
  const at = path.join(OUT, part);
  const mark = existsSync(at) ? '✓' : '✗';
  const bytes = existsSync(at) ? ` ${(size(at) / 1e6).toFixed(1)} MB` : '';
  console.log(`  ${mark} ${part}${bytes}`);
}
console.log(`  total ${(size(OUT) / 1e6).toFixed(1)} MB`);
