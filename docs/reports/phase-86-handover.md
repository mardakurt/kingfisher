# Phase 86 handover — the parity program's gate, the matrix closed, and 330 GB made 40

_2026-09-26. The first phase of the parity program set by the 2026-09-24
market and product strategy audit (the brief: "Next AI-agent implementation
prompt: Kingfisher professional parity program"). Every number below comes
from a command in this document; where something could not be run, the
reason is named._

## 0. Where it started

`HEAD` = `origin/master` = `e7debd8` (the Phase 85 closing handover). Two
uncommitted spec changes from the previous agent — the WebKit keyboard case
and the coverage reload — were inspected, kept, verified and committed with
the rest of the matrix work. Node 24.14.0. Disk: 460 GB, 76 GB free.

The owner's Phase 85 answers still stand and bound this program: no owned
ChessBase database, no Windows machine or certificate, no second machine or
cloud VM; file exchange only, no hosted service.

## 1. What was done

### 1.1 The five filed Firefox/WebKit failures — resolved

Four were the specs, one the application
(`docs/reports/phase-85-browser-matrix.md`, "resolved in Phase 86"). Each fix
was shown to matter by restoring the old behaviour and watching the spec fail;
a tried application change that did not fail the spec when removed was
reverted.

| Failure                           | Cause                                                                                          | Commit               |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| WebKit keyboard (database screen) | Safari's Tab skips links; the check also passed vacuously on `<body>`                          | `d4843ea`            |
| WebKit coverage                   | a reload inside `evaluate()` let `ready()` read the old document                               | `d4843ea`            |
| WebKit Library (+ 3 specs)        | the import wait matched "2 games" on an earlier collection; the page left mid-import (0 games) | `d4843ea`            |
| Firefox workspace tabs            | a reload between a tab's visible switch and its `pushState` is aborted by Firefox              | `d4843ea`            |
| Firefox reliability (fonts)       | **application**: see 1.2                                                                       | `4561a64`, `48cc382` |

### 1.2 Found: the design's fonts never took effect

Chasing Firefox's "preloaded and not used" warning found that `--font-ui` and
`--font-code`, declared on `:root`, referred to faces next/font defined on
`<body>`; both stacks were therefore invalid on every page since `8737815`,
and on production the FEN and the shortcut keys were drawn in the system
sans, not JetBrains Mono (measured in the browser pane on
kingfisherchess.app). The variables moved to `<html>` (`48cc382`);
`e2e/typography.spec.ts` fails before and passes after on Chrome, Firefox
and WebKit. Inter, never drawn on a Mac or Windows, is no longer preloaded
(`4561a64`). Both visual baseline sets were regenerated in full and compared
(`de09e96`; Linux from `visual-review.yml` update run 36254067991, compare
run 36254281444 green). **The public Mac 1.3.1 still has the defect**; it is
recorded in `docs/product/platform-parity.md` for the next release.

### 1.3 The 330 GB problem — measured, and a proven proposal

`docs/design/compact-position-postings.md`. 100,445 real broadcast games
imported through the product's path (3.80 GB, 37,794 B a game); `dbstat`
shows 85.8% is the position side. A posting index built from the same rows
holds it in 179.9 MB (2,110.2 MB without structure search, which it leaves to
the line index): 0 mismatches over 2,984 positions × 3 filters, their game
sets, SAN for 9,040 moves and 500 move blobs; no collision in 6,017,030
positions; explorer p95 2.155 → 0.753 ms. **Estimated** at Lichess 2017-01's
10,680,708 games: 38–43 GB instead of about 330 GB. Not yet the companion's
schema — §3 has the order of work. The import found a bench defect: a
checkpoint during a bulk load failed with "database table is locked"
(`b3a57d1`, benchmark scripts only, test fails before). The 3.8 GB database
was deleted after the evidence was written; the command recreates it in 15
minutes.

### 1.4 The program gate

`docs/product/parity-ledger.md`: every P0 and P1 criterion of the brief with
its verified state, the authority its evidence comes from (Phase 85 run,
Phase 86 run, code only, nothing), and one of `not started`, `in progress`,
`blocked`, `partial`, `complete`; the ChessBase baseline B1 frozen; and the
seven release authorities checked separately.

### 1.5 The Mac

The owner asked to keep only the current application: six extra
`Kingfisher.app` bundles (1.1.7, 1.2.0, 1.2.6 ×2, 1.3.0, a 1.3.1 build
output), all indexed by Spotlight and shown in Launchpad, were moved to the
Trash (not deleted; Finder's Put Back restores them). `/Applications/Kingfisher.app`
1.3.1 (856) is the only one indexed. Previous releases for
`desktop:update:real` come from their GitHub releases (all three verified
present with ZIP and DMG).

## 2. What was run

Recorded at the time of each commit (see commit messages): unit 3,761/3,761
at `dddbe3f`; Chrome e2e 373/373 at `4561a64`; four-engine matrix
1,493/1,496 at `2f2095a`, the three remaining failures fixed in `34c3a33`
(each repeated on three engines); `docs:check` 345/345; CI and Linux visual
green at `de09e96`. **Not run after `7ce9e19`:** the full unit suite, the
full e2e suite, `npm run build`, `npm run benchmark`, a matrix re-run.

**Session ended by the usage limit** at `7ce9e19`, mid-program. In flight:
the 10M-game posting-layout import (`scripts/bench-import-file.mjs`, pid in
`ps`, output `~/KingfisherWork/real-scale/p86-10m/`, ~50 GB when done).
Its `import-run.txt` and `result.json` hold the explorer timings and the
linear-oracle result; copy them to `docs/release-evidence/phase-86/` and
**delete the collection and the 1.9 GB archive** afterwards.

## 2b. Also done after the draft above

- Compact postings are now companion layout `postings` (`1def438`,
  `bdaafb5`): equivalence tests over every position, bulk staging, SAN from
  one move generation; the file-import worker leak fixed (`308d404`).
- P0.2 query model and saved queries (`dddbe3f`, schema v22).
- P0.3 write-back batch (`7ce9e19`, schema v23).
- Two generator scripts that did nothing in a path with a space (`c1ff5e3`).

## 3. What remains

In the ledger's order. Blocked items stay blocked until their dependency
exists; none is rounded up.

1. **Finish the 10M measurement** (running at session end) and a UI to
   create/convert a companion collection in the compact layout (the server
   routes exist).
2. **Query model**: an `or`/`not` editor; companion collections, Position,
   Preparation and reports on the planner.
3. **Job model**: one job record over queue and deep analysis with engine
   digest and states; write-back exists for chapters only.
4. **Preservation matrix for CBH/CBV** (P0.4) and the **repertoire
   maintenance inbox** (P0.5): not started.
5. **Blocked on the owner or hardware**: remote engine on a second machine
   and over the internet (P0.3); CBH export opened in ChessBase (P0.4);
   sync and team access (P0.6 — the owner chose file exchange only); Windows
   (P0.7).
6. **The next Mac release** carries the font fix, Inter unpreloaded, the
   Firefox button fix and the 10M text search. Section B of
   `docs/operations/after-a-fix.md`.
7. Inter appears in `--font-ui` only behind the platform faces; whether it
   is wanted at all on Linux is a design question, not a defect.
