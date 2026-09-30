# Shared interface acceptance — 2026-09-30

**Retain Electron and the shared Next.js/React interface.** The implemented
Research workspace meets the measured geometry, keyboard, responsiveness and
bounded-resource criteria on this Mac. Full packaged certification passed.
Actual VoiceOver, installed macOS input-method use and the five-player study
remain unrun; this is not a claim of complete human usability certification.

Starting point: clean `master` at `74bd84ad4dd95784eb9edb4d8a387427d53fe0b9`,
matching `origin/master`, after the fast-forward merge of `shell-bugfix-pass`.
Implementation branch: `codex/interface-acceptance`.

Final application revision: `1b1b51263b8d50988951c22b12715199f4435ac1`.
The complete source gates passed on this revision: typecheck, lint,
format:check, 3,905 unit tests across 362 files, docs:check 357/357,
test:no-skips, production build, benchmark and diff check. The unfiltered
Chrome suite passed 439/439 in 27.3 minutes; the separate visual command
passed 43/43 in 45.2 seconds. No visual baseline was regenerated. Optional
SQLite benchmarks were not exercised without the companion configuration.
These runs do not establish Firefox or WebKit coverage.

The final package is **1.3.3 dev build 1004**, clean source `1b1b512`,
Developer ID signed with hardened runtime, **not notarized or published**.
Its fresh packaged boot verified the renderer, web server, companion, engine
catalogue and Sparkle 2.10.0. Output is retained at
`/Users/metinardakurt/Library/Caches/Kingfisher/interface-accepted-1004/`.
The DMG is `Kingfisher-1.3.3-dev-1004-arm64.dmg`; SHA-256
`051a5ee534e6fbf4528094656fd22c098636b9e8e7dc671e77aaadc08148e153`.

`node scripts/desktop-interface-behavior.mjs <app> <output>` passed 11/11
against this exact app. It drove native Edit Copy/Paste/Undo with Unicode text,
keyboard-only layout selection, candidates, search and resizing, Light/Dark
through the native menu, actual 1440×900 / 1280×720 / 1100×800 windows, actual
full screen in both themes, and 900×600 folding and selection restoration.
Three candidates, at least two complete reference rows and current notation
were visible in the tested normal layouts; the board met the 480 px laptop
floor. All eight captured screenshots were inspected. Closure was graceful,
with no surviving descendants, and clipboard restoration succeeded.
`tmp/session/final-interface-native/results.json` records the exact identity.
The composition and accessibility-tree checks remain narrower than installed
OS input-method and VoiceOver testing.

This continues the four stages proposed in the Electron assessment. The prior
handoff and merge are complete; their exact evidence is in
[the preceding report](2026-09-29-interface-continuation.md). Retain Electron
and the shared React interface. No chess domain, engine protocol, persistence
schema, desktop origin, traffic-light geometry, native file boundary or updater
architecture is replaced here.

## Changes

- Research workspace is an opt-in layout available from Layout. A full-height
  board sits beside notation, the selected reference tool and one engine panel.
  The compact 184 px candidate strip shows four half-moves per line, with an
  explicit ellipsis. Preview and Insert use the complete line; the full Engine
  tab retains full lines and comparison controls. Three complete candidates and
  at least two complete reference rows must be visible at the tested laptop
  sizes. The selected move must remain visible after keyboard traversal.
  Selecting the full Engine tab, moving Engine elsewhere or entering compact
  mode removes the split rather than mounting a second engine panel.
  Source identity, populations, counts and licences stay visible. The optional
  departure analysis follows the primary table. The old six-move strip needed
  240 px for wrapped candidates; shortening this overview frees reference space.
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

The production-rendered comparison passed on Apple M3 Pro, Mac15,7, 18 GiB,
macOS 27.0.1 (26A434). Baseline is clean dev build 995 at `74bd84a`; candidate
is clean dev build 1004 at `1b1b512`. Both use Electron 44.2.0 and browser
Stockfish 18, one thread, 64 MiB hash and three candidates.

| Measurement                          |    Baseline |   Candidate | Result       |
| ------------------------------------ | ----------: | ----------: | ------------ |
| Median startup to renderer readiness |    790.5 ms |    780.1 ms | −1.32%       |
| Median settled process-tree RSS      | 1,379.4 MiB | 1,377.0 MiB | −0.17%       |
| Navigation p95, stopped search       |    16.25 ms |    16.34 ms | Below 100 ms |
| Navigation p95, searching            |    15.87 ms |    14.86 ms | Below 100 ms |

Each response result pools 250 post-warmup samples from five fresh profiles.
The first launch of each app was slower than subsequent launches. This is a
same-machine comparison with warm OS caches, not an OS cold-start benchmark.
RSS sums all descendants without deduplicating shared pages. The absolute
memory footprint remains substantial; the result demonstrates no material
increase from this change, not that Electron has native-app memory costs.
Raw results: `tmp/session/final-performance.json`.

`node scripts/desktop-interface-soak.mjs <app> <results>` passed (exit 0)
against the complete acceptance package.
The existing packaged suite passed 3/3 in 17.1 minutes, configured for 50
cycles and 12 research-chain passes, each with its own warmup. After 52 cycles,
it reported workers 1, observers 1, window listeners 15 and intervals 1;
all resource-growth assertions passed. The chain reported 13 passes including
warmup, five review prompts throughout, workers 1, observers 3, listeners 16,
intervals 2. The production-only cache test checks absence of the development
injection hook; it does not inject synthetic cache entries into the package.

The long-run process had 177 RSS samples. After excluding its first two minutes,
five median bins were 1,600.06 / 1,349.09 / 1,387.44 / 1,379.61 / 1,403.28 MiB,
first-to-last −12.30%, with no strictly monotonic growth. Peak process-tree RSS
was 1,617.36 MiB. The two shorter test processes were too short for the
post-warmup trend calculation; no memory trend is claimed for them.
Raw results: `tmp/session/final-soak.json`. These bounded checks do not
prove the absence of every possible leak or substitute for an all-day field run.

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

## Engine identity audit added September 30

The startup panel hard-coded “Loading Stockfish…” and a 7 MB download
message even for native engines. It now reads the selected registry definition,
updates when that definition changes, and describes native startup separately.
Missing evaluation identity is labelled “Unknown engine”, never Stockfish.
The rendered-panel regression exercises Lc0 followed by Stormphrax while loading.
It passes with the correction and fails when the old title is restored.
Existing session-switching tests remain green (20/20 focused tests together).

`npm run engines:verify -- --keep` passed on darwin-arm64. Each installation
completed its own UCI handshake and a real search. Reported identities and
executable SHA-256 digests:

| Engine           | UCI identity          | Executable SHA-256                                                 |
| ---------------- | --------------------- | ------------------------------------------------------------------ |
| Stockfish native | Stockfish 19          | `8eed61129d1493c5d1f2fd9323f0c54c47ac49319911fbde18c6b9c87e8b13c5` |
| Stormphrax       | Stormphrax 8.0.0      | `5e6078f102af5bdd69e1b38ae7843581717fb42f2d0fe8d75f20ef8d097b3207` |
| Viridithas       | Viridithas 20.0.0-dev | `9ab84379f0241d94f926666eef8385ab032c585bb3055f27a3fbae423b75fd41` |
| Halogen          | Halogen 16.8.0        | `7f3a4055102512ae11139512ea02a56c0a7fbbd0b4686db02752053921639c83` |
| PlentyChess      | PlentyChess 8.0.0     | `50c626206b8cff74c11c830bf583560abb96f9ea6b3f0a3c490f98dc46770b21` |
| Lc0              | Lc0 v0.32.1+git.dirty | `3a1177eb7caebfbb9a71840d0e78f2fb245a20df4222099b531a626f3f486066` |

The Lc0 suffix is the executable's own reported build name, not an assessment
of Kingfisher's working tree. Its successful search includes functioning weights.
These are separate binaries and identities, not Stockfish aliases. The provider
lookup dispatches by selected ID; no native-engine-to-Stockfish substitution was
found. A digest establishes byte identity with the recorded asset, not an
upstream code signature. Berserk 14, Koivisto 9.0 and Obsidian 16.0 have no
published darwin-arm64 build and are explicitly unavailable on this platform.
No claim is made that their Windows/Linux binaries were tested here.
Lc0 was separately installed at `/opt/homebrew/bin/lc0`, rather than downloaded
as a managed Kingfisher binary. Browser Stockfish 18 remains a separate WASM
option; the managed native Stockfish on this platform is Stockfish 19.

The marketing version remains 1.3.3. The handoff expressly prohibits a version
bump or publication in this pass. Development builds record a new commit/build
identity automatically; a new public stable release would require its own
version, trusted-release and Sparkle update validation procedure.

## Screenshot review correction

Build 1002 passed the original nine native assertions, but screenshot inspection
found a partially visible first reference row and current notation scrolled out
of view after keyboard traversal. Those assertions were insufficient. The native
harness now requires two entire reference rows and current notation to be
in the viewport. The optional departure analysis follows the primary move table;
source identity, populations, counts, licences and all departure actions remain.

Notation is a keyboard group at the root and otherwise has one current move tab
stop. Arrow/Home/End navigation uses the existing immutable-tree navigation
helpers and the supplied selection callback. It preserves focus, including a
virtualized destination, and does not trap Tab. The browser regression passed
with this behavior and failed with 49 tabbable move buttons restored (expected
one, received 49). A focused pass returned 6/6. A missing dialog-close wait in
the first new focus test was corrected; no retries were introduced.

The build-1002 clipboard harness initially refused a typeless Electron item
before changing the clipboard. AppKit confirmed the native pasteboard was empty.
The harness accepts this empty placeholder only after that read-only check;
it refuses an untyped nonempty pasteboard it cannot preserve. A subsequent pass
restored the clipboard and shut down without survivors. Build 1002 remains
intermediate evidence because of the screenshot findings above. The interrupted
438-test browser run is not counted as a completed final run.

The final preview also checks all actual tabbable buttons, including comment
controls. Only the current move and its comment participate in the tab sequence;
other comments remain clickable and become keyboard reachable on selection.
Leaving the group restores the selected move to view. The compact strip's 160 px
trial clipped the third candidate and was rejected. The 184 px/four-half-move
version passed 6/6 focused browser cases and all nine strengthened Electron
checkout-preview checks. These preview results are not packaged acceptance.
The final signed package and complete gates are still required below.

## Final packaging and native-dialog correction

The initial build-1004 variant omitted the optional Syzygy probe helper because
it was built in a fresh worktree. Its smoke run therefore had 16 checks, not 17. The complete acceptance package stages the existing helper built by
`npm run tablebase:install` from pinned, digest-checked Fathom sources. No
application source, dependency, architecture or public asset was changed.
Both variants remain in separate cache directories; the final output and hash
above select the complete variant. Performance and soak are repeated against
it, rather than silently attributing the first variant's measurements to it.

The first certification attempt returned 9/10. Seed 46 at step 189 entered a
native up-to-date alert after fullscreen and then lost its AX window index
(`-1719`). The walk retried the stale index and threw before the existing
Return fallback, leaving the modal open; quit was forced and one web server
survived. That owned test server was stopped. This failed attempt is recorded
in `tmp/session/accepted-certification.log`; it is not counted as passing.

The test harness now resolves the current window without reusing a vanished
index. A known up-to-date alert can use the guarded foreground/Return path
when AX loses it, and any observed offered-update window forbids that path.
A dialog remaining after dismissal fails immediately. Six boundary regression
tests pass; restoring the old no-window-only fallback makes two fail.
The full unit suite now passes 3,911/3,911 across 363 files, with typecheck,
lint, formatting, docs and no-skip checks passing. Harness revision is
`d24556c`; application source remains `1b1b512`. There is no change under
`src/`, `desktop/`, `companion/` or `public/` between these commits.

The final native interface run adds an actual fullscreen up-to-date alert in
each theme: both dismissed, fullscreen and selection survived, and the package
closed gracefully with no surviving descendants. All 11 checks passed and
the clipboard was restored. Completion extends into October 1; the report
retains its starting date.

## Final certification and completion checklist

`npm run desktop:certify -- --app <complete app> --dmg <complete DMG>`
passed **10/10**, with no quick-mode omissions. Every packaged gate used the
same app and DMG selected above. Final log: `tmp/session/final-certification.log`.

| Gate                                         | Completed result                                          |
| -------------------------------------------- | --------------------------------------------------------- |
| Smoke, including local Syzygy and system Lc0 | 17/17                                                     |
| Real traffic lights and window chrome        | 109/109                                                   |
| Quit/reopen persistence                      | 7/7                                                       |
| Managed engines installed and searched       | 25/25                                                     |
| Suspend/resume                               | 14/14                                                     |
| Seed 46, 200 actions                         | Zero findings, zero console errors                        |
| Seed 7, 120 actions with faults              | Zero findings; two expected injected-fault console errors |
| Exact DMG verification                       | Passed                                                    |
| No-skip scan                                 | Passed                                                    |
| Unit/integration suite                       | 3,911/3,911 in 363 files                                  |

| Assessment item                                                           | Status                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Handoff implementation and preferred shell-pass merge                     | ✓ Completed in the preceding report                                           |
| Shared radii, elevation, typography/contrast checks                       | ✓ Implemented and checked; no visual baseline regenerated                     |
| Board, notation, real engine candidates and named references together     | ✓ Research layout passes the representative window checks                     |
| Library preview continuity and keyboard selection                         | ✓ Implemented; browser regressions pass                                       |
| Preparation toolbar and session disclosure                                | ✓ Implemented; source facts and denominators retained                         |
| Keyboard resizing, notation focus and composition-event guards            | ✓ Browser and packaged checks pass                                            |
| Native menus, Unicode editing, fullscreen and update-alert dismissal      | ✓ 11/11 packaged interface checks                                             |
| Engine identity, availability and startup naming                          | ✓ Six distinct engines searched; unsupported platform rows remain unavailable |
| Startup, RSS, stopped/live-engine response and 50-cycle resource checks   | ✓ Measured criteria pass on this machine                                      |
| Profile origin, authored-work persistence, engine identity and provenance | ✓ Architecture retained; relevant source and packaged gates pass              |
| Actual VoiceOver and installed OS input methods                           | ✗ Unrun; AX/composition-event checks are narrower evidence                    |
| Four of five strong players completing tasks unaided                      | ✗ No participants or observations supplied; protocol is ready                 |
| New public stable Mac release                                             | ✗ Intentionally not performed: the handoff prohibits version bump/publication |

No Sparkle installation/relaunch upgrade was performed here, and no claim is
made about notarization, Windows execution or a full Firefox/WebKit matrix.
The unchanged public Mac is 1.3.3 build 932. A future public release must follow
the trusted-release and real Sparkle update procedures; these local results do
not replace them. Logs, JSON results and screenshots are preserved beside the
complete package under `evidence/` as well as in the session workspace.
