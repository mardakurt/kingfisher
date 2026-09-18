#!/usr/bin/env node
/**
 * Phase 69 — the colour-blind annotation palette actually changes things.
 *
 * The owner reported that toggling between "Standard" and "Colour-blind"
 * in Settings → Annotation colours looked identical. Investigation showed
 * the palette *was* applied (the CSS variables resolve to the Okabe–Ito
 * set), so the failure was perception, not plumbing: the four swatches in
 * the Settings preview were so small at text-xs that the hue shift between
 * `#5fa96b` (a green) and `#0072b2` (a blue) read as "two of the same".
 *
 * This script boots the web app, walks every CSS variable the palette is
 * supposed to override, and asserts that the resolved values change
 * between the two modes. It writes the comparison to `tmp/colorblind.diff`
 * so the change is auditable from a terminal.
 *
 *   node scripts/diagnostics/phase-69-colorblind-palette.mjs
 *
 * Requires the web server running at http://localhost:3210.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

const BASE = process.env.KF_BASE_URL ?? 'http://localhost:3210';

const TOKENS = [
  '--positive',
  '--negative',
  '--caution',
  '--shape-green',
  '--shape-red',
  '--shape-blue',
  '--shape-yellow',
];

const readTokens = (page) =>
  page.evaluate((tokens) => {
    const root = getComputedStyle(document.documentElement);
    const result = {};
    for (const t of tokens) result[t] = root.getPropertyValue(t).trim();
    result['data-arrow-palette'] = document.documentElement.dataset.arrowPalette;
    return result;
  }, TOKENS);

const compare = (a, b) => {
  const diff = {};
  for (const t of TOKENS) {
    if (a[t] !== b[t]) diff[t] = { standard: a[t], colorblind: b[t] };
  }
  return diff;
};

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${BASE}/analysis`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    document.documentElement.dataset.arrowPalette = 'standard';
  });
  await page.waitForTimeout(200);
  const standard = await readTokens(page);

  await page.evaluate(() => {
    document.documentElement.dataset.arrowPalette = 'colorblind';
  });
  await page.waitForTimeout(200);
  const colorblind = await readTokens(page);

  await browser.close();

  const diff = compare(standard, colorblind);
  const expected = TOKENS.length;
  const changed = Object.keys(diff).length;

  mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
  writeFileSync(
    path.join(process.cwd(), 'tmp', 'colorblind.diff'),
    JSON.stringify({ standard, colorblind, diff }, null, 2) + '\n',
  );

  console.log(
    `palette attribute changes : ${standard['data-arrow-palette']} -> ${colorblind['data-arrow-palette']}`,
  );
  console.log(`tokens expected to change : ${expected}`);
  console.log(`tokens actually changed   : ${changed}`);
  for (const [name, values] of Object.entries(diff)) {
    console.log(`  ${name.padEnd(18)} ${values.standard} -> ${values.colorblind}`);
  }
  if (changed < expected) {
    console.error(`FAIL: ${expected - changed} token(s) did not change between palettes`);
    process.exit(1);
  }
  console.log('PASS: every annotation token shifted when the palette switched');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
