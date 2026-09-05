# Phase 16 — handover

Written 5 September 2026. Phase 16 is **not complete**; §18 says exactly what
remains and the next agent should continue this phase rather than open a new one.

---

## 1. Executive verdict

**What Kingfisher is.** A chess research workstation that runs in the browser,
with an optional local companion for native engines, SQLite databases and
tablebase probing. It opens usable with no import, no account and no download:
reference packs, an opening library of 3,810 named positions, a player library,
famous games and a working browser engine are present on a fresh profile.

**Is Phase 16 complete?** No. The audit, engine, persistence, network,
measurement and documentation sections are done and evidenced. Five substantial
sections are not: a real million-game database (Part O), En Croissant
interoperability (Part S), the high-rated online pack (Part T), a fresh React
render profile (Part V), and a manual UX pass (Part AH).

**Known release blockers.** None found. Every defect this pass turned up was
fixed and covered by a test that fails without the fix.

**Can a strong player use it as their primary study application?** For opening
work, analysis, studies, repertoire, preparation and reviewing their own games —
yes. For a ChessBase-sized personal database, that is untested at real scale and
is the honest gap.

**The Magnus test.** The four trust questions, answered directly.

- _Is the displayed position the analysed position?_ Yes — and this is the one
  that changed. A stopped-but-unreaped engine process could previously have its
  late `bestmove` counted against the next position; it now cannot.
- _Is the named database the named source?_ Yes. Provenance is carried per
  source, sources are never silently merged, and a remote failure offers the
  local source rather than blanking the panel.
- _Is the saved repertoire decision the one entered?_ Yes, and it is keyed by
  canonical position identity, so every move order that reaches the position
  gets the same answer.
- _Can a study be silently overwritten?_ No. Chapters carry a revision, and a
  cross-tab update that would lose local work is reported as a conflict rather
  than applied.

The remaining honest "no" is scale: a ChessBase-sized personal database has not
been tested with real games, only with a million synthetic metadata rows.

---

## 2. Git / GitHub

|                 |                                               |
| --------------- | --------------------------------------------- |
| Repository      | `https://github.com/mardakurt/kingfisher`     |
| Branch          | `master`                                      |
| Starting HEAD   | `e83a9be` (plus uncommitted work in the tree) |
| Final HEAD      | `c6e0b4e`                                     |
| `origin/master` | `c6e0b4e` — in sync                           |
| Working tree    | clean                                         |
| Force pushes    | none                                          |

Commits added this session:

| Commit    |                                                                       |
| --------- | --------------------------------------------------------------------- |
| `62428e8` | fix: never let a dead engine answer for a live position               |
| `53f21bb` | fix: back up every kind of authored work, not the first six           |
| `5df63ce` | test: interrogate the system engine instead of skipping it            |
| `c8c2d2a` | docs: give the next agent a map, and record what phase 16 inspected   |
| `3c9943f` | fix: put a deadline on the two remote calls that had none             |
| `b201a07` | perf: measure search honestly, and stop reporting a cold run as a p95 |
| `735de11` | docs: correct the search figures phase 15 could not explain           |
| `c6e0b4e` | fix: fail the engine panel when its engine dies, instead of spinning  |

The first three finish work the previous agent left uncommitted in the tree; it
was reviewed, formatted, mutation-tested and committed rather than restarted.

---

## 3. Bugs found

Ordered by severity. All are fixed.

### 1. A castling move that was not castling — **critical, chess correctness**

Found and fixed just before this session, recorded here because it is the most
serious defect the phase produced. Given `4k3/8/8/8/8/8/8/R4K1R w KQ - 0 1` —
white king on **f1**, rooks on a1 and h1, both rights claimed — the rules engine
offered `O-O-O`, played it by sliding the king f1→d1, and **left both rooks
where they were**. An illegal move presented as legal, in a position the setup
dialog could build and a PGN `[FEN]` tag could carry. Kingfisher's own FEN parser
now checks the claim rather than trusting what `chess.js` tolerates.
ADR 0047, `src/chess/variant-contract.test.ts`.

### 2. A backup omitted most kinds of authored work — **critical, data safety**

`PORTABLE_STORES` was written when the workspace had studies, repertoires and
games and was never revisited. **Preparation sessions, opening files, endgame
positions, pinned engine lines, source sets and player identities were all
absent.** A backup taken before a reinstall looked complete and restored a
workspace missing most of the work done since. All six now round-trip; a store a
backup predates is skipped rather than treated as empty, so the fix cannot itself
erase newer work.

### 3. A dead engine could answer for a live position — **high, engine correctness**

Three windows in which stale UCI output could be attributed to the position now
on the board:

- an unacknowledged `stop` abandoned the search but kept the process, so the next
  search reused a process still owing a `bestmove`;
- a companion-reported crash (`#error`/`#exit`) never reached the session, so a
  search whose engine had died stayed pending with its last `info` standing as
  though still being refined;
- neither transport's `waitFor` could be woken by anything but a matching line or
  its timeout, and both clear listeners on shutdown — so a waiter on a dead
  engine sat for its full 10–20 s with the session queue blocked behind it. A
  crashed engine read as a frozen panel rather than a failed one.

### 4. A crashed engine left its panel spinning — **medium, stability**

The session fails a search when its engine dies, but a dead engine emits no
final snapshot, and the store watched only the listener. The slot therefore read
"analysing" indefinitely after a crash — the stuck spinner, in the place a player
is most likely to sit and wait for it. The background analysis queue already
awaited the search and marked its job failed; the interactive panel, which is the
one a person is actually looking at, did not. The slot now moves to the `error`
status it already had for start failures, and only that slot fails.

### 5. Two remote calls had no deadline — **medium, stability**

Fetching a Lichess game by id passed only the caller's signal, and the callers
that open a model game pass none. The OAuth callback page had no signal at all —
so a stalled identify-the-account request left "Connecting…" on screen for ever,
the one outcome that page exists to prevent.

### 6. The search benchmark reported a cold run as a p95 — **medium, false measurement**

See §7. Phase 15's "p95 around one second" was an artifact.

### 7. The system engine was never interrogated — **low**

Lc0 is located on the path rather than downloaded, and the fleet check skipped
it, leaving its capability row as dashes for ever — indistinguishable from
"never asked".

---

## 4. Codebase audit

926 tracked files inventoried and categorised; full table in
`docs/product/phase-16-codebase-audit.md`.

Static health across `src`, `companion` and `scripts`:

- **0** `TODO` / `FIXME` / `HACK` / `XXX`
- **0** `@ts-ignore` / `@ts-expect-error`
- **0** real `as any` or `: any` — every textual hit is prose inside a comment
- **4** `eslint-disable`, each read in full and each deliberate and documented

No dead state, write-only preference, unused store, unreachable UI, duplicate
implementation, stale feature flag or suppressed failure was found. For a
codebase of this size that is unusual, and it is the main reason this pass could
go deep on behaviour instead of on tidying.

Query cache keys (Part W): every `queryKey:` enumerated and read. Keys answering
from a switchable reference source carry the source **and** its cache version;
keys answering from the user's own work carry only the canonical position key,
which is correct, and every mutation that changes such an answer invalidates it —
including a profile alias edit, because a player's aliases are what "My games"
means. No stale-chess-statement defect found.

Worker lifecycle (Part X): three `new Worker` sites, each terminated on abort,
on error and on completion, with listeners removed. No worker outlives its task.

Error boundaries (Part AE): a subsystem fails locally. An engine crash now fails
its own slot and leaves the board, the explorer and the second engine untouched;
an explorer error explains itself and offers the local source; a failing remote
source never blanks local evidence. Covered by unit tests and by the e2e
reliability and reference-source specs.

Database move invariant (Part N): verified in
`src/database/collections/operations.ts`. The destination is **re-queried** for
the fingerprints it now holds rather than the write being trusted to have thrown,
and only confirmed games are deleted from the source. Unconfirmed games are
counted and reported as `undeletedAfterCopy` — "the games are in both
collections" — rather than silently lost.

---

## 5. Core chess

`src/chess/` is pure: no React, no I/O, fully unit tested, and `position.ts` is
the only module permitted to import `chess.js`.

Legal moves, SAN, UCI, FEN, castling, en passant, promotion, check, mate,
stalemate, repetition and the fifty-move state are all covered, including a fuzz
suite. PGN import and export carry comments, NAGs, nested variations and
annotations; the rules-engine replacement experiment (ADR 0028) re-ran this pass
and again **rejected** raw `chess.js` as a replacement, because it is a main-line
loader that does not preserve variations or NAGs.

The FEN parser is stricter than the rules library beneath it: a castling right is
a claim about where two pieces stand, and the claim is checked. Shredder-FEN
castling fields (`HFhf`) are rejected rather than misread as `KQkq`.

Transposition identity is `positionKey()`, and it is what makes the explorer,
"have I been here before?", repertoire lookup and the transpositions panel agree.

---

## 6. Universal board

One rendering architecture, used by analysis, studies, openings, repertoire,
preparation, review, calculation, training, endgame, model games, opening files,
PV preview, position setup and play-from-here. The e2e suite asserts this per
route rather than trusting it — `e2e/phase10.spec.ts` walks each surface and
checks the canonical board is rendering the workspace position. Still one board.

---

## 7. Performance

**The headline finding of this pass is that the tail Phase 15 reported did not
exist.**

`scripts/bench-player-search.mjs` took twenty samples and reported
`samples[floor(20 * 0.95)]` — index 19, the **maximum** — as the p95. The
maximum was always the first sample: the first query after a build faults in the
index pages it touches, and nothing after it does. At 300,000 games the file is
still warm from the build and the spike does not appear at all, which is why the
effect looked like it scaled with row count.

Raw samples at 500,000 games, in the order taken:

```
392.2 29.8 20.7 22.7 20.8 19.9 19.8 19.7 21.1 19.8
 18.7 18.6 18.7 18.5 18.1 18.1 17.9 17.7 18.0 17.8
```

**Nothing was optimised, because there was nothing recurring to optimise.** The
benchmark now times the cold run separately and reports a median, a true
nearest-rank p95 over sixty warm samples, and the worst.

At **1,000,000 synthetic rows** (built in 45.1 s):

| Query                   |    cold |  median |     p95 |    worst |
| ----------------------- | ------: | ------: | ------: | -------: |
| player prefix           |  0.1 ms |  0.0 ms |  0.0 ms |   0.1 ms |
| player search (exact)   | 37.9 ms | 34.5 ms | 37.0 ms |  48.0 ms |
| text search (common)    | 62.6 ms | 62.6 ms | 66.0 ms |  67.5 ms |
| text search (two terms) | 57.5 ms | 55.9 ms | 57.5 ms |  58.5 ms |
| text search (rare)      | 63.4 ms | 64.3 ms | 94.3 ms | 149.0 ms |
| text search (no match)  |  1.5 ms |  0.1 ms |  0.1 ms |   0.2 ms |

Phase 15 reported 921 ms and 1,074 ms p95 for the first two. The true figures are
**37.0 ms and 66.0 ms** — off by roughly twenty-five times. The Phase 15
documents keep their original numbers with a correction beside each.

Two caveats that matter more than the numbers: this is **synthetic metadata, not
a real million-game database**, and the cold column depends on OS page-cache
state rather than being a cold-boot figure.

Route bundles: heaviest is `/review` at **364.2 kB gzipped** over 21 scripts;
3,283 kB of client JavaScript in total across 95 files including every lazy chunk.

---

## 8. Opening knowledge and variation explanations

|                   |                                                    |
| ----------------- | -------------------------------------------------- |
| Named positions   | **3,810**                                          |
| Deepest named ply | **36** (18 full moves)                             |
| Variation briefs  | **135**, across **49** families                    |
| Brief provenance  | authored at build time, source-tagged `kingfisher` |

Briefs are fixed constants a reviewer can check against a book. **Nothing asks a
language model for chess theory at runtime, and nothing interpolates prose from
statistics** — a brief is either in the file or the panel says there is not one.
Each states the defining move or structure and what each side plays for;
evaluations, novelties and "best move" claims are deliberately absent because
they date and are contested.

The defining move sequence is not authored at all: it comes from the CC0
dataset's own shortest line, replayed through Kingfisher's rules code — so the
one claim a reader is most likely to check is the one nobody typed.

A deep position inherits its nearest named ancestor's brief and the panel says
that it is inherited. No new subvariation names are invented past the dataset.

Example, at the quality bar asked for:

> **Najdorf Variation.** Defined by 5…a6, which takes b5 away from both the
> bishop and the knight. White chooses a setup first: 6.Be3, 6.Bg5, 6.Bc4 and
> 6.Be2 lead to quite different games. Black keeps the choice between …e5 and
> …e6 open and prepares …b5 with queenside expansion.

---

## 9. Opening Explorer depth

From `docs/performance/phase-16-explorer-depth.md`, corpus of 45 real
theoretical lines (median 32 plies), each replayed through the rules code:

| Pack               |   Games | Positions | 10 plies | 20 plies | 30 plies | 40 plies |
| ------------------ | ------: | --------: | -------: | -------: | -------: | -------: |
| Kingfisher Starter | 172,376 |   246,870 |   100.0% |    60.0% |    10.3% |     0.0% |
| Elite OTB          | 407,538 | 5,438,808 |   100.0% |    71.1% |    17.9% |    25.0% |
| Recent Theory      |  44,200 |   918,069 |    97.8% |    51.1% |     5.1% |     0.0% |

The important part is _why_ lines stop, which the benchmark now reads out of the
pack rather than guessing. On Elite OTB, **32 of 45 lines stop because the exact
continuation has never been played in 407,538 elite games**, and only 10 stop at
a position the pack chose not to keep. So "17.9% at thirty plies" is not "the
explorer runs out at move fifteen" — it is a fact about how many elite games
exist, fixed by more games rather than more indexing.

---

## 10. Engines

| Engine                | Licence          | Platforms                              | Transport          |
| --------------------- | ---------------- | -------------------------------------- | ------------------ |
| Stockfish 17.1        | GPL-3.0-or-later | all (WebAssembly)                      | in-browser Worker  |
| Stockfish 18 (native) | GPL-3.0-or-later | darwin arm64/x64, linux x64, win x64   | companion          |
| Lc0                   | GPL-3.0-or-later | darwin arm64/x64, linux x64, win x64   | companion (system) |
| Stormphrax 8          | GPL-3.0-or-later | darwin arm64, linux x64, win x64       | companion          |
| Viridithas 20         | AGPL-3.0-only    | darwin arm64, linux x64/arm64, win x64 | companion          |
| Halogen 16            | GPL-3.0-or-later | darwin arm64/x64, linux x64, win x64   | companion          |
| PlentyChess 8         | GPL-3.0          | darwin arm64, linux x64/arm64, win x64 | companion          |
| Berserk 14            | GPL-3.0          | win x64                                | companion          |
| Koivisto 9.0          | GPL-3.0          | linux x64, win x64                     | companion          |
| Obsidian 16.0         | GPL-3.0          | win x64                                | companion          |

Capability rows are **produced by interrogation, never inferred from a name**:
`npm run engines:verify` launches each engine and asks it. Managed native engines
are downloaded against a recorded digest, extracted as a single named member into
a fresh temporary directory with no shell, and **run with the user's own
operating-system permissions — they are not sandboxed**, which ADR 0041 says
plainly rather than implying otherwise.

### Lc0 — live verified

On this machine (Apple M3 Pro, darwin-arm64), both directly and through
Kingfisher's own `ManagedEngines.install('lc0')`:

```
binary       : /opt/homebrew/bin/lc0
reportedName : Lc0 v0.32.1+git.dirty
weights      : 42850.pb.gz (auto-discovered)
backend      : metal, on Apple M3 Pro
search       : bestmove e2e4 ponder c7c6  (depth 5, 452 nodes, cp 28)
checks       : handshake ✓ isready ✓ search ✓ stop ✓ multipv ✓
               searchmoves ✓ wdl ✓ syzygy ✓ malformed ✓
capabilities : multipv ✓ searchmoves ✓ wdl ✓ syzygy ✓ threads ✓
               hash ✗ (correct — Lc0 has no Hash option) chess960 ✓
```

**Ready on the definition that matters: binary + usable network + a completed
search.** This is one machine and one platform; it is not a claim about Windows
or Linux, which were not tested here.

---

## 11. Chess960

**Not supported, deliberately, and the refusal is enforced rather than
documented.** This is unambiguous by design.

`src/chess/variant-contract.test.ts` asserts the stronger claim: Kingfisher will
never offer a castling move it cannot legally make, and refuses a position
claiming one rather than guessing. It rejects a Chess960 starting array that
claims `KQkq`, rejects Shredder-FEN rights instead of misreading them, loads a
960 array with no rights claimed and offers no castling from it, and falls back
to the standard start when a PGN carries an impossible position — recording why.

Engine `UCI_Chess960` support is _recorded_ because it is a fact about the
engine. That is what would make adding the variant later a question about
Kingfisher rather than a survey of ten binaries.

---

## 12. Tests and gates

All run locally at `c6e0b4e`:

| Gate                   | Result                                           |
| ---------------------- | ------------------------------------------------ |
| `npm test`             | **128 files, 1,696 passed, 11 skipped**          |
| `npm run typecheck`    | clean                                            |
| `npm run lint`         | clean                                            |
| `npm run format:check` | clean                                            |
| `npm run build`        | exit 0                                           |
| `npm run test:e2e`     | **156 passed, 0 failed, 0 flaky**, retries **0** |
| `npm run benchmark`    | exit 0                                           |
| `git diff --check`     | clean                                            |

**Test quality (Part AM).** Every test added this session was mutation-tested —
the implementation was reverted and the test re-run to confirm it actually fails:

- `uci-adversarial.test.ts` — 9 of 11 fail without the fix
- `transport-liveness.test.ts` — 5 of 6 fail, **by hanging to the test timeout**,
  which is the stall itself
- `backup-completeness.test.ts` — fails without the fix
- the Lichess deadline test — fails without the fix

The liveness tests drive the **real** transport classes; only the browser globals
they sit on (`Worker`, `EventSource`) and the companion's HTTP client are stood
in for. Nothing asserts against a mock of the thing under test.

---

## 13. CI

Workflow audited (Part AO) and sound: fresh `npm ci`, no `node_modules` cache, npm
download cache only, Playwright browsers keyed by resolved version, Stockfish
deliberately **un**cached so a broken installer cannot pass unnoticed, per-job
timeouts, concurrency cancellation, read-only permissions, failure artefacts
uploaded, and **no credentials anywhere in ordinary CI**. Release Playwright runs
at `retries: 0`; a separate manually-triggered workflow runs with retries only to
tell "flaky" from "broken" without weakening the gate.

Final run result is recorded in §14.

---

## 14. Final CI run

Run **33966432623**, commit `735de11`. See the run for per-job status; the
preceding run at `3c9943f` had Quality, Visual gate and Production build green
before it was superseded by this push.

---

## 15. AGENTS.md / CLAUDE.md

`AGENTS.md` previously held nothing but the block `next dev` writes, so an agent
arriving learned the framework was unfamiliar and nothing about Kingfisher. The
generated block is preserved exactly; a project guide now follows it covering
dependency direction, the non-negotiable rules (the chess.js boundary, canonical
position identity, the immutable tree, one board, standard chess only),
persistence and backup rules, the engine trust model, reference-data provenance,
testing expectations including mutation-testing and zero-retry CI, the release
commands, and the two honesty rules — do not fake data, do not fake capabilities.

`CLAUDE.md` keeps `@AGENTS.md` and adds only what is specific to _working_ here:
find the real repository state before editing, continue an unfinished phase
rather than renumbering it, treat uncommitted work as the previous agent's
unfinished work rather than debris, and do not trust a final report claiming
completion — several have claimed suites that were never run.

---

## 16. Competitor gap analysis

| Area                                            | vs ChessBase                               | vs En Croissant                      | vs ChessMonitor     |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------ | ------------------- |
| Opening explorer depth and provenance           | equivalent                                 | **stronger**                         | stronger            |
| Variation explanations                          | **stronger** (sourced, concise, inherited) | stronger                             | different by design |
| Engine fleet breadth and honest capability rows | **stronger**                               | stronger                             | n/a                 |
| Neural engine (Lc0)                             | equivalent                                 | equivalent                           | n/a                 |
| Own-decision review / calculation training      | **stronger**                               | stronger                             | different by design |
| Repertoire by position identity                 | **stronger**                               | equivalent                           | n/a                 |
| Very large personal databases                   | **weaker** — untested at real scale        | weaker                               | n/a                 |
| Database interoperability (import from others)  | **weaker**                                 | **weaker** — no En Croissant adapter | n/a                 |
| Online account statistics                       | equivalent                                 | equivalent                           | **weaker**          |
| Cloud / remote analysis                         | weaker                                     | different by design                  | n/a                 |
| Gamified progress metrics                       | different by design — deliberately absent  |                                      |                     |

---

## 17. Known limitations

Genuine limitations, not unfinished Phase 16 work (that is §18):

1. **Chess960 is not supported.** Deliberate, enforced, documented.
2. **Managed native engines are not sandboxed.** They run with the user's own
   permissions. Stated rather than implied.
3. **Lc0 is verified on darwin-arm64 only.** Other platforms are untested here.
4. **No live Lichess or Chess.com round trip** was performed. Those paths are
   contract-tested against fixtures and a routed network, not the real services.
5. **Largest measured database is synthetic**, at 1,000,000 metadata rows. Query
   shapes and schema are exercised; real movetext and real name distributions are
   not.

---

## 18. What remains in Phase 16

The next agent should continue **this** phase.

| Part | Item                                                 | State                                                                                                                                                                       |
| ---- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O    | Real ≥1,000,000-game database import and measurement | **not started** — needs a real open dataset; synthetic metadata is not a substitute and must not be reported as one                                                         |
| S    | En Croissant read/import adapter                     | **not started** — requires a real En Croissant fixture; do not claim compatibility without one                                                                              |
| T    | High-rated online reference pack                     | **not started** — report as Delivered or Infrastructure-blocked, not quietly dropped                                                                                        |
| V    | Fresh React render-cost profile                      | not repeated this pass; Phase 14/15 figures stand unrefreshed                                                                                                               |
| AH   | Manual walk of every route for UX friction           | not done this pass                                                                                                                                                          |
| E    | Formal phase 1–15 verification matrix                | partially evidenced — 156 browser tests across 61 spec files, many named and grouped by the phase they cover, all passing; but the explicit matrix document was not written |

Everything else in Parts A–AU is done and evidenced, either this pass or in the
five Phase 16 commits that preceded it.

---

## 19. Recommended next steps

Three, in order.

1. **Close Part O with a real dataset.** It is the largest remaining unknown and
   the one gap a serious player would hit first. Everything else about the
   database layer is verified; only the scale claim is not.
2. **Decide Part T explicitly** — build the high-rated online pack, or declare it
   infrastructure-blocked with the resources it needs. It has now been deferred
   twice without a verdict.
3. **Then use it.** The correctness, persistence, engine and measurement work is
   done and the defects it found were real. What Kingfisher most needs next is a
   strong player putting real hours through it, not another audit phase.
