#!/usr/bin/env node
/**
 * The landing page's hero capture, from the application itself.
 *
 * A landing that shows an old interface is a claim the product no longer
 * makes, so the hero image is made from a running build rather than kept as a
 * file somebody once exported: the analysis workspace with a real Stockfish
 * search on the position after 1. e4 e5 2. Nf3 Nc6 3. Bc4, waited on until
 * the engine's arrow is on the board. Nothing is drawn or retouched; the only
 * thing hidden is Next's development badge, which is not part of the product.
 *
 *   npm run dev            # on :3210
 *   node scripts/landing-hero-capture.mjs out.png
 *   cwebp -q 82 -resize 2240 0 out.png -o public/landing/img/workspace-<date>.webp
 *
 * Record the result in THIRD_PARTY_ASSETS.md — commit, date, position, depth —
 * the way the previous captures are.
 */
import { chromium } from 'playwright-core';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/landing-hero-capture.mjs <out.png>');
  process.exit(1);
}
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
await page.goto('http://localhost:3210/analysis');
await page.locator('[data-kingfisher-ready="true"]').waitFor({ timeout: 60_000 });
const square = (name) => page.getByRole('gridcell', { name: new RegExp(`^${name},`) });
for (const [from, to] of [
  ['e2', 'e4'],
  ['e7', 'e5'],
  ['g1', 'f3'],
  ['b8', 'c6'],
  ['f1', 'c4'],
]) {
  await square(from).click();
  await square(to).click();
  await page.waitForTimeout(250);
}
await page.getByRole('button', { name: 'Start analysis (E)' }).click();
await page.locator('[data-engine-arrow-hit]').first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(6_000);
await page.mouse.move(5, 5);
await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
