# ChessBase roadmap follow-up: implementation and acceptance

2026-10-02. Baseline `master` / `49ce4bd`, nine existing commits ahead of
`origin/master`, preserved. Node 24.14.0 on Apple Silicon macOS. Source version
was restored to 1.4.0 while implementing the follow-up, then bumped to 1.4.1
after the implementation changes. Public Mac descriptor remains 1.4.0 build 1007.

## Implementation

- Survey answers become immutable, dated study chapters with training questions;
  original source counts remain in comments. Reload and portable-backup coverage.
- Desktop large imports can create collections in a chosen existing directory.
  Exclusive creation refuses overwrites. Compact posting indexes are the default
  for this workflow; both-player rating and BOT filters apply before move parsing.
- SHA-256 verification streams the original PGN archive before writes. Main SQLite
  pages have a hard quota; database/WAL/SHM and free-space reserve are checked
  between batches. No decompressed archive or full rollback copy is written.
- Incremental inserted IDs are recorded in the insertion transaction. Paged
  rollback preserves pre-existing and duplicate records across reopen. Source
  ledger reports supplied licences, digests and measured annotation coverage;
  comments do not establish expert authorship or redistribution rights.
- Repertoire inbox manually checks recent source evidence at up to 40 positions.
  Changed evidence reopens decisions. This is not a complete import delta.
- Playouts checkpoint completed games in ordinary portable study chapters,
  record engine identity and requested budgets, resume with identity validation,
  and export JSON. Seeds stabilize move selection given the same engine answers;
  time-limited engine answers can differ. Durable analysis-job records export too.
- Scale acceptance requires an explicit corpus minimum and can independently
  replay every stored PGN for selected Explorer positions. The ChessBase kit
  supplies real CBH fixtures, digests, field-loss checks and six research tasks.

## Evidence recorded during implementation

The real, public-domain Capablanca corpus contains 14 games. Product-path import
with a supplied SHA-256 produced a 618,496-byte compact collection, with 14
annotated and dated games, zero evaluated games and zero games with both ratings.
Eight independently replayed position checks and three line-index equivalence
checks matched. This is small-corpus correctness evidence, not 10M certification.
Evidence: `/tmp/kingfisher-roadmap-real-book/result.json` on this machine.

The invalid cached-outcome regression was mutation checked: removing the reducer
rejection made the test fail; restoring it passed. The scanner already rejected
unfinished results. No affected reference pack was identified or republished.

Independent acceptance kit generated successfully at
`/tmp/kingfisher-independent-acceptance-20261002`. No licensed ChessBase installation
or participants are available, as confirmed by the user. Field and timing results
remain not-run; [the protocol](../operations/independent-chessbase-acceptance.md)
explains how to obtain them without replacing self-readback with a compatibility claim.

Rendered QA used repository Playwright because the Browser plugin is unavailable.
The real Starter source generated a six-move survey; selecting an answer saved a
study question which survived reload. The page had the correct application title,
meaningful content and no page errors. Screenshots outside the repository:
`/tmp/kingfisher-roadmap-survey.png`, `/tmp/kingfisher-roadmap-preparation.png`.
The separate persistent browser also logged failed unpaired-companion probes;
these are not evidence that a companion connection was tested.

## Open acceptance gates

No external volume is mounted. Internal free storage was about 61 GiB; a fresh
fully indexed 10M corpus plus archive and journal was deliberately not allocated.
The reproducible external-drive command, limits and selected-position oracle are
in [large databases](../operations/large-databases.md). Earlier scale records
remain dated and do not certify this implementation.

A newly licensed corpus of thousands of expert annotations, overnight remote-worker
recovery, independent ChessBase execution, strong-player timing, Windows runtime,
new packaged Mac certification and public 1.4.1 publication remain open.

## Follow-up gate results

- `npm test`: 371 files / 3,961 tests passed in 53.45 seconds, no skips,
  after the final production changes.
- Typecheck, lint, format, documentation (359/359), production build and
  `git diff --check` passed. The production build includes the playout store
  move and the final import recovery and maintenance guards.
- Full Chrome suite: 453 passed in 29.6 minutes, zero retries. This predates
  the final import recovery and maintenance guards. An earlier run interrupted
  by the user pause has no final result and is not counted as passed.
- Fresh database integration: passed in 6.8 seconds. It runs actual imports,
  checks job discovery and refusal of concurrent compaction, reloads the
  renderer, discovers the completed job, rolls back the added game, and checks
  both visible rows and the exact remaining count. The preceding targeted run
  had 14 passes and one test selector failure: header and footer both exposed
  a Close button. Closing with Escape fixes that ambiguity.
- Fresh survey/playout/database suite: 15 passed in 2.3 minutes after the
  final production rebuild and test selector correction.
- The active-import compaction guard was mutation checked with a real isolated
  companion: removing it accepted concurrent maintenance (202 instead of 400),
  causing the assertion to fail. Restoring it refused the operation as expected.
  The temporary process and data directory were removed.
- Survey selection uses canonical parent-position identity, so transposed paths
  cannot introduce competing intended answers. Reverting to parent node IDs
  makes its regression fail. Removing the cached invalid-outcome rejection
  also makes its regression fail. Both implementations were restored.
- Actual SQLite hard-page-quota check refused a 2 MiB insertion under a 1 MiB
  limit and retained zero rows. The corpus-minimum check refused the 14-game
  collection as 10M. Independent replay matched eight selected positions;
  line-index queries matched on three themes. The acceptance CLI refuses
  zero oracle positions and incompatible layouts instead of omitting replay.
- `npm run benchmark` passed, including seven performance assertions and its
  actual HTTP SQLite workload: 100,000 generated games, 81.74 seconds import,
  1,223 games/s. The isolated companion and disposable data directory were
  removed. These are synthetic workloads, not reference data or a ChessBase
  comparison. The rules prototype was rejected for lost PGN semantics.
- `npm run public:check`: all 22 links responded successfully on the final run.
  The GitHub install-guide URL had previously returned HTTP 503; no source URL
  was changed to hide that transient external failure.
- Deployment status reached the API using the existing release environment.
  Before pushing, it describes GitHub master `2857625` / deployment `7dafaa0`,
  not the local implementation. Its “Local master HEAD” label reads the remote
  ref in this ahead-of-remote state and is not proof these changes are live.
- Mac release preflight found signing and notarization prerequisites but refused
  the dirty, ahead-of-origin checkout. The installed `/Applications/Kingfisher.app`
  reports 1.4.0 build 1007 and is available as a real previous-release baseline
  for isolated upgrade checks. The public descriptor remains unchanged.

Job discovery retains up to twenty recent finished jobs, serializes file imports,
and distinguishes a renderer reload from a companion process restart. Connection
failures retain the last progress and show a reconnect error. Playout orchestration
now lives in `src/stores/playout-store.ts`; the rendering feature imports that
store, keeping engine/session and repository wiring below features.
