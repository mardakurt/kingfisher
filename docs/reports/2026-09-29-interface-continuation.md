# Interface continuation — 2026-09-29

This is a dated record of the work on `shell-bugfix-pass`, starting from clean
`d46e24c`. It completes the remaining shell-pass handoff and tests a narrow
part of the ChessBase-inspired direction without changing the chess domain,
desktop architecture, data contracts, or public release. The authoritative
current behavior remains in `docs/design/visual-system.md` and
`docs/product/platform-parity.md`.

## Decision and reference evidence

Retain Electron with the shared Next.js/React renderer. The visual gaps in
these examples are layout, density, focus, and token decisions; neither the
images nor the repository evidence shows a need to replace the renderer. The
existing macOS shell already supplies real traffic lights and native window
geometry, file dialogs and bounded file access, companion lifecycle, and
Sparkle windows. A Swift wrapper around web content would still render web
controls. A genuine SwiftUI/AppKit migration would require replacement UI for
each migrated surface and a bridge to the existing chess, data, and engine
state. No screenshot demonstrates enough benefit to justify that cost.

The ten supplied photographs were accessible and reviewed, named
`image-1790696261242.webp` through `image-1790696240199.webp` in descending
timestamp order. They are photographs of an app on a screen, so reflection,
perspective, and video overlays limit precise pixel comparison. They show:

| Images  | Useful design decision                                                                                                | Kingfisher implication                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1–3     | A calm permanent sidebar and restrained toolbar; the shop and database overviews use generous space and clear groups. | Preserve one navigation hierarchy; do not fill empty space with invented metrics.                                               |
| 4, 9–10 | The board is prominent, while notation, reference rows, and engine controls remain in the same workspace.             | Keep one board and offer a compact research arrangement where width permits. Protect the measured board-size floor at 1280×720. |
| 5       | Dense game rows, a filter popover, and a selected-game preview coexist.                                               | Keep Library preview mounted when desktop filters open; use a phone sheet at narrow widths.                                     |
| 6–8     | Player preparation has a readable identity block, clear Openings/Games/Style tabs, and source-specific charts.        | Use this as a hierarchy reference, not a licence to invent scores, merge populations, or copy assets.                           |

[ChessBase's official Mac page](https://de.chessbase.com/post/chessbase-endlich-auf-dem-mac)
describes a Mac-specific application but does not identify Swift, SwiftUI, or
AppKit as its implementation. Its appearance cannot establish a framework,
accessibility, or runtime characteristics.

## Implemented and verified

- Scoped four formerly ambiguous `.first()` browser assertions to their
  actual owning controls or containers. The full suite exposed one separate
  ambiguous dialog Close control; it is now scoped to the footer. No product
  behavior was weakened to make strict mode pass.
- Mapped the remaining hard-coded 2–16 px corners to board, control, and panel
  tokens in separate commits, then mapped the eleven remaining elevation
  classes to panel and popover tokens. `rounded-full` and the board piece's
  `drop-shadow` were left intact. The committed visual baselines did not move.
- Made the Analysis dock separator keyboard-operable, exposing its role,
  orientation, and current/minimum/maximum widths. Arrow keys step by 16 px,
  Shift by 40 px, and Home/End reach the allowed limits; the existing saved
  width is still the source of truth.
- Kept the Library game preview visible under desktop filters. The filter
  panel floats over the table, and the phone layout uses a sheet. Closing it
  restores focus to the trigger. The corresponding browser regressions were
  first run against the old behavior and failed, then passed after the change.
- At 1280×720 and 1440×900, rendered a populated Library table with the
  selected game's board while filters were open; checked light and dark at
  1280×720. The table remains usable, but player names truncate at 1280×720.
  That is a remaining density limit, not a framework limitation.
- `npm run test:e2e`: **432 passed, 28.6 minutes**, exit 0 on `a14e4d4`,
  one worker and no filtered cases. `npm run test:e2e:visual`: **43 passed**
  after each token batch and after the layout change, with no baseline
  regeneration. Focused board, tab, Library, query, and saved-query checks:
  **15 passed**; phone filter check: **1 passed**.

The other source gates on the continuation tree: `npm test` **3,874/3,874**
across 360 files; `npm run typecheck` and `npm run lint` exit 0;
`npm run format:check` exit 0 after formatting this record;
`npm run docs:check` **357/357**; `npm run test:no-skips` OK;
`npm run build` exit 0; `npm run benchmark` exit 0, with `/studies` the
heaviest route at 590.7 kB gzipped over 29 scripts; `git diff --check` clean.
The benchmark's explicit **REJECT replacement** decision for direct
`chess.js` PGN loading is an expected result of its comparison, not a failed
command: that loader loses variations, NAGs, and recovery provenance.

`npm run desktop:dist` then built a clean **1.3.3 dev build 994** from
`43f3073` and verified a fresh packaged boot of its renderer, web server,
companion, engine catalogue, and Sparkle 2.10.0. Developer ID signing was
applied; **notarization was skipped** because the dev builder had no
notarization options. The generated
`Kingfisher-1.3.3-dev-994-arm64.dmg` was passed explicitly with its matching
`mac-arm64/Kingfisher.app` to `npm run desktop:certify -- --app … --dmg …`.
The full packaged gate returned **DESKTOP CERTIFIED, 10/10 steps**:

| Packaged check                                                    | Result                                              |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| Smoke: launch, bridge, isolation, companion, PGN, tablebase, quit | 17/17                                               |
| Real window chrome                                                | 109/109                                             |
| Quit and reopen with work intact                                  | 7/7                                                 |
| Managed engines installed and searched                            | 25/25                                               |
| Suspend and resume                                                | 14/14                                               |
| Seed 46, 200 actions                                              | 0 findings, 0 console errors                        |
| Seed 7, 120 fault-injected actions                                | 0 findings, 2 console errors during injected faults |
| DMG launch, identity, signature, layout                           | verified                                            |
| No-skip scan                                                      | passed                                              |
| Unit and integration suite in certification                       | 3,874/3,874                                         |

This is evidence for one exact local dev package. It does not certify the
public download, notarization, a live deployment, or a future release.

## Decisions left as decisions

The 860/960 px board-surface measures and the 1080 px document measure serve
different content; making them one number would make at least one surface
worse without evidence. The six workspace floor heights were rendered at
1280×720 and exercised by board-size, viewport, and route-layout browser
checks. They did not cause clipping in those tested states, so they remain.
This is bounded evidence, not a claim that every content and font-size
combination is proved.

The remaining fixed waits in launch/restoration and stale-response tests
measure behavior over time; the feedback form's 1.6 s pause is required by its
anti-spam rule. High per-test time budgets are not a product improvement. A
blanket sweep would reduce regression evidence. F11's missing sibling tests
for PGN parsing and query AST remain the next chess-correctness phase, as the
handoff specifies.

## Next redesign checkpoint

The next small prototype should use a real Analysis game with a populated
move tree, engine PV, and named reference source. Compare board-first and
compact research arrangements at 1440×900, 1280×720, a narrow window, and
full screen, in both themes. A keyboard-only pass must reach board moves,
notation, engine controls, source rows, resizing, and menu actions in a
predictable order. Measure board size, visible notation lines and reference
rows, clipped text, focus return, horizontal overflow, screen-reader names,
and start/resize responsiveness on a packaged Mac. Preserve one board,
position identity, immutable trees, result identity, autosave, provenance,
stable profile origin, and real chrome. Keep Electron if those targets are met
without a platform-specific UI duplicate; reconsider a selected native
surface only if a measured macOS behavior cannot be delivered through the
existing renderer and narrow shell bridge. A full native rewrite has no
evidence-based case here.

The public Mac remains 1.3.3 build 932 until a separately verified and
published release. The locally certified development build is not that release.
