import { describe, expect, it } from 'vitest';
import { BOARD_THEMES } from './themes';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

for (const theme of BOARD_THEMES) {
  describe(`${theme.name} coordinate labels`, () => {
    it.each(['Light', 'Dark'] as const)('read at 4.5:1 on %s squares', (tone) => {
      const ink = theme[`coordinateOn${tone}`];
      const square = tone === 'Light' ? theme.light : theme.dark;
      const light = Math.max(luminance(ink), luminance(square));
      const dark = Math.min(luminance(ink), luminance(square));
      expect((light + 0.05) / (dark + 0.05), `${ink} on ${square}`).toBeGreaterThanOrEqual(4.5);
    });
  });
}
