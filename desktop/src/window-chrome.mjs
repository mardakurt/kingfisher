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
 * ## The four regions
 *
 * Phase 21 made the buttons and the application stop overlapping. It did not
 * make the result look composed, and the owner said so. The difference is that
 * "no collision" is satisfied by *any* amount of space, so the corner drifted
 * into the shape a safety margin produces rather than the shape a designer
 * would choose. What follows is therefore stated as a composition, in four
 * regions across the window's first 56 pixels, each with a reason:
 *
 * ```
 *   0    14                68   84                            214
 *   │    │                 │    │                              │
 *   ├────┤  ●  ●  ●  ├─────┤    ├──────────────────────────────┤
 *   inset  traffic lights   gap  brand region                   header
 *                                (mark, then the wordmark)      right inset
 * ```
 *
 * **1. The inset.** `x = 14`, and it is not a free choice. Kingfisher's
 * collapsed navigation rail is 72 px (`--sidebar-collapsed`), and the buttons
 * must fit inside it, because a button hanging over the rail's edge onto the
 * board is worse than the bug this replaces. 14 + 54 = 68 leaves four pixels.
 * Any larger inset stops fitting.
 *
 * **2. The buttons.** macOS lays them out on its own metrics given that
 * origin: 14 pt frames, 20 pt centre to centre, so the group spans `x .. x+54`
 * and `y .. y+16`. Derived, not chosen.
 *
 * **3. The gap.** 16 px, and it is a *design* gap rather than a safety margin.
 * The two are easy to confuse and Phase 21 confused them: it picked 8 px as
 * "enough that a user aiming at zoom does not hit a Kingfisher control", which
 * is a floor, and then the corner ended up with 32 px of dead space anyway
 * because the reservation was applied inside a container that had already
 * inset itself by 14 (see `TitleBarSafeArea.tsx`). 16 px is what the last
 * button to the first Kingfisher pixel should actually be, and it is now what
 * it measures.
 *
 * **4. The brand region.** Everything from `MAC_TITLEBAR_SAFE.width` to the
 * sidebar header's own right inset. At the expanded sidebar's 228 px that is
 * 84 .. 214: the 36 px mark, a 10 px gap, and the 77 px wordmark end at 207,
 * leaving the header's right inset intact. Under the old numbers the group
 * started at 100 and ran to 223 — past the header's right inset by 9 px and
 * within 5 px of the sidebar's edge, which is the crowding the owner reported.
 *
 * ## The vertical
 *
 * `y = 20`, so the 16 px button group spans 20 .. 36 and its centre lands on
 * 28 — the centre line of the 56 px sidebar header, which is where the mark
 * and the wordmark are already centred. At Phase 21's `y = 12` the buttons
 * centred on 20 and everything Kingfisher drew beside them centred on 28, so
 * the controls rode eight pixels high against their own row. That is small,
 * and it is most of what "does not look intentional" was pointing at.
 */

/** The close button's frame origin, in window coordinates. */
export const MAC_TRAFFIC_LIGHT_POSITION = { x: 14, y: 20 };

/** What macOS draws there, given that origin. Derived, not chosen. */
export const MAC_TRAFFIC_LIGHT_BOUNDS = {
  x: MAC_TRAFFIC_LIGHT_POSITION.x,
  y: MAC_TRAFFIC_LIGHT_POSITION.y,
  width: 54,
  height: 16,
};

/**
 * The gap between the last button and the first thing Kingfisher draws.
 *
 * Region 3 above. Applied on both axes: horizontally it separates the buttons
 * from the brand, vertically it separates them from whatever a workspace draws
 * under them when no sidebar header owns the corner.
 */
export const MAC_TITLEBAR_GAP = 16;

/** The rectangle the application must leave empty. */
export const MAC_TITLEBAR_SAFE = {
  width: MAC_TRAFFIC_LIGHT_BOUNDS.x + MAC_TRAFFIC_LIGHT_BOUNDS.width + MAC_TITLEBAR_GAP,
  height: MAC_TRAFFIC_LIGHT_BOUNDS.y + MAC_TRAFFIC_LIGHT_BOUNDS.height + MAC_TITLEBAR_GAP,
};

/**
 * Where the first Kingfisher pixel goes, and the line it centres on.
 *
 * Stated so the composition can be *asserted* rather than looked at.
 * `scripts/desktop-chrome.mjs` checks the mark against both: a build where the
 * brand has drifted right again, or has stopped sharing a centre line with the
 * controls, fails there rather than in somebody's screenshot six weeks later.
 */
export const MAC_BRAND_REGION = {
  /** The mark's left edge, in window coordinates. */
  x: MAC_TITLEBAR_SAFE.width,
  /** The centre both the buttons and the brand sit on. */
  centreY: MAC_TRAFFIC_LIGHT_BOUNDS.y + MAC_TRAFFIC_LIGHT_BOUNDS.height / 2,
};

/**
 * The IPC channels full screen travels on, named once for both processes.
 *
 * ## Why full screen is a state the renderer has to be told about
 *
 * In full screen macOS takes the traffic lights away: they live in the
 * auto-hiding menu bar and are drawn over nothing. The rectangle above is then
 * a reservation for controls that are not there, and a sidebar that kept
 * honouring it would hold its brand 84 px in from an edge with nothing in the
 * way — the corner a person notices in every Mac application that got this
 * wrong. The reservation therefore collapses to zero for as long as the window
 * is full screen, and the brand moves into the space, and it moves back when
 * the buttons do.
 *
 * "Is the window full screen" is a fact only the shell has. The renderer must
 * not infer it from the viewport — an external display at the window's own
 * size is not full screen, and a full-screen window on a small panel is not
 * wide — so the shell reports the window's `enter-full-screen` and
 * `leave-full-screen` events, and the renderer asks once on attach so a
 * reload inside full screen starts in the right state. What crosses the bridge
 * is one boolean; the renderer gets no handle on the window and cannot set it.
 */
export const FULLSCREEN_CHANNELS = Object.freeze({
  /** Shell → renderer: `true` on entering full screen, `false` on leaving. */
  changed: 'kingfisher:fullscreen',
  /** Renderer → shell: a listener attached; answer with the current state. */
  wanted: 'kingfisher:fullscreen-wanted',
});

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
