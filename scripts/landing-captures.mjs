#!/usr/bin/env node
/**
 * The landing page's three product images, from the application itself.
 *
 * A landing that shows an old interface is a claim the product no longer
 * makes, so the images are made from a running build rather than kept as
 * files somebody once exported. Each one is the real workspace in a state a
 * player would recognise; nothing is drawn or retouched, and the only thing
 * hidden is Next's development badge, which is not part of the product.
 *
 *   hero      the analysis workspace with a real Stockfish search on the
 *             position after 1. e4 e5 2. Nf3 Nc6 3. Bc4, waited on until the
 *             engine's arrow is on the board — the whole window, 1440 × 900
 *             at 2×.
 *   research  the Explorer's source comparison on the Najdorf, the two
 *             sources a fresh profile has, each in its own column with its
 *             own game count — the right-hand panel, cropped.
 *   engines   the engine panel a few seconds into the same search as the
 *             hero, its ranked lines and the depth it reached — cropped.
 *
 * Every capture runs on a fresh profile (the tour is turned off, nothing else
 * is set), so no personal data, no linked account and no imported game can
 * appear in it.
 *
 *   npm run dev                                   # on :3210
 *   node scripts/landing-captures.mjs <outdir>    # writes hero.png, research.png, engines.png
 *   node scripts/landing-captures.mjs <outdir> --encode
 *       # also writes the three WebP files into public/landing/img/, named
 *       # by today's date, with cwebp — the names are what LandingPage.tsx
 *       # references, so change them there in the same commit — and the
 *       # social card, og.png, 1200 × 630 from the hero (the size the
 *       # layout's Open Graph metadata declares), with sharp.
 *
 * Record the result in THIRD_PARTY_ASSETS.md — commit, date, position, depth
 * — the way the previous captures are.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright-core';

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node scripts/landing-captures.mjs <outdir> [--encode]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const encode = process.argv.includes('--encode');
const BASE = process.env.KINGFISHER_CAPTURE_URL ?? 'http://localhost:3210';
const READY = 'html[data-kingfisher-ready="true"]';

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());

/**
 * A fresh profile with the tour off, the way every browser test starts.
 *
 * Durable storage is granted up front. A browser under automation has no
 * engagement history, so `navigator.storage.persist()` answers no and the
 * sidebar says "Storage is not protected" — a true report about the
 * automation profile, and a warning that does not belong in a picture of the
 * product a person has been using. Granting the permission is what a
 * browser does for a site it has been given a reason to keep; it changes
 * nothing else in the capture.
 */
async function freshPage() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  await context.grantPermissions(['persistent-storage'], { origin: BASE }).catch(() => {
    /* Not every channel knows the permission; the notice is then in the frame. */
  });
  await context.addInitScript(() => {
    window.localStorage.setItem(
      'kingfisher.preferences',
      JSON.stringify({ state: { tourShowOnLaunch: false }, version: 5 }),
    );
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/analysis`);
  await page.locator(READY).waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  return page;
}

const square = (page, name) => page.getByRole('gridcell', { name: new RegExp(`^${name},`) });

async function play(page, moves) {
  for (const [from, to] of moves) {
    await square(page, from).click();
    await square(page, to).click();
    await page.waitForTimeout(250);
  }
}

/** The Italian, with the engine running and its best move on the board. */
async function italianWithEngine(page) {
  await play(page, [
    ['e2', 'e4'],
    ['e7', 'e5'],
    ['g1', 'f3'],
    ['b8', 'c6'],
    ['f1', 'c4'],
  ]);
  // Five lines, the most the panel offers, chosen before the search starts:
  // the picture is of the engine's candidates, and three leaves the panel
  // half empty.
  await page
    .locator('[data-engine-panel-fen]')
    .getByRole('button', { name: '5', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start analysis (E)' }).click();
  await page.locator('[data-engine-arrow-hit]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(8_000);
  await page.mouse.move(5, 5);
}

/**
 * A section image: the right-hand panel with enough of the board beside it
 * to say where the panel lives, from the tool strip down to the status bar.
 * Cropped from the page rather than the element so the panel keeps its own
 * edge and the board keeps its pieces; the same rectangle for both sections,
 * so the two images sit in the page at the same scale.
 */
async function panelWithBoard(page, file) {
  const board = await page.locator('[data-chessboard]').boundingBox();
  const strip = await page.getByRole('tab', { name: 'Engine' }).boundingBox();
  if (!board || !strip) throw new Error('workspace not on screen');
  const x = Math.round(board.x + board.width * 0.5);
  const y = Math.round(strip.y - 4);
  // Down to the board's own bottom edge; the row of controls under it and the
  // empty move tree of a fresh capture say nothing about the panel.
  const bottom = Math.round(board.y + board.height + 6);
  await page.screenshot({
    path: path.join(outDir, file),
    clip: { x, y, width: 1440 - x, height: bottom - y },
  });
}

const hero = await freshPage();
await italianWithEngine(hero);
await hero.screenshot({ path: path.join(outDir, 'hero.png') });
await panelWithBoard(hero, 'engines.png');
await hero.context().close();

/*
  The comparison: the bundled reference against Recent Theory, the two-year
  broadcast pack the catalogue offers, installed here from its public
  manifest (34 MB; the run needs the network for it). Two separate
  populations, each in its own column with its own count and licence, is
  what the Research section says, so the image has to show two packs and
  not "My games", which is empty on a fresh profile. The Najdorf is deep
  enough that the two disagree visibly about the move after 5...a6.
*/
const research = await freshPage();
await research.goto(`${BASE}/databases`);
await research.locator(READY).waitFor({ timeout: 60_000 });
await research.getByRole('button', { name: /Reference sources/ }).click();
const recent = research.locator('[data-source-row="kingfisher-recent-theory"]');
await recent.waitFor({ timeout: 60_000 });
await recent.getByRole('button', { name: 'Install', exact: true }).click();
// A pack that needs a large download asks first; a small one just starts.
const confirm = research.getByRole('dialog').getByRole('button', { name: 'Install anyway' });
if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) await confirm.click();
await recent.getByRole('button', { name: /^Remove /i }).waitFor({ timeout: 600_000 });
await research.goto(`${BASE}/analysis`);
await research.locator(READY).waitFor({ timeout: 60_000 });
await research.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
/*
  The dock is 380 px on a fresh profile, which is right for one source and
  too narrow for two columns side by side — the table scrolls sideways. A
  player comparing sources drags the dock wider, so the capture does the
  same, by the handle, the way they would.
*/
const handle = research.getByRole('button', { name: 'Resize workspace tools' });
const handleBox = await handle.boundingBox();
if (!handleBox) throw new Error('dock handle not on screen');
const grip = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
await research.mouse.move(grip.x, grip.y);
await research.mouse.down();
await research.mouse.move(grip.x - 160, grip.y, { steps: 8 });
await research.mouse.up();
await research.getByRole('button', { name: 'Import PGN or FEN' }).click();
const dialog = research.getByRole('dialog', { name: 'Import a game or position' });
await dialog.getByRole('textbox').fill('1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 *');
await dialog.getByRole('button', { name: 'Import games' }).click();
await dialog.waitFor({ state: 'hidden' });
await research.keyboard.press('End');
await research.getByRole('tab', { name: 'Explorer' }).click();
await research.locator('[data-explorer-move]').first().waitFor({ timeout: 30_000 });
await research.getByRole('button', { name: 'Compare sources' }).click();
const comparison = research.locator('[data-source-comparison]');
await comparison.waitFor();
const wanted = ['kingfisher-starter', 'kingfisher-recent-theory'];
for (const button of await comparison.locator('[data-comparison-source]').all()) {
  const id = await button.getAttribute('data-comparison-source');
  const pressed = (await button.getAttribute('aria-pressed')) === 'true';
  if (pressed !== wanted.includes(id ?? '')) await button.click();
}
for (const id of wanted) {
  await comparison
    .locator(`[data-comparison-column="${id}"]`)
    .filter({ hasText: /games/ })
    .waitFor({ timeout: 60_000 });
}
// The variation brief above the table is the Theory Book's business, and
// folded away it leaves the table where the eye lands.
const hideBrief = research.getByRole('button', { name: 'Hide', exact: true });
if (await hideBrief.isVisible().catch(() => false)) await hideBrief.click();
// The import confirmation has done its job.
for (const dismiss of await research.getByRole('button', { name: 'Dismiss' }).all())
  await dismiss.click().catch(() => {});
// The comparison sits under the single-source table; scroll it to the top
// of the panel so the table above it is out of the frame, not half in it.
await comparison.evaluate((el) => el.scrollIntoView({ block: 'start' }));
await research.waitForTimeout(1_500);
await research.mouse.move(5, 5);
await panelWithBoard(research, 'research.png');
await research.context().close();
await browser.close();

for (const name of ['hero', 'engines', 'research'])
  console.log(`wrote ${path.join(outDir, `${name}.png`)}`);

if (encode) {
  const stamp = new Date().toISOString().slice(0, 10);
  const target = path.join(process.cwd(), 'public', 'landing', 'img');
  const jobs = [
    ['hero', `workspace-${stamp}.webp`, ['-resize', '2240', '0']],
    ['research', `research-${stamp}.webp`, []],
    ['engines', `engines-${stamp}.webp`, []],
  ];
  for (const [name, file, resize] of jobs) {
    const out = path.join(target, file);
    execFileSync('cwebp', [
      '-quiet',
      '-q',
      '82',
      ...resize,
      path.join(outDir, `${name}.png`),
      '-o',
      out,
    ]);
    console.log(`encoded ${out}`);
  }
  // The social card: the hero scaled to 1200 wide and cropped to 630 from
  // just under the top edge, so the brand in the sidebar header stays in.
  const sharp = (await import('sharp')).default;
  const og = path.join(target, 'og.png');
  await sharp(path.join(outDir, 'hero.png'))
    .resize({ width: 1200 })
    .extract({ left: 0, top: 48, width: 1200, height: 630 })
    .png({ compressionLevel: 9, palette: true })
    .toFile(og);
  console.log(`encoded ${og}`);
}
