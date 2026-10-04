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
