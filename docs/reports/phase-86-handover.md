# Phase 86 handover — the parity program's first phase, seven pages reworked, Mac 1.3.2

_2026-09-26 → 2026-09-27. Two briefs: the professional parity program (P0
before P1) and a usability/reliability pass over seven pages with a storage
proposal. Every number below comes from a command named here; what could
not be run is said._

## 0. State

`HEAD` = `origin/master` at the commit that adds this file, following
`3a793ae` (the 1.3.2 descriptor). Clean tree. The public Mac is **1.3.2,
build 908, `6b59452`**. Node 24.14.0 (Node 20 is first on this Mac's PATH;
the companion tests need 24). Disk: 97 GB free after the 10M test data was
deleted.

## 1. Parity program (brief 1)

| Item                                      | What was built                                                                                                                        | Evidence                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Firefox/WebKit failures filed in Phase 85 | the five resolved (four spec, one application: fonts)                                                                                 | `d4843ea`, `4561a64`, `48cc382`                                                 |
| 330 GB for 10M games                      | companion `postings` layout (opt-in; create or convert in Databases), equal to the row layout; measured at 7,484,400 games            | `docs/design/compact-position-postings.md`, `phase-86/real-scale-10m-postings/` |
| P0.2 query model                          | one AST/planner/executor, saved queries with rerun-and-diff, an any-of/not editor                                                     | `dddbe3f`, `8354ee6`                                                            |
| P0.3 jobs                                 | one job list and vocabulary; stored evaluations into a chapter as one undoable batch                                                  | `79871a3`, `7ce9e19`                                                            |
| P0.4 ChessBase                            | preservation matrix from code; a loss report per import                                                                               | `cfc9f79`                                                                       |
| P0.5 repertoire                           | the maintenance inbox                                                                                                                 | `0c8497e`                                                                       |
| Reliability found on the way              | interrupted imports finish on next open (`4795c4c`); the hot rebuild reads games in order — over an hour → 646 s at 7.48M (`128ab64`) | unit tests; `real-scale-10m-postings/`                                          |

The ledger (`docs/product/parity-ledger.md`) has each criterion's state.
**Blocked on the owner or hardware**: a remote engine on a second machine;
a ChessBase export opened in ChessBase; sync/team access (owner chose file
exchange); Windows.

**The 10M run** stopped at 7,484,400 games when the session running it
ended; it was measured there rather than restarted, because at the measured
4,859 B a game the whole month (~52 GB) exceeds the ~45 GB the owner
approved. Explorer identical to a linear oracle on 50 positions over all
games; move search identical to the linear read on 30,000 games. The
collection and archive were deleted after the evidence was committed.

## 2. The seven pages (brief 2)

Summary per page, defects with their commits and tests:
`docs/reports/phase-86-workflow-matrix.md` §4. Before/after screenshots:
`docs/release-evidence/phase-86/ux/{before,after}/` (`scripts/capture-pages.mjs`).
Storage proposal: `docs/design/storage-proposal.md` (proposal only — nothing
moved, deleted, provisioned or downloaded for it). Workflow matrix with
passed/blocked per journey: `docs/reports/phase-86-workflow-matrix.md`.

The defects that mattered most were not visual: Daily never rescheduled a
graded repertoire card and could not finish a session (`f064ea0`); a
Score Sheet reload discarded the typed game (`d0a0c57`, and the WebKit race
that fix opened, `0444fd2`); Opening Files showed and could save the wrong
file's notes (`fcd59ca`).

## 3. What was run (this phase's final state)

| Command                                                           | Result                                                                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                        | 3,786/3,786, 354 files, 0 skipped (at `6b59452`, and inside certify)                                                       |
| `npm run typecheck`, `lint`, `format:check`                       | clean                                                                                                                      |
| `npm run docs:check`                                              | 345/345 (at `3a793ae`)                                                                                                     |
| `npm run build`                                                   | exit 0                                                                                                                     |
| `npm run benchmark`                                               | exit 0 (its "FAIL PGN variations" line is the standing chess.js-replacement evaluation, decision REJECT)                   |
| `git diff --check`                                                | clean                                                                                                                      |
| `npm run test:e2e` (Chrome)                                       | **399/399** at `0444fd2`                                                                                                   |
| `npm run test:e2e:matrix` (Chrome, Chromium, Firefox, WebKit)     | 1,586/1,596 at `6c5bb4d`; the 10 fixed in `0444fd2` and rerun on Chrome/Firefox/WebKit: 150/150 and 12/12 (×2)             |
| `visual-review.yml` compare                                       | green (run 36272223035)                                                                                                    |
| `desktop:release:preflight:mac`                                   | GREEN                                                                                                                      |
| `KINGFISHER_DESKTOP_CHANNEL=stable desktop:dist`                  | 1.3.2 · build 908 · `6b59452`; notarised; fresh packaged boot verified                                                     |
| `release:mac:notarize`                                            | accepted, stapled (submission 68928b67…)                                                                                   |
| `desktop:trust:verify`                                            | GREEN (29 code objects)                                                                                                    |
| `verify-dmg.mjs --version 1.3.2 --commit 6b59452`                 | verified                                                                                                                   |
| `desktop:certify`                                                 | **10/10**: smoke 17/17, chrome 109/109, restart 7/7, engines 25/25, suspend 14/14, walks (0 findings), dmg, no skips, unit |
| `release:mac:appcast`, `release:mac:publish v1.3.2`               | published; `gh release edit --latest`; the feed redirects to v1.3.2                                                        |
| `desktop:update:real --current <1.3.1 from GitHub> --public-feed` | **PASS 19/19**                                                                                                             |
| `deploy:status`                                                   | up to date (`3a793ae`)                                                                                                     |
| `desktop:public:verify -- --landing --full`                       | **67/67, every byte**                                                                                                      |
| Live landing (browser pane)                                       | offers Kingfisher 1.3.2 and links only the v1.3.2 DMG                                                                      |

Not run: a matrix rerun of the whole suite after `0444fd2` (the failing
specs were rerun on three engines); the Linux visual comparison after the
status-line change (`6c5bb4d`); the 8-hour soak.

## 4. Kept on this Mac

`~/KingfisherWork/release-1.3.1/` and `release-1.3.2/` (apps, ZIP, DMG) for
the next `update:real`. 577 iCloud conflict copies from `desktop/node_modules`
were moved to `~/KingfisherWork/icloud-duplicates/`, not deleted.

## 5. What remains

1. Blocked items above, until the owner provides hardware, a licence or a
   decision.
2. Storage recommendations 2–3 (collections on a chosen volume; selective
   imports) are designs in `storage-proposal.md`, not code; posting layout
   as the default for new collections after one release on it.
3. The query model on Position, Preparation, reports and companion
   collections; write-back beyond chapters; a formal WCAG audit.
