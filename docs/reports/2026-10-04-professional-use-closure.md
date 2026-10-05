# Professional-use closure — working log (started 2026-10-04)

Continues [the stability audit](2026-10-04-professional-stability-audit.md).
Starting point verified, not assumed: `master` = `origin/master` =
`179577f518f04db671b244e0d267a7aa8e71b424`, clean tree. Public descriptor:
1.4.7 build 1113 from `43044cde134cca9a4db8c3023ab2ad4235a68e95`. Commits after
`43044cd` change documentation and a landing test only.

Evidence that is not committed lives in `~/KingfisherWork/evidence/closure/`.

## Support promises this verdict is measured against

Read from README, `docs/product/public-claims.md` and the landing page — not
chosen to make the matrix easier.

| Promise                                                                            | Source                               |
| ---------------------------------------------------------------------------------- | ------------------------------------ |
| Mac application: Apple Silicon (arm64), macOS 13 or later                          | README, public claims, descriptor    |
| Windows, Linux and Intel Macs: not built, not supported (desktop)                  | README, public claims                |
| Web application: "Modern · Chromium, Firefox, Safari"; JSON-LD also names Edge     | Landing                              |
| SQLite collections measured to 500,000 games, IndexedDB to 50,000; not to millions | README "Deliberately bounded"        |
| Authenticated remote provider: **Lichess only** (token or PKCE sign-in)            | `lichess-auth.ts`, `lichess-pkce.ts` |
| Chess.com: public username sync, no authentication                                 | README "Linked accounts", `sync/`    |

## Outstanding gaps and the evidence that closes each

| #   | Gap                                                               | Evidence required                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Final timed 30-minute packaged walk incomplete                    | `desktop:soak` on the final candidate, passing                                                                                                                                                                                  |
| G2  | No multi-hour professional session                                | ≥4 h mixed-workload run on the packaged final candidate: per-cycle memory by process, engines/workers, listeners/observers/channels, requests, latency, console, persistence, restart, shutdown; inspection at start/middle/end |
| G3  | Cross-tab persistence not stressed over sustained use             | Two real tabs on one isolated profile, controlled persistence-boundary delays, independent invariant checks; regressions for any defect                                                                                         |
| G4  | Lichess signed-in workflows never exercised live                  | Live sign-in + explorer/game queries + revocation; transport fault injection for 401/429/timeout/offline/malformed; Chess.com username sync live round trip                                                                     |
| G5  | Firefox never reached the app; Safari only as WebKit automation   | Focused professional-workflow set in Firefox and WebKit; actual Safari if remote automation can be enabled; Chrome stable                                                                                                       |
| G6  | macOS 13 floor and other macOS versions unverified                | Packaged launch on any older macOS available through real infrastructure; otherwise state the boundary                                                                                                                          |
| G7  | No real corpus driven through the UI at the advertised 500k scale | Real CC0 Lichess tiers 224,679 / 578,262 / 1,048,440 games through _Import a large file_ and Library/Explorer in the packaged app; targets stated before measuring                                                              |
| G8  | Engine bar / lifecycle under long sessions                        | Covered inside G2 plus the existing real-engine regressions; a real Giri–Vachier-Lagrave game if one is available from a CC0 source                                                                                             |
| G9  | Classics collection not re-gated in a complete candidate          | Classics specs inside the final full browser gate and packaged run                                                                                                                                                              |
| G10 | Studies bundle / bulk parsing debt                                | Measure first; change only where a measured workflow warrants it                                                                                                                                                                |
| G11 | Full suites not rerun after `43044cd`                             | One frozen candidate: all source gates, one package, `desktop:certify`, leak soak, upgrade                                                                                                                                      |

## Progress

(Appended as work completes. Each entry names the command and where its output is.)

### D1 — Safari: a stalled remote request never ended (fixed)

Found by the new `e2e/provider-states.spec.ts` (G4/G5). With a Lichess
explorer request that was never answered, WebKit showed "Reading Lichess
Masters…" for as long as anyone watched (35 s observed; Chrome and Firefox
showed "did not respond" after the bounded retry, about 18 s).

Isolated in WebKit 26.6, Chromium and Firefox with a page that allocates while
waiting (probe scripts reproduced in the commit message):

| Deadline construction                              | WebKit              | Chromium |
| -------------------------------------------------- | ------------------- | -------- |
| `AbortSignal.timeout(6000)`                        | aborted at 6.0 s    | 6.0 s    |
| `AbortSignal.any([c.signal, AbortSignal.timeout])` | **pending at 14 s** | 6.0 s    |
| same, timeout signal strongly referenced           | **pending at 14 s** | 6.0 s    |
| `AbortController` + `setTimeout`                   | aborted at 6.0 s    | 6.0 s    |

Without allocation pressure WebKit's `AbortSignal.any` aborted on time, which
is why no earlier probe or test saw it. Every remote request built its deadline
that way: Lichess explorer (three sources), master-game PGN, the Lichess
connection test, Lichess tablebase, **every companion request**, and the
assistant. WebKit also rejects a timed-out fetch with `AbortError`, so callers
that matched `TimeoutError` misdescribed a timeout as "not reachable".

Fix: `deadline()` in `src/database/retry.ts` (controller + timer, explicit
`expired()`), used by all of them. Evidence:

- `src/database/retry.test.ts` "still combines the caller and the clock" —
  failed with the old `withTimeout` body restored (1 failed / 20 passed), passes
  with the fix (21/21).
- `e2e/provider-states.spec.ts` in WebKit — failed before (hang step, 25 s, no
  error), **6/6 passed** after across Chrome, Firefox and WebKit.
- Affected unit suites: 125/125.

### G4 (partial) — provider failure classes in the real panel

`e2e/provider-states.spec.ts`, fake token, faults at the network boundary only:
empty, malformed JSON, wrong schema, 401 revoked, 403, 429 (Retry-After), 503,
connection refused, never answered — each named distinctly, the source picker
unchanged (no silent substitution), no healthy table, failure never shown as
"No games", and the next position recovers. A late answer for the previous
position (carrying a move illegal now) never appears. Chrome, Firefox, WebKit.

### G5 (partial) — Firefox reaches the application

Firefox 155 (Playwright build) launches, loads Kingfisher and runs specs; the
profile-setup failure recorded in the 1.4.3 handover did not recur.

### D2 — a connected player reopening on Lichess Masters was told to connect (fixed)

Found by the live harness (`scripts/desktop-lichess-live.mjs`) on the packaged
public 1.4.7 with a real signed-in profile: token persisted (36 characters,
remember on), Masters selected, and at launch and after reload the panel said
"Lichess requires an API token… Connect Lichess". The provider learns the token
from a module variable, mirrored by an effect in `useCompanionSync`; React runs
child effects first, so the Explorer's first request went without the token,
Lichess's answer was cached as an authentication error, and was not retried.

Fix: the preferences store mirrors the token synchronously at hydration and on
every change; the effect copy is removed.

- `src/stores/preferences-lichess-token.test.ts`: 2/2 fail with the mirror
  removed, 2/2 pass with it.
- `e2e/provider-states.spec.ts` "reopening on Lichess Masters": **passed even
  with the fix removed under `next dev`** — Strict Mode's double mount refetched
  with the token and hid the race. Against a production build (`next start`):
  failed without the fix (`token-race-nofix.log`), passed with it. The standard
  e2e gate runs `next dev`, so it cannot catch this class of first-mount race;
  the provider spec is therefore also run against production in final acceptance.

### G4 — first live pass (public 1.4.7, signed-in profile, no revocation)

`lichess-live-1.4.7-dry.json`: Masters at the start matched Lichess directly
(e4 d4 Nf3 c4, 2,879,587 games); after 8 rapid moves the panel showed only the
final position, every listed move legal; Lichess account sync imported 234
games and a second sync none; Chess.com `sampleuser` imported 1, then none;
37 remote requests; 0 console errors; no surviving process. Four harness
defects were found and corrected (compared against its own bookkeeping instead
of the board's FEN; read the master game before it loaded; prefetch cache made
the offline step vacuous; sync text read from the wrong account row; an
exception was swallowed by `exit` in `finally`). Final live run pending on the
final candidate, including revocation.

### G7 — targets, stated before any large-corpus measurement

Interactive operations are judged as a person waiting at the screen; bulk
import is judged by honesty and control, not speed.

| Operation                                                                                                | Target at ≤ 600k games                                                                                                          | Target at ~1M games |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Library: open collection with count; first page; next page; sort; filters by player, event, date, result | p95 ≤ 1 s                                                                                                                       | p95 ≤ 2 s           |
| Explorer / opening summary at a position from the collection                                             | p95 ≤ 1 s                                                                                                                       | p95 ≤ 2 s           |
| Open a returned game on the board                                                                        | ≤ 1 s                                                                                                                           | ≤ 1 s               |
| Free-text search over all headers (no index-friendly prefix)                                             | may be slower; must show progress or stay cancellable, never freeze                                                             | same                |
| Bulk import                                                                                              | progress at least every 5 s; Stop honoured within 10 s; committed games kept; reimport adds no duplicates; UI stays interactive | same                |
| Companion memory during import                                                                           | bounded, no growth with games imported beyond batch working set                                                                 | same                |

Anything that misses a target is reported as a miss, with its measurement.

### G3 — sustained two-tab stress (`e2e/cross-tab-stress.spec.ts`)

Two real tabs, one profile, one study of three chapters; seeded actions
(open chapter, play a random legal move, race both tabs on one chapter, cursor
keys, reload, fail the next chapter write); every chapter read and write in
both tabs delayed 0–700 ms before and after at the repository boundary, with
the real workspace. After every action: the tab settles (conflicts are always
resolved with "Save my version as a copy"), the list selection and the status
bar name the same document within 10 s, and the FEN is legal. At the end every
authored chapter move — recorded by the test as (position before, SAN) — must
be in a stored chapter of that name or a conflict copy.

It found two defects.

**D3 — a cancelled chapter switch kept naming the clicked chapter (fixed).**
The board held a non-chapter document (Studies' first read still pending), a
chapter was clicked, and a move was played. The edit correctly cancelled the
switch and stayed in its own document, but the list kept the clicked chapter
selected and the header kept its title for as long as anyone watched, so
every later move went somewhere the screen said it did not. `restoreSelection`
re-aligned only when the board held a study chapter. Now the page is
_detached_ while that same document is on the board in that study: nothing is
selected, the header says "The board holds Untitled analysis, not a chapter of
this study", and the first-chapter fallback does not open a chapter over the
edit. Regression `study-open-ownership.spec.ts` "…names no chapter and opens
none over the edit": failed without the fix (a chapter row stayed current),
passed with it; 17/17 neighbouring Studies/reliability cases passed.

Not a defect, recorded: with reads slowed by up to 1.4 s, a reload shows the
first chapter highlighted for up to ~840 ms before converging on the chapter
actually restored (`reload-probe.log`). It always converges, and edits during
the restore are already protected; with unslowed IndexedDB the first sample
(219 ms) is already correct. Cosmetic; left as is.

**D4 — a tab reloaded inside the autosave window could come back with the
other tab's work, losing its last edit (fixed).** Seed 20261004, steps 98–99:
tab A played b4 in Charlie, reloaded before the chapter write landed; tab B
wrote its own draft meanwhile; A came back on B's document and b4 was nowhere.
Both draft slots — the synchronous `localStorage` unload draft and the
IndexedDB draft — are shared by every tab, and the restore kept the newer of
the two, dropping A's unload draft, the only copy of its edit. Now the unload
draft records its tab session (`kingfisher.session`); a reloading tab takes
only its own (any, on a fresh launch, as before) and prefers it over a newer
stored draft of different work. Regressions: `unload-draft.test.ts` (4 new
cases) and `cross-tab-stress.spec.ts` "a tab reloaded mid-save comes back with
its own work" — failed without the fix (A's move gone), passed with it.
38/38 reload/launch/restore/tab neighbours passed after the change.

**D3 follow-up — my own regression, caught by the stress run (fixed).** Seed
1999 timed out looking for the board: in the new detached state Studies showed
"Create or select a chapter" instead of the board, because the body rendered
only with a selected chapter. The work was safe (notation and status bar
showed it) but could not be seen or played on. The board now stays in the
detached state. The D3 regression now also requires a visible, playable board:
it failed with the one-line render condition reverted and passes with it.
Seeds after the fix (120 actions each, all **0 chapter moves missing**):
20261004 (81 moves, 3 conflict copies, 7 failed writes), 7 (76, 5, 13),
46 (73, 2, 12), 1999 (81, 3, 10). An earlier "1 missing" on 20261004 after
D4's fix was the test's oracle, not the product: it recorded the chapter and
position _before_ a move whose board a pending switch replaced between choice
and click. The oracle now records where the move landed.

### D5 — Safari: leaving and coming back lost the last edit and stalled saving (fixed)

Found by the first real-Safari run (`scripts/safari-acceptance.mjs`, Safari
27.0.1 via `safaridriver`). Minimal reproduction: play a move, leave Kingfisher
by a full navigation while it is unsaved, come back by loading `/analysis`.
On return the edit was gone (0 half-moves), the status bar said "· saved",
every later edit stayed at "· saving…", and the app's `drafts.get` never
answered while `studies.list` did. Safari had frozen the page it left in its
back-forward cache (`pagehide.persisted === true`, even with an `unload`
listener) with the draft write's IndexedDB transaction open, and that lock
held the `drafts` store for every later page of the origin. WebKit automation
under Playwright never navigates this way, which is why no earlier run saw it.

Fix: `NativeDatabase` tracks open transactions; a `pagehide` with `persisted`
aborts them and refuses new ones until `pageshow`; the synchronous unload
draft keeps the work, and a resumed page saves again at once. Evidence:

- Unit `database.back-forward-cache.test.ts` 3/3; with the freeze call
  disabled, 2 fail.
- Real Safari before: minimal flow lost the move and stalled (log above).
  After: the move is restored, the store answers, the next edit saves.
- `safari-acceptance.mjs` now **15/15** on a production build of the fix,
  including leave-and-return by fresh load and by Back, reload, PGN import
  with a variation and comment, browser Stockfish, the built-in explorer,
  24 direct routes plus refresh, and 1024×700 layouts.
- Persistence specs on the production build 42/42 (Chrome + WebKit); the two
  specs that need the development-only repository seam 12/12 on `next dev`.

### G7 — real Lichess corpora, imported and queried (pre-fix measurements)

Imported through the companion's own `/db/import-file` (compact index,
publisher SHA-256 verified), `scripts/large-db-import.mjs`:

| Archive (CC0)                 | Games accepted | Publisher count | Wall time | Games/s | Peak companion RSS | On disk |
| ----------------------------- | -------------- | --------------- | --------- | ------- | ------------------ | ------- |
| 2013-06 (after stop + resume) | 224,679        | 224,679         | 425 s     | 529     | 4.47 GB            | 1.11 GB |
| 2013-12                       | 578,262        | 578,262         | 763 s     | 758     | 4.24 GB            | 2.68 GB |
| 2014-07                       | 1,048,440      | 1,048,440       | 1,319 s   | 795     | 5.04 GB            | 5.16 GB |

Stop was honoured in 2.0 s with 40,800 games committed; the resumed import
added 183,879 and recognised the 40,800 as duplicates. Status polls saw
occasional `ECONNRESET` on reused keep-alive sockets during import; one retry
always succeeded and the companion never exited (`companionExit: null`).

Chrome against a production build (`scripts/large-db-ui.mjs`), 43/48 first
run: open with exact count 44 / 67 / 57 ms; next page 101 / 75 / 72 ms; player
search 39 / 36 / 36 ms; six rapid queries ending on the last ≈ 300 ms; explorer
at the start 33–36 ms; collection switch 5 ms. Three defects and two harness
faults followed:

- **D6 — Lichess archive games had no date (fixed).** The archives carry only
  `UTCDate`; `normalizeGame` read only `Date`, so all 1,851,381 games were
  undated and date filters, year windows and date sorts left them out. Now
  `UTCDate` is used when `Date` names no year; the fingerprint still hashes
  `Date`, so re-imports still deduplicate. `prepare-game.test.ts` 6/6; with
  the old rule 3 fail. Collections imported earlier stay undated (re-import).
- **D7 — the Library footer said "0–0 of N games" while a query ran (fixed).**
  Seen for 110 ms before the Event filter's correct 213,660 on the 578k
  collection. It now reads "Reading …" like the list. Browser regression with
  a 1.5 s delayed companion search: fails without the change, passes with it.
- **D8 — sorting by player scanned the whole table (fixed).** Sort by White
  took 4.8 s on 578k games (1.8 s at 225k) because it ordered by the
  unindexed display column; the indexed player key takes 22 ms on the same
  file and orders case-insensitively. Opening (79 ms) and date (132 ms) sorts
  are full sorts but within target and left as they are. Companion case test
  fails with the old column; 49/49 pass.
- Harness: the preview/open and post-restart checks failed because the date
  filter the script set was never cleared (all dates were empty before D6);
  rerun pending after re-import with dates.

### G10 — performance, measured before changing anything

Bundle (`npm run bundle:report`, `ad8f411`): application routes ship 396–532
kB gzip; heaviest `/studies` 532.0 kB over 31 scripts (the previous audit
recorded ≈620.8 kB; part of the difference is zod leaving the bundle, but no
baseline build was made, so no figure is attributed). What a person waits for,
Chrome, production build, cache disabled, median of 3, measured while a
large import ran in the background (`route-load-perf.txt`):

| CPU       | /analysis | /studies | /repertoire | /games | longest main-thread task |
| --------- | --------- | -------- | ----------- | ------ | ------------------------ |
| native    | 168 ms    | 143 ms   | 141 ms      | 127 ms | none over 50 ms          |
| 4× slower | 707 ms    | 589 ms   | 588 ms      | 561 ms | 153 ms (/studies)        |

No change is warranted to the Studies bundle on this evidence. Other measured
workflows: key → board p95 42–48 ms with an engine running
(`desktop-session.mjs` shakedown); Library at 1M games 36–101 ms; the one
measured problem (player sort, 4.8 s) is D8, fixed. zod's removal (CSP) is
incidental, not a performance claim.

### G5 — browsers (focused professional set)

Firefox 155 (Playwright): reliability, study reload, workspace frame / FEN
links, live engine settings and the evaluation bar, explorer top games,
Library databases, the main workflow spec, accessibility and provider states:
**78/78** (`firefox-focused.log`). WebKit 26.6, same set: 77/78 — one real
defect, D9 — then accessibility **132/132** across Chrome, Firefox and WebKit
after the fix. Real Safari 27.0.1: `safari-acceptance.mjs` 15/15 (D5 above).

**D9 — Safari: Tab left an open dialog for the page behind it (fixed).**
Safari's default Tab skips buttons and links, so it never reached the
dialog's last button, the only place the trap intercepted; from Settings'
last text field focus walked to the analysis title, the board, the notation
and the engine selector behind the modal. The dialog now also returns focus
that lands outside it (leaving nested dialogs, menus and list popups alone).
The trap test (now also Shift+Tab) fails in WebKit without the change; Settings
spec 30/30 with it.

### G7 — after D6–D8, on re-imported (dated) collections

Re-import (`large-db-import-2.json`): 224,679 / 578,262 / 1,048,440 games,
every game dated (`2013.11.30–2013.12.31`, `2014.06.30–2014.07.31`; edge games
are UTC-evening starts), 499 / 713 / 810 games/s, peak companion RSS 4.6 /
4.1 / 5.1 GB, 1.12 / 2.69 / 5.18 GB on disk; stop honoured in 2.0 s again.

UI, Chrome, production build (`large-db-ui-2.json`, 56/57): every filtered
count equals the count read from the SQLite file — Event "Rated Blitz game"
86,804 / 213,660 / 373,864; From date 131,910 / 324,834 / 582,768 — and each
clears back to the full count. Player sort 51–68 ms at every size (was up to
4.8 s). Open + count 49–57 ms; next page 59–81 ms; player search 37–43 ms;
preview 85–91 ms; open on board 96–99 ms; explorer 4–84 ms; switch 31–35 ms;
0 console errors.

**Measured miss, not fixed:** the first _unindexed_ sort of a cold collection
pays one sequential read of the file: Opening 4.8 s at 578k (2.7 GB), 1.8 s at
225k; warm, the same sort takes ~100 ms (CLI) to 330 ms (UI, Date). The page
stays interactive and now says "Reading…" (D7). The remedy — indexes on
`opening` and `date`, built when an existing collection opens — changes what
opening a multi-GB collection does (seconds per million games, and impossible
on read-only attachments), so it is recorded as technical debt rather than
made in a release-time change.

**D10 — reloading the Library on a companion database said "not connected"
(fixed).** `/games?db=sqlite:…` loaded with a running, answering companion
showed "could not be read: the companion is not connected" and never
retried. The connection was mirrored into the client module by an effect
that runs after the Library's first query (D2's shape); the Mac application's
bridge pairing was adopted the same way. The preferences store now adopts the
bridge pairing and mirrors the connection synchronously at load and on every
change. Unit tests (stored pairing, bridge pairing): 3/3 fail without the
mirror, pass with it. Production build: after a companion restart and reload
the Library lists 224,679 of 224,679 games (`large-db-ui-3.json`).

## Final candidate — `08bf7d4`, Kingfisher 1.4.8 build 1138

Frozen at `08bf7d4c69253b869fc04cb2a6b1b6e215956813`, clean
(`final-gates/summary.txt`):

| Gate                          | Result                              |
| ----------------------------- | ----------------------------------- |
| `npm test`                    | 4,180/4,180, 408 files, 0 skipped   |
| typecheck, lint, format, docs | pass (docs 363/363)                 |
| `npm run build`               | pass                                |
| `npm run benchmark`           | pass                                |
| `git diff --check`            | pass                                |
| `npm run test:e2e` (Chrome)   | **525/525**, zero retries, 37.0 min |

CI on `08bf7d4`: success. Production `kingfisherchess.app`: up to date
(`08bf7d4`). Real Safari 27.0.1 on the live site: **15/15**
(`safari-live-08bf7d4.json`); the web build is not cross-origin isolated by
design, so browser Stockfish runs single-threaded there and does search.

Package: `desktop:dist` (stable) — signed with Developer ID, notarised,
booted fresh (renderer, web, companion, engine catalogue, Sparkle 2.10.0),
signature re-verified after boot. Identity in the bundle: 1.4.8, build 1138,
commit `08bf7d4`, `dirty: false`, channel `stable`. DMG notarised (submission
`9ce7e452-…`, Accepted) and stapled; `desktop:trust:verify` GREEN;
`verify-dmg` 48 checks pass after stapling.

| Artifact                     | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `Kingfisher-1.4.8-arm64.dmg` | `ce2e6535330bb5ebd7e754cb25b7e07eb7427b003675b23819288d7caf58fcea` |
| `Kingfisher-1.4.8-arm64.zip` | `c21325c2c7b26181f888b98b267e94e23928be5115c1bd658364b50c19fad0d6` |

Process note, recorded as it happened: after the build, extracting the
packaged `package.json` with `asar extract-file` into the checkout overwrote
and then deleted the repository's own `package.json`. The package had already
been built from the clean tree (its identity says `dirty: false`); the file
was restored byte-for-byte from `HEAD` and the tree is clean. The first DMG
notarisation and trust runs failed for that reason only and were rerun.

## The 4-hour session on build 1138, and what it found (D11, D12)

The chain on build 1138 (`long/summary.txt`): 1,000-action walk 0 findings,
0 console errors; 300-action fault walk 0 findings (2 console errors from
killed services); **timed 30-minute soak complete: 833 actions, 1,808 s, 0
console errors, 0 findings, 0 survivors** (G1 closed); leak soak 3/3 (52 cycles,
12 chain passes; workers 0, observers 1, listeners 18, intervals 2); upgrade
from 1.4.7 passed.

The 4-hour session stopped measuring at 1 h 37 m. Cycles 0–40 were steady —
post-GC heap 28 MB, listeners 649, DOM nodes ≈1,527, renderer 450–580 MB, key
p95 31–62 ms, the same at cycle 40 as at cycle 2 — and the work survived every
restart (comment on screen after reopening). Then the shell logged
`[quit] requested` with no cause of its own (an outside quit; source not
determinable from the logs), and the harness, which had no recovery, looped
on a dead window. Three "restart" findings were the harness comparing the
cursor after an offline round with the game's end; corrected.

Reproducing the outside quit to make the harness recover found two defects:

**D11 — reopening within seconds of quitting was refused (fixed).** The
previous instance was still stopping its services on the profile's port, and
the new launch showed "Kingfisher needs its own port … another program is
using that port" — the owner saw this dialog. `resolveAppPort` now waits up to
10 s for its own port; a foreign holder is still refused. Two tests fail
without the grace.

**D12 — a killed shell left its web server running, and Kingfisher would not
open again (fixed).** The companion ends when the shell's IPC channel closes;
Next's generated web server had no such watch. Each of three outside quits
during validation left an orphaned `next-server` (parent PID 1) on its
profile's port. On build 1138, `scripts/desktop-killed-shell.mjs` (SIGKILL the
shell, require every service gone in 10 s, reopen the profile): **1/3 — the web
server survived, the reopen failed**. The shell now loads
`desktop/src/web-parent-watch.cjs` into the web server with `--require`; it is
staged beside `server.js` and listed in the required packaged resources. The
unit test fails with the watch emptied. The check is now a `desktop:certify`
step.

## Shipped build 1141 session — owner-requested early stop (2026-10-05)

Start verified: clean `master` = `origin/master` = `ae763d8`. The package's
recorded identity is 1.4.8 build 1141, `7545726`, stable, `dirty: false`.
The local DMG hashes to the descriptor's `f667e09f…`; `gh release view v1.4.8`
reports a published stable release. `npm run deploy:status` reports production
`f68d4ad`, up to date with a docs-only skipped commit.

Command, detached with `nohup`, a separate process session, log and exit marker:

```bash
KINGFISHER_DESKTOP_APP=$HOME/KingfisherWork/desktop-out-148b/mac-arm64/Kingfisher.app \
  node scripts/desktop-session.mjs --duration=4h --warmup=2 --restart-every=6 \
  --offline-every=4 --suspend-every=60m \
  --out=$HOME/KingfisherWork/evidence/closure/session4h-1141
```

The owner asked to end early. Measured duration: **10,028 s (2 h 47 m 8 s)**,
71 cycles with measurements, 69 after warm-up. Eleven quit/reopen checks
preserved the chapter's final position and comment, each with zero survivors
and ~5.7 s shutdown. Seventeen offline rounds answered from the built-in
reference; both 20 s suspends resumed responsively (six processes each).
No lost-work, stale-analysis, unexplained quit or console finding before stop.

The first and last thirds after warm-up (23 cycles each):

| Measurement                                     | First      | Last       |
| ----------------------------------------------- | ---------- | ---------- |
| Post-GC heap                                    | 41 MB      | 41 MB      |
| Renderer working set                            | 483 MB     | 507 MB     |
| Main process                                    | 218 MB     | 226 MB     |
| Services                                        | 245 MB     | 245 MB     |
| DOM listeners                                   | 664        | 664        |
| DOM nodes                                       | 1,659      | 1,659      |
| Live workers / channels                         | 0 / 1      | 0 / 1      |
| Intervals / resize observers / window listeners | 3 / 4 / 32 | 3 / 4 / 32 |
| Key latency p95 (mean of cycle p95s)            | 47 ms      | 48 ms      |
| Cycle time                                      | 134 s      | 131 s      |

Ordinary cycles return to 28 MB heap, 649 listeners and ~1,527–1,531 nodes;
offline and restart cycles leave different page states, hence higher pooled
means. Renderer working-set variation alone is not evidence of a leak.
The Library step's ~7.85 s includes the harness's wait for a nonempty search
result; it is not a measured slow successful query or a new latency claim.

Inspected `inspect-start.png`, `inspect-1h.png` and `inspect-2h.png` personally:
correct chapter and saved state, notation and board intact; the hourly images
show cycle-25 and cycle-51 comments. No end/hour-3/hour-4 image was produced.

**Termination attribution:** at 16:59:33 UTC (19:59:33 Istanbul), the agent
issued normal application quit in response to the owner's request. The harness
recorded this as `unexpected-quit`, correctly identifying the outside request.
SIGTERM did not stop its Playwright recovery, so it reopened once; the harness
was terminated and the recovered app quit normally. The log records services
stopped at 17:00:21 UTC. Both shells, all captured owned processes and all
Kingfisher services/engines are gone. Exit marker **137 is intentional
termination, not a completed harness pass**. `session.json` is preserved raw;
`early-stop-review.json` records attribution, comparison and cleanup separately.
The raw shortened comparison fails on that known termination finding; all
resource/latency growth checks are within its thresholds.

**Verdict: PARTIALLY under the original four-hour acceptance criterion.**
The observed session supports stability for the measured duration; it does not
prove four hours or multi-day use. macOS 13 remains unverified. The owner
explicitly waived further waiting, not the distinction between evidence and
an unperformed test.

### Arrow consistency follow-up

At the owner's request, use the engine best-move arrow's shape everywhere,
retaining existing colors. `arrow-shape.ts` now supplies authored, engine and
reference geometry and exported diagrams. Reference shafts retain their
population-weighted widths. No new version or Mac release is requested yet;
the published 1.4.8 package retains the previous authored geometry.

Regression: `vitest run src/features/board/BoardShapes.test.ts` compares rendered
engine/authored/reference outlines for a straight and knight move in both
orientations. With both implementation files restored to HEAD: **4/4 fail**.
With the fix and neighboring shape/diagram tests: **12/12 pass**.
Logs: `arrow-unification/regression-before.log` and `regression-after.log`.
Source validation: `npm test` **4,188/4,188**, 409 files, zero skipped;
`npm run typecheck`, `lint`, `format:check`, `build`, `benchmark` and
`git diff --check` passed; `npm run docs:check` **363/363**.

Rendered QA: the production build (`next start --port 3211`), real Chrome,
1440×920 and 390×844; Analysis → draw an actual engine-suggested move → file
as a study → Studies → compare the rendered engine/authored coordinates.
Light and dark: four geometry comparisons passed, original green brush
preserved, mobile board visible, zero console/page errors. Desktop and mobile
screenshots inspected; no framework overlay or missing board. Evidence:
`arrow-unification/browser-qa.json`, `analysis-light.png`, `studies-dark.png`,
`studies-mobile-light.png` (the other theme images are beside them).
The Browser plugin was unavailable; the repository's Playwright API was used.
The first probe incorrectly waited for a transparent engine data line to be
visible; after changing that wait to attached, the same flow passed.

Full browser gate: `CI=1 npm run test:e2e` **525/525**, zero retries,
38.1 minutes. The two-tab stress case authored 49 moves over 70 actions,
with three conflict copies and four injected write failures: zero chapter
moves missing. The browser resource-leak soak and visual snapshots also passed.
Log: `arrow-unification/e2e.log`.

All source gates are green for this arrow change. The public Mac remains
1.4.8 build 1141 with the old authored geometry at the owner's explicit
request; no release assets or descriptor were changed. `gh release view
--json tagName` still names `v1.4.8`. Publication is a source/web commit and
push, followed by `npm run deploy:status` and a live browser check; their
outputs are retained in the same evidence directory.

## Shipped build 1141 — the complete four-hour session (2026-10-05)

Start verified: clean `master` = `origin/master` = `65c41a9`; production
`npm run deploy:status` up to date (`65c41a9`); `gh release view` names
`v1.4.8`, stable, published. The package's recorded identity, read from
`app.asar` in memory (nothing extracted): 1.4.8 build 1141, `7545726`,
`dirty: false`, stable; `spctl` accepts it as _Notarized Developer ID_; the
local DMG hashes to the descriptor's `f667e09f…`. Host: macOS 27.0.1
(26A434), Apple M3 Pro, 18 GiB. No Kingfisher instance, build, packaged gate or
test suite was running; the harness's own isolated profile was used.

```bash
KINGFISHER_DESKTOP_APP=$HOME/KingfisherWork/desktop-out-148b/mac-arm64/Kingfisher.app \
  node scripts/desktop-session.mjs --duration=4h --warmup=2 --restart-every=6 \
  --offline-every=4 --suspend-every=60m \
  --out=$HOME/KingfisherWork/evidence/closure/session4h-1141-complete-20261005T175320Z
```

Launched with `nohup` in its own process session (runner PID 66067),
`caffeinate -i -w` on the runner, an atomic exit marker. No application or
harness code was changed, built or tested while it ran; source edits for the
owner's two later requests were made but nothing was run against them until
the marker existed.

**Result: exit marker 0; harness verdict `pass`, 100 steady cycles, no
failures.** Workload 17:53:51 → 21:54:18 UTC (14,427 s, 4 h 0 m 27 s), 102
cycles. Sixteen quit/reopen checks, each with the chapter's final move and
comment back and **0 survivors** (close 5.66–5.69 s); 25 offline rounds, all
answered from the built-in reference; three 20 s suspends (cycles 25, 51, 77),
six processes each, all responsive. **0 findings, 0 console errors, 0 failed
requests, 0 unexpected quits.** Shutdown: 5,667 ms, not forced, 5 owned
processes, 0 survivors, 0 orphan engines; afterwards `pgrep` finds no
Kingfisher, engine or web-server process. The profile's `kingfisher.log` holds
17 launches and 17 orderly quits (all harness-initiated) and no error,
exception or crash line.

Pooled first/last thirds after warm-up (the harness's own comparison): heap
40 → 39 MB, listeners 664 → 662, DOM nodes 1,664 → 1,642, workers 0 → 0,
channels 1 → 1, intervals 3 → 3, resize observers 4 → 4, window listeners
32 → 32, key p95 47 → 49 ms, cycle 134 → 135 s, renderer 526 → 533 MB, main
232 → 234 MB, services 268 → 259 MB.

Pooled means mix page states, so each state is compared with itself:

| State (first / last third) | Heap    | Listeners | DOM nodes   | Key p95        |
| -------------------------- | ------- | --------- | ----------- | -------------- |
| Ordinary (21 / 22 cycles)  | 28 / 28 | 649 / 649 | 1528 / 1528 | 47.5 / 48.0 ms |
| Offline only (6 / 5)       | 64 / 64 | 718 / 718 | 2262 / 2262 | 45.5 / 46.8 ms |
| Restart (3 / 2)            | 64 / 64 | 666 / 666 | 1547 / 1546 | 48 / 52 ms     |
| Restart + offline (2 / 3)  | 64 / 64 | 666 / 666 | 1546 / 1546 | 48.5 / 53 ms   |
| Suspend (1 / 1)            | 29 / 28 | 658 / 658 | 1527 / 1527 | 51 / 51 ms     |

The post-GC heap was 28 MB in every one of the 64 ordinary cycles; workers,
channels, intervals, observers and window listeners never changed; engine
processes after each settled cycle were 0 throughout; the worst cycle's key
p95 was 63 ms. The offline-only state (13 documents, 718 listeners) is the
same at cycle 4 and cycle 100: a page state, not growth.

Inspected personally: `inspect-start`, `-1h`, `-2h`, `-3h`, `-end`. Each shows
the session study and chapter, _Saved_, 120 moves, the board equal to the
notation's 60…Kg8, that cycle's comment on the move, and the explorer's
truthful "past this source's depth". The e2–e4 arrow toggles on alternate
cycles (drawing the same arrow erases it), so its absence from a screenshot is
expected.

`session.json` is the raw harness report; the independent review is
`independent-review.json` beside it. **The four-hour acceptance condition is
met on build 1141.** It is one continuous run; the shortened 2 h 47 m run
stays recorded separately and is not added to it.

## Owner requests after the session, and Kingfisher 1.4.9 (2026-10-06)

While the session ran the owner asked for two changes and a 1.4.9 release.
Source was edited during the run; nothing was built, tested or packaged
against it until the session's exit marker existed.

**The plain arrow is the engine's.** `65c41a9` had unified only the outline:
a plain right-drag still chose the green brush, which is what the owner (and
the session harness) kept seeing. A plain right-drag now draws the blue brush,
and a blue authored arrow is rendered with the engine best-move layer's colour
token, halo, edge and opacity, on the board and in exported diagrams; ⌥ draws
green. Regression: `BoardShapes.test.ts` — with the blue branch removed and
the old default restored, **2 fail**; with the fix the board group passes
**91/91** (`v149/arrow-regression-{before,after}.log`); a diagram test asserts
the exported paint. Live on production after `362517b`: the engine's d2–d4
arrow and a drawn e2–e4 arrow have identical paint attributes (fill and edge
`var(--engine-a-color)` = `rgb(58, 108, 173)`, halo, opacity 0.82).

**Historical players' photographs.** Photos were looked up only through the
titled roster, and FIDE titles begin in 1950. `npm run players:legends`
resolves each historical-roster person to a Wikidata item from Wikidata
(human, chess player, the roster's birth/death years, exactly one survivor):
104 of 106, every label checked; 83 are the same items the titled roster
holds, 21 are new (Capablanca, Morphy, Steinitz, Lasker, Alekhine…). Where both
rosters know a name they must agree. Regression: with the lookup roster-only,
**2 unit cases fail** and the Capablanca browser test fails ("element(s) not
found"); with the fix 15/15 and 4/4. Live: Capablanca's page shows his Commons
photograph credited "Anonymous Unknown author (Keystone-France), Public domain".

Source gates on `362517b`: unit **4,196/4,196**, 0 skipped; Chrome
**526/526**, zero retries, 36.8 min; typecheck, lint, format, docs 363/363,
build, benchmark, `git diff --check`; `deploy:status` up to date (`362517b`).

**Release 1.4.9 (section B).** `d9c5aae` (versions, changelog, release notes).
Preflight GREEN; `desktop:dist` stable: **1.4.9 build 1147, `d9c5aae`**,
signed, app notarised, fresh packaged boot verified; DMG notarised and
stapled; trust GREEN; `verify-dmg` with version and commit passed.
`desktop:certify` failed its unit step twice with `Failed to start forks
worker` on three files (406/409 ran, all green): iCloud had evicted 2,820
`node_modules` files to dataless placeholders and a worker importing one
blocked past vitest's 60 s start limit. `npm ci` (root and `desktop/`)
restored them locally and the third, complete run was **DESKTOP CERTIFIED
11/11** (smoke 17/17, chrome 109/109, restart 7/7, engines 25/25, suspend
14/14, killed, walks 0 findings, dmg, zero skips, unit 409/409 files, 4,196
tests). Published `v1.4.9` (latest): DMG 193,109,138 bytes, SHA-256
`7b7c704329775a373f95c9095c1941f80924dd789f528e519049762ae3e4fd9a`. Real
Sparkle update 1.4.8 → 1.4.9 over the public feed: **PASS 19/19**, study
preserved, test profile adopted, nothing survived. Logs:
`~/KingfisherWork/evidence/closure/v149/`.

The four-hour session certifies build 1141. Build 1147 differs from it in
the renderer's arrow paint and the photo lookup, both covered above, and is
certified by `desktop:certify` and the update test; it has not had its own
four-hour session, and the verdict says so.
