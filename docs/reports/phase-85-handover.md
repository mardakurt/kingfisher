# Phase 85 handover — the ChessBase verdict, on the Mac, with evidence

_Closed 2026-09-26. Every row below cites something that was run; where a
row could not be run, the reason is named. Logs cited as `evidence/…` are in
`~/KingfisherWork/evidence/` on the maintainer's Mac (outside the repository,
because many are large harness output); the recorded workflow and benchmark
evidence is in the repository under
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
this phase, and row 1 can be met only by a database Kingfisher ships or one
the player imports — not by an owned Mega Database. The verdict therefore
could not be an unqualified YES, whatever else was built.

## 1. The verdict table (Part F), filled in

"Partially" is NO. ✅ met, with evidence a person can re-run; ❌ not met.

| #   | Criterion                                                                                                            | Status | Evidence, or why not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A ≥ 1M-game database the player owns or Kingfisher ships answers explorer, novelty, preparation and report questions | ✅     | Lichess standard 2014-07 (CC0, SHA-256 checked against Lichess's list) imported through the product's own path: **1,048,440 games in 149 min, peak RSS 6.75 GB, 33.2 GB** ([`real-scale-1m/`](../release-evidence/phase-85/real-scale-1m)). Explorer 0.1 ms, games at a position 12 ms, a player's games 7.5 ms, **preparation's query (newest 200 + PGN) 9.7 ms**, duplicates page 4.8 ms (medians). Answered in the product — Part E W4, browser 36/36 and **packaged 1.3.1 36/36**: headers, move search, the explorer beside the built-in population, **an opponent prepared from it** (blue13, 200 games, 2.2 s — preparation read only packs until `e00a9f3`), historical games, a study in its own tab. The report's population row reads it; its year/Elo history reads packs only. No owned Mega Database exists to import (§0).                                                                             |
| 2   | Opening Report: popularity by year, pioneers, Elo classes from a population                                          | ✅     | Pack format with per-position year/Elo history (`8b2f292`); Starter v6 and Elite OTB v4 rebuilt with it; `e2e/opening-report.spec.ts` and `e2e/position-history.spec.ts` assert each figure's population label, and a unit test fails if a figure mixes populations. Production showed the Elite history sections, labelled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | Material/theme/route search: ≤ 10 s at 1M, ≤ 60 s at 10M (or the owner accepts the measured numbers in writing)      | ✅     | **1M**: material R v B 1.6 s, theme opposite bishops 1.5 s, route N g1-f3-d4-f5 2.7 s, material + route 1.7 s (medians, [`real-scale-1m/`](../release-evidence/phase-85/real-scale-1m)). **10M — 10,680,708 real games** (Lichess 2017-01, CC0, SHA-256 checked, imported search-only through the product's path in 262 min, peak 4.2 GB, 22.96 GB): **35.1 s, 30.0 s, 39.3 s**, material + route 31.7 s (medians, 12 slices, nothing unindexed), under 60 s with the browser matrix running on the same machine ([`real-scale-10m/`](../release-evidence/phase-85/real-scale-10m)). At both sizes the index gives **the same hits as the linear read** on 30,000 games for all three (1M: 491 / 4,655 / 376; 10M: 561 / 4,789 / 445).                                                                                                                                                                                |
| 4   | Deep analysis survives reload, suspend and quit; runs overnight                                                      | ✅     | **8.35 hours on the packaged 1.3.0** (`npm run desktop:deep-night`, 3 × 12 × 30 s): every process stopped for 60 s at 2 h and resumed; the application quit and relaunched at 4 h and the run picked up from its checkpoint; finished at **1,000 positions, 2,680 moves in the tree**, with a report (the start's own search +0.3 at depth 30, the backed-up line, eight disagreements with their depths) — [`deep-night/`](../release-evidence/phase-85/deep-night). Reload: `e2e/deep-analysis.spec.ts`. `desktop:suspend` 14/14 and `desktop:restart` 7/7 cover a running deep analysis (`2d3590d`, `e56407a`).                                                                                                                                                                                                                                                                                                    |
| 5   | Remote engine on a second machine, with failure handling                                                             | ❌     | Built (`c1898f9`, `docs/design/remote-engines.md`): a pairing code keys TLS-PSK, the host is named on every engine line, a lost connection ends the session as a failed one. Tested with two real companions **on one machine over loopback**, including a host killed mid-search (`companion/src/remote-engines-server.test.mjs`). No second machine (§0).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 6   | Monte Carlo playouts, labelled                                                                                       | ✅     | `7528fe1`: scripted-engine unit tests; `e2e/playouts.spec.ts` with the browser Stockfish; "N playouts at X ms: W/D/L", engine named, never an evaluation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | Windows build runs the desktop harnesses                                                                             | ❌     | No Windows machine or certificate (§0). Nothing built or claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 8   | Master green on CI (unit, e2e, visual) and every packaged Mac gate green on one build                                | ✅     | Packaged, **all on build 856 (1.3.1)**: `desktop:certify` 10/10 (smoke 17/17, chrome 109/109, restart 7/7, engines 25/25, suspend 14/14, walks 0 findings, DMG, zero-skip, unit 3,724/3,724), menus 74/74, engine-chaos 18/18, walk 46 × 1000 and 7 × 300 faults (0 findings each), soak:leaks 3/3, upgrade 7/7 from 1.3.0, the 30-minute soak (0 findings), trust GREEN, Part E 36/36 — and the same set on 846 ([`gates/`](../release-evidence/phase-85/gates)). CI [36239333104](https://github.com/mardakurt/kingfisher/actions/runs/36239333104) green; Linux visual [36239333234](https://github.com/mardakurt/kingfisher/actions/runs/36239333234) green against fully regenerated baselines; the Chrome e2e 372/373 with the one fixed and passing 3/3. The Firefox/WebKit matrix: 1,419/1,492, then fixed or filed — five open, none in Chrome ([`phase-85-browser-matrix.md`](phase-85-browser-matrix.md)). |
| 9   | The six Part E workflows done end to end without a blocker                                                           | ✅     | Packaged 1.3.1: **36/36** ([`packaged/`](../release-evidence/phase-85/packaged)). Browser, localhost: **36/36** ([`browser/`](../release-evidence/phase-85/browser)). Browser, production: W1–W3, W5 and the edge cases ([`browser-production/`](../release-evidence/phase-85/browser-production)); W4 and the companion-kill case cannot run from kingfisherchess.app **by design** (the companion refuses a page it did not serve) and are covered by the other two. The runs found two real defects, both fixed and released (§3).                                                                                                                                                                                                                                                                                                                                                                                 |
| 10  | Header search, explorer, position page, preparation and duplicates answer in seconds at 10M games                    | ❌     | At **10,680,708 games**: a player's games 16 ms, player prefix 0.1 ms, preparation's query 19 ms, the common text search **405 ms** (50 s until `876ff13`), ECO 5.7 ms, rating 8.8 ms, duplicates 5.9 ms (medians, a real player). **The explorer and the position page were not measured at 10M**: they need the per-position rows, about 330 GB for this month at the 1M run's ratio, more than this Mac's disk. At 1M both answer in milliseconds (row 1).                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 11  | Reference packs update on a schedule and an installed app picks the update up                                        | ✅     | `.github/workflows/data-monthly.yml` (monthly; run [36202154660](https://github.com/mardakurt/kingfisher/actions/runs/36202154660) succeeded — "nothing to do" for a month already published). One real cycle on production: Elite v2 → v3 and Starter v4 → v5 installed updated themselves; a fresh install of the six-month pack took **v4 through its channel** though the catalogue named v3 (`evidence/update-cycle/`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 12  | A remote engine on a cloud VM analyses for the Mac over the internet                                                 | ❌     | No cloud VM (§0). The pairing code and TLS-PSK are built for the internet; they have not been run over it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 13  | Batch departure, Opening Report parity, question points/timers, explorer first moment, CBH export all shipped        | ✅     | Each with unit tests and an e2e: `batch-departure`, `opening-report`, `question-points-timer`, `explorer-first-moment`, `chessbase-export` (the written file is read back by Kingfisher's own CBH reader; it has not been opened in ChessBase, which the owner does not have).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 14  | Stored engine evidence exported to a file and imported by another Kingfisher, with provenance (owner's choice)       | ✅     | `16e48ac`; `e2e/shared-evaluations.spec.ts` exports from one browser context and imports into another; imported evidence keeps engine, depth and origin and is never re-exported as local work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Verdict: NO.** Rows 5, 7 and 12 need hardware the owner did not have, and
row 10 is half-measured at 10M (headers, preparation and duplicates in
milliseconds; the explorer and the position page not, for want of disk). It
is not rounded up. Everything the Phase 84 audit named as a software gap is
built and measured.

**Where Kingfisher meaningfully surpasses ChessBase, with evidence:** every
figure names its population, and populations are never merged (the Opening
Report, the Explorer's comparison, the preparation card — asserted by e2e);
the move search's indexed answer is proven equal to the replayed one at 1M
and 10M; engine evidence carries engine, depth and origin through export and
import; deep analysis resumes after a sleep and a quit and reports what
changed its mind (8.35 h, 1,000 positions); the player's data stays on their
machine, and every release is verified byte for byte against what the public
downloads.

## 2. Part A and Part B

Part A: the canonical checkout; no stash, no local commits; `HEAD` =
`origin/master` = `e0ea197` at the start. The one uncommitted change (a
deleted next-session prompt) was already on GitHub in its newer form.
`origin/claude/wizardly-franklin-qre1bd` merged with `--no-ff` (`d4c1349`), no
conflicts; remote branches kept. Node v24.14.0, npm 11.9.0; `npm ci`,
`desktop:install`, `engine:install`, `desktop:sparkle:fetch`,
`desktop:sparkle:bridge`. The equality proof at the close is in §6.

Part B:

- **Sparkle tests**: the platform is an input of Sparkle's start
  (`f35efa3`); they run on Linux CI and the Mac, no skip.
- **Wall-clock budgets**: measured and restated in units of the machine
  (`0b658ae`, `48dc230`).
- **Visual baselines**: both sets were stale in a way the tolerance hid —
  the Darwin set was the pre-Studio interface, and three Linux images too —
  because `visual:baselines` only rewrote failing images. It now rewrites all
  (`f81ee4e`), and both sets were regenerated and compared one
  by one: Darwin on this Mac (`e7f31d0`), Linux from the CI job
  (`57b4144`); CI compare passes against them.
- **Live-site spec** `e2e/prod-phase60.spec.ts` passes from this Mac.
- **Vercel**: every push deployed; `deploy:status` confirmed production at
  each release commit.
- Unit **3,724/3,724**, typecheck, lint, format, `docs:check` **345/345**,
  `git diff --check`, all at `d04b206`.

## 3. Found and fixed on 2026-09-26

- **The icon** drew the board inset in a navy frame, so the Dock icon and the
  site's mark read as a board in a dark border (owner's report). The squares
  reach the rounded edge now (`f31289e`), from the master through every
  raster, the DMG volume icon and the in-app mark; a test fails on the framed
  master. Verified in the bundle's `icon.icns`, the DMG and production.
- **A move search's count**: "5,000 of 1,048,440 games read contain it"
  where 163,840 do — the companion counts every hit and sends 5,000
  (`a2d6e34`). Shipped in 1.3.0; **fixed in 1.3.1**.
- **Preparation ignored companion databases** (`e00a9f3`), in 1.3.1.
- **The after-round spec** required the engine to prefer 2.Nf3 to 2.Bc4, two
  sound moves; it now asserts the evidence on 3.Qh5 (`0a1ddeb`).
- **Harnesses**: the header benchmark timed an empty answer (`ad66bc3`); the
  deep-night report was read before it was restored (`b6bc4fe` — the run
  passed; the report was recovered from the kept profile); Part E assumed
  tab order, an empty Studies page and a browser download (`730c602`); the
  walk now records why a click failed (`92b4200`); `update:real` has a
  keyboard fallback (`2476e39`).
- **Not explained**: one 8 s click timeout in the first 30-minute soak on
  build 846 (seed 55806, step 282; the seed does not replay the sequence; the
  second soak and 856's soak had 0 findings); and Sparkle's window reading as
  empty through System Events for every 1.2.6 → 1.3.0 update run in the
  morning, while three full updates through the same window passed that
  afternoon — **not** a missing permission, as `2476e39`'s message says
  (corrected in `19ac3e7`).

## 4. The 10M and matrix runs

**10M.** Lichess standard 2017-01 is 10,680,708 games — the month alone
exceeds ten million. Imported search-only (headers, content, the line index;
no per-position rows, which at this size would need about 330 GB) with six
workers: 262 min, 679 games/s, peak 4.2 GB, 22.96 GB on disk. The move-search
medians and the equivalence are in row 3; the header, preparation and
duplicate queries in row 10. The run found one real defect — a common text
search took 50 s because ordering 57,544 matches newest-first read a row per
match across the file — fixed in `876ff13` (the companion now walks the
newest-first index when that is cheaper; 405 ms), tested, and not yet in a
Mac release. The database and both archives were deleted afterwards; the
work folder is 3.8 GB.

**Matrix.** [`phase-85-browser-matrix.md`](phase-85-browser-matrix.md): 1,419
of 1,492 passing, Chrome all green; one application defect found and fixed
(Firefox's restored button state, `bb7419b`); the 51 stale visual baselines
regenerated and checked against Chrome's; five failures filed with causes.

## 5. Releases

**1.3.0** — published 2026-09-26T07:54:22Z,
<https://github.com/mardakurt/kingfisher/releases/tag/v1.3.0>: build 846 from
`52cfcee`, `Kingfisher-1.3.0-arm64.dmg`, SHA-256 `4ae6f338…`, 192,006,890
bytes; `desktop:public:verify -- --landing --full` 67/67. Built from `52cfcee`
rather than the earlier build 838 because 838 lacked the Rapid & Classical
catalogue row and the icon fix its notes list.

**1.3.1** — published 2026-09-26T11:17:51Z,
<https://github.com/mardakurt/kingfisher/releases/tag/v1.3.1>: build 856 from
`d04b206` (the `v1.3.1` tag), `Kingfisher-1.3.1-arm64.dmg`, SHA-256
`ffe69f60…ea426a8`, 192,003,879 bytes, Developer ID signed, notarised, ticket
stapled to app and DMG. `desktop:public:verify -- --landing --full` **67/67**:
the bytes the landing links, downloaded from GitHub and verified.
`desktop:update:real` on the public feed, through each updater's own window:

| From                   | To    | Result                                                                                                                  |
| ---------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------- |
| 1.1.7 electron-updater | 1.3.1 | **PASS 16/16**                                                                                                          |
| 1.2.6 Sparkle          | 1.3.1 | **PASS 19/19** (offer text read, Install Update and Install and Relaunch clicked, test profile relaunched, work intact) |
| 1.3.0 Sparkle          | 1.3.1 | **PASS 19/19**                                                                                                          |
| 1.1.7 → 1.3.0          |       | PASS 16/16 (morning)                                                                                                    |
| 1.2.6 → 1.3.0          |       | not passed in the morning: window unreadable (§3); installed on quit                                                    |

## 6. Equality with GitHub, and what remains

_Filled in at the close._
