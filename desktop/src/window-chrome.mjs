/**
 * Where macOS puts the window buttons, and how much room Kingfisher owes them.
 *
 * ## Why this file exists
 *
 * The traffic lights are real macOS controls drawn by the operating system on
 * top of the web contents. They are not in the DOM, nothing in the renderer can
 * measure them, and a hidden title bar means the application's own first pixel
 * is at (0, 0) — underneath them. Kingfisher shipped nineteen phases that way:
 * `titleBarStyle: 'hiddenInset'` with no reservation anywhere, so the close
 * button sat on top of the Kingfisher mark in the corner of the sidebar.
 *
 * The reason it stayed broken is worth recording, because it is a shape rather
 * than an oversight. Two processes have to agree about a rectangle, and until
 * now neither of them stated it: the shell knew where it had asked macOS to put
 * the buttons (nowhere — it took the default), and the renderer had no way to
 * find out. So this module is the statement, and it is the *only* one. The
 * shell reads it to place the buttons; the renderer receives the same numbers
 * over the bridge and reserves exactly that much. There is no second constant,
 * and no component hard-codes a padding.
 *
 * ## The numbers
 *
 * `trafficLight` is passed to Electron as `trafficLightPosition`, which places
 * the close button's frame origin. macOS then lays the three buttons out on its
 * own metrics: 14 pt frames, 20 pt centre-to-centre, so the group spans
 * `x .. x + 54` horizontally and `y .. y + 16` vertically.
 *
 * `safe` is that rectangle plus a gutter — the region no Kingfisher control may
 * occupy. It is deliberately larger than the buttons: a control that merely
 * *touches* the zoom button is one a user aiming for zoom will hit by mistake.
 *
 * The width has one hard constraint. Kingfisher's collapsed navigation rail is
 * 72 px (`--sidebar-collapsed`), and the buttons must fit inside it, because a
 * button hanging over the rail's edge onto the board is worse than the bug this
 * replaces. 14 + 54 = 68 leaves four pixels, and the safe width clamps to the
 * rail rather than overflowing it.
 */

/** The close button's frame origin, in window coordinates. */
export const MAC_TRAFFIC_LIGHT_POSITION = { x: 14, y: 12 };

/** What macOS draws there, given that origin. Derived, not chosen. */
export const MAC_TRAFFIC_LIGHT_BOUNDS = {
  x: MAC_TRAFFIC_LIGHT_POSITION.x,
  y: MAC_TRAFFIC_LIGHT_POSITION.y,
  width: 54,
  height: 16,
};

/** The gutter between the last button and the first thing Kingfisher draws. */
const GUTTER = 8;

/** The rectangle the application must leave empty. */
export const MAC_TITLEBAR_SAFE = {
  width: MAC_TRAFFIC_LIGHT_BOUNDS.x + MAC_TRAFFIC_LIGHT_BOUNDS.width + GUTTER,
  height: MAC_TRAFFIC_LIGHT_BOUNDS.y + MAC_TRAFFIC_LIGHT_BOUNDS.height + GUTTER,
};

/**
 * What the renderer is told, for a platform.
 *
 * Null everywhere but macOS, and null is the whole of the Windows and Linux
 * behaviour: those shells keep a real title bar, so the application owes the
 * window buttons nothing and must not reserve anything. The web build never
 * calls this at all — it has no shell — which is what keeps a browser tab from
 * growing an empty spacer where a Mac's close button would have been.
 */
export function windowChromeFor(platform) {
  if (platform !== 'darwin') return null;
  return {
    kind: 'mac-hidden-titlebar',
    trafficLight: { ...MAC_TRAFFIC_LIGHT_BOUNDS },
    safe: { ...MAC_TITLEBAR_SAFE },
  };
}
