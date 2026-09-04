import { expect, test, type Page } from '@playwright/test';

import { BOARD_THEMES } from '../src/features/board/themes';
import { PIECE_SETS } from '../src/features/board/piece-sets';

/**
 * Every piece set on a board, measured rather than eyeballed.
 *
 * The failure this exists for has a name in the brief: "a piece set that
 * disappears on a board is not a valid combination". It cannot be settled by
 * reading the SVG files — the sets in use paint variously with hex fills, CSS
 * classes, gradients referenced by id, and in one case no fill attribute at
 * all — so it is settled the only way it can be: render the board and look at
 * the pixels.
 *
 * "Look at the pixels" means: compare the two bands of the starting position
 * that are full of pieces against the two that are empty. For any visible set
 * the mean brightness differs substantially; for an invisible one it would not
 * differ at all.
 */

const THEME_EXTREMES = ['ivory', 'contrast', 'midnight', 'walnut'] as const;

async function ready(page: Page) {
  await page.locator('html[data-kingfisher-ready="true"]').waitFor();
}

async function setAppearance(page: Page, theme: string, pieceSet: string) {
  await page.evaluate(
    ([boardTheme, set]) => {
      const key = 'kingfisher.preferences';
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : { state: {}, version: 4 };
      parsed.state = { ...parsed.state, boardTheme, pieceSet: set };
      localStorage.setItem(key, JSON.stringify(parsed));
    },
    [theme, pieceSet],
  );
  await page.reload();
  await ready(page);
}

/**
 * How many squares have something drawn on them.
 *
 * Brightness is the wrong instrument and it took two attempts to see why: a
 * white piece on a light square is *supposed* to be nearly the same brightness
 * as the square, and a mid-dark board can hide a missing army by having the
 * other one cancel it out in the average. What actually distinguishes an
 * occupied square from an empty one is **structure**: an empty square is one
 * flat colour (or a faint generated grain), and a piece adds contours,
 * outlines and interior detail whatever its fill happens to be.
 *
 * So this measures the variation of luminance *within* each square, over its
 * central 60% — away from the borders between squares, which vary by
 * definition. Runs in the page, because that is where a canvas is.
 */
const measure = async ({ png }: { png: string }) => {
  const image = new Image();
  image.src = `data:image/png;base64,${png}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return { occupiedWithInk: 0, emptyStructure: 0, floor: 0 };

  context.drawImage(image, 0, 0);
  const size = image.width / 8;
  const inset = size * 0.2;

  const structure = (file: number, rank: number) => {
    const data = context.getImageData(
      Math.round(file * size + inset),
      Math.round(rank * size + inset),
      Math.max(1, Math.round(size - inset * 2)),
      Math.max(1, Math.round(size - inset * 2)),
    ).data;
    let sum = 0;
    let sumSquares = 0;
    const count = data.length / 4;
    for (let index = 0; index < data.length; index += 4) {
      const luma =
        0.2126 * (data[index] as number) +
        0.7152 * (data[index + 1] as number) +
        0.0722 * (data[index + 2] as number);
      sum += luma;
      sumSquares += luma * luma;
    }
    const mean = sum / count;
    return Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
  };

  const occupied: number[] = [];
  const empty: number[] = [];
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      // Ranks 0,1 and 6,7 of the image hold the two armies in the starting
      // position; 2..5 are bare.
      (rank <= 1 || rank >= 6 ? occupied : empty).push(structure(file, rank));
    }
  }

  /*
    The threshold calibrates itself against this board rather than being a
    constant. It has to: a wood theme draws a generated grain on its dark
    squares, so "an empty square is perfectly flat" is true of nine themes and
    false of three. Measuring the empty squares of the board actually on screen
    makes the check work on all of them without knowing which is which.
  */
  const sorted = [...empty].sort((a, b) => a - b);
  const emptyStructure = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const floor = emptyStructure + 4;
  return {
    occupiedWithInk: occupied.filter((value) => value > floor).length,
    emptyStructure: Math.round(emptyStructure),
    floor: Math.round(floor),
  };
};

test('every piece set renders visibly on light, dark, wooden and high-contrast boards', async ({
  page,
}) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  const vectorSets = PIECE_SETS.filter((set) => set.kind === 'vector').map((set) => set.id);
  expect(vectorSets.length, 'the picker offers a real choice of sets').toBeGreaterThanOrEqual(8);
  for (const theme of THEME_EXTREMES) {
    expect(
      BOARD_THEMES.some((entry) => entry.id === theme),
      theme,
    ).toBe(true);
  }

  const invisible: string[] = [];
  for (const set of vectorSets) {
    for (const theme of THEME_EXTREMES) {
      await setAppearance(page, theme, set);
      const frame = page.locator('[data-board-frame]');
      await expect(frame).toBeVisible();
      // The pieces are <img> elements; a screenshot taken before they decode
      // would report an empty board for every set.
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('[data-board-frame] img')].every(
            (image) => (image as HTMLImageElement).complete,
          ),
        undefined,
        { timeout: 15_000 },
      );
      await page.waitForTimeout(150);

      const shot = await frame.screenshot();
      const drawn = await page.evaluate(measure, { png: shot.toString('base64') });
      // Thirty-two men stand on the board. A couple of squares under the
      // threshold would be a rook in a corner of a very flat set; a set that
      // vanished scores nothing at all, so the bar is 30 rather than 32.
      if (drawn.occupiedWithInk < 30) {
        invisible.push(
          `${set} on ${theme}: only ${drawn.occupiedWithInk}/32 pieces stand out from the board ` +
            `(bare squares measured ${drawn.emptyStructure}, threshold ${drawn.floor})`,
        );
      }
    }
  }
  expect(invisible).toEqual([]);
});

test('the board preview in Settings is a real board, not a broken one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);

  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('tab', { name: 'Board', exact: true }).click();

  const preview = page.locator('[data-mini-board="board-preview"]');
  await expect(preview).toBeVisible();

  const geometry = await preview.evaluate((board) => {
    const rect = board.getBoundingClientRect();
    const grid = board.querySelector('.grid');
    const cells = grid ? [...grid.children] : [];
    const cellRects = cells.map((cell) => cell.getBoundingClientRect());
    const pieces = [...board.querySelectorAll('img, svg')];
    const pieceRects = pieces.map((piece) => piece.getBoundingClientRect());
    return {
      square: Math.abs(rect.width - rect.height) < 2,
      cells: cells.length,
      cellsSquare: cellRects.every((cell) => Math.abs(cell.width - cell.height) < 1),
      lastCellInside:
        cellRects.length > 0 && (cellRects.at(-1) as DOMRect).bottom <= rect.bottom + 1,
      pieces: pieces.length,
      piecesInside: pieceRects.filter(
        (piece) =>
          piece.left >= rect.left - 1 &&
          piece.right <= rect.right + 1 &&
          piece.top >= rect.top - 1 &&
          piece.bottom <= rect.bottom + 1,
      ).length,
      pieceSizes: new Set(pieceRects.map((piece) => `${Math.round(piece.width)}`)).size,
    };
  });

  expect(geometry.cells, 'sixty-four squares').toBe(64);
  expect(geometry.square, 'the board is square').toBe(true);
  expect(geometry.cellsSquare, 'every square is square').toBe(true);
  expect(geometry.lastCellInside, 'the last rank is not clipped away').toBe(true);
  expect(geometry.pieces, 'thirty-two pieces at the starting position').toBe(32);
  expect(geometry.piecesInside, 'no piece overflows the board').toBe(32);
  expect(geometry.pieceSizes, 'every piece is the same size').toBe(1);
});

test('choosing a theme and a set in Settings changes the preview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/analysis');
  await ready(page);
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('tab', { name: 'Board', exact: true }).click();

  const preview = page.locator('[data-mini-board="board-preview"]');
  const colourOf = () =>
    preview.evaluate((board) => getComputedStyle(board).getPropertyValue('--square-dark').trim());

  const before = await colourOf();
  await page.getByRole('button', { name: /Midnight/ }).click();
  await expect.poll(colourOf).not.toBe(before);

  await page.getByRole('tab', { name: 'Pieces', exact: true }).click();
  await page.getByRole('button', { name: /Kiwen Suwi/ }).click();
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  await expect(preview.locator('img').first()).toHaveAttribute('src', /kiwen-suwi/);
});
