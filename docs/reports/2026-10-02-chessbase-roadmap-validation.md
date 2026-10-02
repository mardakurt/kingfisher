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
Query/oracle evidence: `/tmp/kingfisher-roadmap-real-book/result.json` and
`/tmp/kingfisher-roadmap-real-book-final.log` on this machine. The JSON was
replaced by a query-only run and its import `stats` field is null; coverage
was recorded during import and retained in the collection ledger.

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
public 1.4.1 publication remain open. The local stable candidate passed packaged
certification; extended release checks are recorded below.

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
- After the implementation commits were pushed, deployment status reported
  `up to date (b9da957)`. GitHub CI run 37040517428 passed quality and build.
- The initial dirty/ahead-of-origin Mac preflight correctly refused packaging.
  After commit and push, clean/synchronized preflight was GREEN; the stable
  candidate's trust and packaged results are detailed below. Installed
  `/Applications/Kingfisher.app` remains 1.4.0 build 1007 and was used only
  as the previous-release binary with isolated acceptance profiles.

Job discovery retains up to twenty recent finished jobs, serializes file imports,
and distinguishes a renderer reload from a companion process restart. Connection
failures retain the last progress and show a reconnect error. Playout orchestration
now lives in `src/stores/playout-store.ts`; the rendering feature imports that
store, keeping engine/session and repository wiring below features.

## Publication and packaged evidence

The five roadmap increments were committed in order, ending with version 1.4.1
in `b9da957` (build 1024), preserving the nine prior local commits. The source
was pushed to master. GitHub CI run 37040517428 passed quality and production
build. Deployment status reported `up to date (b9da957)`. A real fresh Chrome
profile on the canonical site generated a Starter survey, saved a study
question and retained it on reload, with no page errors. Initial source
installation exceeded the first script's 30-second click timeout; waiting for
source readiness completed the workflow. Visual inspection followed all 32
piece images loading, rather than counting an early screenshot as complete.

The clean, synchronized Mac release preflight was GREEN. The stable package
was built in `/tmp/kingfisher-release-1.4.1-1024`; Apple accepted and stapled the
application, its fresh packaged boot passed, and Apple separately accepted
and stapled the DMG (submission `f1ceffd5-065b-4299-9f80-92f5d955b444`).
The trust gate was GREEN: 29 code objects passed signature checks, audited
entitlements and Hardened Runtime checks passed, both tickets validated and
Gatekeeper accepted the app and DMG. These assessments alone do not certify a
quarantined GUI launch. Sparkle's signed appcast was generated for build 1024.

The actual native folder and file panels were operated on an isolated candidate
profile. A synthetic 50,000-record archive deduplicated to one retained game;
the dialog closed during import, the renderer reloaded, the recent job was
recovered, and its terminal `done` status was asserted. The selected folder
held 573,496 bytes across database/journal files before cleanup. This is picker,
placement, deduplication and background recovery evidence, not real-scale corpus
certification. Fixture files and isolated profile were removed. The first native
run was deliberately stopped to canonicalize macOS `/var` versus `/private/var`
path aliases in the harness. UI app-name resolution initially opened the installed
1.4.0 application; it was closed without edits, and subsequent UI selection used
the candidate's full path.

Full `desktop:certify` passed all ten gates on this same candidate: smoke 17/17,
window chrome 109/109, restart 7/7, engine fleet 25/25, suspend 14/14, 200-action
walk with no findings or console errors, 120-action fault walk with no findings
and two console errors during injected failures, DMG verification, zero-skip
scan, and 371 test files / 3,961 unit/integration tests (53 seconds).
`annotated:check` replayed all 14 committed Capablanca games with none refused.

The push reported dependency alerts. `npm audit --omit=dev` reports one critical
Next.js advisory in pinned 16.3.5, [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j).
The upstream advisory requires attacker-controlled SVG content passed to Node
`next/og` ImageResponse. The source search found no `next/og` or `ImageResponse`
use. The dependency was not upgraded in this roadmap increment, and the audit
is not reported as green.

## Extended packaged checks in progress

The stable build 1024 completed the required seed 46 walk with 1,000 actions
in 515 seconds, no findings or console errors, and zero descendant survivors
on quit. Renderer RSS increased from 201 to 661 MB; this observation is not
a claim of flat memory usage.

The first seed 7 / 300-action fault run exited before completion after the
second web-server kill. Its shell log records a quit request during recovery.
A fresh 60-action reproduction passed that sequence with no findings and
zero process survivors. The cause of the initial quit is not established;
the failed run is retained. A full repeat passed 300 actions in 160 seconds,
with no findings, two console errors during injected failures, and zero
descendant survivors on quit. It does not retroactively pass the first run. The subsequent
30-minute soak was interrupted and has no completed result. Neither is
counted as a passing extended gate.

The packaged 52-cycle resource pass (two warm-ups plus 50 measured cycles)
passed its worker, channel, EventSource, interval, listener and observer
bounds and console-error assertions. End counts: one worker, one observer,
15 window listeners, one interval; estimated JS heap 148.5 MB. This is
resource-count evidence, not a guarantee of flat RSS. The repeated research
chain passed 13 passes with review prompts steady at five, one worker, three
observers, 16 listeners and two intervals. All three packaged suite tests
passed in 17.3 minutes. The production-only cache-injection case does not
assert synthetic cache eviction; the navigation/resource passes do run.

All three real optional reference packs installed from their published
manifests (Elite OTB 407,538, Recent Theory 44,200, High-Rated Online 305,169).
After restart, each answered offline (338, 367 and 98 ms including UI
selection), and Theory Book return navigation passed. Populations stayed
separate. The temporary pack profile was removed. The real 1.4.0 build 1007
to 1.4.1 build 1024 upgrade passed 7/7 checks, preserving authored study,
preferences, reference metadata and the isolated profile identity.

## Release correction found by the long soak

Build 1024's seed 19447 soak found persistent error notices covering the board
and intercepting moves (steps 479, 482 and 484). This is a release-blocking
interaction defect. The run was stopped after the finding and is not green.
The concurrent full browser run was stopped before changing production code:
348 passed, one interrupted, 104 not run (22.5 minutes), not a completed gate.
Uploaded 1.4.1 artifacts remain in a draft release, outside the public feed.

The correction collapses equivalent notices, retains the four most recent
distinct messages and allows pointer events through notice text, with Dismiss
still interactive. Two store regressions failed against the original behavior
and passed after the change. A real-browser regression forces the observed
overlap independently of viewport/font differences, with only the clipboard
boundary denied: the original timed out because notice text intercepted the
board click, while the correction plays e2-e4 and then dismisses the notice
(3.1 seconds). The corrected package was rebuilt as stable build 1025 from
`f6f705297e6df29b5af4597ace70ea802e299349`; prior build 1024 results do not
certify the correction. Marketing version remains 1.4.1, still unpublished.

## Corrected build 1025: current release evidence

All five software increments are implemented and pushed. The version bump
followed their implementation. The remaining corpus and independent comparison
checks are acceptance work, not claimed software completions.

After the notice correction, `npm test` passed 372 files / 3,963 tests in
57.48 seconds with no skips. Typecheck, lint, formatting, documentation
(359/359), production build and diff checks passed. The fresh full Chrome
suite passed **454/454 in 29.9 minutes**, with zero retries. Firefox and
WebKit were not certified by this run. The benchmark passed all assertions,
including its synthetic 100,000-game HTTP SQLite import (97.484 seconds,
1,026 games/s). Concurrent browser/build activity makes this unsuitable as
an isolated before/after performance comparison. Its disposable database and
companion were removed.

The stable build 1025 application is Developer ID signed, Apple-notarized
and stapled. Its packaged boot verified the renderer, web server, companion,
engine catalogue and Sparkle 2.10.0 before generating the archives. The
DMG submission `59065a1f-0dd7-4621-b9f9-6e17bdf9bfef` remains In Progress
at Apple as of 20:45 UTC. The submit wrapper exited without a verdict;
`notarytool info` confirms the existing submission, so it was not resubmitted.
App acceptance does not establish DMG acceptance. Publication remains held.

The same-binary extended certification has passed smoke 17/17, window chrome
109/109, restart 7/7, native engines 25/25 and suspend/resume 14/14. Its
1,000-action seed 46 walk passed in 1,231 seconds with no findings or console
errors. The 300-action seed 7 fault walk passed in 352 seconds with no findings
and two console errors during injected failures. The new 30-minute
soak used the previously failing seed 19447 and passed 781 actions in
1,808 seconds, with no findings or console errors and zero surviving
descendant processes on quit. Both run with independent profiles to avoid another sequential
30-minute wait. This concurrent load is recorded, and their eventual memory
observations will not be described as isolated application measurements.

Commit `8669949` changes only the certification harness: strict
`--walk-actions=1000 --fault-actions=300` arguments run the required extended
walks directly inside certification. Invalid counts fail before launching;
the mutation-independent negative check refused 199 normal actions. The
packaged runtime remains build 1025 from `f6f7052`.

The corrected package's resource suite passed all three tests in 3.9 minutes.
Ten navigation cycles ended with one worker, one observer, 15 window listeners,
one interval and estimated JS heap 141.9 MB. Four repeated research-chain
passes retained five review prompts, one worker, three observers, 16 listeners
and two intervals. These are bounded resource checks, not a flat-RSS claim;
the production cache-injection test does not expose the browser development hook.

All three real optional packs installed in a disposable profile and answered
offline after restart: Elite OTB (407,538 games, 377 ms), Recent Theory
(44,200 games, 396 ms), High-Rated Online (305,169 games, 96 ms). Times include
UI selection. Theory Book return navigation passed. The profile was removed.
A fresh isolated 1.4.0 build 1007 → 1.4.1 build 1025 upgrade passed 7/7,
preserving the authored study, preferences, reference metadata and profile
identity; the installed application and owner's profile were not replaced.

The corrected runtime CI `37056702368` and harness CI `37057620013` passed.
Deployment status for documentation commit `f507013` reports
`up to date (f6f7052; the 2 commit(s) since changed nothing the web build reads,
so Vercel skipped them)`. A real in-app browser loaded the canonical Analysis
page: the board, notation, engine and playout surfaces rendered. This is a
live-page check, not another full browser suite.

Final local certification of corrected build 1025 passed **10/10 stages**,
including both extended walks, DMG layout/identity/signature verification,
zero-skip scan and 372 files / 3,963 tests in 55 seconds. The 30-minute soak,
resource suite, real-pack/offline field check and isolated upgrade also passed.

`desktop:trust:verify` exited 1, **NOT GREEN**. The application passed all
29 code-object signature checks, the sealed-bundle verification, stapled ticket
and Gatekeeper's Notarized Developer ID assessment. The DMG failed its ticket
and Gatekeeper checks because its separate Apple submission remains In Progress.
The accepted application is not used to conceal that failed release gate.

The public descriptor remains 1.4.0 build 1007. GitHub 1.4.1 is still a draft
holding the superseded build 1024 assets; no corrected build 1025 public download
or Sparkle public-update success is claimed. After Apple acceptance, the existing
submission's digest must be bound to this DMG, then the ticket stapled, trust
rechecked, the quarantined GUI launch completed, feeds generated, draft assets
replaced, release published, real public Sparkle update verified and the public
descriptor/deployment/download bytes checked. These remain pending release work.

Only the two task-owned superseded build 1024 staging/quarantine directories
were removed (approximately 1.3 GiB combined). Logs, regression evidence,
walk reports and the corrected 787 MiB build 1025 candidate remain available.
The current run never allocated a new 10M corpus on the internal SSD.
