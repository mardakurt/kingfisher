/**
 * Persist the main window's size and position across restarts.
 *
 * macOS does not remember a window's frame between application launches when
 * the window is owned by the shell rather than by a saved `.app` document.
 * Without an explicit save, every relaunch of Kingfisher reopens at the same
 * 1440×920 default and the user has to resize by hand each time. Worse, a
 * window that was last on a now-disconnected external display comes back at
 * coordinates nothing can see, and the application looks broken on first
 * launch.
 *
 * This module fixes both. It writes one small JSON file in `userData` and
 * reads it back on startup; the load step is responsible for clamping the
 * remembered frame to a display the user actually has, so a stale frame
 * cannot trap a window off-screen.
 *
 * The clamp step is the part worth testing: it is pure data in, data out,
 * with no Electron handle, and the failure it prevents is "the application
 * reopens invisibly". Everything else is plumbing.
 *
 * No telemetry, no upload. The file lives in the same `userData` the rest
 * of the shell writes to and is rotated by the existing log logic.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const WINDOW_BOUNDS_FILE = 'window-bounds.json';

/** A frame the shell saved last time and would like to restore. */
export const NULL_BOUNDS = Object.freeze({ x: null, y: null, width: null, height: null });

const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
/** Anything beyond this in any direction is treated as garbage data. */
const MAX_DIMENSION = 16_384;

/**
 * Parse a saved JSON file into a bounds object, or `null` if the file is
 * missing, unreadable, malformed, or carries values outside what is plausible
 * for a window. The shape is loose because the file is small and human-touched
 * enough that a strict shape would fail closed too often.
 */
export function parseBounds(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { x, y, width, height } = raw;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) return null;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) return null;
  if (Math.abs(x) > MAX_DIMENSION || Math.abs(y) > MAX_DIMENSION) return null;
  return { x, y, width, height };
}

export function loadBounds(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return parseBounds(raw);
  } catch {
    return null;
  }
}

export function saveBounds(filePath, bounds) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(bounds));
}

/**
 * Clamp a remembered frame to a display the user actually has.
 *
 * If the saved frame is fully on-screen against any of the supplied
 * `workAreas`, return it unchanged. If it is partially visible, the
 * intersection is returned (preserving the user's chosen size where possible,
 * and only resizing when the saved size no longer fits any display). If it
 * is fully off-screen, center a sensible default on the primary work area
 * (the first one passed in; the shell's screen module always puts the
 * primary display first).
 *
 * `workAreas` is an array of `{ x, y, width, height }` rectangles in the
 * coordinate space the window frame uses. The function never throws on a
 * well-formed list, and returns `null` only when the list itself is empty —
 * the caller is expected to fall back to its own default.
 */
export function clampBoundsToDisplays(bounds, workAreas, defaults) {
  if (!Array.isArray(workAreas) || workAreas.length === 0) return null;
  const primary = workAreas[0];
  const fallback = {
    width: defaults?.width ?? MIN_WIDTH,
    height: defaults?.height ?? MIN_HEIGHT,
  };

  const fits = (rect) => {
    const fitsOn = (area) =>
      rect.x >= area.x - 1 &&
      rect.y >= area.y - 1 &&
      rect.x + rect.width <= area.x + area.width + 1 &&
      rect.y + rect.height <= area.y + area.height + 1;
    return workAreas.some(fitsOn);
  };

  if (fits(bounds)) return { ...bounds };

  // At least part is visible: pick the largest intersection and keep the
  // saved size when the display can hold it, otherwise shrink to fit.
  let best = null;
  let bestArea = 0;
  for (const area of workAreas) {
    const ix = Math.max(area.x, bounds.x);
    const iy = Math.max(area.y, bounds.y);
    const ir = Math.min(area.x + area.width, bounds.x + bounds.width);
    const ib = Math.min(area.y + area.height, bounds.y + bounds.height);
    const w = ir - ix;
    const h = ib - iy;
    if (w <= 0 || h <= 0) continue;
    const a = w * h;
    if (a > bestArea) {
      bestArea = a;
      best = area;
    }
  }

  if (best) {
    const width = Math.min(bounds.width, best.width);
    const height = Math.min(bounds.height, best.height);
    return {
      x: best.x + Math.round((best.width - width) / 2),
      y: best.y + Math.round((best.height - height) / 2),
      width,
      height,
    };
  }

  // Fully off-screen: center the fallback on the primary display.
  return {
    x: primary.x + Math.round((primary.width - fallback.width) / 2),
    y: primary.y + Math.round((primary.height - fallback.height) / 2),
    width: fallback.width,
    height: fallback.height,
  };
}

/**
 * Pull the remembered frame (clamped to a real display) for a fresh launch.
 *
 * Pass the list of work areas you got from `screen.getAllDisplays()` and the
 * bounds file path. The return value is either a frame the window can adopt
 * directly, or `null` if the saved data is missing, malformed, or the
 * display list is empty. The caller is responsible for the default fallback.
 */
export function resolveStartupBounds(filePath, workAreas, defaults) {
  const saved = loadBounds(filePath);
  if (!saved) return null;
  return clampBoundsToDisplays(saved, workAreas, defaults);
}

/** Persist a fresh frame after a resize/move, with a tiny shape check. */
export function recordBounds(filePath, frame) {
  if (!frame) return false;
  const { x, y, width, height } = frame;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  saveBounds(filePath, { x, y, width, height });
  return true;
}

/**
 * Keep a window's frame on disk as it moves and resizes.
 *
 * Debounced, because a drag fires the events dozens of times a second. And
 * guarded, because a window closed inside the debounce interval is gone by
 * the time the timer fires: asking it for bounds threw "Object has been
 * destroyed" from the main process, which Electron shows the user as a
 * JavaScript error dialog. Found by the seeded walk — resize, then close
 * within 400 ms. `close` flushes the last frame synchronously, so the
 * position a person left the window in is the one it reopens at.
 *
 * @param {{ on(event: string, fn: () => void): unknown, isDestroyed(): boolean, getBounds(): object }} window
 * @param {{ file: string, log?: (tag: string, message: string) => void, debounceMs?: number, setTimeoutImpl?: typeof setTimeout, clearTimeoutImpl?: typeof clearTimeout }} options
 * @returns {() => void} a function that saves now, for tests and for close
 */
export function attachBoundsPersistence(
  window,
  {
    file,
    log = () => {},
    debounceMs = 400,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
  },
) {
  let timer = null;
  const save = () => {
    if (window.isDestroyed()) return false;
    const b = window.getBounds();
    const saved = recordBounds(file, b);
    if (saved) log('window', `saved bounds ${b.width}×${b.height} at (${b.x}, ${b.y})`);
    return saved;
  };
  const later = () => {
    if (timer) clearTimeoutImpl(timer);
    timer = setTimeoutImpl(() => {
      timer = null;
      save();
    }, debounceMs);
  };
  window.on('resize', later);
  window.on('move', later);
  window.on('close', () => {
    if (timer) clearTimeoutImpl(timer);
    timer = null;
    save();
  });
  return save;
}
