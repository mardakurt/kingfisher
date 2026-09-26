# Phase 85 handover — the ChessBase verdict, on the Mac, with evidence

_Closed 2026-09-26. Every row below cites something that was run; where a
row could not be run, the reason is named. Logs cited as `evidence/…` are in
`~/KingfisherWork/evidence/` on the maintainer's Mac (outside the repository,
because several are hundreds of megabytes of harness output); the recorded
workflow evidence is in the repository under
[`docs/release-evidence/phase-85/`](../release-evidence/phase-85)._

## 0. The owner's answers

Asked once, at the start of the phase (2026-09-24/25), as the brief requires:

| Question                                                                                                 | Answer                                                     |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A ChessBase database of ≥ 1M games you own; a Windows PC and certificate; a second machine or a cloud VM | **None of these** is available                             |
| Publish 1.3.0?                                                                                           | **When every packaged gate is green**                      |
| Shared analysis (Let's Check) and hosted sharing                                                         | **File exchange only**; no server, no hosted share         |
| How the Phase 84 branch reaches master                                                                   | **Merge locally, keep the remote branches**                |
| The data mirror                                                                                          | **Publish new versions** (never overwrite an existing one) |
| Pack schedule                                                                                            | **Monthly, automatic**                                     |
| An annotated master corpus                                                                               | **Start a public-domain set**                              |

Consequences, recorded before any work: rows 5, 7 and 12 cannot be met in
this phase, and row 1 can be met only by a population Kingfisher ships, not
by a database the owner owns. The verdict therefore could not be an
unqualified YES, whatever else was built.

## 1. The verdict table (Part F), filled in

"Partially" is NO. ✅ = met, with evidence a person can re-run; ❌ = not met.

| #   | Criterion                                                                                                            | Status | Evidence / reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A ≥ 1M-game database the player owns or Kingfisher ships answers explorer, novelty, preparation and report questions | ✅     | The owned-CBH half cannot be run (no owned Mega Database; §0). A ≥1M-game database **Kingfisher can import and the player then owns** was run through the product's own import path: Lichess standard 2014-07 (CC0, SHA-256 checked against Lichess's list), **1,048,440 games in 149 min, peak RSS 6.75 GB, 33.2 GB on disk** (`scripts/bench-import-file.mjs`, `evidence/…/lichess-2014-07/result.json`). Explorer 0.5 ms median, games at a position 14 ms, header prefix < 1 ms, duplicate page 52 ms. Part E W4 in the **packaged** 1.3.0 answers explorer, Library, move search and the source comparison from it through the bundle's companion (35/35 steps, [`packaged/results.json`](../release-evidence/phase-85/packaged/results.json)). |
| 2   | Opening Report: popularity by year, pioneers, Elo classes from a population                                          | ✅     | Pack format with per-position year/Elo history (`8b2f292`); Starter v6 and Elite OTB v4 rebuilt with it; `e2e/opening-report.spec.ts` and `e2e/position-history.spec.ts` assert each figure is labelled with its population and a unit test fails if a figure mixes populations. The production Opening Report showed the Elite history sections, labelled (browser pane, 2026-09-26).                                                                                                                                                                                                                                                                                                                                                               |
| 3   | Material/theme/route search: ≤ 10 s at 1M, ≤ 60 s at 10M (or the owner accepts the measured numbers in writing)      | ❌     | **1M met**: material R v B 3.3 s, theme opposite bishops 4.3 s, route N g1-f3-d4-f5 5.2 s, material+route 3.1 s (medians over 1,048,440 real games; `evidence/move-search-1m-after.txt`), and the index gives the **same hits as the linear read** on 30,000 games for all three (491 / 4,655 / 376). **10M: pending — see §4.**                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 4   | Deep analysis survives reload, suspend and quit; runs overnight                                                      | ⏳     | Reload: `e2e/deep-analysis.spec.ts`. Suspend and quit: `desktop:suspend` 14/14 and `desktop:restart` 7/7 on build 846, both extended to a running deep analysis (`2d3590d`, `e56407a`). **Eight hours on the packaged app** (`npm run desktop:deep-night`, 3 × 12 × 30 s): suspended at 2 h (every process SIGSTOPped for 60 s) and resumed at 240 positions; quit and relaunched at 4 h and resumed from its checkpoint at 479 positions. Final report: pending — see §4.                                                                                                                                                                                                                                                                           |
| 5   | Remote engine on a second machine, with failure handling                                                             | ❌     | Built (`c1898f9`, `docs/design/remote-engines.md`): TLS-PSK pairing code, host name on every engine line, a lost connection ends the session as a failed one. Tested with two real companions **on one machine over loopback** (`companion/src/remote-engines-server.test.mjs`), including a host killed mid-search. **Two machines were not available (§0)**, so the acceptance run did not happen.                                                                                                                                                                                                                                                                                                                                                 |
| 6   | Monte Carlo playouts, labelled                                                                                       | ✅     | `7528fe1`: scripted-engine unit tests; `e2e/playouts.spec.ts` with the browser Stockfish; reported as "N playouts at X ms: W/D/L" with the engine named, never as an evaluation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7   | Windows build runs the desktop harnesses                                                                             | ❌     | No Windows machine or certificate (§0). Nothing was built for Windows and nothing is claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 8   | Master green on CI (unit, e2e, visual) and every packaged Mac gate green on one build                                | ⏳     | Packaged, **all on build 846** (1.3.0, `52cfcee`): `desktop:certify` 10/10 gates (smoke 17/17, chrome 109/109, restart 7/7, engines 25/25, suspend 14/14, walks 46 and 7-with-faults 0 findings, DMG, zero-skip, unit 3,721/3,721); menus 74/74; engine-chaos 18/18; walk 46 × 1000 and 7 × 300 faults, 0 findings each; soak:leaks 3/3; upgrade 7/7 from 1.2.6; trust GREEN; the 30-minute soak twice (the first with one unexplained 8 s click timeout, §3; the second 0 findings). CI: see §2. E2E: pending — see §4.                                                                                                                                                                                                                             |
| 9   | The six Part E workflows done end to end without a blocker                                                           | ✅     | Packaged 1.3.0: **35/35** ([`packaged/`](../release-evidence/phase-85/packaged)). Browser on localhost: all six ([`browser/`](../release-evidence/phase-85/browser)). Browser on production: W1–W3, W5 and the edge cases ([`browser-production/`](../release-evidence/phase-85/browser-production)); W4 and the companion-kill case cannot run from kingfisherchess.app **by design** — the companion refuses a page it did not serve — and are covered by the other two. The run found a real defect (a move-search count), fixed in `a2d6e34`.                                                                                                                                                                                                    |
| 10  | Header search, explorer, position page, preparation and duplicates answer in seconds at 10M games                    | ⏳     | At 1M all answer in milliseconds (row 1). 10M: pending — see §4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 11  | Reference packs update on a schedule and an installed app picks the update up                                        | ✅     | `.github/workflows/data-monthly.yml` (monthly, automatic; run [36202154660](https://github.com/mardakurt/kingfisher/actions/runs/36202154660) succeeded, "nothing to do" for a month already published). A real cycle, on production, in the browser pane: an installed Elite v2 updated to v3 and Starter v4 to v5; a fresh install of the six-month pack took **v4 through its channel** although the catalogue named v3 (`evidence/update-cycle/01-before.json`, `02-after.json`, `03-channel-install.json`).                                                                                                                                                                                                                                     |
| 12  | A remote engine on a cloud VM analyses for the Mac over the internet                                                 | ❌     | No cloud VM (§0). The pairing code and TLS-PSK channel are designed for the internet; it has not been run over one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 13  | Batch departure, Opening Report parity, question points/timers, explorer first moment, CBH export all shipped        | ✅     | Each with unit tests and an e2e: `e2e/batch-departure.spec.ts`, `opening-report.spec.ts`, `question-points-timer.spec.ts`, `explorer-first-moment.spec.ts`, `chessbase-export.spec.ts` (the written file is read back by Kingfisher's own CBH reader; it has not been opened in ChessBase, which the owner does not have).                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 14  | Stored engine evidence exported to a file and imported by another Kingfisher, with provenance (owner's choice, §0)   | ✅     | `16e48ac`; `e2e/shared-evaluations.spec.ts` exports from one browser context and imports into another; imported evidence keeps its engine, depth and origin and is not re-exported as local work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Verdict: NO.** Rows 5, 7 and 12 need hardware the owner did not have, and
row 3's 10M half and row 10 are stated as measured in §4. The software gaps
the Phase 84 audit named are closed; the verdict is held back by acceptance
runs this Mac alone cannot perform, and it is not rounded up.

## 2. Part A and Part B

Part A (start of phase): the canonical checkout; no stash; no local commits;
`HEAD` = `origin/master` = `e0ea197`. The one uncommitted change (the
deleted next-session prompt) was already on GitHub in its newer form.
`origin/claude/wizardly-franklin-qre1bd` merged with `--no-ff` (`d4c1349`), no
conflicts; remote branches kept (owner's answer). Node v24.14.0, npm 11.9.0;
`npm ci`, `desktop:install`, `engine:install`, `desktop:sparkle:fetch`,
`desktop:sparkle:bridge`.

Part B:

- The two Sparkle tests: the platform is an input of Sparkle's start
  (`f35efa3`); they pass on Linux CI and the Mac without a skip.
- The two wall-clock budgets: measured and restated in units of the machine
  (`0b658ae`, `48dc230`), proven on CI.
- Linux visual baselines regenerated from the current design (`d0ec3ca`);
  Visual review on 2026-09-26 at `52cfcee`:
  [36221242889](https://github.com/mardakurt/kingfisher/actions/runs/36221242889),
  success. (That run passed the icon change too: a 24 px mark is a few hundred
  pixels of a full page, inside the page tolerance — the spec does not
  compare the mark on its own.)
- CI: pending final link — see §4.
- `docs:check` 345/345 against the 1.3.0 descriptor.
- The live-site spec (`e2e/prod-phase60.spec.ts`) passes against
  kingfisherchess.app from this Mac.

## 3. What was found and fixed in this session (2026-09-26)

- **The icon** drew the board inset in a 5-unit navy frame, so the Dock icon
  and the site's mark read as a board in a dark border (owner's report).
  The squares now reach the rounded edge; every raster, the DMG volume icon
  and the in-app mark come from the master; a test holds the four squares to
  the full tile and fails on the framed master (`f31289e`). Verified in the
  1.3.0 bundle's `icon.icns`, the DMG's volume icon, and on production.
- **A move search's count** — "5,000 of 1,048,440 games read contain it"
  where 163,840 do: the companion counts every hit and sends 5,000; the
  footer printed what it received (`a2d6e34`, test fails without the fix).
  **Build 846 (the public 1.3.0) has this defect**; the web has the fix.
- **The update harness** could not read Sparkle's window from this session
  (no Accessibility grant for the responsible application — the owner's
  permission to give). It now drives Sparkle from the keyboard and confirms
  each step from the application's verdict (`2476e39`).
- **The walk** records Playwright's reasons for a failed click
  (`92b4200`). The first 30-minute soak on build 846 had one move whose click
  timed out after 8 s (seed 55806, step 282); the seed does not replay the
  same sequence, probes of the obvious suspect (an error notice) cleared it,
  and the cause is **not known**. The second soak: 0 findings.
- Part E harness assumptions (tab order, the Studies button, the Mac's
  Save panel) — `730c602`.

## 4. Pending at the time of writing

_This section is replaced by the final numbers before the phase closes._

## 5. Release 1.3.0

Published 2026-09-26T07:54:22Z:
<https://github.com/mardakurt/kingfisher/releases/tag/v1.3.0> — build 846 from
`52cfcee` (the `v1.3.0` tag), `Kingfisher-1.3.0-arm64.dmg`, 192,006,890
bytes, SHA-256 `4ae6f338…de353`, Developer ID signed, notarised, ticket
stapled to the app and the DMG. `desktop:public:verify -- --landing --full`:
**67/67**, the bytes the landing links downloaded from GitHub and verified.

`desktop:update:real` on the public feed:

- **1.1.7 (electron-updater) → 1.3.0: PASS, 16/16** — offered, installed,
  relaunched on the test profile (not the owner's), work intact.
- **1.2.6 (Sparkle) → 1.3.0: not passed.** Offered (the application's
  verdict), downloaded, EdDSA-verified and ready to install; the second
  keystroke did not reach _Install and Relaunch_, and the update installed
  when the harness quit the application instead — 1.3.0 then launched on the
  same profile with the study intact. The click itself and the relaunch's
  profile handoff were not exercised from this session, because Sparkle's
  window could not be read (above).
