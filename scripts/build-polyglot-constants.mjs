#!/usr/bin/env node

/**
 * Write the 781 constants the Polyglot book format is defined in terms of.
 *
 *   npm run polyglot:constants
 *
 * These numbers are not a design decision and not somebody's creative work:
 * they *are* the format. A `.bin` opening book keys its entries on a Zobrist
 * hash computed with this exact array, so an implementation that used any
 * other numbers would not be able to read a single book anybody has. They are
 * the same kind of thing as a CRC polynomial or a codec's quantisation table.
 *
 * Generated rather than pasted so that the check below is part of the build.
 * The Polyglot specification publishes the hash of the initial position —
 * `0x463b96181691fc9c` — and 781 numbers that produce it are, by construction,
 * the right 781 numbers. If a re-fetch ever brought back a different array,
 * this script would refuse to write it.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/niklasf/python-chess/master/chess/polyglot.py';
const OUTPUT = new URL('../src/book/polyglot-constants.generated.ts', import.meta.url);
const START_KEY = 0x463b96181691fc9cn;

const KIND = { p: 0, P: 1, n: 2, N: 3, b: 4, B: 5, r: 6, R: 7, q: 8, Q: 9, k: 10, K: 11 };

/** The published key of the initial position, recomputed from a candidate array. */
function initialKey(values) {
  let key = 0n;
  let rank = 7;
  for (const row of 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'.split('/')) {
    let file = 0;
    for (const character of row) {
      if (character >= '1' && character <= '8') {
        file += Number(character);
        continue;
      }
      key ^= values[64 * KIND[character] + 8 * rank + file];
      file += 1;
    }
    rank -= 1;
  }
  for (let index = 0; index < 4; index += 1) key ^= values[768 + index];
  key ^= values[780];
  return key;
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE} → HTTP ${response.status}`);
const text = await response.text();

const block = /POLYGLOT_RANDOM_ARRAY\s*=\s*\[(.*?)\]/s.exec(text);
if (!block) throw new Error('The source did not contain a POLYGLOT_RANDOM_ARRAY.');
const hex = [...block[1].matchAll(/0x([0-9A-Fa-f]{16})/g)].map((match) => match[1].toLowerCase());
if (hex.length !== 781) throw new Error(`Expected 781 constants, found ${hex.length}.`);

const values = hex.map((value) => BigInt(`0x${value}`));
const computed = initialKey(values);
if (computed !== START_KEY) {
  throw new Error(
    `The constants do not reproduce the published initial-position key: ` +
      `got 0x${computed.toString(16)}, expected 0x${START_KEY.toString(16)}.`,
  );
}

const lines = [];
for (let index = 0; index < hex.length; index += 4) {
  lines.push(
    `  ${hex
      .slice(index, index + 4)
      .map((value) => `0x${value}n`)
      .join(', ')},`,
  );
}

writeFileSync(
  fileURLToPath(OUTPUT),
  [
    '/**',
    ' * GENERATED FILE — do not edit.',
    ' *',
    ' * The 781 Zobrist constants the Polyglot book format is defined in terms of,',
    ' * written by `npm run polyglot:constants`. They are the format, not a choice:',
    ' * a `.bin` book keys its entries on a hash computed with exactly these numbers,',
    ' * so any other array would read no book that exists.',
    ' *',
    ' * The generator refuses to write an array that does not reproduce the',
    ' * specification’s published key for the initial position, 0x463b96181691fc9c.',
    ' */',
    '',
    'export const POLYGLOT_RANDOM: readonly bigint[] = [',
    ...lines,
    '];',
    '',
    `export const POLYGLOT_INITIAL_KEY = 0x${START_KEY.toString(16)}n;`,
    '',
  ].join('\n'),
);

process.stdout.write(`Polyglot constants\n`);
process.stdout.write(`  source   ${SOURCE}\n`);
process.stdout.write(`  values   ${hex.length}\n`);
process.stdout.write(`  checked  initial key 0x${computed.toString(16)}\n`);
process.stdout.write(`  written  src/book/polyglot-constants.generated.ts\n`);
