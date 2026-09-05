import { expect, test, type Page } from '@playwright/test';

import { PIECE_INK_BASELINE } from '../src/features/board/piece-sets/ink-baseline';
import {
  PIECE_INK_MAX_WIDTH,
  PIECE_INK_TARGET,
  PIECE_SETS,
} from '../src/features/board/piece-sets';

/**
 * The pieces looked too small, and the fix must be checked in pixels.
 *
 * A player's complaint here is about proportion — how much of a square the
 * artwork covers — and that is not something the DOM can answer: an <img> box
 * tells you nothing about how much of it is transparent, and every set chose a
 * different amount of transparency. So these tests rasterise the artwork the
 * way the board draws it and measure the ink.
 *
 * The unit test in `piece-proportions.test.ts` pins the same numbers against a
 * committed baseline, which is what makes a change of artwork fail. This is
 * what makes a change of *rendering* fail — a padding class reintroduced, a
 * scale not applied, a set added without calibration.
 */

const READY = 'html[data-kingfisher-ready="true"]';

const PIECES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as const;

/** Ink bounding boxes for one set, drawn at the board's own geometry. */
async function inkFor(page: Page, set: string, scale: number) {
  return page.evaluate(
    async ({ set, scale, pieces }) => {
      const SQUARE = 320;
      const canvas = document.createElement('canvas');
      canvas.width = SQUARE;
      canvas.height = SQUARE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('no 2d context');
      const drawn = Math.round(SQUARE * scale);
      const offset = Math.round((SQUARE - drawn) / 2);
      const out: { piece: string; h: number; w: number }[] = [];
      for (const piece of pieces) {
        const img = new Image();
        img.src = `/piece/${set}/${piece}.svg`;
        await img.decode();
        ctx.clearRect(0, 0, SQUARE, SQUARE);
        ctx.drawImage(img, offset, offset, drawn, drawn);
        const { data } = ctx.getImageData(0, 0, SQUARE, SQUARE);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < SQUARE; y += 1) {
          for (let x = 0; x < SQUARE; x += 1) {
            if (data[(y * SQUARE + x) * 4 + 3]! > 24) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        out.push({
          piece,
          h: (maxY - minY + 1) / SQUARE,
          w: (maxX - minX + 1) / SQUARE,
        });
      }
      return out;
    },
    { set, scale, pieces: [...pieces] },
  );
}

const pieces = PIECES;

test('every piece set covers its square by the same amount, and none of them clips', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await page.locator(READY).waitFor();

  const report: string[] = [];
  const tooSmall: string[] = [];
  const tooWide: string[] = [];

  for (const set of PIECE_SETS) {
    if (set.kind !== 'vector') continue;
    const measured = await inkFor(page, set.id, set.visualScale);
    const tallest = Math.max(...measured.map((m) => m.h));
    const widest = Math.max(...measured.map((m) => m.w));
    report.push(
      `${set.id.padEnd(12)} scale ${set.visualScale.toFixed(3)}  tallest ${tallest.toFixed(3)}  widest ${widest.toFixed(3)}`,
    );
    // 1.5pt of a square: a real rasteriser at a different size rounds
    // differently from the one the baseline was recorded with.
    if (Math.abs(tallest - PIECE_INK_TARGET) > 0.015) {
      tooSmall.push(`${set.id}: tallest piece covers ${tallest.toFixed(3)} of its square`);
    }
    if (widest > PIECE_INK_MAX_WIDTH) {
      tooWide.push(`${set.id}: widest piece covers ${widest.toFixed(3)} of its square`);
    }
  }

  await test.info().attach('piece-ink.txt', { body: report.join('\n'), contentType: 'text/plain' });
  expect(tooSmall, 'sets that do not match the calibrated ink height').toEqual([]);
  expect(tooWide, 'sets whose pieces would touch a neighbouring square').toEqual([]);
});

test('the board draws pieces at the calibrated scale, with no inset of its own', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await page.locator(READY).waitFor();
  await page.waitForTimeout(400);

  const geometry = await page.evaluate(() => {
    const frame = document.querySelector('[data-board-frame]');
    if (!frame) return null;
    const square = frame.getBoundingClientRect().width / 8;
    const images = [...document.querySelectorAll('[data-piece-layer] img')];
    if (images.length === 0) return null;
    return images.slice(0, 8).map((img) => {
      const rect = img.getBoundingClientRect();
      const tile = img.parentElement?.getBoundingClientRect();
      return {
        // The artwork's box against the square: the scale, observed.
        boxRatio: rect.width / square,
        // The tile is the drag target and must stay exactly one square.
        tileRatio: tile ? tile.width / square : 0,
      };
    });
  });

  expect(geometry).not.toBeNull();
  const expected = PIECE_SETS.find((set) => set.id === 'cburnett')?.visualScale ?? 1;
  for (const piece of geometry ?? []) {
    expect(piece.boxRatio).toBeCloseTo(expected, 1);
    /*
      The hitbox is not allowed to move. Scaling the artwork is a visual
      change; scaling the tile would change which square a drag starts on.
    */
    expect(piece.tileRatio).toBeCloseTo(1, 2);
  }
});

test('the ink baseline still describes the artwork on disk', async ({ page }) => {
  /*
    The calibration is arithmetic on a committed measurement. If somebody
    replaces a set's files with a differently proportioned drawing, the
    arithmetic stays valid and the board goes wrong — so the measurement itself
    has to be re-checked against the files.
  */
  test.setTimeout(180_000);
  await page.goto('/analysis');
  await page.locator(READY).waitFor();

  const drifted: string[] = [];
  for (const set of PIECE_SETS) {
    if (set.kind !== 'vector') continue;
    const baseline = PIECE_INK_BASELINE[set.id];
    if (!baseline) {
      drifted.push(`${set.id}: no baseline`);
      continue;
    }
    const measured = await inkFor(page, set.id, 1);
    const tallest = Math.max(...measured.map((m) => m.h));
    const widest = Math.max(...measured.map((m) => m.w));
    if (
      Math.abs(tallest - baseline.tallest) > 0.015 ||
      Math.abs(widest - baseline.widest) > 0.015
    ) {
      drifted.push(
        `${set.id}: measured ${tallest.toFixed(3)}x${widest.toFixed(3)}, baseline ${baseline.tallest}x${baseline.widest}`,
      );
    }
  }
  expect(drifted, 'run `npm run pieces:measure` and update ink-baseline.ts').toEqual([]);
});
