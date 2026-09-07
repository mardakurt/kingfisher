# Phase 19 — final report

```
Phase 19 status: COMPLETE for everything that could be done without a
                 credential this session does not hold, with four items
                 named in §29 that need one and one that needs hardware
```

Every number below names the command that produced it. Nothing is marked
verified on the strength of an earlier report, including Phase 18's — §21 is
what happened when this phase went and looked.

---

## 1. Executive verdict

**Is Kingfisher now a real installable desktop workstation?** On macOS, yes,
with one qualification that is stated everywhere it matters rather than buried
here: `npm run desktop:dist` produces `Kingfisher.app` and a `.dmg`, the bundle
is code-signed with the hardened runtime and all six entitlements, it launches
in 5.4 seconds, starts and pairs its own companion with no terminal and no
token to paste, opens a PGN onto the board, and leaves nothing running when it
quits. **It is not yet distributable**: the signature is an Apple _Development_
one, Gatekeeper rejects it, and notarised distribution needs a Developer ID
Application certificate that this machine does not hold. §4.

**Is macOS genuinely supported?** Apple Silicon: built, signed, launched and
driven end to end, 14 smoke checks passed and 22 with the network cut. Intel:
the same configuration builds a `.dmg`; it has not been launched, and the
report says so rather than counting a build as support. §5.

**Can it still run as a web app?** Yes, and nothing was traded for the desktop.
Standalone output and cross-origin isolation are opt-in behind environment
variables that only the desktop build script sets; with them unset `npm run
build` emits what it emitted before. 222 browser tests pass at zero retries.

**Known release blockers.** None for the web. For the desktop, one: the app
cannot be given to anybody until it is notarised, and that is a certificate.

**The Magnus test.** §31. The short answer changed from "no, and here is what
he cannot do" to "yes, except he cannot be handed the installer".

---

## 2. Git and GitHub

|                        |                                   |
| ---------------------- | --------------------------------- |
| Branch                 | `master`                          |
| Phase 19 begins        | `5fa13c5` (the Phase 18 handover) |
| Last gated code commit | `f9a7ee3`                         |
| Handover HEAD          | `ece577b`, this report            |
| Commits                | **13, including this report**     |
| Diff                   | **70 files, +11,065 / −188**      |
| New files              | **38**                            |
| Working tree           | clean                             |

`git log --oneline 5fa13c5..HEAD`:

```
3ebc46a docs: correct the signing status, which turned out to be better and narrower
db87742 docs: record what Lc0 did on this machine, and why there are two slots
f9a7ee3 fix: stop one HTTP request from killing the companion, and settle the slot count
187aeea test: walk the research chain repeatedly, and record the acceptance walk
f673eff perf: make every claim search interactive, and measure it at real scale
e675dd7 fix: make Analyse Game's side choice reachable, and make it mean something
f019f07 fix: name the resource a soak failure could not name, and re-audit Chess960
067cc2e feat: open a historical master game in Kingfisher instead of a browser tab
d959d3d feat: build and qualify engines from an exact upstream tag
def44c7 perf: index strategic claims, and make the index reachable
8d3a6de feat: package Kingfisher as a real macOS application
b1f9cdd feat: make Kingfisher a Mac application that owns its own companion
```

**CI.** Run **34129245906**, on `ece577b` — this report's own commit — is green
on all four gating jobs. §28 has the table, and names the two runs in between
that show as cancelled and why. Run **34112154544** built and qualified engines
on three platforms.

---

## 3. Desktop architecture

**Electron 44.2.0**, and it was chosen by measurement.
[ADR 0049](../adr/0049-the-desktop-shell.md) has the table; two rows decided it.

|                                 | Tauri 2.11.4                     | Electron 44.2.0            |
| ------------------------------- | -------------------------------- | -------------------------- |
| Empty bundle                    | **9.4 MB**                       | 307 MB of framework        |
| Web engine                      | WKWebView `AppleWebKit/605.1.15` | Chromium **152.0.7977.76** |
| `crossOriginIsolated`           | **false**                        | **true**                   |
| …with COOP/COEP declared        | still false                      | true                       |
| `SharedArrayBuffer`             | **absent**                       | **present**                |
| Node for the companion          | none; a **+119 MB** sidecar      | **Node 24.20.0, embedded** |
| `node:sqlite`, `worker_threads` | via that sidecar                 | **both work**              |

**Why Tauri lost.** Kingfisher's browser engine is a multi-threaded WebAssembly
Stockfish. That needs `SharedArrayBuffer`, which needs a cross-origin-isolated
context, and under Tauri's WKWebView `crossOriginIsolated` is `false` — re-measured
with `app.security.headers` declaring both policies, which is the configuration
that ought to fix it. A Tauri Kingfisher would have fallen back to one thread on
the platform this phase calls first-class, _silently_.

**Why Electron won on the other side too.** The companion is 28 Node modules
using `node:sqlite` and `worker_threads`. Electron embeds a Node that runs both,
verified by running them, so the companion is forked unmodified — no rewrite in
Rust, no second implementation of the database and engine layers.

**Bundle architecture.** The shell serves the same Next.js application the
browser runs, from a Next standalone server it starts on a loopback port it
chose. No second renderer, no second router, no chess code in the main process.

**Security model.** `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. The whole surface between shell and application is
`desktop/src/preload.cjs` and `src/desktop/bridge.ts`, which returns `null` in a
browser. There is no `readFile(path)` on the bridge; everything readable was
chosen in a dialog or dropped on the window. Navigation is pinned to the
shell's own origin and external links open in the user's browser.

---

## 4. Desktop distribution

| Artifact                     | Status                                       |
| ---------------------------- | -------------------------------------------- |
| `Kingfisher.app` (arm64)     | **built, signed, launched, driven** — 338 MB |
| `Kingfisher-0.1.0-arm64.dmg` | **built** — 155 MB                           |
| `Kingfisher-0.1.0.dmg` (x64) | **built**, not launched                      |
| Windows NSIS                 | configured, **not built**                    |
| Linux AppImage               | configured, **not built**                    |

**Signed: yes.** `codesign -dv` on the arm64 bundle:
`Identifier=dev.kingfisher.app`, `flags=0x10000(runtime)` — the hardened
runtime — authority `Apple Development: Metin Arda KURT`,
`TeamIdentifier=3B5CYF9DQ4`, `Sealed Resources version=2 rules=13 files=2013`.
`codesign --verify --deep --strict` reports **valid on disk** and **satisfies
its Designated Requirement**. All six entitlements are present in the signed
bundle: `allow-jit`, `allow-unsigned-executable-memory`,
`disable-library-validation`, `files.user-selected.read-write`,
`network.client`, `network.server`.

**Notarised: no**, and Gatekeeper rejects it. `spctl -a -t exec` → `rejected`,
`origin=Apple Development`. `stapler validate` → "does not have a ticket
stapled to it". The precise reason, rather than "needs an Apple Developer
identity": this keychain holds _Apple Development_ and _Apple Distribution_
certificates and neither is the right kind. Notarised **direct** distribution
needs a **Developer ID Application** certificate — _Apple Distribution_ is for
the App Store and TestFlight, _Apple Development_ is for running on registered
devices, which is exactly what the current signature is good for.

**Auto-update: not implemented.** No updater is configured, so §AS's update
scenarios have nothing to exercise. Said plainly rather than tested against a
stub.

**File association:** `.pgn` is declared in the bundle with a MIME type and the
Viewer role, and `desktop/src/files.mjs` decides what Kingfisher will actually
open. Opening from the Finder was **not exercised**, because registering an
association reliably needs a Gatekeeper-accepted, installed application.

---

## 5. macOS

|                    | Apple Silicon (arm64)         | Intel (x64)           |
| ------------------ | ----------------------------- | --------------------- |
| Application builds | ✅                            | ✅                    |
| Installs (`.dmg`)  | ✅                            | ✅ built, not mounted |
| Launches           | ✅ **5.4 s** signed, packaged | ✗ not run             |
| Manually driven    | ✅ 14/14 smoke, 22/22 offline | ✗                     |
| Engines qualified  | **7**                         | **3**                 |
| Known limitations  | not notarised                 | never launched        |

**Engine support, arm64.** Stockfish 19, Stormphrax 8.0.0, Viridithas 20.0.0,
Halogen 16.0.0, PlentyChess 8.0.0 (Phase 18's five), plus **Berserk 14** built
from source this phase, plus **Lc0 0.32.1** verified live. **Intel** goes from
Phase 18's two — Stockfish 19 and Halogen 16 — to three, with Berserk.

---

## 6. Windows

Desktop packaging: **configured, not built.** `desktop/electron-builder.yml`
declares an NSIS target for x64 and arm64 with a chooseable install directory.
Nothing was produced and nothing was run. Manual status: none.

Engine support is unchanged from Phase 18 and remains the widest for published
binaries: Stockfish 19, Halogen 16, PlentyChess 8, Koivisto 9, Berserk 14 — five
qualified in run 34048549010. The engine-build workflow does **not** include
Windows, because the Berserk makefile's Windows path was not tried.

CI status: the browser suite does not run on Windows; the engine fleet matrix
does, and did.

---

## 7. Linux

Desktop packaging: **configured, not built.** An AppImage target for x64 and
arm64 is declared; nothing was produced and nothing was run.

Engine support: six qualified in Phase 18, plus Berserk 14 **built and
qualified this phase** in run 34112154544 — 16 of 16 checks. CI runs the whole
browser suite, the visual gate and the production build on Linux, and all three
are green.

---

## 8. The companion

On the desktop the companion is infrastructure, and the shell owns its lifetime.

**Start.** The shell picks two free loopback ports, mints a 32-byte token, and
forks the companion under `ELECTRON_RUN_AS_NODE` with the token, a data
directory under the user's application support, an engine directory outside the
bundle, and the one origin it should accept. Both services start in parallel;
neither is a prerequisite for the other.

**Shutdown, which is a contract with three parts.** `SIGTERM` first, so the
companion runs its own handler and calls `engines.stopAll()` — a `SIGKILL`
would skip that, and engines are spawned **detached**, in their own process
groups, which is exactly the property that lets them outlive a parent nobody
told to stop. Escalation to `SIGKILL` if it will not go, so a hung service
cannot make the shell hang on quit. And an IPC channel the companion watches,
so a shell that is _killed_ rather than quit still takes its engines with it.

`desktop/src/services.test.mjs` forks real processes and asserts all three,
including one that ignores `SIGTERM`. `desktop:smoke` asserts the end state:
**nothing at all survives the quit** — 5 descendants, all gone, 398 ms.

---

## 9. Engine fleet

| Engine              | Version | Licence          | Source                         | Platforms qualified         | MultiPV | WDL | `searchmoves`               | Syzygy |
| ------------------- | ------- | ---------------- | ------------------------------ | --------------------------- | ------- | --- | --------------------------- | ------ |
| Stockfish (browser) | 18      | GPL-3.0-or-later | official WASM                  | all                         | ✅      | ✅  | ✅                          | —      |
| Stockfish           | 19      | GPL-3.0-or-later | official release               | Linux, Windows, macOS ×2    | ✅      | ✅  | ✅                          | ✅     |
| Stormphrax          | 8.0.0   | GPL-3.0-or-later | official release               | Linux, macOS arm64          | ✅      | ✅  | honours it                  | ✅     |
| Viridithas          | 20.0.0  | AGPL-3.0-only    | official release               | Linux, macOS arm64          | ✅      | ✅  | ✅                          | ✅     |
| Halogen             | 16.0.0  | GPL-3.0-or-later | official release               | Linux, Windows, macOS ×2    | ✅      | ✅  | ✅                          | ✅     |
| PlentyChess         | 8.0.0   | GPL-3.0          | official release               | Linux, Windows, macOS arm64 | ✅      | ✅  | **ignores it, and says so** | ✅     |
| Koivisto            | 9.0     | GPL-3.0          | official release               | Linux, Windows              | ✅      | ✅  | ✅                          | ✅     |
| Berserk             | 14      | GPL-3.0          | **Kingfisher-built**, tag `14` | **macOS ×2, Linux**         | ✅      | ✅  | ✅                          | ✅     |
| Lc0                 | 0.32.1  | GPL-3.0-or-later | system (Homebrew)              | macOS arm64, **live**       | ✅      | ✅  | ✅                          | ✅     |

Capability columns are read from each engine's own `uci` response at install
time, never inferred from a name. Phase 18's qualification matrix
(run 34048549010) stands; Berserk's row is new.

**Berserk 14, built by Kingfisher.** Run **34112154544**, from tag `14` at
commit `8ae895a6151695be4a50d4fb65b0c131659c513a`, unpatched:

| Platform    | Build command                 | Compiler           | Time | SHA-256 (first 16) | Qualification |
| ----------- | ----------------------------- | ------------------ | ---: | ------------------ | ------------- |
| macOS arm64 | `make build ARCH=arm64`       | Apple clang 21.0.0 | 11 s | `0d4db823e3896315` | **16 of 16**  |
| macOS x64   | `make build ARCH=x86-64-avx2` | Apple clang        | 16 s | `4c165edfd415240e` | **16 of 16**  |
| Linux x64   | `make build ARCH=x86-64-avx2` | gcc                |    — | in the artifact    | **16 of 16**  |

Every provenance field the brief asked for is recorded: engine, upstream
repository, tag, commit, licence, compiler, compiler version, build flags,
target architecture, the network dependency (the neural network the build
downloads, by URL), and the resulting SHA-256.

**Two engines were tried on macOS and refused**, recorded with the reason so a
shorter column is an answer rather than a question. Obsidian 16.0 passes
`-flto-partition=one` — a GCC option Apple clang rejects — and `-s` to a linker
that does not take it. Koivisto 9.0 needs `-fopenmp`, which Apple clang does
not have, and links with GNU-only `-static` and `-Wl,--whole-archive`. Neither
is a defect in the engine; both would need Kingfisher to patch an engine or
override the flags its authors chose, which the pipeline forbids.

**Nothing built this way is published.** Every one is GPL or AGPL, and
conveying a binary carries an obligation to offer the corresponding source.
Because nothing is patched that obligation is satisfiable by the upstream tag —
which is why "no patches" is a rule — but satisfying it properly is a release
process, not a CI artifact.

---

## 10. Lc0

Driven through a running companion on macOS 26.6.2, Apple M3 Pro, 2026-09-07:

|         |                                                               |
| ------- | ------------------------------------------------------------- |
| Binary  | `Lc0 v0.32.1`                                                 |
| Backend | **metal**, `Initialized metal backend on device Apple M3 Pro` |
| Network | `42850.pb.gz`, autodiscovered from the Homebrew install       |
| Search  | depth 4, `pv e2e4 c7c6 d2d4 d7d5 f2f3 d5e4 f3e4`              |

Binary present, network present, **and a real search finished** — which is what
Ready has to mean for a neural engine, because Lc0 handshakes happily with no
weights at all. The backend line comes from Lc0's own stderr, which the
companion tags rather than discards.

**Not verified in the packaged application.** Lc0 is a `system` engine on
macOS; it is on this machine because Homebrew put it there, and it is not in
the packaged app's engine directory.

---

## 11. Engine safety

Phase 18's hardening stands and was not weakened: an allowlisted environment
rather than `process.env`, process-group termination, bounded partial-line
buffers, `setoption` values clamped to the machine with the clamp reported
rather than applied silently, and a process that fails to acknowledge a stop
failed rather than reused.

Phase 19 adds the shell-level half — the shutdown contract in §8 — and fixes
one defect that could take all of it down at once. See §21.

**The sandbox verdict, per platform, in the required words:**

| Platform | Verdict                                                         |
| -------- | --------------------------------------------------------------- |
| macOS    | **Verified managed native engine — runs with user permissions** |
| Windows  | **Verified managed native engine — runs with user permissions** |
| Linux    | **Verified managed native engine — runs with user permissions** |

Not _Isolated_, on any of them, and the desktop bundle makes that slightly
sharper rather than softer: the hardened runtime needs
`disable-library-validation` so that an engine signed by its own project — or
by nobody — can be loaded at all. That entitlement is in the bundle, it is
commented in `entitlements.mac.plist`, and it is the honest cost of running
other people's binaries. No OS isolation mechanism was implemented, because
implementing one that did not actually confine anything would be security
theatre. [ADR 0041](../adr/0041-engine-trust-and-the-sandbox-we-do-not-have.md)
is unchanged and still correct.

---

## 12. Claim search

Phase 18's first known limitation, closed. Full measurements in
[`docs/performance/phase-19-claim-search.md`](../performance/phase-19-claim-search.md);
`npm run bench:claim-search` reproduces them.

**The collection.** 150,119 real over-the-board games, **11,303,059 indexed
positions**, 1,527,506 distinct claim sets, 3,109 distinct claims, 4.96 GB —
the same scale Phase 18 measured, rebuilt through the application's own import
path. Twelve claims sampled log-spaced from one in 824,408 claim sets down to
one in a single set, across all three orderings.

|        |          before | after (cold) | after (warm) |
| ------ | --------------: | -----------: | -----------: |
| median |    **642.6 ms** |   **0.9 ms** |   **0.4 ms** |
| p95    |               — |      82.9 ms |      78.4 ms |
| worst  | **11,241.9 ms** | **268.8 ms** |  **78.8 ms** |

Two things the before-table showed that were not obvious. Every claim paid a
floor of about 640 ms however rare, because a leading wildcard makes the `LIKE`
over 1.5 million claim sets unindexable. And **sorting on the position row is
worth 4.8× on the worst case by itself** — `positions.rating_key` and
`year_key` already hold the game's rating and year, so the join to `games`
stops being per matched row.

**The schema.** A `claims` dimension table and `claim_set_members`, plus two
rank indexes. Claim → claim _set_, not claim → position: 11.3 million positions
carry only 1.5 million distinct claim sets, so the posting list is 20,252,011
rows rather than the ~114 million a claim-to-position index would be. **+531 MB,
10.7%** — against roughly 1.6 GB, which would have given back nearly half of
what Phase 18's compaction saved.

**Two plans, chosen by selectivity**, returning the same rows so a wrong choice
is slower and never different. The hint is a set count, which is free to
maintain and cannot be badly wrong: a claim in _S_ sets covers at least _S_
positions, which bounds how far a wrongly chosen scan can walk. It
misclassifies 32 of 3,109 claims on this collection.

**Migration and backfill.** Chunked, resumable from a cursor, running in the
maintenance worker beside compaction, with progress and cancel. **A half-built
index is never used** — a claim search against one returns _nothing_, which
reads as "no game here has that structure" — so the fast plan waits for a
completed build and every other state falls back to scanning. That gap was
caught by `schema-equivalence.test.mjs` on a migrated collection before any of
it shipped.

**UI behaviour.** The Position index section in a collection's detail reports
which schema it is on and whether claim search is indexed or scanning, and
offers both jobs with their progress and a cancel — see §21, because that
section is the fix for something else.

---

## 13. Databases

Current schema: the compact position index from Phase 18, plus this phase's
claim index. Largest tested real collection: **150,119 games / 11,303,059
positions / 5.49 GB indexed**.

Copy, move, merge, dedupe, federated search, integrity, backup and restore are
unchanged and green: `schema-equivalence.test.mjs` runs the whole `GameDatabase`
API against a migrated collection and a natively-compact one and requires
identical answers — **57 tests**.

**New: opening a collection by path.** `/db/attach` is the one route that names
a filesystem path rather than a resource key, and it is the narrowest such
route that works. The file is opened **read-only first** and refused unless it
already is a Kingfisher collection, because `GameDatabase`'s constructor runs
its schema DDL — which writes. `attach.test.mjs` asserts the refusals by
**reading the file back byte-for-byte afterwards**: a database another program
made, an En Croissant database (named specifically, with the right route
offered), and a PGN all come back unchanged.

En Croissant remains read-only and is never written to.

---

## 14. Historical master research

**What is installed locally: nothing before 2020.** Unchanged, and for the same
reason — no source audited both contains historical over-the-board master games
and grants redistribution on compatible terms.

**What comes from Lichess Masters**, re-verified against the current API
specification and the live service on 2026-09-06 rather than against what the
code assumed:

- `explorer.lichess.org/masters?play=…` → **401 without a token.** Still true;
  it is why `explore` requires one.
- `explorer.lichess.org/masters/pgn/{gameId}` → **200 without a token.** An
  unauthenticated request for the id in Lichess's own specification returned a
  real over-the-board master game: Carlsen–Chadaev, World Blitz, Astana 2012.

Kingfisher was refusing that request before making it. It no longer does.

**What can be opened.** The explorer's model-game list had three cases and
implemented two: a pack game opened on the board, and everything else became a
link _out of the application_. An online source that serves whole games now
opens on Kingfisher's board, through the same parser an import uses, carrying
the source and the id that served it.

**What cannot be done, and it is a fact about the API.** The masters endpoint
takes `fen`, `play`, `since`, `until`, `moves` and `topGames`, and **no player
parameter**. There is no player search in the masters database, so "find every
Fischer game" is not a request that can be sent. What works is reaching a
position and opening the games that got there.

**Fischer–Spassky 1972.** The position is reachable through the masters
explorer, which needs the user's own token; the game endpoint that serves the
PGN does not. Phase 18 checked the position is reachable; this phase made the
game openable here rather than in a browser tab.

**Saving a fetched game locally** (§AA) was **not implemented.** The read path
is now honest and complete; a save path needs a provider-terms decision that is
the owner's, and inventing one would be the wrong kind of initiative.

`npm run smoke:lichess -- --public` is the half of the live check that needs no
credential. It asserts **both** halves of the asymmetry — that a master game
comes back without a token, and that the query endpoint beside it still refuses
— because a check that only did the first would keep passing if Lichess put the
whole explorer behind authentication. Both pass, and it runs on a schedule in
CI (run 34123549102).

---

## 15. Opening Explorer

Sources: Kingfisher Starter (bundled), Elite OTB, Recent Theory, High-Rated
Online, Lichess Masters, Lichess rated, My Games, and companion SQLite
collections. Populations are shown side by side, each with its own game count
and licence, and there is deliberately no combined figure.

The Theory Book, the Explorer, Book Moves and the Repertoire still answer four
different questions and are still four different surfaces. Variation briefs:
157, covering 93.6% of the 3,810 named positions; the rest say so.

Offline: the bundled starter pack answers with the network off, verified this
phase inside the packaged desktop application — see §16 of the acceptance walk
and the 22-check offline run.

---

## 16. Opening Report

Nine sections, each carrying a provenance line or a stated reason it is empty,
and `e2e/opening-report.spec.ts` checks that in the browser for every section
rendered. Unchanged this phase and re-run green.

---

## 17. Automatic game analysis

**The workflow.** Games → select → _Add to analysis queue_ → engine, analysis
preset (250 ms / 1 s / 5 s / custom), MultiPV, positions (every move or after
opening move N), and — new this phase — **whose decisions to judge**.

**Evidence stored per analysed position**: engine id and name, score, depth,
nodes, time, principal variation, the other MultiPV lines, the position key and
FEN, and a timestamp. WDL is carried by the engines that report it.

**Tablebase use is not a queue option**, and is not claimed as one.

**Critical-position rules** are transparent and unchanged: an expected-result
swing past a threshold, the engine's first choice differing _beside_ a measured
swing, and the played move being outside the engine's stored candidate set.
Each candidate carries the facts that produced it. There is no Brilliant, no
Blunder badge, no accuracy percentage and no game score.

**What Phase 19 found here** is in §21: the side filter was unreachable, and the
saving it was introduced for cannot exist.

---

## 18. Repertoire review

Phase 18's fixes stand: one prompt per canonical position however many move
orders reach it, `reviewCardKey` making a card the memory of a _decision_, a
session replacing its set rather than growing it, and `?set=` read from
`useSearchParams` so an in-app navigation opens the set it names.

Phase 19 adds a repeated walk. The research-chain soak opens the review four
times across four passes and requires the number of prompts to be identical
every time: **steady at 5**. That is the Phase 18 defect asserted from the
outside, and it has no resource signature — no Worker, no listener, no observer
— so no leak test could have caught it.

---

## 19. Chess960

**NOT SUPPORTED.**

The re-audit changed the _reason_, which is worth recording.
[ADR 0050](../adr/0050-chess960-the-candidate-that-exists-and-still-is-not-taken.md).

ADR 0048 said no maintained, permissively licensed JavaScript library has
Chess960 support. That is no longer why. **`kokopu` 4.13.4 is
LGPL-3.0-or-later, published two months before this audit, and does it
correctly** — installed and driven rather than read about: it parses a Chess960
array and converts `KQkq` to the file-based `FHfh` form, and from
`rkr5/…/RKR5 w ACac` it plays `O-O` to `R4RK1`, king to g1 and rook to f1 from
squares neither started on.

It is still not taken, for reasons that are now the real ones. Adopting it
**replaces** the rules engine behind `position.ts` rather than augmenting it,
and two rules implementations would have to agree on standard chess for ever —
in a codebase that has already had one castling correctness bug with only one.
And LGPL §4 attaches a relinking obligation that a minified Next.js bundle and
a signed `.app` would each have to satisfy; Kingfisher declares no licence, so
that combination is permitted and conditional. That is the owner's decision and
a phase of its own.

The audit also found the hazard beside the opportunity. **chess.js 1.4.0
accepts a Chess960 array claiming standard castling rights** and generates
twenty moves for it, with no Chess960 rules behind them — an illegal move
offered as legal. Kingfisher does not have that defect, because its own FEN
parser refuses the position first and `variant-contract.test.ts` holds it with
two named tests. Second time that boundary has paid for itself.

---

## 20. Phases 1–19 verification

[`docs/product/phase-verification.md`](../product/phase-verification.md) carries
one row per capability with its invariant, unit evidence, browser evidence and
the commit that repaired it if it was ever broken. Phase 19 added thirteen rows
and corrected one that had outrun the code.

**Thirty-four rows now say Held (repaired)**: thirteen from Phase 16 or
earlier, eight from Phase 17, seven from Phase 18, six from Phase 19.

---

## 21. Bugs found beyond the brief

Nine, each with its test, and four of them share a pattern that Phase 18 named
and did not escape.

| #   | Defect                                                    | Cost                                                     | Fix       |
| --- | --------------------------------------------------------- | -------------------------------------------------------- | --------- |
| 1   | **One HTTP GET killed the whole companion**               | every running engine and open collection, mid-analysis   | `f9a7ee3` |
| 2   | Phase 18's compact index had no client method and no UI   | 42.9% on a real collection, reachable only from a script | `def44c7` |
| 3   | `sides` was set by no control in the product              | a finished capability nobody could ask for               | `e675dd7` |
| 4   | The side filter cannot save what it was built to save     | a stated rationale that is arithmetically impossible     | `e675dd7` |
| 5   | The explorer sent every online model game to a website    | a master game unreachable without leaving Kingfisher     | `067cc2e` |
| 6   | `game()` refused a request that needs no token            | a capability Lichess gives away, withheld                | `067cc2e` |
| 7   | The relevance sort forced the worst of both query plans   | 74,351 ms against 312 ms on 11.3M positions              | `f673eff` |
| 8   | Rank indexes on open made the _unindexed_ fallback slower | 78,480 ms against 30,589 ms, plus 51.7 s per open        | `f673eff` |
| 9   | A soak failure that named neither resource nor route      | an unactionable red that nobody actioned                 | `f019f07` |

**Number 1 is the serious one.** `/engine/stream` wrote its event-stream
headers and _then_ subscribed; subscribing throws for a session that has
exited, which clients ask for all the time — a reconnect after a stop, an
engine that crashed. The throw reached the request handler's catch, which
replied with JSON, which called `writeHead` a second time, and an
`ERR_HTTP_HEADERS_SENT` raised inside an async handler is an unhandled
rejection. Node ends the process. **A single GET naming a dead session took the
companion down with every engine and every open collection.** Found by running
the multi-engine experiment, which opens and closes sessions in a loop.
`server-liveness.test.mjs` starts the real server as a child process and asks
whether it is still there, because no unit test against the route function
could have seen it.

**Number 4 is the one worth reading twice.** The side filter was introduced
because a pass over both sides "costs twice as much for evidence half of which
they will not read". It does not. Judging a move needs the evaluation before it
and after it, and a side moves at every other ply, so the union of "before and
after each of White's moves" is every position in the game. **The saving is at
most one position, whatever the game's length.** The test protecting it
asserted only that White's set is _smaller_, under a comment saying "close to
half" — and passed on a difference of one, which is the most it can ever be. It
now asserts the real bound at both parities, and the narrowing moved to where a
player can feel it: `suggestReviewCandidates` offers only that side's
decisions, while the pass still evaluates the whole game because it must.

Plus one defect inherited rather than introduced: **the Phase 18 handover
commit's own CI run is red.** Run 34050052495 on `5fa13c5` failed one soak test
with `Failed to load resource: … 404`, and `5fa13c5` is a documentation-only
commit on top of the run the report cites. So that test is intermittent, and
under this project's own rule a flaky green is not green. It has not reproduced
locally in four runs; what this phase could do is make the next occurrence
actionable, which is number 9.

---

## 22. Settings

Phase 17's settings contract is intact. `src/features/shell/settings-contract.ts`
names, for all thirty-three preferences, the module that writes it, the module
where it becomes visible and what a person would see, and `e2e/settings.spec.ts`
carries a runtime assertion for each or a written reason one is impossible. All
of it is green in run 34125786497.

**The desktop creates no second preferences system.** Companion pairing is
written _through_ the same preference the Settings field writes, so Settings
shows what is actually in use and nothing below that line is a special case.

---

## 23. Performance

|                                                | Measured                                     |
| ---------------------------------------------- | -------------------------------------------- |
| Desktop launch to window, signed and packaged  | **5.4 s**                                    |
| Desktop launch from the checkout               | **1.9 s**                                    |
| Desktop quit, everything gone                  | **398 ms** packaged, 64 ms from the checkout |
| Claim search, median / worst (11.3M positions) | **0.4 ms / 78.8 ms** warm                    |
| Claim index build (1.5M claim sets)            | **313 s** cold, 105 s warm                   |
| Explorer, unfiltered (150k games)              | 0.0 ms median                                |
| Explorer, filtered                             | 0.6 ms median                                |
| Games at a position                            | 10.8 ms median                               |
| Player prefix search                           | 0.0 ms median                                |
| Text search, common term                       | 21.2 ms median                               |
| Import throughput                              | 29 games/s, 89 min for 150,119 games         |
| Browser bundle, heaviest route                 | 371.4 kB gzipped                             |

Engine concurrency, Stormphrax, `go movetime 4000`, M3 Pro:

| Engines |    12t / 1 GB |   4t / 256 MB |
| ------: | ------------: | ------------: |
|       1 |      depth 24 |      depth 23 |
|       2 | depth 23 (−1) | depth 23 (−0) |
|       3 | depth 23 (−1) | depth 21 (−2) |
|       4 | depth 22 (−2) | depth 22 (−1) |

**The multi-engine decision: two slots**, and
[ADR 0051](../adr/0051-two-engine-slots-and-the-measurement-behind-them.md)
gives the reason the measurement does not. Three readings produce a majority,
and a majority is a verdict wearing the costume of evidence. Two engines
disagreeing is a reason to look at the lines. No document claims three or four.

---

## 24. Memory and soak

Two soak tests now, and they look for different things.

**The afternoon walk**, ten cycles across every surface: heap 106.8 MB, **1
worker, 1 observer, 16 listeners, 0 intervals**, no unbounded growth in
BroadcastChannels or EventSources.

**The research chain**, four passes through one connected piece of preparation
— board, Theory Book, source comparison, Opening Report, engine start and stop,
repertoire review, players, preparation, games, databases, studies, endgame,
structural search, review, training. **Review prompts steady at 5** across all
four; workers 1, observers 1, listeners 16, intervals 0.

The second exists because the first cannot see stale state: nothing in it
returns to a screen it has already been on and requires it to still be right.

**Desktop processes**: 5 descendants before quit, **0 after**, asserted on the
pids the shell reports rather than on a `ps` name heuristic.

---

## 25. Security

**Desktop shell IPC.** `contextIsolation`, `sandbox`, no `nodeIntegration`. The
bridge has no `readFile(path)`; everything readable was chosen in a dialog or
dropped on the window. Navigation is pinned to the shell's origin; external
links go to the user's browser. `window.require` is `undefined`, asserted in the
smoke run.

**Companion authentication and origin.** Loopback only, a token minted per run
and never written to disk. The desktop needs the companion to accept an origin
on a port the shell chose, so `allowedOrigins` now takes extras — and
**validates them as loopback rather than trusting the process that spawned it**.
`isLoopbackOrigin` refuses `https://`, a non-loopback host, a host that merely
_starts_ like loopback (`http://127.0.0.1.evil.example`), credentials, a path
and a query. Four tests, and mutating the validator to return `true` fails two
of them.

**Native paths.** `/db/attach` is the single route that takes a path, it comes
from a native dialog, and it refuses anything that is not already a Kingfisher
collection — proved by reading the file back unchanged after each refusal.
Engine and Syzygy paths are unchanged and still key-addressed.

**Engine downloads and build artifacts.** Downloads are checked against
recorded SHA-256 digests. Built engines add provenance: an exact tag that must
still resolve to the recorded commit — tested against a real repository whose
tag is moved between two clones, and by pointing the real Berserk entry at a
wrong commit and watching the build refuse it by name — and a checkout verified
clean, so nothing is patched.

**Availability.** The defect in §21.1 was a denial of service reachable by any
holder of the token, including the application itself after an engine exited.
Fixed at the cause and at the class.

**OAuth.** Unchanged: PKCE, no token pasted, the token never displayed. **Not
exercised live** — see §29.

**Updates.** No updater exists, so there is no update artifact to validate and
nothing is claimed about one.

---

## 26. Stale features

The audit found four capabilities that were built, tested, documented and
unreachable — §21.2, §21.3, §21.5 and §21.6 — plus one whose reachability was
fine and whose _claim_ was wrong (§21.4). All five are fixed.

Not everything on the brief's list was individually driven this phase, and the
honest position is that the browser suite exercises most of it as a side effect
rather than as a stale-feature audit: 222 tests across 28 spec files cover the
command palette, shortcuts, training modes, backup and restore, model games,
opening files, recent work, saved filters, Syzygy fallback, database
copy/move/merge, dedupe, En Croissant import, the position report, preparation
sessions, player profiles, the research back stack, focus mode and compact
mode. A dedicated no-dead-controls sweep was **not** written; §32 recommends it.

---

## 27. Tests

|                            |                                   |
| -------------------------- | --------------------------------- |
| Unit and integration files | **159**                           |
| Unit and integration tests | **2,132 passed, 11 skipped**      |
| Browser spec files         | **28**                            |
| Browser tests              | **222 passed**                    |
| Playwright retries         | **0**                             |
| Visual gate                | **24 passed**                     |
| Desktop shell tests        | **22** (services, files, menu)    |
| Companion tests            | **208 passed, 11 skipped**        |
| Desktop smoke              | **14 checks**, and **22 offline** |

New this phase: `desktop/src/services.test.mjs`, `files.test.mjs`,
`menu.test.mjs`, `companion/src/attach.test.mjs`, `claim-index.test.mjs`,
`server-liveness.test.mjs`, `scripts/engine-sources.test.mjs`,
`src/features/games/open-online-game.test.ts`, and the browser specs
`e2e/analyse-game.spec.ts` and the research-chain test in `e2e/soak.spec.ts`.

Every regression test for a defect in §21 was confirmed capable of failing by
reverting the implementation and watching it fail.

---

## 28. CI

Final completed run **34129245906**, on **`ece577b` — this report's own
commit**, so nothing here is written from an in-progress run or from a
different tree:

| Job                 | Result                                    |   Time |
| ------------------- | ----------------------------------------- | -----: |
| Quality             | ✓ 159 files, **2,132 passed**, 11 skipped |  3m27s |
| Production build    | ✓                                         |  1m05s |
| Visual gate (Linux) | ✓ **24 passed**                           |  2m48s |
| Browser tests       | ✓ **222 passed** (24.9m)                  | 25m42s |

Retries **0**. Flaky **0**.

Run **34125786497** on `db87742` is the same code and was also green on all
four. Two runs in between show as _cancelled_ — 34125058951 at test 80 of 222,
and 34128679420 — each superseded by the next push, with their other jobs
already green. Neither is a test failure, and neither is left unexplained.

Off the gates: **Engine build** run 34112154544, three platforms green.
**Lichess contract smoke** run 34123549102, green on the public half.
**Engine fleet** run 34048549010 from Phase 18 stands.

---

## 29. Known limitations

1. **The desktop app is not distributable.** Signed and valid, Gatekeeper
   rejects it, no notarisation ticket. Needs a Developer ID Application
   certificate.
2. **No auto-update.** Not implemented, not stubbed.
3. **`.pgn` file association is declared, not exercised.**
4. **Windows and Linux desktop builds are configured, not built.**
5. **macOS x64 was built and never launched.**
6. **A live Lichess OAuth round trip was not performed.** It needs the user's
   consent in a browser. The contract is tested and the public half of the live
   check runs without a credential — so: _contract-tested, live consent not
   performed._
7. **Lc0 was not driven inside the packaged application**, only through the
   companion from a checkout.
8. **Syzygy was not probed**; no tablebase files on this machine.
9. **Chess960 is not supported**, deliberately, and enforced by a test.
10. **The engine comparison takes two engines**, by decision, not by limit.
11. **Saving a fetched master game locally is not implemented.**
12. **The Phase 18 soak flake has not reproduced** and is not fixed — only made
    diagnosable.
13. **No games before 2020** are shipped.
14. **157 variation briefs**, covering 93.6% of named positions.

---

## 30. Competitors

Updated in [`docs/product/competitors.md`](../product/competitors.md). The rows
Phase 19 moved:

|                          |    ChessBase     |  Lichess  | En Croissant | ChessMonitor |                      Kingfisher                      |
| ------------------------ | :--------------: | :-------: | :----------: | :----------: | :--------------------------------------------------: |
| Desktop application      | ✅ Windows-first |     ✗     | ✅ all three |      ✗       | ◐ **macOS built, signed, driven; not distributable** |
| Engine management        |        ✅        |     ✗     |      ✅      |      ✗       |    ✅ **seven on Apple Silicon; one built here**     |
| Historical research      |   ✅ 550 years   | ◐ Masters |      ✗       |      ✗       |    ◐ **online masters, now opening on the board**    |
| Where a number came from |        ◐         |     ◐     |      ✗       |      ◐       |      ✅ **source and licence on every figure**       |

Strictly: Kingfisher is **weaker** on database breadth (507k shipped against
11.7M), on historical coverage (nothing before 2020), and on desktop
distribution (En Croissant and ChessBase ship something a stranger can
install). It is **stronger** on provenance, on comparing populations without
merging them, on shipping usable data for nothing, and — new this phase — on
having a desktop application that is the same application as the web one rather
than a second implementation.

---

## 31. The Magnus test

> Could Magnus sit down at a MacBook with Kingfisher installed and prepare
> without understanding how Kingfisher itself works?

**Open PGNs.** Yes. File → Open PGN, or drop one on the window, or hand it to
the shell — it lands on the board.

**Use huge databases.** Yes. A collection is opened by path from a native
dialog, and an 11.3-million-position one answers a structural search in under a
millisecond.

**Run Stockfish.** Yes, threaded, because the shell is cross-origin isolated.

**Run Lc0.** Yes on this machine — metal backend, network 42850, real search —
but through the companion from a checkout, not inside the packaged app.

**Compare engines.** Yes, two of them, and that is a decision with a
measurement behind it rather than a limit.

**Search history.** Partly, and the boundary is the API's rather than
Kingfisher's: he can reach a position in the masters database and open the
games that got there, on Kingfisher's board. He cannot ask it for "every
Fischer game", because the endpoint has no player parameter.

**Study openings, review a repertoire, analyse games.** Yes, and the review now
offers the side he asked about.

**Work offline.** Yes — 22 of 22 checks with every non-loopback request blocked.

**Close the app without orphan processes.** Yes. Five descendants before, none
after, and the shutdown contract is tested against real processes including one
that ignores `SIGTERM`.

**The honest no.** Somebody would have to hand him this build, or he would have
to build it himself, because Gatekeeper will not open it. Everything else on
that list he could do without knowing anything about how Kingfisher is made.

---

## 32. Next, at most three

1. **A Developer ID Application certificate, then notarise and staple.** It is
   the only thing between a working Mac application and one a stranger can
   install, and everything else for it is already configured and committed.
2. **Field use, for a week, by the owner.** Four of this phase's nine defects
   were capabilities that passed their tests and could not be used. The cheapest
   remaining detector of that class is not another test — it is somebody
   preparing for a real game and noticing what they reach for and cannot find.
3. **A no-dead-controls sweep.** §26 is honest that the stale-feature audit was
   a side effect of the browser suite rather than a deliberate pass. A
   structural test that walks every button, menu item and command and requires
   each to lead somewhere would turn the commonest defect in this project's
   history into a failing test.
