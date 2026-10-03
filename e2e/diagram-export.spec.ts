import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

/**
 * The board as a diagram: saved from the Position menu as an SVG and a PNG
 * that stand alone, drawn with the player's own piece artwork.
 */

const READY = 'html[data-kingfisher-ready="true"]';
// After 1.e4 e5 2.Nf3: Black to move, 32 pieces.
const FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

async function save(page: Page, label: string) {
  await page.goto(`/analysis?fen=${encodeURIComponent(FEN)}`);
  await page.locator(READY).waitFor();
  await page.getByRole('button', { name: 'Position actions' }).first().click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: label }).click();
  const file = await download;
  return { name: file.suggestedFilename(), bytes: readFileSync((await file.path())!) };
}

test('Save diagram as SVG writes a standalone diagram with every piece embedded', async ({
  page,
}) => {
  const { name, bytes } = await save(page, 'Save diagram as SVG');
  expect(name).toMatch(/\.svg$/);
  const svg = bytes.toString('utf8');
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  // One embedded artwork image per piece, and nothing fetched from elsewhere.
  expect(svg.match(/<image /g)).toHaveLength(32);
  expect(svg).not.toMatch(/href="(https?:|\/)/);
  expect(svg).toContain('>Black to move</text>');
});

test('Save diagram as PNG writes a 1200-pixel-wide image', async ({ page }) => {
  const { name, bytes } = await save(page, 'Save diagram as PNG');
  expect(name).toMatch(/\.png$/);
  // PNG signature, then the IHDR chunk's width.
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.length).toBeGreaterThan(20_000);
});
