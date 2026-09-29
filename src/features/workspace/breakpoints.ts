/**
 * The workspace's layout thresholds, in one place.
 *
 * Each of these was a literal in two or three modules, restating a number the
 * stylesheet already owns as a token. The failure mode is not a wrong number
 * today — it is that changing the token moves the CSS and leaves the JavaScript
 * deciding something different, in a different file, silently. The workspace
 * chose desktop-vs-compact from two modules reading two copies of `1100`, and
 * the short-screen threshold from a third.
 *
 * `breakpoints.test.ts` reads `globals.css` and asserts each constant still
 * equals its token, so a token edited without this file following fails the
 * suite rather than producing a window that lays out two different ways.
 */

/** `--breakpoint-board`, the width at which the board gets the room it needs. */
export const BOARD_BREAKPOINT_PX = 1100;

/** The width at which the app switches out of compact. */
export const DESKTOP_MIN_WIDTH_QUERY = `(min-width: ${BOARD_BREAKPOINT_PX}px)`;

/**
 * The height at which the workspace is "tall", and the negation of it.
 *
 * The two must partition the range with no gap between them, because they are
 * used as complements: the padding that applies on a short window and the
 * padding that applies on a tall one. Written as `max-height: 859px` the pair
 * leaves a 1px hole — a viewport height of 859.5, which browser zoom and
 * fractional device pixel ratios produce, matches *neither*, and the board gets
 * the tight padding while losing the loose one. The negation therefore stops
 * just short of the positive rather than at the pixel below it.
 */
export const TALL_VIEWPORT_PX = 860;
export const TALL_VIEWPORT_QUERY = `(min-height: ${TALL_VIEWPORT_PX}px)`;
export const SHORT_VIEWPORT_QUERY = `(max-height: ${TALL_VIEWPORT_PX - 0.02}px)`;

/**
 * The same two thresholds as Tailwind arbitrary media variants — **literals**.
 *
 * This is the third time this session that a class assembled by interpolation
 * silently did nothing, and the third time typecheck, lint and every unit test
 * passed while the layout was wrong. Tailwind scans source *text* for complete
 * class names; `[@${TALL_VIEWPORT_TAILWIND_QUERY}]:sm:px-5` contains no
 * complete class, so nothing was emitted and the workspace lost its padding at
 * every tall viewport. It surfaced as eleven failing visual baselines and
 * nothing else. The queries above are for `matchMedia` and may be built any
 * way a test likes; these are for the build and must be spelled out.
 */
export const SHORT_VIEWPORT_PADDING_CLASS = '[@media(max-height:859.98px)]:py-1';
export const TALL_VIEWPORT_PADDING_CLASS =
  '[@media(min-height:860px)]:sm:px-5 [@media(min-height:860px)]:sm:py-4';

/*
 * The two widths below are not tokens, and were not invented to be. They are
 * the existing arrangement's own shape — below 1400 the workspace cannot carry
 * a dock and a full document side by side, below 1600 the dock's own controls
 * stop fitting — and they are named here so the intent travels with the number
 * instead of sitting in a ternary three hundred lines from the layout it
 * describes. They are deliberately *not* `--breakpoint-panes` (1180) or
 * `--breakpoint-wide` (1080), which mean something else: those are where the
 * CSS grid reflows, these are where this arrangement folds.
 */
export const LAPTOP_MAX_WIDTH_PX = 1399;
export const LAPTOP_MAX_WIDTH_QUERY = `(max-width: ${LAPTOP_MAX_WIDTH_PX}px)`;

export const NARROW_DOCK_MAX_WIDTH_PX = 1599;
export const NARROW_DOCK_MAX_WIDTH_QUERY = `(max-width: ${NARROW_DOCK_MAX_WIDTH_PX}px)`;

/**
 * The titlebar band: the 56px strip across the top of the window that the
 * macOS window buttons sit inside.
 *
 * This one is shared between CSS and JS, so it is a measurement rather than a
 * class name — `h-14` in four files plus two workspaces that roll their own
 * header. Those four are the entire fixed-height `data-titlebar-drag` surface,
 * so a height changed in one of them silently changes window-drag geometry in
 * another. The contract between the band and the traffic lights is written
 * down in `docs/design/macos-window-chrome.md`; this is the other half of it.
 */
export const TITLEBAR_BAND_PX = 56;

/**
 * The Tailwind class for that height — and it is a *literal*, on purpose.
 *
 * Written as `` `h-[${TITLEBAR_BAND_PX}px]` `` it is correct TypeScript and
 * silently does nothing: Tailwind scans source text for complete class names
 * and cannot evaluate an interpolation, so no rule is ever emitted, the header
 * falls back to being sized by its contents, and the window-chrome suite
 * measures 36px where 56 was contracted. It failed silently because the header
 * still *looked* like a header; the ring was gone, not the box.
 *
 * The number is duplicated here on purpose, and `breakpoints.test.ts` asserts
 * the two agree — a duplicate the build can read, checked by a test, beats a
 * single source the build cannot.
 */
export const TITLEBAR_BAND_CLASS = 'h-[56px]';

/** The same height as a floor, for headers whose content may exceed the band. */
export const TITLEBAR_BAND_MIN_CLASS = 'min-h-[56px]';
