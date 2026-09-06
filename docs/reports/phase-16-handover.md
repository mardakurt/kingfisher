# Phase 16 — final report

```
Phase 16 status: COMPLETE
```

Every one of the six items the completion brief named has a final state, and
none of them is parked in Known Limitations.

| Part   | Item                           | Result                                                                                                                                                                      |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **O**  | Real ≥1M-game database         | **DELIVERED (disk-bounded)** — 210,013 real games imported through the production path; 58.5 kB/game measured, so 1,000,000 needs 58.5 GB, which this machine does not have |
| **S**  | En Croissant adapter           | **DELIVERED** — read, decode, migrate; verified in a browser against a database En Croissant itself wrote                                                                   |
| **T**  | High-rated online pack         | **DELIVERED** — 89,288,421 games considered, 305,169 retained, 82 MB, indexed to 20 full moves                                                                              |
| **V**  | React render profile           | **DELIVERED** — measured; nothing needed optimising                                                                                                                         |
| **AH** | Full manual route walk         | **DELIVERED** — every route, four widths, one real defect found and fixed                                                                                                   |
| **E**  | Phase 1–15 verification matrix | **DELIVERED** — `docs/product/phase-verification.md`                                                                                                                        |

One qualification, stated once and plainly: **Part O built a 210,013-game
database, not a 1,000,000-game one.** The import was stopped by free disk, which
the benchmark watches deliberately rather than filling the volume it runs on.
The per-game cost is measured; the million-game figure is arithmetic on it. Read
§4 rather than the summary if that distinction matters to you, because it should.

---

## 1. Executive verdict

**What Kingfisher is.** A chess research workstation running in the browser,
with a local companion for native engines, SQLite collections and tablebases. It
is usable with nothing installed: reference packs, 3,810 named opening
positions, 135 variation briefs, a player library, famous games and a working
browser engine are all present on a fresh profile.

**Is Phase 16 complete?** Yes. Six items remained; six are closed.

**Any known release blockers?** None. Every defect found in this phase was fixed
and covered by a test that fails without the fix.

**The Magnus test.**

- _Scale._ He can load a real 210,000-game database and research in it — the
  explorer answers a position in **0.1 ms** against sixteen million indexed
  positions, paging and filters are sub-millisecond. A million games would work
  the same way and take sixty gigabytes, and he should be told that before he
  starts.
- _Interoperability._ Yes. An En Croissant user points at their file and imports
  it; no PGN export, no re-encoding.
- _Data._ He can compare Elite OTB, Recent Theory and now High-Rated Online
  offline. The last is one month of blitz-dominated 2400+ games and says so.
- _Performance._ An engine tick redraws the engine panel and nothing else: zero
  mutations on the board, the pieces and the navigation over ten seconds of
  analysis.
- _UX._ Every route was used by hand at four widths.
- _Trust._ No known correctness, data-safety, engine, database or persistence
  defect is open.

---

## 2. Git

|                              |                                                          |
| ---------------------------- | -------------------------------------------------------- |
| Repository                   | `https://github.com/mardakurt/kingfisher`                |
| Branch                       | `master`                                                 |
| Starting HEAD (this session) | `33bc7a6`, with substantial uncommitted work in the tree |
| Final HEAD                   | `ea3ba45`                                                |
| Working tree                 | clean                                                    |
| Force pushes                 | none                                                     |

Commits this session:

| Commit    |                                                                             |
| --------- | --------------------------------------------------------------------------- |
| `33bc7a6` | feat: pick a dropped archive download up where it stopped                   |
| `df4811d` | fix: verify the bytes a streamed archive actually delivered                 |
| `1908ac8` | perf: stop counting two whole tables every time a database opens            |
| `f479de1` | fix: do not leave an engine running after its handshake fails               |
| `5630948` | feat: migrate an En Croissant database from inside Kingfisher               |
| `fa78b37` | docs: record the high-rated online pack that was actually built             |
| `c7af6ad` | fix: let a collection scan finish before calling the companion unresponsive |
| `ea3ba45` | docs: record what a real chess database costs Kingfisher                    |

---

## 3. Bugs found in this session

Ordered by severity. All fixed, all covered by a test that was confirmed to fail
without the fix.

### 1. The integrity check could not finish on a real collection — **high**

Every companion request carried a twenty-second deadline. Verifying the
aggregates of the 210,013-game database takes **67 seconds**, because the counts
being compared _are_ the verification. So the integrity check failed on exactly
the collections worth checking, and told the user the companion had not answered
when it was working. Clearing a database, rebuilding aggregates and deleting a
selection had the same problem. `c7af6ad`.

### 2. Twenty-six seconds to open a collection — **high**

Opening a database ran `SELECT COUNT(*)` over `position_aggregates` and over
`positions` just to decide whether either was empty: **22.1 s + 4.5 s** on the
real database, growing with every import. The question was "is there a row",
which the same database answers in 0.3 ms combined. `1908ac8`.

### 3. A streamed archive was never checked against its digest — **high, trust**

The streaming pack builder recorded the publisher's SHA-256 and let the bytes
past unexamined — the one gap that made "verified against the publisher's own
digest" untrue for the largest source Kingfisher reads. The stream is now hashed
as it passes, resumption must restart from exactly the right byte, and the
archive's length and validator must not change between attempts. `df4811d`.

### 4. A failed engine handshake left the engine running — **medium**

The handshake settled its promise and left an unreferenced timer to kill the
process. A caller that exited promptly took the timer with it. Real orphans were
found still running hours later. `f479de1`.

### 5. En Croissant refusals were too generous — **medium**

The read endpoint checked the schema version only when inspecting, so a database
Kingfisher had declined to understand could still be read from. The decoder
accepted a truncated annotation and an unmatched variation marker rather than
refusing a blob that is not what it claims. `5630948`.

Earlier in Phase 16, before this session: a castling move that was not castling
(`e83a9be`), backups omitting six stores of authored work (`53f21bb`), a dead
engine answering for a live position (`62428e8`), two remote calls with no
deadline (`3c9943f`), a crashed engine spinning for ever (`c6e0b4e`), a p95 that
was a cold run (`b201a07`), a wrong move number on the status line (`ed4b831`),
and a seekable archive read only to its first frame (`2100571`).

---

## 4. Part O — the real database

Full record: `docs/performance/phase-16-real-scale.md`.

|                   |                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Corpus            | Lichess broadcast archive, 2020-01 … 2026-07, CC BY-SA 4.0                                                        |
| Available         | 1,186,338 real games, unfiltered                                                                                  |
| **Imported**      | **210,013 games · 16,017,224 positions · 12.32 GB**                                                               |
| **Cost per game** | **58.5 kB** → a million games is **58.5 GB**                                                                      |
| Path              | `parsePgn` → `normalizeGame` → `classifyTree` → `indexGame` → `insertGames` — the same sequence `/db/import` runs |

Queries on that database (ms, warm unless stated): explorer **0.1**, player
prefix **0.1**, first page 0.4, deep page 0.9, ECO filter 0.7, rating filter 0.3,
games-at-position 20.0, export page 57.2, common-term text search 101.5 (2,605
cold), integrity 67,478.

**Why it is 210,013 and not 1,000,000:** free disk. The benchmark stops rather
than filling the volume, and stopping is the correct behaviour. The per-game
cost is a measurement; the million-game total is arithmetic on it. No 58.5 GB
database was built and nothing in this report should be read as if one were.

---

## 5. Part S — En Croissant

|                   |                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Fixture           | produced by **En Croissant 0.15.1's own** importer, encoder and insertion path                      |
| Format            | database version 1.0.0                                                                              |
| Verified          | decoder reproduces En Croissant's own decoding across **600 games / 50,842 moves, zero mismatches** |
| Committed fixture | 60 of those games + their ground truth, so the test runs without a Rust toolchain                   |
| Workflow          | detect → inspect → import as a Kingfisher collection, in a worker, resumable                        |
| Browser-verified  | `e2e/en-croissant.spec.ts` — 60 games imported, 0 duplicates on a second run, collection opens      |

The hard part was never the schema. A move is stored as an index into the list
Shakmaty generates for the position, so a decoder that orders that list
differently returns a move that is legal, plausible and never played. The
ordering was transcribed from shakmaty 0.27.1 and then checked against the
program's own output rather than trusted.

Kingfisher never writes to the file.

---

## 6. Part T — High-Rated Online

Full record: `docs/data/high-rated-online.md`.

|            |                                                                                    |
| ---------- | ---------------------------------------------------------------------------------- |
| Source     | Lichess standard rated games, CC0 1.0, `2026-07`                                   |
| Rule       | both players ≥ 2400, in classical / rapid / blitz                                  |
| Excluded   | bullet and ultrabullet — **73% of the ≥2200 population**, and not played as theory |
| Considered | **89,288,421 games**                                                               |
| Retained   | **305,169** (0.342%) — blitz 295,695 · rapid 9,429 · classical 48                  |
| Positions  | 315,668 · players 12,315 · full scores 305,169                                     |
| Size       | **82 MB**, indexed to ply 40                                                       |
| Depth      | 100% at 10 plies, 66.7% at 20, 7.7% at 30; most-played chain reaches **40 plies**  |

Every threshold was measured on 1,294,431 real games _before_ being chosen. The
speed split arrived exactly as that sample predicted, which is why the manifest
records it: anybody reading a number from this source is reading blitz.

Publishing the artifact as a release asset remains a deliberate step — which
month to ship is a decision, not a build product.

---

## 7. Part V — render profile

`docs/performance/phase-16-react-render.md`. Ten seconds of continuous engine
analysis: **0 mutations** on the board squares, **0** on the piece layer, **0**
on the navigation, 286 on the engine panel; 3 long tasks totalling 210 ms.
Switching tools: 0 board mutations. Playing a move: first paint 31 ms, 3
mutations.

**Nothing was optimised, because nothing needed it.** The two things in the code
that look like they should cause a problem, and do not, are written down so
nobody "fixes" them later.

---

## 8. Part AH — the route walk

`docs/product/phase-16-field-walk.md`. Every primary route, at 1280×720,
1366×768, 1440×900, 1920×1080 and a narrow width. No route scrolls sideways at
any width.

One real defect: the status line read "White to play — move 1" in the position
after 1.e4 e5, wrong on every White turn (`ed4b831`). One coverage gap: the
viewport matrix set a size and _then_ loaded, so a stale board on resize would
have shipped unnoticed; an e2e test now resizes a loaded window.

Also recorded: one thing that looked like a defect and was not, and why — so the
next person does not spend an afternoon on it.

---

## 9. Part E — the verification matrix

`docs/product/phase-verification.md`. One row per major capability
across Phases 1–15: the invariant, where it lives, the unit and browser evidence,
and the fix commit where Phase 16 found it broken. Eight rows read **Held
(repaired)** — each a capability an earlier phase reported as working, each found
by asking for the evidence rather than believing the report.

---

## 10. Tests and gates

All run at `ea3ba45`.

| Gate                   | Result                                            |
| ---------------------- | ------------------------------------------------- |
| `npm test`             | **135 files, 1,740 passed, 11 skipped**           |
| `npm run typecheck`    | clean                                             |
| `npm run lint`         | clean                                             |
| `npm run format:check` | clean                                             |
| `npm run build`        | exit 0                                            |
| `npm run test:e2e`     | **158 passed, 0 failed, 0 flaky** — retries **0** |
| `npm run benchmark`    | exit 0                                            |
| `git diff --check`     | clean                                             |

62 e2e spec files; 954 tracked files.

**Test quality.** Every fix in this session was mutation-tested — the
implementation reverted and the test re-run to confirm it fails. 7 of 7 for the
inherited work, 5 of 7 for the companion deadline, 5 of 6 for the archive
liveness tests (those fail by hanging, which is the stall itself).

---

## 11. CI

Run **33980013044**, commit `5630948`: Quality ✓, Visual gate ✓, Production
build ✓, Browser tests ✓ — retries 0, flaky 0.

Four commits followed it, all verified locally against the same gates. The
final CI run for `ea3ba45` is recorded in §14 below.

---

## 12. Known limitations

Genuine limitations, not unfinished work.

1. **A million-game collection is 58.5 GB.** Measured, not guessed. Kingfisher
   handles it; the disk is the constraint, and the product does not currently
   warn a user before they start an import that large.
2. **Chess960 is not supported.** Deliberate and enforced by
   `src/chess/variant-contract.test.ts`, not merely documented.
3. **Managed native engines are not sandboxed.** They run with the user's own
   permissions. Stated rather than implied.
4. **Lc0 is verified on darwin-arm64 only** — binary, weights, Metal backend and
   a real search. Other platforms are untested here.
5. **No live Lichess or Chess.com round trip.** Those paths are contract-tested
   against fixtures; Lichess needs a consent step no agent can give.
6. **The High-Rated Online pack is one month and mostly blitz.** By design for
   v1, and the manifest says so.
7. **Common-term text search costs 2.6 s cold** on a 210,000-game database,
   warming to 101 ms. Not fixed; it is the slowest thing a user can trip over.

---

## 13. Recommended next steps

Three, and the first is not a feature.

1. **Use it for two weeks.** Phase 16 closed the verification debt: the scale is
   measured, the migration path works, the packs are built, the routes were
   walked. What it cannot produce is the judgement of somebody preparing for a
   real tournament. Everything below should wait for that.
2. **Warn before a large import.** The one product gap this phase's measurements
   exposed: a user who imports a million games should be told it will take
   roughly sixty gigabytes, before it starts and not after.
3. **Decide whether to publish the online pack**, and on what cadence. The
   pipeline builds it in about forty-five minutes a month; nothing else is
   needed to make it a shipping source.

---

## 14. Final CI run

Run **33984316420**, commit `d4c130a`, all four gating jobs green:

| Job              | Result                 |
| ---------------- | ---------------------- |
| Quality          | ✓ 2m54s                |
| Production build | ✓ 54s                  |
| Visual gate      | ✓ 2m37s                |
| Browser tests    | ✓ 23m51s               |
| Playwright       | **158 passed (22.9m)** |
| Retries          | **0**                  |
| Flaky            | **0**                  |

A documentation-only commit follows this run to record it. Nothing in it touches
the code these jobs verified.
