# Professional-use stability audit — 2026-10-04

Starting checkout: clean `master`, `e19e37a`, source version 1.4.6, Node 24.14.0.
This session stabilizes existing capabilities. At the user's later request, it
also adds a small, credited collection of 100 classic scores through the existing
importer. No accounts, cloud service or large-data infrastructure was added.

## Reproduced defects and their causes

| Defect                                                                 | Root cause                                                                                  | Correction                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| An unavailable engine could not recover on a later attempt             | Availability returned before startup's `finally`, retaining a resolved-null startup promise | All availability paths clear startup ownership                                                                   |
| Availability exceptions left startup stuck and rejected UI actions     | Availability checking was outside the startup error boundary                                | Availability errors become recoverable slot errors                                                               |
| Stop during startup could be reversed by a later board move            | Stop left a pending FEN/last request behind                                                 | Explicit Stop invalidates pending intent and disposes late startup sessions                                      |
| Startup offered no Stop control                                        | `running` was only set after startup/configuration                                          | Claim requested search immediately; Stop remains available during loading                                        |
| An older configuration could cancel a newer request                    | A superseded continuation cleared the newer request's pending FEN                           | Only the current request can clear pending state                                                                 |
| Returning to the previous FEN could let a different pending search run | Last analysed FEN was checked ahead of pending FEN                                          | Pending request identity takes precedence                                                                        |
| A new search could relabel old evidence with its new FEN               | Slot FEN changed while retained snapshot/history still belonged to the old position         | Retain warm evidence only for the same FEN                                                                       |
| Configuration or synchronous search failures rejected UI actions       | These calls lacked a slot error boundary                                                    | Dispose the failed session, clear evidence, expose Retry                                                         |
| Retry after mid-search death reused the failed session                 | The finished promise only changed the displayed error                                       | Failure now tears down the failed runtime before retry                                                           |
| Engine resource labels could misreport allocated threads/hash          | Labels read current preferences rather than the applied shared configuration                | Slots record applied configuration; labels use it                                                                |
| Selecting One engine left the secondary engine active                  | The control changed only the panel view                                                     | Selecting One engine releases the secondary slot                                                                 |
| MultiPV/settings edits did not update a running search                 | Preferences were consumed only when starting a search                                       | The shared studio guard reconfigures active unrestricted searches, including pending startup                     |
| Switching Library databases displayed the previous database's games    | Unconditional query placeholder data                                                        | Clear old header results and name the database being read                                                        |
| A completed move search stayed visible under another database          | Search identity omitted source ID                                                           | Include source identity; cancel and hide old results                                                             |
| Companion filters also queried My games                                | Local query remained enabled on every filter update                                         | Enable local query only for the local source                                                                     |
| Obsolete companion header requests kept running                        | Query cancellation signal was not forwarded to transport                                    | Pass the query signal through searchSource and CompanionClient                                                   |
| Slow game opens could overwrite newer choices or edits                 | Async loaders had no ownership check before committing to the shared store                  | Shared document request guard checks token, generation, authored revision and tree; all callers honor acceptance |
| A pending game could navigate back after leaving its route             | Caller navigated after any fulfilled load                                                   | Route departure cancels pending ownership; navigate only after an accepted load                                  |

## Evaluation-bar flicker reported during the audit

The user observed the black evaluation band flashing grey after each move in a
Giri–Vachier-Lagrave game. The root cause was the bar's `opacity-60` class during
engine catch-up and stored readings, rather than a change in which side led.
The black/white bands now remain opaque. During catch-up the previous geometry
is held, the score label reads `…`, and the tooltip and accessible description
explicitly identify the previous position. Stored current-position readings stay
visible; checkmate and rule-based draws still outrank engine updates.

Two component regressions failed before the fix and pass after it. A real
Stockfish browser regression imports the sourceable Marshall–Capablanca 1909
game from the existing annotated corpus, steps 20 moves forward and 10 back,
and samples DOM changes and animation frames. It observed actual catch-up,
constant opacity and honest pending labels. It failed against the original bar
because sampled opacity dropped below 1. After restoring the fix, all eight
targeted engine browser tests passed, including orientation and engine arrows. The user's exact game/date was not
identified; no claim to have replayed that specific game is made.

The earlier 509-case candidate run was intentionally stopped at 190 passed,
one interrupted and 318 not run to include this fix. The build-1107 packaging
attempt was cancelled during signing and was never published. A new frozen
candidate must complete all gates.

## FEN handoff failures found by the full browser gate

The frozen 510-case run finished with 509 passed and one failure: a direct
`/openings?fen=…` link reverted to the starting position after a failed route
payload triggered full navigation. Consuming the FEN used `router.replace`, which
unnecessarily requested server content; a fallback reload could race the draft
write. The underlying transient transport failure was not diagnosed.

URL consumption now uses Next.js's supported native history integration, avoiding
that server transition and retaining unrelated query parameters and the fragment.
A second reproduced defect prevented the same FEN from being handed to an already
mounted route twice: the applied-input latch never reset after URL consumption.
It now resets when the input parameter disappears. Both browser regressions failed
against the previous implementation. All 11 workspace-frame/tab cases passed with
the fix. The final full suite now contains 512 cases; the failed 510-case run is
not a green release gate. Build 1108 is superseded and will not be published.

## Further reload and restoration failures

A real production workflow then found that a starting-position FEN link was
consumed but overwritten by the previous draft. The initial board matched the
requested FEN, so the handoff skipped claiming the document before restoration.
An explicit input now claims priority when the workspace revision is still zero.
The browser regression also found the first correction insufficient on an
immediate second reload: clean document changes were not included in the synchronous
unload draft. Cursor and orientation navigation had the same gap. Pagehide now
captures the live workspace, including clean state, except while the untouched
initial board is holding or waiting for a draft.

Chapter restoration also awaited its repository read without rechecking ownership.
`stores/restore-draft.ts` now owns the restore commit and returns acceptance after
checking the shared document guard. Boot observes ownership before child effects;
it cannot supersede an explicit route load, survives route changes, and yields to
new requests or authored edits. Recent's Continue navigates only on acceptance.
An untouched initial board is protected from autosave until storage has answered.
Seven service regressions cover edits, replacement, route departure, newer requests,
ordinary restore and global boot ownership. Removing the guards made five fail;
restoring them passed all seven. Two additional browser cases cover starting-FEN
reload and preserving an existing tree, cursor and flipped orientation.

The 512-case run was stopped at 408 passed, one interrupted and 103 not run to
include these fixes. It is not a completed gate. The 1109 package is superseded
and will not be published. The final full suite contains 514 cases.

## Study selection after conflict recovery

The frozen 514-case run finished with 513 passed and one strict-selector failure:
the conflict-copy title appeared in both the chapter row and document label.
Strengthening that existing regression uncovered an actual selection defect:
the saved copy was open on the board but its row was not selected, and returning
to Studies could open the first chapter over the restored copy. Local picker
state did not follow external document changes and its default ignored the
workspace document.

Studies now follows the active chapter when no explicit choice exists, aligns a
settled selection after conflict recovery, and rechecks restored identity before
opening its fallback. Explicit chapter clicks and deep links keep their priority.
The stronger test failed before this correction, then verified the selected copy,
reload retention and the distinct move contents of both versions. All ten
reliability/study-reload cases passed. The final 514-case suite must be rerun;
build 1110 is superseded. Its 30-minute packaged soak completed 811 actions with
zero console errors/findings and zero surviving descendants on quit, as supporting
evidence rather than acceptance of the next build.

## Pending chapter reads and selection on failure

A separate slow-storage browser check reproduced loss of an authored move: the
outgoing chapter's save barrier completed, the user then played Nf6, and the
pending target read opened another tree over that edit. The board and stored
chapter lost Nf6. The chapter loader checked route cancellation, but did not
check intervening authored work after its storage awaits. Repository errors also
left the picker naming the failed target while the board held the original.

The loader now uses shared document ownership after the save barrier and every
repository await. Its ownership is retained across query-cache refreshes, so an
outgoing autosave cannot renew the old selection over the edited board. A stale
read cancels the switch and explains why; failed or missing reads restore the
current chapter selection. Three browser regressions cover an edit before
its autosave, the subsequent cache refresh, and read failure. All three passed
with the fix, failed when it was removed, and passed again after restoration.
All ten related Studies/reload/conflict/settings checks passed on a fresh server.

The frozen build-1111 514-case run finished with 513 passes and one settings-test
timeout. The trace shows a single 52-second reload waiting for local Next.js
development assets, not a failed preference assertion. The same complete settings
persistence test passed on production in 19.5 seconds. Its assertions and timeout
remain unchanged; final browser and native UI acceptance will run separately.
The full suite now contains 517 cases.

The signed/notarized 1111 package passed its two real-engine renderer cases,
launch (17 checks), chrome (109), restart (7), engine fleet (25) and suspend (14).
Its 1,000-action walk was cancelled to include the chapter fix; that is incomplete
certification. Six tracked isolated application processes were closed, with zero
survivors. Build 1111 is superseded and will not be published.

## Architecture and data integrity

The workspace remains one analysis store and one canonical board pipeline.
`stores/document-request.ts` adds request ownership, not another chess state.
Autosave acknowledgements do not cancel a legitimate load; authored changes do.
Stored/source game openers return acceptance, and the Library, player pages,
position history, search, review, repertoire, opening reports and similar-game
callers honor it. Study model-game references now use the same opener rather
than duplicating an unguarded load; missing-game errors are visible. Transposition
chapter loads use the same guard.

Engine board following reuses an existing startup. Explicit Stop cancels it.
Every late callback remains scoped to its request, including an old callback
whose FEN matches after returning to the same position. Failed sessions are
not reusable. No database schema or backup format changed.

## Tests and failure proof

- Deterministic engine regressions cover availability recovery,
  availability errors, startup Stop, configuration/search errors, superseded
  configuration, returning to the old FEN, and retained evidence identity.
  Six failed against the original engine store; the two position cases failed
  before their subsequent fixes. Startup-control assertions also failed before
  immediate running/cancellation was added.
- Replaced the weak late-snapshot test with three real searches through the
  store and captured per-search callbacks, including returning to the same FEN.
  The old test emitted callbacks before searches were reliably attached and used
  a score shape that did not match the domain type.
- Companion transport cancellation regression runs the real client against
  a fetch boundary and asserts AbortError, preserving the ordinary deadline.
  Reverting the client made it fail by timeout; restoring the fix passed.
- Four document-load tests cover last-click wins, authored edits, route departure,
  and outgoing autosave acknowledgement. The three stale-load cases failed
  against the original opener (including A overwriting newer B and edits being
  lost); all four pass with the guard.
- Four browser regressions use real companion collections: delayed source switch,
  move-search source switch, rapid filters/cancellation with zero duplicate local
  queries, and leaving a route during a slow game open. The first two failed
  before their fixes.

A real Stockfish browser regression also changes MultiPV 3 → 1 → 5 during a
running search, then verifies that changing it after Stop does not restart the
engine. It failed before live configuration wiring. Slot configuration/resource
sharing, secondary release and pending-startup preference changes have unit/UI
regressions.

## Actual browser use and comparison

Browser plugin unavailable; committed Playwright/Chrome workflow used.

The audit imported a PGN with comments and nested alternatives, started real
browser Stockfish with MultiPV, made 40 rapid End/Home cursor changes, switched
Openings → Preparation → Library → Analysis, flipped orientation, stopped the
engine and reloaded. Position, notation and comments remained intact; engine
panel FEN matched the board. Captured console warnings/errors and page errors:
zero. This workflow was repeated after the document guard and live engine settings
were added.

All 24 application routes were directly loaded and refreshed at 1024×700.
Each rendered meaningful content (Settings uses its dialog), with no page-level
horizontal overflow or captured console/runtime errors. Desktop screenshot:
1440×900. These are empty/default route checks, not exhaustive route-state proof.

Reference: https://macland.chessbase.com/ and the provided local images
`image-1790696240199.webp` and `image-1790696255459.webp`. The observed reference
principles are a stable board with adjacent notation/evidence, explicit source
identity and predictable Library-to-analysis navigation. This is an ergonomics
comparison to public development screenshots, not testing ChessBase itself.

## Performance evidence

The new rapid-filter browser test confirms zero My-games searches while querying
an active companion database, and cancellation of the obsolete companion request.
Cancellation aborts the browser transport; it does not establish that an
already executing SQLite statement is interrupted on the companion. No wall-time
acceleration percentage is claimed. Engine navigation reuses pending
startup rather than creating an engine per move; failed/stopped startups dispose
late sessions.

The exploratory browser run's 20,000-node tree test reported create/save 79.7 ms,
reload/render 452 ms and End/Home/Right navigation 140 ms. These are measurements
of this machine/run, not a change attributable to this patch.

## Verification status

- ✓ Frozen stabilization core `1077fd0` / build 1112: **517/517 browser tests**,
  zero retries; **4,151/4,151 unit/integration tests**, 401 files, no skips.
- ✓ Typecheck, lint, formatting, production build, documentation (363/363),
  benchmark and diff checks passed. The 100,000-game parser/index benchmark and
  real 10,000-game in-process SQLite benchmark passed. The optional external
  companion benchmark was not configured; it is not claimed as run.
- ✓ Fourteen production Chrome/WebKit regression cases and all 24 direct-route
  / reload checks passed without console errors or horizontal overflow.
- ✓ Core packaged certification: all ten steps passed, including a 1,000-action
  walk, a 300-action fault walk, all six available native engines, restart,
  suspension, window chrome, DMG verification and full unit suite.
- ✓ Core extended resource-leak soak: 3/3 cases, 17.3 minutes, 52 navigation
  cycles and 13 chain passes; no accumulating observable workers/listeners.
- ✓ Core upgrade, real Sparkle update, quarantined launch and optional reference
  pack offline/restart field checks passed.
- △ Final core timed 30-minute walk was interrupted during continuation after
  about 490 seconds / 210 actions. Earlier candidates completed three separate
  30-minute walks, but those are supporting evidence, not a final-core pass.
- ✓ Final application core `43044cd` / build 1113 adds the 100-game collection.
  CI passed **4,154 tests in 402 files**. Targeted parser/provenance tests passed
  10/10; actual live and packaged importer / named-game / reload tests passed
  2/2 each. All four named games were checked through their finishing moves.
- ✓ Final 1.4.7 Mac build: signed, notarised, stapled, booted and verified;
  smoke 17/17 and focused classics 2/2. Published DMG bytes independently
  downloaded and verified. Actual public Sparkle 1.4.6 → 1.4.7 update passed,
  retaining the authored study and isolated profile, with clean shutdown.
- ✓ Final Databases viewport and committed visual baseline: 2/2 passed; no
  baseline replacement was needed. Standard release checksum verification passed.
- △ Full suites and full desktop certification were deliberately not repeated
  after the static collection addition, following the user's explicit request.

## Coverage boundaries

| Area                                      | Evidence and boundary                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Shared board and position                 | Real Stockfish, rapid cursor navigation, route switching, orientation, reload; 24 direct routes                                       |
| Studies and move trees                    | Actual held-I/O races, cross-tab conflicts, annotations, persistence, nested PGN and 20,000-node workflow                             |
| Engine lifecycle                          | Startup, stop, failure, retry, stale callbacks, configuration; real browser engine and six native engines                             |
| Explorer and databases                    | Provider failure boundaries, real companion collections, source changes and cancellation; authenticated remote accounts not exercised |
| PGN and scale                             | Complete score round trips, 100,000-game synthetic benchmarks and real 10,000-game SQLite; no 10-million-game acceptance              |
| Repertoire, preparation, training, review | Complete frozen-core browser workflows and direct-route/reload checks                                                                 |
| Accessibility and layout                  | Keyboard, focus, resize browser gates, laptop overflow scan and 109 packaged chrome checks                                            |
| Long sessions                             | Packaged resource soak and hostile walks passed; final timed 30-minute walk incomplete; no multi-day plateau claim                    |

## Build dependency maintenance

GitHub reported GHSA-ch52-4w7c-c8xp in `http-cache-semantics` 4.2.0, a desktop
build-only dependency through electron-builder's download tooling. The maintainer
disputes the report in [upstream issue 56](https://github.com/kornelski/http-cache-semantics/issues/56).
The compatible dependency was refreshed to 4.3.0; npm reports zero desktop
vulnerabilities. This is dependency maintenance, not a reproduced runtime
security fix or a full security audit.

## Remaining known issues, technical debt and hardening

No meaningful reproduced application defect remains open in the covered
workflows. This is a bounded conclusion, not proof that every possible daily
workflow is defect-free. Exact Giri–MVL game identification was not supplied;
the evaluation flash was reproduced and checked on another real game.

Live signed-in Lichess/Chess.com integrations still need credentialed acceptance.
Firefox targeted launch failed during profile setup before the application
loaded; there is no full Firefox, Safari, Windows or older macOS matrix claim.
WebKit regression coverage is narrower than a complete Safari acceptance run.

The final core timed 30-minute walk remains incomplete, and the final collection
build has focused acceptance rather than another complete certification run.
Multi-hour cross-tab editing, real very-large corpora and multi-day memory
plateau measurements remain useful additional hardening.

The Studies bundle remains approximately 620.8 kB gzip; large PGN parsing and
index construction remain expensive at scale. The audit removes obsolete
requests, duplicate engine work and unused secondary sessions, but does not
claim a measured overall speedup. Signing static resources and aliases adds
release-time cost; the trusted pipeline was preserved rather than changed
while publishing. The large-data/accounts proposal remains outside this task.

The 100 games are curated classics and championship scores, not an objectively
measured popularity ranking. Expanding historical coverage still requires
verified source rights and score provenance.

## Final stabilization checkpoint and user-requested classics

The frozen stabilization core `1077fd0659b34ce7cc4283935e828a49e0320fe9`,
build 1112, completed **517/517 browser tests** in 33.7 minutes, with zero
retries. Its complete unit/integration gate passed **4,151/4,151 tests in 401
files**, without skips. Typecheck, lint, formatting, production build,
documentation and benchmark gates passed. CI was green; production deployment
matched that commit. Fourteen real Chrome/WebKit production cases passed, and
all 24 direct-route/reload checks produced no console errors or overflow.

The same signed/notarised Mac core passed all ten desktop certification steps:
smoke 17/17, window chrome 109/109, restart 7/7, engine fleet 25/25, suspend
14/14, the 1,000-action walk, the 300-action fault walk, DMG verification,
zero-skip scan and the full unit gate. Both walks had zero invariant findings.
The fault walk logged two console errors during intentionally killed services;
this is not reported as a zero-console-error run. Real packaged MultiPV and
evaluation-band regressions passed 2/2.

The user then requested roughly 100 famous games and explicitly instructed
**not to repeat all tests**. The existing Databases classics catalog now adds
100 factual scores: 21 individually named classics plus 79 championship games.
It includes Immortal, Evergreen, Opera, Game of the Century, Kasparov–Topalov
and Anand's Immortal. Every source is a pinned Wikimedia revision, credited
and licensed CC BY-SA 4.0. Modern commentary and images were excluded;
unknown exact dates remain unknown. This is not a measured top-100 ranking.

The addition changes the static collection, its existing importer copy, and
the data-licences page. No new database provider, board renderer, storage schema
or engine behaviour was added. All 100 scores replay completely through the
real rules/parser (**8,661 legal half-moves**, no duplicate complete scores),
survive PGN export, and carry source identity. Golden tests check the actual
checkmating finishes of Immortal, Evergreen and Opera. Targeted tests passed:
10 unit cases (two files) and both browser cases, including the original
annotated book, importing 100 games twice without duplication, searching and
opening four named classics, and reload persistence. Full suites were not
repeated for this final collection change, as the user explicitly requested.

No fabricated analytics, accounts or large database infrastructure were added.
The earlier failures and checkpoints above are retained as investigation
history; they are superseded by the completed frozen core gate, not erased.

## Final public verification

The published download / landing / install-guide / complete DMG gate passed
**67/67**. Vercel served the publication metadata at `2d858e4`.
The first live landing browser run passed 7/8: its ICO assertion assumed
`image/x-icon`, while Vercel correctly served the
[IANA-registered `image/vnd.microsoft.icon`](https://www.iana.org/assignments/media-types/image/vnd.microsoft.icon).
The test now accepts both ICO media types and independently verifies the
`00 00 01 00` file signature, preserving invalid-file detection. This was a
production test portability defect, not a broken favicon. The corrected live landing gate passed **8/8** in 11.2 seconds, without
retries. Full suites remain intentionally unrerun.

## Published deliverable and verdict

**Kingfisher 1.4.7, build 1113**, application core
`43044cde134cca9a4db8c3023ab2ad4235a68e95`, is published at
[the immutable release](https://github.com/mardakurt/kingfisher/releases/tag/v1.4.7).
The public DMG is 194,197,766 bytes, SHA-256
`8ec4e679a73d8ebaa03774cd0c3e11626560c896d2f84f5ffbc30026ae6fd799`.
Its downloaded bytes, Developer ID signature and notarisation were checked;
the public Sparkle feed actually updated the isolated 1.4.6 installation.
Publication metadata follows the frozen artifact and does not change its bytes.

The engine bar keeps stable black/white bands during position changes while
honestly showing a pending score. Engine evidence remains keyed to the correct
position. The existing Databases page offers **Famous games and championship
classics → Add 100 games**; imported games are searchable in My games and survive
reload, and importing the collection twice adds no duplicates.

**Professional-use stability verdict: PARTIALLY.** The exercised Mac and Chrome
workflows are substantially more dependable, with reproduced data-loss and
synchronization defects fixed and regression-protected. A universal professional
readiness claim still needs the remaining authenticated-provider, platform and
long-duration coverage described above. No missing acceptance is reported as a
pass.

_That was the 1.4.7 verdict. It is superseded by the
[Closure verdict](#verdict) below._

## Closure (2026-10-05): Kingfisher 1.4.8

Full evidence: [closure working log](2026-10-04-professional-use-closure.md);
raw logs in `~/KingfisherWork/evidence/closure/`.

### Defects found and fixed (each with a regression shown to fail first)

| #   | Defect                                                                                                                             | Where found                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| D1  | Safari: a stalled Lichess/tablebase/companion/assistant request read "Reading…" for ever (`AbortSignal.any` + GC in WebKit)        | provider-states spec, WebKit    |
| D2  | Signed in to Lichess, reopening on Masters said "connect Lichess" (token mirrored after the first query)                           | live signed-in run, package     |
| D3  | A cancelled chapter switch kept naming a chapter the board did not hold; then the board vanished                                   | two-tab stress                  |
| D4  | A tab reloaded mid-save restored the other tab's draft and lost its last edit                                                      | two-tab stress, seed 20261004   |
| D5  | Safari: leaving and returning lost the last edit and stalled saving behind a false "saved" (history cache froze an IndexedDB lock) | real Safari 27 via safaridriver |
| D6  | Lichess archive games imported undated (only `UTCDate`)                                                                            | 1,048,440-game import           |
| D7  | Library footer said "0–0 of N games" while a query ran                                                                             | large-collection UI             |
| D8  | Player sort scanned the whole table (4.8 s at 578k)                                                                                | large-collection UI             |
| D9  | Safari: Tab left an open dialog for the page behind it                                                                             | WebKit accessibility            |
| D10 | Reloading the Library on a companion database said "not connected"                                                                 | large-collection UI             |
| D11 | Reopening within seconds of quitting: "Kingfisher needs its own port"                                                              | session harness; owner saw it   |
| D12 | A killed shell left its web server on the port; Kingfisher would not open again                                                    | session harness; 1/3 → 4/4      |
| —   | Annotation arrows: round blob past the point, narrow head (board and exported diagrams)                                            | owner report                    |
| —   | zod (via a lint plugin) shipped and logged a CSP violation in every Firefox session                                                | Firefox on production build     |

### Checklist

| Area                                          | State        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source gates on the web candidate `08bf7d4`   | verified     | unit 4,180/4,180; browser **525/525** zero retries; typecheck, lint, format, docs 363/363, build, benchmark, diff                                                                                                                                                                                                                                                                                                                                                                            |
| Source gates on the shell candidate `7545726` | verified     | unit 4,184/4,184 and the static gates; no `src/` or `e2e/` change after `08bf7d4`                                                                                                                                                                                                                                                                                                                                                                                                            |
| Package 1.4.8 build 1141                      | verified     | signed, app + DMG notarised and stapled; trust GREEN; `desktop:certify` every step incl. killed-shell                                                                                                                                                                                                                                                                                                                                                                                        |
| Published release and public bytes            | verified     | v1.4.8 latest; `desktop:public:verify --landing --full` **68/68**; production `f68d4ad`                                                                                                                                                                                                                                                                                                                                                                                                      |
| Real Sparkle update 1.4.7 → 1.4.8             | verified     | public feed, study preserved, test profile adopted, no survivors                                                                                                                                                                                                                                                                                                                                                                                                                             |
| macOS 14.8.9 and 15.7.9 (hosted runners)      | verified     | 16/16 each on the published 1.4.8                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| macOS 13 (documented floor)                   | **open**     | no Apple-silicon hosted runner exists; not claimed                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Chrome / Firefox / WebKit                     | verified     | Chrome full gate; Firefox focused set 78/78; WebKit focused set + accessibility 132/132 (three engines)                                                                                                                                                                                                                                                                                                                                                                                      |
| Real Safari 27.0.1                            | verified     | 15/15 locally and on the live site (`08bf7d4`)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Two-tab persistence under slowed I/O          | verified     | four 120-action seeds, 0 authored chapter moves lost; deterministic regressions for D3/D4                                                                                                                                                                                                                                                                                                                                                                                                    |
| Signed-in Lichess                             | verified     | live 25/25 on build 1138 incl. revocation (Lichess answers 401 afterwards); renderer source identical in 1141                                                                                                                                                                                                                                                                                                                                                                                |
| Chess.com (username, public API)              | verified     | live sync and re-sync without duplicates                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Real corpora 224,679 / 578,262 / 1,048,440    | verified     | exact counts; filters equal SQLite counts; interactive 36–99 ms; stop 2.0 s; reimport deduplicates                                                                                                                                                                                                                                                                                                                                                                                           |
| 30-minute timed soak                          | verified     | build 1138: 833 actions, 0 console errors, 0 findings, 0 survivors                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Leak soak (52 cycles, 12 chain passes)        | verified     | build 1138: 3/3                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1,000 / 300-action walks                      | verified     | build 1138: 0 findings; build 1141 certify walks: 0 findings                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **4-hour professional session**               | **verified** | build 1141, one continuous run (2026-10-05, `session4h-1141-complete-20261005T175320Z`): 4 h 0 m 27 s, 102 cycles (100 after warm-up), harness `pass`, exit 0; 16 restarts 0 survivors, 25 offline rounds, 3 suspend/resume; 0 findings, console errors or failed requests; ordinary cycles heap 28→28 MB, listeners 649→649, nodes 1,528→1,528, key p95 47.5→48 ms; workers/channels/observers constant; 0 survivors after shutdown. The earlier 2 h 47 m run is kept separately, not added |
| Giri–Vachier-Lagrave evaluation bar           | verified     | Tata Steel 2021 (Lichess CC0 broadcast), Chrome and WebKit; the owner's exact game remains unidentified                                                                                                                                                                                                                                                                                                                                                                                      |

Arrow follow-up (owner-requested, unreleased on Mac): authored arrows and
exported diagrams now share the engine best-move geometry, retaining colors.
Regression 4/4 fail on the old implementation; 12/12 focused tests pass after.
Source gate: unit 4,188/4,188, Chrome 525/525 (zero retries), all static gates,
build and benchmark pass. Production-build Analysis/Studies geometry and
light/dark desktop/mobile QA pass. This source change is separate from the
unchanged shipped build 1141 used for the shortened session; no version bump
or Mac publication is made yet.

### Remaining non-blocking debt

- First _unindexed_ sort (Opening, Date) of a cold multi-GB collection pays one
  read of the file: 4.8 s at 578k games, 1.8 s at 225k; ~100–330 ms warm. The
  page stays interactive and says "Reading…". Remedy: indexes built on open.
- Under artificially slowed storage the Studies list can highlight the first
  chapter for up to ~0.8 s before converging on the restored one.
- Companion status polls during a large import occasionally see a reset
  keep-alive socket; one retry succeeds.
- Browser Stockfish on the web is single-threaded by design (no cross-origin
  isolation); the Mac application is isolated.

### Verdict

**Professional-use stability verdict: YES, within the scope below.**

Scope: Kingfisher 1.4.8 build 1141 (`7545726`, stable, notarised) on
Apple-silicon macOS 14.8.9, 15.7.9 (hosted runners, 16/16 each) and 27.0.1
(this machine: the four-hour session and every local packaged gate); the web
application in current Chrome, Firefox and Safari 27; browser and native
engines (Stockfish, Stormphrax and the managed fleet `desktop:certify`
installs and searches); local SQLite collections at the measured real sizes
224,679 / 578,262 / 1,048,440 games; persistence, recovery, offline use,
analysis identity and process lifetime; signed-in Lichess (live on build 1138,
renderer source identical in 1141) and public Chess.com username sync.

What closed it: one continuous four-hour session on the shipped build — 4 h
0 m 27 s, exit 0, harness `pass` — with no finding, console error or failed
request, sixteen quit/reopen checks that brought back the latest work with no
surviving process, twenty-five truthful offline rounds, three responsive
suspend/resume checks, every comparable resource count constant within its
own page state, key latency flat, and every owned process gone at the end
([closure log](2026-10-04-professional-use-closure.md)). Every other row of
the checklist above was verified earlier and is carried forward, not rerun;
each names the build or source revision it was measured on.

Kingfisher 1.4.9 build 1147 (`d9c5aae`), published 2026-10-06 at the
owner's request, adds the engine-style blue arrow and historical players'
photographs. It is `desktop:certify` 11/11 and passed a real Sparkle update
from 1.4.8; it has not had its own four-hour session, so the four-hour
evidence above belongs to build 1141 and is not claimed for 1147.

Not claimed: macOS 13, the documented floor (no Apple-silicon runner exists
to run it); Intel Macs, Windows and Linux desktop builds; Edge as a separately
tested browser; collections beyond the measured sizes; multi-day sessions;
engines and providers other than those exercised; ChessBase feature parity;
or that no future failure is possible. The non-blocking debt above remains.

## Final-source closure continuation (2026-10-06)

The new [ChessBase Mac claim/control matrix](../product/chessbase-mac-comparison-1.5.0.md)
was written before changes against the live preview page and ten owner-supplied
screenshots. Its comparison boundary is the unreleased development preview.
This continuation preserves prior results and does not transfer a historical
package's session evidence to a new build.

| Required checkpoint                                                | Current continuation evidence                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded rating classes, all-repertoire overview, PGN Title display | Implemented; focused logic 8/8, production browser 7/7, browser implementation-removal fail/pass pairs retained                                                                                                     |
| Real local/SQLite games and local video synchronization            | Final production browser 6/6 using two real broadcast games and Morn's CC0 Opera Game animation; screenshots inspected; responsive filter retention and stored-position return regressions failed before/pass after |
| Dependency fixes                                                   | sharp 0.35.5, source-map-js 1.2.2; runtime audit 0; sprintf-js and separate development braces advisory remain open                                                                                                 |
| Full final Chrome, Windows Edge, >10M games                        | Earlier Chrome interrupted for title browsing; final full Chrome, Edge and scale pending, no result claimed                                                                                                         |
| Stable package, public-byte/update checks                          | Pending; public remains 1.4.9 build 1147                                                                                                                                                                            |
| Continuous eight-hour published-build session                      | Pending; historical four-hour build 1141 does not satisfy it                                                                                                                                                        |

Verdict for this candidate remains **PARTIALLY** until the final-source gates,
publication and final-build session are complete. macOS 13 remains on 1.4.9;
Intel Mac, Windows and Linux desktop packages are outside the owner's scope.
