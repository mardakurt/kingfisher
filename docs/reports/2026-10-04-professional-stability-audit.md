# Professional-use stability audit — 2026-10-04

Starting checkout: clean `master`, `e19e37a`, source version 1.4.6, Node 24.14.0.
This is stabilization of existing capabilities. No account, corpus, cloud service
or new chess feature was added.

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

- Initial unit/integration suite: 398 files, 4,123 tests passed.
- Final expanded unit/integration suite: 401 files, 4,151 tests passed, no skips.
- Typecheck, lint, format and diff checks passed after application edits.
- Documentation check: 363/363 before final report linkage.
- New browser regressions: 10/10 passed in targeted runs; 25 restoration, reload and tab cases passed together; the evolving audit suite passed 508/508 in 34.4 minutes. The subsequent frozen 510-case run failed the FEN handoff case above;
  the 512-case candidate was subsequently stopped for the additional reload defects;
  the final candidate (build 1110) must complete all 514 cases.
- Native fleet verifier: Stockfish native 19, Stormphrax 8, Viridithas 20,
  Halogen 16.8, PlentyChess 8 and locally installed Lc0 each verified.
  Berserk, Koivisto and Obsidian have no published darwin-arm64 build.
- Exploratory full browser run intentionally stopped after 342 passed cases (one interrupted and 161 not run) to build
  and restart against the final source. It is not a completed release gate.
- Frozen 1.4.7 production build passed again after the evaluation-bar fix. Benchmark passed: 100,000-game PGN parsing
  and aggregation, 20,000 rules operations, 10,000-game SQLite collections,
  preparation, seven performance tests and the bundle report. The live SQLite
  benchmark was skipped because no external companion token was configured;
  the collection benchmark used a real in-process SQLite database.
- Final full browser suite, extended soak and new packaged acceptance: pending
  at this checkpoint.

## Coverage boundaries

| Area                                         | Evidence and boundary                                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared board and position                    | Real browser Stockfish, 40 rapid cursor changes, route switching, orientation, reload; all 24 direct routes checked                                 |
| Studies and move trees                       | Existing conflict, persistence, annotation and large-tree regressions; measured 20,000-node browser workflow                                        |
| Engine lifecycle                             | Startup, cancellation, failure, retry, same-FEN stale callbacks and configuration regressions; real browser engine and six native searches          |
| Explorer and databases                       | Provider-failure regressions, actual companion collections, source switching and aborted fetches; public Lichess authentication requirement checked |
| PGN and scale                                | Domain tests and 100,000-game parser/aggregation benchmarks; no 10-million-game acceptance                                                          |
| Repertoire, preparation, training and review | Existing full browser workflows are being rerun; default direct-route/reload scan passed                                                            |
| Accessibility and panel layouts              | Existing keyboard, focus and resize browser gates plus a 1024×700 overflow scan; no radical restyle                                                 |
| Long sessions and packaged Mac               | Extended leak soak, full packaged certification and wall-clock soak still pending                                                                   |

## Build dependency maintenance

GitHub reported GHSA-ch52-4w7c-c8xp in `http-cache-semantics` 4.2.0, a desktop
build-only dependency through electron-builder's download tooling. The maintainer
disputes the report in [upstream issue 56](https://github.com/kornelski/http-cache-semantics/issues/56).
The compatible dependency was refreshed to 4.3.0; npm reports zero desktop
vulnerabilities. This is dependency maintenance, not a reproduced runtime
security fix or a full security audit.

## Remaining acceptance and technical debt

Provider failure paths are covered by repository/browser boundaries; no live
signed-in Lichess/Chess.com account was exercised in this audit. External service
availability cannot be inferred from mocked error cases. Native engine fleet
verification is separate from packaged renderer/session verification.

No acceptance at a real 10-million-game corpus is claimed. The route scan and
nested-PGN workflow do not represent hours spent in every combination of settings,
source, chapter conflict and training state. Browser memory/resource soaks and
packaged long walks must be recorded separately. No Windows run is claimed.

The public Mac descriptor still names 1.4.6 build 1105 and does not contain these
working changes. Production deployment and publication are independent evidence.
The large-data/accounts proposal remains a proposal, outside this stabilization.

Checkpoint verdict: PARTIALLY. Concrete races and source-identity defects are
fixed and covered, but final browser/build/long-session/package gates must finish
before a professional-use production-readiness claim.

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
