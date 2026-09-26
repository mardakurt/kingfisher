#!/usr/bin/env node
/**
 * Screenshots of chosen pages, for before-and-after review (Phase 86).
 *
 *   node scripts/capture-pages.mjs --out <dir> [--base http://localhost:3210]
 *        [--pages daily,season,...] [--seed]
 *
 * Each page at a 13-inch MacBook window (1280×800) and a large one
 * (1728×1117), light and dark, full page and scrolled to the bottom — where
 * content meeting the sidebar shows. `--seed` first imports 200 games of the
 * repository's bench fixture into My games in a fresh browser profile, so the
 * pages that read games have something to show; without it every page is
 * captured empty, which is the other state worth seeing.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = { out: null, base: 'http://localhost:3210', pages: null, seed: false };
for (let i = 2; i < argv.length; i += 1) {
  if (argv[i] === '--out') args.out = argv[++i];
  else if (argv[i] === '--base') args.base = argv[++i];
  else if (argv[i] === '--pages') args.pages = argv[++i].split(',');
  else if (argv[i] === '--seed') args.seed = true;
}
if (!args.out) throw new Error('--out is required');
const PAGES = args.pages ?? [
  'daily',
  'season',
  'endgame',
  'scoresheet',
  'similar',
  'team',
  'opening-files',
];
const SIZES = [
  { name: 'mbp13', width: 1280, height: 800 },
  { name: 'large', width: 1728, height: 1117 },
];
mkdirSync(args.out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${args.base}/analysis`);
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
  await page.evaluate((theme) => {
    localStorage.setItem('kingfisher.preferences', JSON.stringify({ state: { theme }, version: 7 }));
  }, scheme);
  if (args.seed) {
    const pgn = readFileSync(path.join(ROOT, 'public/bench/bench-1k.pgn'), 'utf8')
      .split('\n\n[Event')
      .slice(0, 200)
      .join('\n\n[Event');
    await page.waitForFunction(() => Boolean(globalThis.__kingfisher));
    await page.evaluate(async (text) => {
      const app = globalThis.__kingfisher;
      await app.importGames(text, app.games);
    }, pgn);
  }
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const name of PAGES) {
      await page.goto(`${args.base}/${name}`);
      await page.locator('html[data-kingfisher-ready="true"]').waitFor();
      await page.waitForTimeout(1_200);
      const stem = `${name}-${size.name}-${scheme}`;
      await page.screenshot({ path: path.join(args.out, `${stem}.png`) });
      // The bottom of every scrolling region, where content meets the sidebar.
      await page.evaluate(() => {
        for (const element of document.querySelectorAll('*')) {
          if (element.scrollHeight > element.clientHeight + 4) element.scrollTop = element.scrollHeight;
        }
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(args.out, `${stem}-bottom.png`) });
    }
  }
  await context.close();
}
await browser.close();
console.log(`wrote ${PAGES.length * SIZES.length * 4} screenshots to ${args.out}`);
