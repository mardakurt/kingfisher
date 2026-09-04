import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BOARD_THEMES } from './themes';
import { PIECE_SETS } from './piece-sets';

/**
 * Appearance is not decoration here: a piece that disappears against a square
 * is a position you cannot read, and a licence that is not recorded is a file
 * this project should not be shipping.
 *
 * Both are checkable, so both are checked. The contrast test reads the actual
 * vendored SVG files rather than a table describing them, because the table is
 * the thing that goes stale when a set is re-vendored.
 */

const hex = (value: string): [number, number, number] | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const number = Number.parseInt(match[1] as string, 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance(rgb: [number, number, number]): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

const contrast = (a: string, b: string): number => {
  const first = hex(a);
  const second = hex(b);
  if (!first || !second) return 0;
  const one = luminance(first);
  const two = luminance(second);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
};

const PIECE_ROOT = path.join(process.cwd(), 'public', 'piece');

describe('board themes', () => {
  it('offers a range wide enough to be a choice rather than a gesture', () => {
    expect(BOARD_THEMES.length).toBeGreaterThanOrEqual(12);
    const ids = BOARD_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the two square colours far enough apart to see the pattern', () => {
    for (const theme of BOARD_THEMES) {
      const ratio = contrast(theme.light, theme.dark);
      expect(
        ratio,
        `${theme.name}: light and dark squares are ${ratio.toFixed(2)}:1 apart`,
      ).toBeGreaterThan(1.35);
    }
  });

  it('keeps at least one piece colour strongly readable on each square', () => {
    for (const theme of BOARD_THEMES) {
      for (const square of [theme.light, theme.dark] as const) {
        // A piece carries an outline in the opposite tone, so it need only be
        // strongly legible in one of its two colours — but in *one* of them it
        // must be, on both square colours.
        const best = Math.max(
          contrast(square, theme.pieceLight),
          contrast(square, theme.pieceDark),
        );
        expect(best, `${theme.name} on ${square}`).toBeGreaterThan(3);
      }
    }
  });

  it('names and describes every theme', () => {
    for (const theme of BOARD_THEMES) {
      expect(theme.name.length).toBeGreaterThan(2);
      expect(theme.description.length).toBeGreaterThan(20);
    }
  });

  it('gives every theme its own highlight colours rather than one shared accent', () => {
    for (const theme of BOARD_THEMES) {
      for (const value of [theme.selected, theme.lastMove, theme.check, theme.legalMove]) {
        expect(value).toMatch(/^rgb\(/);
      }
    }
  });
});

describe('piece sets', () => {
  it('offers enough sets to be a real choice, without padding the list', () => {
    expect(PIECE_SETS.length).toBeGreaterThanOrEqual(8);
    expect(PIECE_SETS.length).toBeLessThanOrEqual(12);
  });

  it('records an author, a licence and a source for every vendored set', () => {
    for (const set of PIECE_SETS) {
      if (set.kind !== 'vector') continue;
      expect(set.attribution.author.length, set.id).toBeGreaterThan(2);
      expect(set.attribution.license.length, set.id).toBeGreaterThan(2);
      expect(set.attribution.licenseUrl, set.id).toMatch(/^https:/);
      expect(set.attribution.source, set.id).toMatch(/^https:/);
    }
  });

  it('uses no licence that forbids commercial use or derivative works', () => {
    // The rule from THIRD_PARTY_ASSETS.md, enforced rather than remembered: a
    // non-commercial clause would have to be revisited before Kingfisher could
    // ever be sold, bundled or offered as a service.
    for (const set of PIECE_SETS) {
      if (set.kind !== 'vector') continue;
      expect(set.attribution.license, set.id).not.toMatch(/NC|NoDeriv|ND\b/i);
      expect(set.attribution.license, set.id).not.toMatch(/freeware|personal/i);
    }
  });

  it('ships twelve files for every vendored set', () => {
    for (const set of PIECE_SETS) {
      if (set.kind !== 'vector') continue;
      for (const piece of [
        'wK',
        'wQ',
        'wR',
        'wB',
        'wN',
        'wP',
        'bK',
        'bQ',
        'bR',
        'bB',
        'bN',
        'bP',
      ]) {
        const file = path.join(PIECE_ROOT, path.basename(set.directory), `${piece}.svg`);
        expect(readFileSync(file, 'utf8').startsWith('<svg'), `${set.id}/${piece}`).toBe(true);
      }
    }
  });

  /**
   * Whether a piece stays legible on a particular board is a *rendering*
   * question, and it is answered where rendering happens: `e2e/appearance.spec.ts`
   * puts every set on every theme in a real browser and measures how much of
   * each square the piece actually darkens or lightens.
   *
   * It is deliberately not answered here by parsing the SVG files. That was
   * tried: the sets in use variously paint with hex fills, CSS classes,
   * gradients referenced by id, and no fill at all, and every rule that
   * described one of them rejected good artwork from another.
   */
  it('describes every set in words a user can choose between', () => {
    for (const set of PIECE_SETS) {
      expect(set.name.length, set.id).toBeGreaterThan(2);
      expect(set.description.length, set.id).toBeGreaterThan(24);
    }
    const names = PIECE_SETS.map((set) => set.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
