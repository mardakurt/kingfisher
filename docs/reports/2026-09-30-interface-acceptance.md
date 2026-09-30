# Shared interface acceptance — 2026-09-30

Starting point: clean `master` at `74bd84ad4dd95784eb9edb4d8a387427d53fe0b9`,
matching `origin/master`, after the fast-forward merge of `shell-bugfix-pass`.
Implementation branch: `codex/interface-acceptance`.

This continues the four stages proposed in the Electron assessment. The prior
handoff and merge are complete; their exact evidence is in
[the preceding report](2026-09-29-interface-continuation.md). Retain Electron
and the shared React interface. No chess domain, engine protocol, persistence
schema, desktop origin, traffic-light geometry, native file boundary or updater
architecture is replaced here.

## Changes

- Research workspace is an opt-in layout, available from Layout. A full-height
  board sits beside notation, the selected reference tool and one engine panel.
  Compact candidates show six half-moves; Preview and Insert use the complete
  line. Three candidates are visible at laptop height. Comparison controls remain in
  the full Engine tab rather than squeezing two engines into the strip. Selecting the full
  Engine tab, moving Engine to another region or entering compact mode removes
  the split, rather than mounting a second engine panel.
- The lower divider now has separator semantics, a measured value and the same
  arrow/Shift/Home/End keyboard interaction as the side divider. A packaged pass
  found that consumed divider keys also reached global chess navigation. The
  shortcut handler now respects `defaultPrevented`; a populated-position
  regression failed before this fix and passes afterward.
- Library rows support Home/End, preserve preview selection and ignore keys
  originating in their nested controls.
- Preparation session actions share the search/filter toolbar. An empty
  session selector and its extra row are deferred until there is a session.
- Dialogs, the command palette, global shortcuts and opponent suggestions leave
  composition keys to the input method. This covers Chromium composition events;
  it is not proof of every installed macOS input source.
- The shared board describes side to move, move number, orientation and selected
  square through `aria-describedby`. Notation exposes `aria-current="step"`.
  Engine candidate updates are not live announcements.
- The optional research layout flag round-trips through layout sanitization;
  older records remain unsplit and malformed values are ignored.

## Representative workspace and verification

`e2e/interface-acceptance.spec.ts` imports the first actual annotated game in
`capablanca-chess-fundamentals-1921.pgn`. It uses the installed Kingfisher Starter
Reference and real three-line engine searches. Both light and dark themes are
checked at 1440×900, 1280×720, 1100×800 and 900×600. Normal laptop views retain a
board of at least 480 px; compact mode exposes notation and engine through tabs,
then restores the research desk when widened. There is no page-level horizontal
scrolling. No proprietary ChessBase assets were added.

The research layout, divider, composition-Escape and Library table regressions
were run against the previous implementation and failed before their fixes.
The board-description regression also failed before its accessibility changes.
The initial focused run passed 12/12; the subsequent accessibility-inclusive
interface run passed 5/5. Token tests check primary/secondary/tertiary text
against all four surfaces at 4.5:1, and keyboard focus at 3:1, in both themes.
These tests do not certify every opacity, image, or custom control combination.

A dedicated coordinate audit found that the page audit intentionally excludes
boards: 24 of 26 base square/coordinate pairs failed 4.5:1. Their ink now uses
a legible color from the theme's piece palette, with black/white where neither
piece color reaches the threshold, preserving square and piece colors. The new
regression failed on the old theme table. Highlight overlays and wood texture
variations are not included in this base-color calculation.
All 43 visual checks still pass with the corrected coordinate ink; no baseline
was regenerated. These small ink changes remain within the existing pixel
tolerance, so the dedicated contrast regression supplies the precise check.

The first full source pass returned 3,904/3,904 unit tests and 438/438 browser
tests. Signed dev build 996 (`e4cd6a9`) passed 10/10 desktop certification gates.
A subsequent populated keyboard pass exposed the divider/global-shortcut
interaction above, so that build is intermediate evidence, not the final
acceptance package. The corrected revision and fresh results will be recorded
here after completion.
A screenshot or DOM accessibility assertion does not constitute a VoiceOver
usability result.

## Performance protocol

`scripts/desktop-interface-performance.mjs` compares two exact packaged apps in
fresh disposable profiles. It records the machine, OS, five startup trials,
settled RSS of the entire descendant process tree, and 250 navigation samples
per app after warmup in each of two conditions: stopped search and a running
follow-board search. It imports the same annotated game and uses the default
engine with one thread, 64 MiB hash and three candidates. The candidate uses the
Research workspace; the baseline uses Engine under the board. The response
measurement runs from captured keydown to two animation frames after the
current-move mutation. This estimates visible response, not GPU presentation
latency measured externally. Target: p95 below 100 ms in both conditions, and no unexplained startup
or settled-memory increase above 10%. Run without another build or suite competing
for resources.

The existing packaged soak is configured for 50 navigation cycles and 12 passes
through its research chain. Constructor/resource counts and process-tree RSS
measure different things; neither alone proves the other.

## Human checkpoint

The five-player study remains externally dependent. No participant observations
have been supplied and no success rate is invented. Use
[the study protocol](../product/interface-usability-study.md) to record outcomes.
Actual VoiceOver and installed macOS IME use require their own observed results;
Chromium and accessibility-tree tests remain narrower evidence.

Stay with Electron if the measured prototype meets its criteria and defects
remain repairable within shared components. Reconsider a selected AppKit
surface only after a reproducible essential macOS failure and a native proof
that resolves it. A broad migration additionally needs measured runtime benefit
and compatibility tests for profile origins, portable authored work, conflicts,
engine identities, source provenance, companion shutdown and Sparkle relaunch.
