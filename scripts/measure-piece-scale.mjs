/**
 * Measure how much of a board square each piece set's artwork actually covers.
 *
 * The question is not what the SVG's viewBox says — a viewBox is mostly
 * transparent padding, and every set chose a different amount of it. It is how
 * much *ink* lands on the square, which is what a player sees. So this
 * rasterises each piece exactly as the board draws it and takes the alpha
 * channel's bounding box.
 *
 * Run against a dev server:  npm run pieces:measure
 * With `--live`, it measures the pieces on the real /analysis board instead of
 * drawing them itself, which is the check that the registry's numbers and the
 * rendered result actually agree.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.KINGFISHER_URL ?? 'http://localhost:3210';
const LIVE = process.argv.includes('--live');
const SQUARE = 400;

const SETS = [
  'cburnett',
  'merida',
  'chessnut',
  'fantasy',
  'spatial',
  'celtic',
  'rhosgfx',
  'kiwen-suwi',
  'firi',
  'mpchess',
];
const PIECES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

/** Pulled from the registry so the report cannot drift from what ships. */
const scales = await (async () => {
  const source = await import('node:fs').then((fs) =>
    fs.promises.readFile('src/features/board/piece-sets/index.tsx', 'utf8'),
  );
  const out = {};
  const entry = /id:\s*'([a-z-]+)',[\s\S]*?visualScale:\s*([0-9.]+),/g;
  let match;
  while ((match = entry.exec(source)) !== null) out[match[1]] ??= Number(match[2]);
  return out;
})();

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/analysis`);
await page.locator('html[data-kingfisher-ready="true"]').waitFor();

const results = await page.evaluate(
  async ({ SETS, PIECES, SQUARE, scales }) => {
    const canvas = document.createElement('canvas');
    canvas.width = SQUARE;
    canvas.height = SQUARE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const inkBox = () => {
      const { data } = ctx.getImageData(0, 0, SQUARE, SQUARE);
      let minX = Infinity,
        minY = Infinity,
        maxX = -1,
        maxY = -1;
      for (let y = 0; y < SQUARE; y += 1) {
        for (let x = 0; x < SQUARE; x += 1) {
          // Ignore antialiasing and the soft drop shadows some sets carry.
          if (data[(y * SQUARE + x) * 4 + 3] > 24) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      return maxX < 0
        ? null
        : {
            h: +((maxY - minY + 1) / SQUARE).toFixed(4),
            w: +((maxX - minX + 1) / SQUARE).toFixed(4),
            top: +(minY / SQUARE).toFixed(4),
            bottom: +((SQUARE - 1 - maxY) / SQUARE).toFixed(4),
          };
    };

    const out = {};
    for (const set of SETS) {
      out[set] = {};
      const scale = scales[set] ?? 1;
      // The board scales the artwork about the centre of its square.
      const drawn = Math.round(SQUARE * scale);
      const offset = Math.round((SQUARE - drawn) / 2);
      for (const piece of PIECES) {
        const img = new Image();
        img.src = `/piece/${set}/${piece}.svg`;
        try {
          await img.decode();
        } catch {
          out[set][piece] = null;
          continue;
        }
        ctx.clearRect(0, 0, SQUARE, SQUARE);
        ctx.drawImage(img, offset, offset, drawn, drawn);
        out[set][piece] = inkBox();
      }
    }
    return out;
  },
  { SETS, PIECES, SQUARE, scales },
);

let live = null;
if (LIVE) {
  live = await page.evaluate(async () => {
    const frame = document.querySelector('[data-board-frame]');
    const square = frame.getBoundingClientRect().width / 8;
    const out = [];
    for (const img of document.querySelectorAll('[data-piece-layer] img')) {
      const rect = img.getBoundingClientRect();
      out.push({
        alt: img.alt,
        boxRatio: +(rect.width / square).toFixed(4),
      });
    }
    return { square: Math.round(square), pieces: out.slice(0, 4) };
  });
}

await browser.close();

console.log(`\n=== PIECE INK AS A FRACTION OF THE BOARD SQUARE ===`);
console.log(
  ['set', 'scale', 'K', 'Q', 'R', 'B', 'N', 'P', 'tallest', 'widest']
    .map((s) => s.padStart(10))
    .join(''),
);
let worstWidth = 0;
for (const set of SETS) {
  const measured = Object.entries(results[set]).filter(([, m]) => m);
  const byType = {};
  for (const [piece, m] of measured) byType[piece[1]] = Math.max(byType[piece[1]] ?? 0, m.h);
  const tallest = Math.max(...measured.map(([, m]) => m.h));
  const widest = Math.max(...measured.map(([, m]) => m.w));
  worstWidth = Math.max(worstWidth, widest);
  console.log(
    [
      set,
      (scales[set] ?? 1).toFixed(3),
      byType.K,
      byType.Q,
      byType.R,
      byType.B,
      byType.N,
      byType.P,
      tallest,
      widest,
    ]
      .map((v) => (typeof v === 'number' ? v.toFixed(3) : String(v)).padStart(10))
      .join(''),
  );
}
console.log(`\nwidest piece on any square: ${worstWidth.toFixed(3)}`);
if (live)
  console.log(
    `live board: square ${live.square}px, piece boxes ${live.pieces.map((p) => p.boxRatio).join(', ')}`,
  );
