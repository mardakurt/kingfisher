import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  loadBounds,
  parseBounds,
  saveBounds,
  clampBoundsToDisplays,
  resolveStartupBounds,
  recordBounds,
  WINDOW_BOUNDS_FILE,
} from './window-bounds.mjs';

let tmp;
let filePath;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'kf-bounds-'));
  filePath = path.join(tmp, WINDOW_BOUNDS_FILE);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('parseBounds', () => {
  it('accepts a complete bounds object', () => {
    expect(parseBounds({ x: 100, y: 50, width: 1440, height: 900 })).toEqual({
      x: 100,
      y: 50,
      width: 1440,
      height: 900,
    });
  });

  it('rejects a width below the minimum', () => {
    expect(parseBounds({ x: 0, y: 0, width: 100, height: 600 })).toBeNull();
  });

  it('rejects a height below the minimum', () => {
    expect(parseBounds({ x: 0, y: 0, width: 1440, height: 100 })).toBeNull();
  });

  it('rejects non-finite numbers', () => {
    expect(parseBounds({ x: NaN, y: 0, width: 1440, height: 900 })).toBeNull();
    expect(parseBounds({ x: 0, y: 0, width: 1440, height: Infinity })).toBeNull();
  });

  it('rejects implausibly large dimensions', () => {
    expect(parseBounds({ x: 0, y: 0, width: 1_000_000, height: 900 })).toBeNull();
  });

  it('rejects null and non-object inputs', () => {
    expect(parseBounds(null)).toBeNull();
    expect(parseBounds(undefined)).toBeNull();
    expect(parseBounds('not an object')).toBeNull();
    expect(parseBounds(42)).toBeNull();
  });
});

describe('loadBounds / saveBounds', () => {
  it('round-trips through the file system', () => {
    saveBounds(filePath, { x: 200, y: 100, width: 1280, height: 800 });
    expect(loadBounds(filePath)).toEqual({ x: 200, y: 100, width: 1280, height: 800 });
  });

  it('returns null when the file is missing', () => {
    expect(loadBounds(filePath)).toBeNull();
  });

  it('returns null when the file is malformed JSON', () => {
    writeFileSync(filePath, '{not json');
    expect(loadBounds(filePath)).toBeNull();
  });

  it('returns null when the JSON is well-formed but the values are bad', () => {
    writeFileSync(filePath, JSON.stringify({ x: 0, y: 0, width: 100, height: 100 }));
    expect(loadBounds(filePath)).toBeNull();
  });

  it('creates the directory if it does not exist', () => {
    const nested = path.join(tmp, 'a', 'b', 'c', WINDOW_BOUNDS_FILE);
    saveBounds(nested, { x: 0, y: 0, width: 1440, height: 900 });
    expect(existsSync(nested)).toBe(true);
    expect(JSON.parse(readFileSync(nested, 'utf8'))).toEqual({
      x: 0,
      y: 0,
      width: 1440,
      height: 900,
    });
  });
});

describe('clampBoundsToDisplays', () => {
  const primary = { x: 0, y: 0, width: 1440, height: 900 };
  const secondary = { x: 1440, y: 0, width: 2560, height: 1440 };

  it('returns the saved bounds when fully on the primary display', () => {
    const bounds = { x: 100, y: 100, width: 1280, height: 800 };
    expect(clampBoundsToDisplays(bounds, [primary])).toEqual(bounds);
  });

  it('returns the saved bounds when fully on a secondary display', () => {
    const bounds = { x: 1500, y: 100, width: 2000, height: 1200 };
    expect(clampBoundsToDisplays(bounds, [primary, secondary])).toEqual(bounds);
  });

  it('shrinks a too-tall window back into the primary display', () => {
    const bounds = { x: 0, y: 0, width: 1440, height: 4000 };
    const out = clampBoundsToDisplays(bounds, [primary]);
    expect(out.height).toBeLessThanOrEqual(primary.height);
    expect(out.width).toBe(bounds.width);
  });

  it('recenters an off-screen window on the primary display', () => {
    // Way to the right of any display
    const bounds = { x: 8000, y: 8000, width: 1280, height: 800 };
    const out = clampBoundsToDisplays(bounds, [primary, secondary]);
    expect(out.x).toBeGreaterThanOrEqual(primary.x);
    expect(out.y).toBeGreaterThanOrEqual(primary.y);
    expect(out.x + out.width).toBeLessThanOrEqual(primary.x + primary.width);
    expect(out.y + out.height).toBeLessThanOrEqual(primary.y + primary.height);
  });

  it('handles a window that is fully below all displays', () => {
    const bounds = { x: 0, y: 5000, width: 1280, height: 800 };
    const out = clampBoundsToDisplays(bounds, [primary]);
    expect(out.y).toBeGreaterThanOrEqual(primary.y);
    expect(out.y + out.height).toBeLessThanOrEqual(primary.y + primary.height);
  });

  it('handles negative coordinates that land on a secondary display', () => {
    const bounds = { x: -2000, y: 100, width: 1280, height: 800 };
    // No display covers -2000..-720, so the window is fully off-screen.
    const out = clampBoundsToDisplays(bounds, [primary]);
    expect(out.x).toBeGreaterThanOrEqual(primary.x);
  });

  it('returns null for an empty display list', () => {
    expect(clampBoundsToDisplays({ x: 0, y: 0, width: 1280, height: 800 }, [])).toBeNull();
  });

  it('uses the provided default size for the off-screen fallback', () => {
    const bounds = { x: 8000, y: 8000, width: 1280, height: 800 };
    const out = clampBoundsToDisplays(bounds, [primary], { width: 1000, height: 700 });
    expect(out.width).toBe(1000);
    expect(out.height).toBe(700);
  });
});

describe('resolveStartupBounds', () => {
  it('returns null when there is no saved file', () => {
    expect(resolveStartupBounds(filePath, [{ x: 0, y: 0, width: 1440, height: 900 }])).toBeNull();
  });

  it('returns clamped bounds when there is a saved file', () => {
    saveBounds(filePath, { x: 100, y: 100, width: 1280, height: 800 });
    const out = resolveStartupBounds(filePath, [{ x: 0, y: 0, width: 1440, height: 900 }]);
    expect(out).toEqual({ x: 100, y: 100, width: 1280, height: 800 });
  });

  it('clamps off-screen saved bounds back into a real display', () => {
    saveBounds(filePath, { x: 9000, y: 9000, width: 1280, height: 800 });
    const out = resolveStartupBounds(filePath, [{ x: 0, y: 0, width: 1440, height: 900 }]);
    expect(out.x + out.width).toBeLessThanOrEqual(1440);
    expect(out.y + out.height).toBeLessThanOrEqual(900);
  });
});

describe('recordBounds', () => {
  it('writes a valid frame to the file', () => {
    expect(recordBounds(filePath, { x: 10, y: 20, width: 1440, height: 900 })).toBe(true);
    expect(loadBounds(filePath)).toEqual({ x: 10, y: 20, width: 1440, height: 900 });
  });

  it('refuses to write a malformed frame', () => {
    expect(recordBounds(filePath, { x: NaN, y: 0, width: 1440, height: 900 })).toBe(false);
    expect(existsSync(filePath)).toBe(false);
  });

  it('refuses null', () => {
    expect(recordBounds(filePath, null)).toBe(false);
  });
});
