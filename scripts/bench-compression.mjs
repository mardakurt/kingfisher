/**
 * Quick pack-encoding compression benchmark.
 *
 * Phase 28 BO: investigate whether the existing gzip encoding is
 * close to the right answer. The brief says "Do NOT switch format
 * simply because another algorithm compresses 8% smaller." This
 * benchmark records the numbers so the decision is data, not
 * taste.
 *
 * This is a *minimal* benchmark on a single synthetic input. A real
 * decision needs to be made against representative chunks from the
 * actual installed pack, and that benchmark belongs to a future
 * phase.
 */
import {
  gzipSync,
  brotliCompressSync,
  brotliDecompressSync,
  gunzipSync,
  constants as zlibConstants,
} from 'node:zlib';
import { readFileSync } from 'node:fs';

function row(key, san, uci, games, white, draws, black, avgRating, lastYear) {
  const recent = (year, w, d, b) => `${games},${w},${d},${b},${year - 1900}`;
  return `${key}|${san},${uci},${games},${white},${draws},${black},${avgRating},${lastYear},${recent(lastYear, white, draws, black)}`;
}

function makeInput(lines) {
  return lines
    .map((line) =>
      row(
        line.key,
        line.san,
        line.uci,
        line.games,
        line.white,
        line.draws,
        line.black,
        line.avgRating,
        line.lastYear,
      ),
    )
    .join('\n');
}

const args = process.argv.slice(2);
const file = args[0];
let input;
if (file) {
  input = readFileSync(file, 'utf8');
  console.log(`Loaded ${input.length} bytes from ${file}`);
} else {
  // Synthetic sample: 100 positions with 30 moves each. Modest.
  const sample = [];
  for (let i = 0; i < 100; i += 1) {
    const key = `rnbqkbnr/pp${'1'.repeat(i % 4)}pppp/8/8/8/8/PPPP${'PP'.repeat(i % 4)}/RNBQKBNR w KQkq -`;
    const moves = [];
    for (let m = 0; m < 30; m += 1) {
      moves.push({
        san: `e${m}`,
        uci: `e${m}e${m + 1 || 1}`,
        games: 100 - m,
        white: 50,
        draws: 30,
        black: 20,
        avgRating: 2400,
        lastYear: 2024,
      });
    }
    sample.push({ key, ...moves[0] });
  }
  input = makeInput(sample);
  console.log(`Built ${input.length} bytes of synthetic input`);
}

const gz = gzipSync(Buffer.from(input, 'utf8'), { level: 9 });
const brotli = brotliCompressSync(Buffer.from(input, 'utf8'), {
  params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
});

console.log('');
console.log(`Codec          Bytes      Ratio`);
console.log(`-------------- ---------- ------`);
console.log(
  `plain          ${String(input.length).padStart(10)}  ${(input.length / input.length).toFixed(3)}`,
);
console.log(
  `gzip -9        ${String(gz.byteLength).padStart(10)}  ${(gz.byteLength / input.length).toFixed(3)}`,
);
console.log(
  `brotli q11     ${String(brotli.byteLength).padStart(10)}  ${(brotli.byteLength / input.length).toFixed(3)}`,
);
console.log('');
console.log(
  'Save ratio over gzip:',
  `${(((gz.byteLength - brotli.byteLength) / gz.byteLength) * 100).toFixed(2)}%`,
);

// Decompression round-trip check
const round = gunzipSync(gz);
const rtBrotli = brotliDecompressSync(brotli);
console.log(
  'Round-trip ok:',
  round.toString('utf8') === input && rtBrotli.toString('utf8') === input,
);
