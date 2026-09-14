# Phase 53 handover — 2026-09-14

The owner used 1.1.5 and wrote fourteen numbered enhancements, in no order,
asking that they be ordered before being built, that every one land in both
identities, and that the after-a-fix checklist be run in full. The phase ran
in two passes. The first pass (commits `1e0a0ee` … `65217dc`) landed eleven
items and reported the rest as undone. The second pass — this document — was
a control pass over the first: it verified every item against the running
application rather than the report, corrected three of the first pass's
answers, found two defects the first pass had introduced, finished the three
items it had left, ran the checklist, and shipped 1.1.6.

## Starting HEAD and ending HEAD

- **Starting HEAD (second pass):** `65217dc` — Phase 53 — record the full
  Mac lag in platform-parity. Clean tree, HEAD = origin/master.
- **Ending HEAD:** recorded in the Release section below.

## What the control pass found

Verified on the running dev server, not read from the handover:

| #            | First-pass claim                                            | What the control pass found                                                                                                                                                                                                                                                                                | Outcome                                                                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1            | "Stockfish 19 has no WASM build; nothing more can be done"  | True for the version, checked against npm (`stockfish@18.0.8` is latest) and `nmrugg/stockfish.js` releases (v18.0.0). But the web had never shipped the **full-network** build that `stockfish.js` publishes beside the lite one — the browser was held to the 7 MB small net while a Mac ran native SF19 | A second browser engine, _Stockfish 18 (full network)_, 113 MB, web-only (the Mac build leaves it out and rewrites its manifest); registered only where the manifest lists it; handshake waits 5 min for the download; a week of `Cache-Control`. Measured: depth 21 in 4.4 s at 767 k n/s |
| 2            | "Position and Set up labelled from 430 px — done"           | The labels were there, and at 834 px and 1024 px the header row was 835 px in a 796 px box: the analysis toolbar's three labels stayed, and a long document title was painted **under** "Position". Measured with `getBoundingClientRect`                                                                  | New/Import/Export labels from 1080 px, the title clipped in its own box, the read-only badge and "Draft saved" yield below 1080 px; `e2e/workspace-header-labels.spec.ts` measures the whole row at three sizes and fails on the first pass's code                                         |
| 3            | "section dividers — done"                                   | "opencarlsen" matched _Run two engines on this position_ (any scattered subsequence scored), and "carlsen" alternated Player, Game, Player, Game, so the divider stood on every other row                                                                                                                  | `src/features/command/rank.ts`: a query word must appear whole (or within one dropped letter in two) in the title or keywords; results gathered by section; nine unit tests                                                                                                                |
| 6            | "needs the data pipeline and network; not done"             | The pipeline is `npm run reference:build -- --pack starter`; 36 of the 48 archives were already cached                                                                                                                                                                                                     | Starter v4: 48 months, 300 a player — 206,451 games, 38,749 openable, 300,413 positions, 13,738 players, 24.3 MB; 73 MB more in the cache; three minutes to build                                                                                                                          |
| 9            | "renamed Lichess → Lichess Rated Games; done"               | The owner's report was "lichess ma… (can't read the rest)". The rename did not touch the cause: the state label sat beside the name in a 220 px rail, and all three Lichess sources still read "Lichess M…", "Lichess R…", "Lichess b…"                                                                    | State under the name, name never truncated; companion storage in `formatBytes`, not raw bytes                                                                                                                                                                                              |
| 14           | "a 40 px drag strip across the top of the workspace — done" | It worked, and it charged every route forty empty pixels above its header                                                                                                                                                                                                                                  | The route headers carry `data-titlebar-drag`; every control inside opts out; the strip is gone; the e2e asserts the header drags on the Mac stub, nothing drags in a browser, zero controls drag                                                                                           |
| 8            | "62 import tests pass"                                      | Driven in the browser: two games pasted on the Games page → "2 games added to your database. 34 positions indexed", ECO classified                                                                                                                                                                         | Confirmed                                                                                                                                                                                                                                                                                  |
| 12           | "35 analysis tests pass"                                    | Driven with the full-network engine: bar at +0.30 → +0.35 with a 300 ms height transition, label legible                                                                                                                                                                                                   | Confirmed                                                                                                                                                                                                                                                                                  |
| 5            | Recent N cap 2000; Recent form tab                          | Driven: Carlsen → "2 from My games, 300 from Kingfisher Starter Reference", dossier tabs Plays / Changed / Move orders / Recent form                                                                                                                                                                       | Confirmed, and the 300 is the v4 pack                                                                                                                                                                                                                                                      |
| 13           | brand flush in full screen                                  | CSS read; `--sidebar-brand-left-padding` collapses under `data-fullscreen`; the packaged chrome harness is the check                                                                                                                                                                                       | Verified against the packaged 1.1.6 (Release section)                                                                                                                                                                                                                                      |
| 4, 7, 10, 11 | icons, sync tests, review queue, recent meta                | Read and driven; no defect found                                                                                                                                                                                                                                                                           | Kept                                                                                                                                                                                                                                                                                       |

Also corrected: the first pass's registry note said Lichess's fork "tops out
at the same point"; `docs/ENGINES.md` had already recorded that
`@lichess-org/stockfish-web@0.5.0` ships an `sf_19.wasm` without a network,
with a different interface, under AGPL. The note now points there.
`stockfish-native` gained `linux-arm64` in its platform list, which the
catalogue has published since Phase 51.

## Honest limits

- **A browser still cannot run a native engine.** Lc0, Stormphrax and the
  rest need the companion, which accepts loopback origins only by design
  (`companion/README.md`, threat model). The web now has the same Stockfish
  network the Mac runs natively; it does not have the fleet, and the
  Settings page says so.
- **Stockfish 19 is not in the browser.** Checked, not assumed:
  `stockfish@18.0.8` is the newest npm release; the only sf_19 WebAssembly
  carries no network. `docs/ENGINES.md`.
- **The starter pack is four years, not the archive.** Eighty months exist;
  the Elite OTB pack (407,538 games, 339 MB, installed on demand) is the
  answer for the rest. 343 games in the 2022–2023 archives were rejected for
  illegal moves and are recorded, not repaired.
- **"Playing like Carlsen"** remains what Phase 52 built: the opponent's own
  recorded moves while the position is in their games, then the engine, each
  labelled. A style model would be a fabricated claim about a person.

## Verification

Section A of `docs/operations/after-a-fix.md`, every step, in this order.
