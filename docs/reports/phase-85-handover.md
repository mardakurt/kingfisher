# Phase 85 handover — the ChessBase verdict, on the Mac, with evidence

_Status: in progress. A checked row has running evidence; a crossed row is not complete. Code existence is not substituted for an acceptance run._

## 0. Inputs and decisions

The canonical checkout is `~/Desktop/Projects/chess&poker/chess/studying hub`.
At the start of Phase 85 the owner answered:

| Question                                                                                                   | Answer                                        |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Owned ChessBase database of at least one million games; Windows PC/certificate; second machine or cloud VM | None available for this phase                 |
| Publish 1.3.0                                                                                              | Only after every packaged gate is green       |
| Shared analysis / hosted sharing                                                                           | File exchange only; no server or hosted share |
| Phase 84 integration                                                                                       | Merge locally; retain remote branches         |

These answers make an unqualified YES impossible in this phase: the two-machine,
cloud-VM and Windows acceptance runs cannot be performed, and no owned Mega
Database may be fabricated.

## 1. Repository state and integration

Phase 84's branch was merged without conflicts at `d4c1349`. `master` and
`origin/master` were equal at `d0ec3ca` before the Phase 85 continuation.
The previously untracked copy of this report has been incorporated into the
continuation rather than discarded.

The continuation adds:

- streaming companion import for PGN, gzip, seekable zstd and ChessBase;
- a compact companion line index and worker search for material, theme and route;
- pack history by year and Elo class plus earliest games in the Opening Report;
- shared engine evidence as a provenance-preserving file;
- a scheduled rolling six-month pack with a monotonic update channel;
- fourteen annotated games from Capablanca's public-domain _Chess Fundamentals_;
- tab-scoped unsubmitted form state;
- real restart and suspend harness checks for persisted deep analysis.

The source also corrects the false 1.3.0 release claim: the public descriptor
still names 1.2.6 and GitHub has no `v1.3.0` release.

## 2. Acceptance table

YES requires every row. “Partial” is recorded as a cross.

| #   | Criterion                                                                                                | Status | Evidence / blocker                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | A ≥1M-game owned or shipped database answers explorer, novelty, preparation and report questions         | ⏳     | Real Lichess 2014-07 import is running through the product import path; no owned Mega Database was supplied.                               |
| 2   | Opening Report: popularity by year, pioneers and Elo classes from one labelled population                | ⏳     | Unit/pipeline tests pass; real v3 pack build and browser proof remain.                                                                     |
| 3   | Material/theme/route ≤10 s at 1M and ≤60 s at 10M, or owner accepts measurements                         | ⏳     | Million-game benchmark is running; 10M does not fit the available 60–67 GB once positions are indexed.                                     |
| 4   | Deep analysis survives reload, suspend and quit and runs overnight                                       | ❌     | Persistence and browser reload pass; restart/suspend harnesses are now extended. The required eight-hour packaged run has not happened.    |
| 5   | Remote engine on a second machine with disconnect handling                                               | ❌     | No second machine was supplied; remote-engine code is not claimed.                                                                         |
| 6   | Labelled Monte Carlo playouts                                                                            | ✅     | Scripted-engine unit tests and browser-Stockfish E2E exist on `master`; final full-suite rerun remains part of the phase gate.             |
| 7   | Windows build runs desktop harnesses                                                                     | ❌     | No Windows machine or signing certificate was supplied. A CI package is not a harness run.                                                 |
| 8   | Master green on CI/visual and every packaged Mac gate green on one build                                 | ⏳     | CI and Linux visual were green at `d0ec3ca`; the continuation still needs merge, CI, browser certification and packaged certification.     |
| 9   | Six serious-user workflows complete in browser and packaged app                                          | ❌     | Targeted E2E exists; the recorded end-to-end evidence folder is not complete.                                                              |
| 10  | Header, explorer, position, preparation and duplicate queries answer in seconds at 10M                   | ❌     | Real 10M indexed database unavailable within this Mac's free disk.                                                                         |
| 11  | Scheduled pack update and installed app adopts one real update                                           | ⏳     | Workflow and client channel code pass unit tests; v3 must be built/published because the catalog currently names an artifact not yet live. |
| 12  | Cloud VM analyses for the Mac over the internet                                                          | ❌     | No cloud VM was supplied and no hosted engine service was authorized.                                                                      |
| 13  | Batch departure, Opening Report parity, question points/timers, explorer first moment and new CBH export | ✅     | Each feature and its targeted unit/E2E regression is present; final suite rerun remains part of row 8.                                     |
| 14  | Stored engine evidence exports/imports with provenance                                                   | ✅     | Exchange validation, separate persistence and browser E2E are present; imported evidence is not re-exported as local work.                 |

## 3. Evidence already complete

- `d0ec3ca` CI: <https://github.com/mardakurt/kingfisher/actions/runs/36145117791> — quality and production build succeeded.
- `d0ec3ca` Linux visual comparison: <https://github.com/mardakurt/kingfisher/actions/runs/36145136073> — 20 current baselines passed.
- Focused continuation tests: 10 files, 36 tests, all passed in 45.26 s.
- Continuation typecheck and lint passed before the final harness/documentation edits.
- `npm run companion:shared -- --check` and `npm run annotated:check` pass; all fourteen book games transcribe and none is refused.
- Live monthly status on 2026-09-25: no channel exists; fallback v2 is current through 2026-08 but has the old pack ID. This is why v3 publication remains a real required step rather than a paper workflow.
- GitHub reports no `v1.3.0` release; `src/release/macos-download.json` truthfully remains 1.2.6 build 714.

## 4. Current real-scale run

Dataset: `lichess_db_standard_rated_2014-07.pgn.zst`, Lichess standard database,
CC0. The archive was already cached under `~/Library/Caches/Kingfisher/archives/`.
The run uses `scripts/bench-import-file.mjs`, eight preparation workers and the
same generated import kit the application packages.

The first run, before bulk-transaction/checkpoint tuning, was preserved under
`~/Library/Caches/Kingfisher/real-scale/lichess-2014-07-before-bulk-transactions-*`.
It fell from 637 games/s at 100,200 games to 256 games/s at 450,900 while SQLite
repeatedly checkpointed hot pages. The final-code run and its query/equivalence
results will be recorded here when complete.

## 5. Verdict

**NO at this checkpoint.** Kingfisher has closed most of the software gaps the
Phase 84 audit named, and meaningfully surpasses ChessBase in position-keyed
personal knowledge, source-separated evidence, local-first ownership,
repertoire/training integration and factual denominators. It cannot yet receive
an unqualified YES because rows 4, 5, 7, 9, 10 and 12 lack their required
running evidence; rows 1–3, 8 and 11 are still being certified.
