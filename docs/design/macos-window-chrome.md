# The macOS title bar

Kingfisher's desktop shell hides the title bar, so macOS draws its three window
buttons directly on top of the web contents and the application's own first
pixel is at (0, 0) — underneath them. This document states the geometry that
resolves that, and the reasoning behind each number, so the corner can be
_asserted_ rather than looked at.

The single source of the numbers is `desktop/src/window-chrome.mjs`. Nothing
else may state them: the shell reads it to place the buttons, and the renderer
is handed the same object across the bridge and reserves exactly that. No
component hard-codes a padding for the window buttons.

## The problem in two parts

**Phase 21 fixed the collision.** Before it, the buttons were drawn on top of
the Kingfisher mark — mark at (14, 10), buttons at (14, 12) — in every window
since the shell existed.

**Phase 22 fixed the composition.** "No collision" is satisfied by any amount
of space, so what Phase 21 left behind was the shape a safety margin produces
rather than the shape a designer would choose. Measured in the shell before
this phase:

| Symptom                                      | Measured                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Dead space between the buttons and the mark  | **32 px**, where the stated gutter was 8                                               |
| Buttons against their own row                | button centre **y 20**, brand centre **y 28** — eight pixels high                      |
| Brand group against the header's right inset | wordmark ended at **x 223**, past the header's 214 content edge and 5 px from the edge |

The 32 px had a single cause. The safe rectangle is stated in _window_
coordinates, so it already contains the 14 px button inset — but it was
rendered as a flex child _inside_ a header that had already inset itself by 14,
and was then followed by the header's 10 px flex gap. The inset was paid twice
and a gap was added that nobody had designed: 14 + 76 + 10 = 100.

## The four regions

Everything happens in the window's first 56 pixels, which is also the height of
the sidebar header.

```
  0    14                  68    84                              214
  │    │                   │     │                                │
  ├────┤   ●   ●   ●   ├───┤     ├────────────────────────────────┤
  inset    traffic lights  gap    brand region                     header
                                  (36 px mark · 10 · wordmark)     right inset
```

| Region              | Value                   | Why it is that value                                                                                                                                                                                                       |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Inset**        | `x = 14`                | Not a free choice. The collapsed rail is 72 px and the buttons must fit inside it: 14 + 54 = 68 leaves four pixels. Any larger inset stops fitting, and a button overhanging the rail is worse than the bug this replaces. |
| **2. Buttons**      | `54 × 16` at `(14, 20)` | macOS lays them out on its own metrics from the origin it is given: 14 pt frames, 20 pt centre to centre. Derived, not chosen.                                                                                             |
| **3. Gap**          | `16 px`                 | A **design** gap, not a safety floor. Phase 21's 8 px was the floor — "far enough that somebody aiming at zoom misses a Kingfisher control" — and a floor used as a design value is how the corner drifted.                |
| **4. Brand region** | `84 .. 214`             | The mark's left edge is exactly `MAC_TITLEBAR_SAFE.width`. 36 px mark, 10 px gap, 77 px wordmark ends at 207, leaving the header's own 14 px right inset intact.                                                           |

## The vertical

`y = 20`. The 16 px button group spans 20 .. 36, so its centre lands on **28** —
the centre line of the 56 px sidebar header, where the mark and the wordmark
are already centred.

At Phase 21's `y = 12` the buttons centred on 20 while everything beside them
centred on 28. Eight pixels is small, and it is most of what "the area does not
look intentional" was pointing at: three controls floating above the row they
belong to.

## What the renderer does with it

Two CSS custom properties carry the rectangle — `--titlebar-safe-w` (84) and
`--titlebar-safe-h` (52) — set before first paint by the bootstrap in
`layout.tsx`, for the same reason the theme is. They are **0px** in a browser,
on Windows and on Linux, so nothing is reserved where nothing is drawn.

The reservation **is** the sidebar header's left inset rather than a spacer
inside it:

```
padding-left: max(<the header's own inset>, var(--titlebar-safe-w))
```

That is the whole fix for the 32 px. In a browser the `max()` resolves to the
header's own 14 px and every web pixel is unchanged; in the shell it resolves
to 84 and the mark lands 16 px clear of the last button.

`src/features/shell/TitleBarSafeArea.tsx` still renders a `corner` element, but
it is now an absolutely-positioned marker of the exact rectangle rather than a
layout spacer — it is what the harness measures, and it carries
`-webkit-app-region: drag`.

### Dragging

A window whose title bar is hidden still has to be movable. The sidebar header
is the drag region (`data-titlebar-drag`), with `no-drag` restored for any
interactive descendant, because `app-region: drag` otherwise swallows clicks
for every child. The rule is scoped to `:root[data-titlebar='mac-hidden-titlebar']`,
so a browser — where the property is inert but not harmless, since an installed
PWA honours it — declares nothing at all.

### Two shapes, not one

The corner belongs to whatever Kingfisher renders in it, and that is one of two
things.

- **With navigation on screen** it is the sidebar header, already 56 px tall,
  so the reservation is purely horizontal and **the board loses nothing**.
- **With navigation gone** — focus mode, or a window narrow enough that the
  sidebar has become the mobile bar — nothing is reserved horizontally and a
  52 px band reserves it instead. That is the only answer that does not require
  every route's header to cooperate.

### The collapsed rail

The rail is 72 px and the safe rectangle is 84, so there is no room left for
the mark. It is hidden there, in CSS keyed on `data-titlebar` so no frame of
overlap is ever rendered, and the rail shows the operating system's controls
and then the navigation icons — which is what a Mac application with a
collapsed sidebar looks like anyway.

### Full screen

In full screen macOS moves the buttons into the auto-hiding menu bar and draws
nothing in the corner, so a reservation kept there holds the mark 84 px in from
an edge with nothing in the way — the corner every Mac user has seen in an
application that did not notice. The reservation therefore exists while the
buttons do, and only then.

Two things make that honest. The state is **reported, never inferred**: the
shell relays the window's own `enter-full-screen` and `leave-full-screen` as
one boolean on `kingfisher:fullscreen` (and answers the current state when a
renderer attaches), and nothing on the bridge lets the page set, move or size
the window. And the geometry stays **in CSS**: the bootstrap writes the shell's
rectangle as `--mac-titlebar-safe-*`, the reservation `--titlebar-safe-*` is
derived from it in `globals.css`, and `:root[data-fullscreen='true']` sets the
derived pair to zero — so the header's inset, the corner marker and the band
collapse in the same frame, and the mark lands at the header's plain 14 px
inset, exactly where a browser shows it. An inline reservation on the root, as
before Phase 48, could never have collapsed: inline beats any stylesheet rule.
The header's `padding-left` transitions over `--motion-standard`, short enough
to sit inside macOS's own full-screen animation. In the collapsed rail the mark
returns for the same reason it was hidden: there is room again.

## How it is checked

`npm run desktop:chrome -- --packaged` launches the real application, asks the
main process where it put the buttons, asks the renderer where it drew
everything, and intersects the two. It checks three kinds of thing:

1. **Nothing collides** — no interactive control and not the mark, across six
   window sizes, five routes, both sidebar states, focus mode, both themes,
   maximise/restore, and the smallest window the shell permits.
1. **Full screen collapses and returns** — inside full screen the root carries
   `data-fullscreen`, the reservation reads `0px × 0px` and the mark is at
   14 px; on the way out the attribute is gone and the composition below holds
   again. No collision check is made inside full screen, deliberately: the
   button rectangle is empty there, and the mark being in it is the point.
1. **The composition holds** — the mark's left edge is exactly
   `MAC_BRAND_REGION.x`, the gap from the last button is exactly
   `MAC_TITLEBAR_GAP`, and the mark's centre line is the buttons' centre line.
   A build where the brand has drifted right again fails here rather than in
   somebody's screenshot six weeks later.
1. **The web build reserves nothing** — that half is
   `e2e/window-chrome.spec.ts`, because the mirror-image defect is a browser
   tab carrying an 84-pixel notch for a control it does not have.

### What cannot be checked here

The traffic lights are `NSButton`s drawn by the operating system. They are not
in the DOM, no browser test can see them, and this machine has neither
`screencapture` permission nor screen-control access, so **there is no
photograph of the three coloured circles in this repository.** The geometry
above is measured from both processes and asserted; the appearance of the
buttons themselves is macOS's, and is stated rather than shown. That is a
limitation of the environment, not a claim that a screenshot was taken.
