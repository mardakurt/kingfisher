'use client';

/**
 * The one place Kingfisher makes room for the macOS window buttons.
 *
 * ## The problem this exists for
 *
 * On macOS the shell hides the title bar, so the application's own first pixel
 * is at the very top-left of the window — and so are the three traffic lights,
 * which the operating system draws on top of the web contents. They are not in
 * the DOM. Nothing in the renderer can measure them, hit-test them, or notice
 * that it has drawn a button underneath one.
 *
 * Kingfisher drew the Kingfisher mark underneath one for nineteen phases.
 *
 * ## The rule
 *
 * There is exactly one mechanism, and this file is it. Two CSS custom
 * properties — `--titlebar-safe-w` and `--titlebar-safe-h` — carry the
 * rectangle from `desktop/src/window-chrome.mjs`, which is also what the shell
 * reads to place the buttons. They are zero everywhere else, so a browser, a
 * Windows shell and a Linux shell all reserve nothing at all.
 *
 * No component may hard-code a padding for the window buttons. That was the
 * anti-pattern to avoid here: `padding-left: 76px` scattered through the four
 * surfaces that happen to touch the corner today, silently wrong the first time
 * anybody changes the inset or adds a fifth.
 *
 * ## Why two shapes and not one
 *
 * The corner belongs to whatever Kingfisher renders in it, and that is one of
 * two things.
 *
 * With navigation on screen it is the sidebar's header — already 56 px tall, so
 * the buttons fit inside a band that exists anyway and the reservation is
 * purely horizontal. That matters: it costs the board nothing, and the board is
 * the thing this application is for.
 *
 * With navigation gone — focus mode, or a window narrow enough that the sidebar
 * has given way to the mobile bar — nothing is reserved horizontally and the
 * corner belongs to the workspace, whose top-left control differs on every
 * route. Reserving a band is the only answer that does not require all of them
 * to cooperate, and it is the cheaper trade in the mode that just took 228 px
 * of sidebar away.
 *
 * ## Dragging
 *
 * Both shapes are drag regions. A window whose title bar is hidden still has to
 * be movable, and these are the two pieces of chrome guaranteed to be empty —
 * which is the requirement, because `app-region: drag` swallows clicks for
 * every descendant. Nothing interactive is ever placed inside one.
 */

import { cn } from '@/lib/cn';

/**
 * `-webkit-app-region` is not in React's CSSProperties, and it is not a custom
 * property either. One cast, stated once, rather than at each use.
 */
const DRAGGABLE = { WebkitAppRegion: 'drag' } as React.CSSProperties;

/**
 * The horizontal reservation, for a header that already spans the corner.
 *
 * Rendered unconditionally and sized entirely from the custom properties, so
 * the server's markup and the browser's agree and there is no hydration seam.
 * In a browser it is a zero-by-zero element with no border, no background and
 * no content — present in the tree, absent from the layout.
 */
export function TitleBarSafeCorner({ className }: { readonly className?: string }) {
  return (
    <div
      aria-hidden
      data-titlebar-safe="corner"
      className={cn('shrink-0 self-stretch', className)}
      /*
        `min()` against the container is what keeps the collapsed navigation
        rail honest. The rail is 72 px and the safe width is 76 px; without the
        clamp the reservation would push the rail's own content out of it. The
        buttons themselves end at 68 px, so they still fit — see the note on the
        width in `window-chrome.mjs`, which is where that constraint is stated.
      */
      style={{ width: 'min(var(--titlebar-safe-w), 100%)', ...DRAGGABLE }}
    />
  );
}

/**
 * The vertical reservation, for when no header spans the corner.
 *
 * `md:hidden` unless focus mode is on: above that breakpoint the sidebar is
 * rendered and its header has already reserved the corner horizontally, so a
 * band would be reserving it twice. Below it the sidebar is gone — Kingfisher
 * shows the mobile navigation instead — and the band is the only reservation
 * there is. A desktop window cannot be narrowed that far, but it can be zoomed
 * that far, which is the same thing to CSS.
 */
export function TitleBarSafeBand({ focusMode }: { readonly focusMode: boolean }) {
  return (
    <div
      aria-hidden
      data-titlebar-safe="band"
      className={cn('w-full shrink-0', focusMode ? undefined : 'md:hidden')}
      style={{ height: 'var(--titlebar-safe-h)', ...DRAGGABLE }}
    />
  );
}
