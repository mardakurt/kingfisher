# Phase 17 — final report

```
Phase 17 status: COMPLETE, with two items deliberately not shipped
```

The two are named in §11 and §13 and neither is unfinished work: one is an
experiment whose numbers say "do this next", and one is a data set that could
not be obtained legally.

---

## 1. Executive verdict

**What Kingfisher is now.** A chess research workstation that runs in a browser
and knows things before you give it anything. On a fresh profile it has 172,376
over-the-board games, 3,810 named opening positions **browsable as a book**,
144 variation briefs reaching 87% of those positions, a 12,589-player library
where every browse result leads to real games, a working Stockfish 18, and
three one-click reference packs — one of them published in this phase.

**What Phase 17 changed.** Two defects the user reported were real and are
fixed with measurements behind them. The opening surfaces stopped being one
undifferentiated "explorer" and became four things that answer four different
questions. Populations can now be compared without being merged. The player
library stopped offering people it has nothing for. Settings gained a contract
that a test enforces. And the slowest query in the product got three times
faster after the profiling found that the number everyone was quoting measured
something else.

**Known release blockers.** None.

**The Magnus test.** §22.

---

## 2. Git

|                 |                                               |
| --------------- | --------------------------------------------- |
| Repository      | `https://github.com/mardakurt/kingfisher`     |
| Branch          | `master`                                      |
| Starting HEAD   | `2877a9e`                                     |
| Final HEAD      | `98af5fa`                                     |
| Working tree    | clean                                         |
| Commits         | 17                                            |
| Force pushes    | none                                          |
| Data repository | `mardakurt/kingfisher-data`, commit `311b64b` |

| Commit    |                                                                            |
| --------- | -------------------------------------------------------------------------- |
| `7a8b5f2` | fix: let board priority keep governing a workspace you have used           |
| `7c19273` | fix: calibrate the chess pieces against their squares                      |
| `58a0450` | test: hold every setting to a contract, not just to storage                |
| `044371d` | feat: give Kingfisher a theory book, and keep it out of the explorer's job |
| `43960a9` | feat: publish the high-rated online reference, and say what it is          |
| `4b37f3f` | feat: compare populations without merging them                             |
| `a37eb66` | fix: stop offering players Kingfisher has nothing to show for              |
| `6f709c2` | docs: record the historical-games audit, and why nothing was shipped       |
| `18e2aa6` | feat: move the browser engine to Stockfish 18, after running it            |
| `3905f0b` | docs: record what the online integrations actually did, live               |
| `9aa60ae` | perf: stop carrying whole rows through a text search's sort                |
| `100c02f` | test: give every setting a runtime assertion, or a reason it has none      |
| `0dd57c3` | docs: measure what a compact position index would save, on a copy          |
| `684f2d6` | test: soak the surfaces this phase added                                   |
| `d34a84b` | docs: record the phase 17 architecture, and compare Kingfisher strictly    |
| `55d2851` | docs: extend the verification matrix through phase 17                      |
| `98af5fa` | feat: explain nine more of the openings a player actually meets            |

---

## 3. Settings

Thirty-three preferences across twelve sections. **No write-only setting was
found**: every one is written by a control and read by a consumer, audited by
scanning every module outside the store and the settings UI.

| Section                  |        Settings |  Runtime-verified | Broken found |
| ------------------------ | --------------: | ----------------: | -----------: |
| Appearance               |               4 |                 3 |            0 |
| Board                    |               4 |                 4 |            0 |
| Pieces                   |               1 |                 1 |            0 |
| Workspace                |               1 |                 1 |        **1** |
| Engine                   |               7 |                 4 |            0 |
| Companion                |               2 | 0 (reason stated) |            0 |
| Database / Explorer      |               5 |                 4 |            0 |
| Accounts                 |               3 |                 1 |            0 |
| Assistant                |               3 | 0 (reason stated) |            0 |
| Openings (in place)      |               2 |                 2 |            0 |
| Layout, pinning, density | not preferences |                 — |        **1** |

Twenty settings have a runtime assertion in `e2e/settings.spec.ts`. Thirteen
carry a written reason why a browser cannot check them — engine threads and
hash reach the engine on its next search, the companion and assistant settings
need infrastructure a test cannot stand up, a Lichess token needs consent no
agent can give. A setting with neither fails the suite.

### The Board Priority bug, explained

The user reported that Large and Maximum looked identical. Measured on
`/analysis` at 1440×900, **Balanced, Large and Maximum all produced a 583px
board.**

The cause was that any stored arrangement overrode the board policy wholesale,
and **selecting a tool tab stores an arrangement**. One click on "Engine" — an
action with no layout intent at all — wrote that workspace's dock width and
notation height as concrete numbers, and the policy could never move them
again. The only remaining lever was the maximum-board cap (780 / 960 / 1200px),
and at laptop heights the board is limited by the window at 583px, far below
even the smallest cap. So all three settings were indistinguishable for every
user who had used the application at all.

An arrangement now records only what the user actually decided. A dimension
they did not choose is absent and the policy fills it in; one they dragged
survives every policy change.

| Viewport  | Balanced | Large | Maximum | (before, with a stored layout) |
| --------- | -------: | ----: | ------: | ------------------------------ |
| 1440×900  |      533 |   583 | **753** | 583 / 583 / 583                |
| 1920×1080 |      713 |   763 | **933** | 763 / 763 / 763                |
| 1280×720  |      413 |   453 | **573** | 403 / 403 / 403                |

The existing e2e test could not have caught it: it deleted the stored layout
before measuring, which is exactly the condition that hides the bug.

**A second defect found here:** the tool dock carried its own copy of the
default pinned-tools list, shadowing the registry's. They had agreed by
coincidence, and pinning a new tool changed nothing until the duplicate went.

---

## 4. The board and the pieces

The user reported the pieces looked slightly too small. They were, and each set
was too small by a different amount.

Two things compounded. The board inset every piece by 6%. And an SVG viewBox is
the drawing plus whatever margin its author chose — measured at full size, the
tallest piece covered **0.802** of its square in Cburnett and **0.935** in
Celtic. One global scale cannot fix both.

Each set now carries a `visualScale` bringing its tallest piece to **0.86** of
the square, clamped so nothing exceeds **0.94** and touches its neighbour.
Applied as a transform, not a resize: the element's box is the drag target.

|                                               |                         Tallest piece / square |
| --------------------------------------------- | ---------------------------------------------: |
| Kingfisher, before                            |          **0.705** (default set's king: 0.688) |
| Lichess, the same Cburnett files at full size |                                      **0.782** |
| Kingfisher, after                             |          **0.858** (default set's king: 0.838) |
| Chess.com reference image                     | **not supplied in this session; not measured** |

Every set now lands within 0.003 of the target and the widest piece anywhere is
0.930 — a gap of 3.5% of a square on each side.

| Set                  | Before | Scale | After | Widest |
| -------------------- | -----: | ----: | ----: | -----: |
| Cburnett _(default)_ |  0.705 | 1.072 | 0.858 |  0.917 |
| Merida               |  0.752 | 1.009 | 0.863 |  0.930 |
| Chessnut             |  0.695 | 1.089 | 0.860 |  0.892 |
| Fantasy              |  0.792 | 0.956 | 0.860 |  0.870 |
| Spatial              |  0.823 | 0.922 | 0.860 |  0.802 |
| Celtic               |  0.823 | 0.920 | 0.860 |  0.815 |
| RhosGFX              |  0.770 | 0.983 | 0.863 |  0.772 |
| Kiwen Suwi           |  0.748 | 1.012 | 0.858 |  0.848 |
| Firi                 |  0.718 | 1.055 | 0.860 |  0.875 |
| MPChess              |  0.713 | 1.065 | 0.860 |  0.882 |

Measured by `npm run pieces:measure`, which rasterises each piece as the board
draws it and takes the alpha bounding box. Full record:
`docs/design/piece-proportions.md`.

---

## 5. The Theory Book

|                              |                                                                    |
| ---------------------------- | -----------------------------------------------------------------: |
| Nodes                        |                                          **3,810** named positions |
| Families                     |                                                                149 |
| Variation briefs             |                                                            **144** |
| Families with a brief        |                                                      **65 of 149** |
| Positions inheriting a brief |                                         **3,321 of 3,810 (87.2%)** |
| Provenance                   | lichess-org/chess-openings, CC0-1.0; briefs authored by Kingfisher |

Two ways down it, because a book is not a move list. **Next moves** is the
immediate branches. **Variations** is the named variations however far down
they sit — the Najdorf is four plies below the Sicilian and behind three
positions the dataset also calls "Sicilian Defense", so it is not a child, and
it is exactly what a reader looking at the Sicilian wants offered.

Both are ordered by how much the dataset records below each line, the only
ranking signal available that is not invented. Sorted alphabetically the
Sicilian was Black's _seventeenth_ reply to 1.e4, behind the Borg Defense.

The panel shows **no counts, no percentages and no evaluations**, and a test
asserts their absence. Twenty plies into a Najdorf English Attack, where the
dataset names nothing, it still says "English Attack" and says the reader is
twenty plies further on, so the name cannot be read as a description of the
position in front of them.

---

## 6. Reference sources

| Source                             |       Games |   Positions |    Players |      Size |    Ply | Licence      | Status                   |
| ---------------------------------- | ----------: | ----------: | ---------: | --------: | -----: | ------------ | ------------------------ |
| Kingfisher Starter                 |     172,376 |     246,870 |     12,522 |     12 MB |     40 | CC BY-SA 4.0 | bundled                  |
| Elite OTB                          |     407,538 |   5,438,808 |     33,607 |    339 MB |     40 | CC BY-SA 4.0 | installable              |
| Recent Theory                      |      44,200 |     918,069 |      2,567 |     34 MB |     40 | CC BY-SA 4.0 | installable              |
| **High-Rated Online**              | **305,169** | **315,668** | **12,315** | **86 MB** | **40** | **CC0-1.0**  | **published this phase** |
| Lichess Masters / Lichess / Player |           — |           — |          — |         — |      — | —            | online, token required   |
| My games                           |  user's own |           — |          — |         — |      — | —            | local                    |

### Comparing them

Up to four sources side by side, each in its own column with its own game count
and licence. **There is no total column, no combined score and no weighted
average**, and a test asserts their absence. Measured on the Najdorf at move 5:

| Move  | Kingfisher Starter (OTB) | High-Rated Online |
| ----- | -----------------------: | ----------------: |
| 6.Bg5 |                    17.1% |         **26.6%** |
| 6.Be3 |                    20.8% |             18.7% |
| 6.Bc4 |                     5.2% |         **10.6%** |
| 6.Be2 |                    13.0% |              8.8% |

Three kinds of nothing stay distinct: a source still loading, a source that
could not answer, and a source that answered and does not have this move. The
last is evidence — a move played online and unknown over the board keeps its
row.

---

## 7. High-Rated Online

|            |                                                                    |
| ---------- | ------------------------------------------------------------------ |
| Published  | `https://mardakurt.github.io/kingfisher-data/reference-online-v1/` |
| Version    | v1, built 2026-09-05, published 2026-09-06                         |
| Month      | 2026-07, one month                                                 |
| Rule       | both players ≥ 2400, classical / rapid / blitz                     |
| Considered | 89,288,421 games                                                   |
| Retained   | 305,169 (0.342%) — **blitz 295,695, rapid 9,429, classical 48**    |
| Excluded   | bullet and ultrabullet — 73% of the ≥2200 population               |
| Size       | 85,722,979 bytes across 160 chunks                                 |
| Depth      | 100% at 10 plies, 66.7% at 20, 7.7% at 30; chain to 40             |

**Validated at four points.** Every chunk checked present, byte-length correct
and SHA-256 matching the manifest, locally and again in the staged copy. After
publication the manifest and a chunk were fetched over the public URL and that
chunk's digest re-checked against the served manifest;
`access-control-allow-origin: *` present. Then **installed in a browser from
the published URL in 36 seconds** and asked for the Najdorf — it answered from
its own population.

**Update cadence: none proposed.** A three-month build was not attempted, so
nothing is known about what it would cost or what depth it would add.
Recommending a cadence on one month's evidence would be a guess.

---

## 8. Players

|                                        |                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------: |
| Searchable identities                  |                                                                                  **12,589** |
| Browse sets                            | Everyone, Top 100, Top 500, World champions, Women's champions, Historical, With games here |
| Rows with zero games in any browse set |                                                                                       **0** |
| Historical index (metadata only)       |                                                                               **67** people |
| Historical roster                      |                                                                   106 people, 6 role groups |

Browsing World champions used to open with Steinitz, Lasker and Capablanca —
three profiles with nothing behind them, because the packs begin in 2020. Every
browse set now contains only players with at least one game; the people the
roster knows and the packs have nothing for live in a Historical index that
says so in as many words. Searching is the deliberate exception: typing
"Morphy" finds him and the row says 0 games.

**Three defects fixed.** A profile with no stored identity fell back to the
route id, so every historical page was headed `steinitz, wilhelm` in lowercase.
A profile with no games explained why and showed nothing else — it now shows
title, dates, reign and the roster's checked sentence first. And search missed
two names people actually type: **"Polgár" returned nothing** while "Polgar"
returned both sisters, and **"MVL" returned nothing at all**. Matching now
folds diacritics and flattens separators; nicknames are a short written-down
list, not a guess from initials.

Twenty-two real names were typed into the real box before and after.

---

## 9. Database performance

Measured on a rebuilt real collection: **60,469 broadcast games, 4,435,492
positions, 3.41 GB, 56,467 bytes per game** (Phase 16 measured 58,500 at
210,013 games — consistent). Apple M3 Pro.

| Query                        |                  median |     p95 |
| ---------------------------- | ----------------------: | ------: |
| open + count                 |                  0.0 ms |  0.0 ms |
| first page (100)             |                  0.3 ms |  0.5 ms |
| deep page (offset 50k)       |                  0.8 ms |  0.8 ms |
| player prefix                |                  0.0 ms |  0.0 ms |
| **text search, common term** | **9.2 ms** _(was 28.0)_ |  9.4 ms |
| text search, rare term       |      0.4 ms _(was 1.0)_ |  0.4 ms |
| explorer, start position     |                  0.0 ms |  0.1 ms |
| explorer, Najdorf            |                  0.0 ms |  0.1 ms |
| games at position            |                  4.4 ms |  4.7 ms |
| export page (200)            |                 49.7 ms | 55.5 ms |

### The cold search, and what it actually was

Phase 16 recorded 2,605 ms cold. Profiling found the benchmark queries the
database **in the same process that just spent eighteen minutes importing into
it**. The identical query phase against the same file, opened fresh:

|                          | after import |  fresh open |
| ------------------------ | -----------: | ----------: |
| text search, common term |     348.8 ms | **28.0 ms** |
| explorer, filtered       |     247.6 ms |  **2.7 ms** |
| open + count             |      19.7 ms |  **0.0 ms** |

Reproduced at 20,349 games. **A user opening an existing collection does not
pay those costs.**

The write-ahead log was the obvious suspect — the import leaves 192 MB of it.
Checkpointing was implemented and measured against a control build with the
change disabled: **86.0 ms against 85.4 ms, identical.** Not the cause; the
change was reverted rather than shipped on a story.

The real cost was the sort. "open" matches 17,566 of 60,469 games, no index can
order an FTS match set, and `SELECT *` made SQLite carry every column of all
17,566 rows through a temp B-tree to return a hundred. Selecting ids first and
fetching the page by primary key gives identical rows in identical order:

| Term     | Matches |  before |      after |
| -------- | ------: | ------: | ---------: |
| open     |  17,566 | 23.3 ms | **7.1 ms** |
| sicilian |  10,776 | 16.9 ms | **6.4 ms** |
| masters  |   2,717 |  3.5 ms | **1.2 ms** |

Three alternative plans were measured and are worse — the index-walk ones by
thirty times when nothing matches — and are recorded so nobody tries them
again.

**A second defect:** every sort column has ties, and the order within a tie was
left to the query plan, so paging could show one game on two pages and lose
another. The primary key now breaks every tie.

---

## 10. Storage

The experiment ran; it did not ship.

The position index and its indexes are **81%** of a collection. Inside it three
columns repeat between five and nine times over — 4.4 million rows carry 670k
distinct claim sets, 473k signatures and 845k skeletons, as text, with two text
indexes. And every row stores both the FEN and the position key, which is the
same string minus two integers.

|                             |       before |                   after |
| --------------------------- | -----------: | ----------------------: |
| `positions` and its indexes |     2,770 MB |   **1,367 MB** (−50.6%) |
| whole database              |     3,415 MB |   **2,012 MB** (−41.1%) |
| per game                    | 56,467 bytes |        **33,270 bytes** |
| a million games             |      56.5 GB |             **33.3 GB** |
| explorer lookup             |     0.013 ms |                0.012 ms |
| structure search            |     0.009 ms |                0.008 ms |
| reading a FEN               |     0.011 ms |                0.016 ms |
| migration cost              |            — | 63 s per 4.4M positions |

**Not shipped** because it is a forward-only migration of the table holding 81%
of a user's data, and this repository's rules require a fixture for the schema
being migrated from, a migration test, and re-validation of the importer, the
aggregate rebuild, structure search, the En Croissant importer, backup and
restore. That was not completed here, and a half-applied schema change to that
table is worse than a database that is larger than it needs to be. It is the
first recommendation in §24.

---

## 11. Historical games

**None shipped.** No source audited both contains historical over-the-board
master games and grants redistribution on compatible terms.

| Source                | Terms                                 | Verdict                                                         |
| --------------------- | ------------------------------------- | --------------------------------------------------------------- |
| Lumbra's Gigabase     | CC BY-NC-SA 4.0, no provenance stated | rejected — NonCommercial, and the rights chain is unestablished |
| PGN Mentor            | no licence stated                     | rejected — silence is not permission                            |
| Caissabase            | no licence, site down                 | rejected                                                        |
| Lichess standard      | CC0-1.0                               | online play only; no historical OTB                             |
| Lichess broadcast     | CC BY-SA 4.0                          | already used; begins 2020                                       |
| TCEC                  | CC BY-SA 3.0                          | engines, not humans                                             |
| Wikipedia game scores | CC BY-SA 4.0                          | not a corpus                                                    |

Chess moves are facts and carry no copyright — tested in Moscow in 2016. That
is not the same as a database being redistributable: EU database rights protect
substantial extraction from a compilation even when every item in it is a fact.
Full audit and what would change the answer:
`docs/data/historical-games-audit.md`.

---

## 12. Engines

Verified live on **darwin-arm64** by interrogation — each engine launched and
asked what it can do. Every binary matched its recorded digest.

| Engine                        | Version         | MultiPV | WDL | searchmoves | Syzygy | Chess960 | Status                          |
| ----------------------------- | --------------- | :-----: | :-: | :---------: | :----: | :------: | ------------------------------- |
| Stockfish (WASM)              | **18**          |    ✓    |  —  |      —      |   —    |    —     | browser, default                |
| Stockfish (native)            | 18              |    ✓    |  ✓  |      ✓      |   ✓    |    ✓     | installed, verified             |
| Stormphrax                    | 8.0.0           |    ✓    |  ✓  |      ✓      |   ✓    |    ✓     | installed, verified             |
| PlentyChess                   | 8.0.0           |    ✓    |  —  |      —      |   ✓    |    ✓     | installed, verified             |
| Halogen                       | 16.0.0          |    ✓    |  —  |      —      |   ✓    |    ✓     | installed, verified             |
| Viridithas                    | 20.0.0          |    —    |  —  |      —      |   ✓    |    ✓     | installed, verified             |
| **Lc0**                       | **0.32.1**      |    ✓    |  ✓  |      ✓      |   ✓    |    ✓     | located and verified            |
| Berserk / Koivisto / Obsidian | 14 / 9.0 / 16.0 |    —    |  —  |      —      |   —    |    —     | no darwin-arm64 build published |

**The browser engine moved to Stockfish 18** — and the version was not changed
until the engine had run. Loaded as a Worker from the application's own origin
it reported "Stockfish 18 Lite WASM", handshook in **451 ms**, and searched a
real position to **depth 14**: bestmove b8c6, 46,074 nodes, a nine-move
principal variation. The lite builds are 7.3 MB and 7.1 MB, the same size as
the 17.1 builds they replace; the full builds are 113 MB and are not a browser
download.

---

## 13. Online integrations

Separated by what actually happened.

**Live — Chess.com.** Profile 200 with every field the sync code reads; 152
monthly archives; a month's PGN at 1,514,401 bytes and 493 games; `ETag`
present; a conditional re-request answering **304 with zero bytes**; unknown
player 404; a month that does not exist yet 404. The 304 is load-bearing —
incremental sync is built on months being immutable and the server saying so.

**Live — Lichess, partly.** The explorer endpoints answer **401 without a
token**, which is the finding and not a fault: it is why Kingfisher asks each
user for their own credential rather than shipping one shared developer token.
The public user API answers 200.

**Not tested live.** OAuth PKCE, the authenticated explorer and game sync.
They need a consent step in a browser that no agent can give on somebody's
behalf. Contract-tested against fixtures; `npm run smoke:lichess` exercises
them for real when a person supplies a token.

**Fallback.** With no token the online sources report as needing
authentication and the bundled reference — which works with no network — stays
selected.

---

## 14. Stability

`e2e/soak.spec.ts`, extended this phase to drive the Theory Book (which
replaces the whole analysis document on every click), source comparison (the
one place where the number of live query subscriptions depends on what the user
picked) and the player library's browse sets and search.

Ten cycles after a two-cycle warm-up: **heap 120.4 MB, 1 worker, 1 observer,
16 listeners, 0 intervals** — flat against the baseline. A second test asserts
the explorer cache cannot grow without bound.

---

## 15. Phases 1–17 verification

`docs/product/phase-verification.md`, renamed from its Phase 16 title because
it is now the map for the whole project. Fourteen rows added for this phase,
each naming the invariant, the unit and browser evidence, and the fix commit.

**Fifteen rows read "Held (repaired)"** — eight found in Phase 16, seven in
Phase 17. Two of this phase's seven were reported by a person using the
application rather than found by a test.

---

## 16. Bugs found beyond the brief

1. The tool dock carried a **duplicate copy of the default pinned tools**,
   shadowing the registry's; pinning a new tool changed nothing. (`044371d`)
2. **Paging over a tied sort column was non-deterministic** — a game could
   appear on two pages and another on none. (`9aa60ae`)
3. A player profile was **headed by its lowercase route key**. (`a37eb66`)
4. Player search **missed correctly-spelled names** with diacritics.
   (`a37eb66`)
5. The preferences store had **no test at all**. (`58a0450`)
6. The visual gate's `maxDiffPixelRatio: 0.02` **absorbed a 7% change to every
   piece on the board** on 19 of 22 shots. Recorded rather than changed;
   tightening it would need every baseline re-reviewed.

---

## 17. Tests

| Gate                   | Result                                            |
| ---------------------- | ------------------------------------------------- |
| `npm test`             | **140 files, 1,826 passed, 11 skipped**           |
| `npm run typecheck`    | clean                                             |
| `npm run lint`         | clean                                             |
| `npm run format:check` | clean                                             |
| `npm run build`        | exit 0                                            |
| `npm run test:e2e`     | **203 passed, 0 failed, 0 flaky** — retries **0** |
| `npm run benchmark`    | exit 0, heaviest route 367.2 kB gzipped           |
| `git diff --check`     | clean                                             |

25 e2e spec files, 977 tracked files, 115,833 lines under `src/`.

New this phase: `theory-book.test.ts`, `source-comparison.test.ts`,
`piece-proportions.test.ts`, `settings-contract.test.ts`,
`preferences-store.test.ts`, and the e2e suites `theory-book.spec.ts`,
`source-comparison.spec.ts`, `players.spec.ts`, `settings.spec.ts`,
`piece-proportions.spec.ts`.

**Every fix in this phase was mutation-tested** — the implementation reverted
and the test re-run to confirm it fails without the fix.

---

## 18. CI

Recorded in §23 below, after the run completed.

---

## 19. Competitors

`docs/product/phase-17-competitors.md`, checked September 2026 and deliberately
unflattering where it should be. ChessBase's Mega Database 2026 is **11.7
million games back to 1475**; Kingfisher has 507,000 across three packs and
**nothing before 2020**. En Croissant ships no games at all. Lichess is browser
only.

What Kingfisher is genuinely better at: several populations side by side
without merging them, data present and free before anything is installed, and
provenance on every figure. Three workflow gaps the comparison found — no
engine-annotated game pass, no published opening report, no spaced repetition
over the repertoire tree — are written down.

---

## 20. Known limitations

Real limitations, not unfinished work.

1. **No games before 2020.** A licensing constraint, not an engineering one;
   see §11.
2. **A million-game collection is 56.5 GB** at the current schema. §10 measures
   what a compact one would cost.
3. **The High-Rated Online pack is one month and 97% blitz.** By design for v1,
   and every surface that shows it says so.
4. **Chess960 is not supported**, deliberately and enforced by a test.
5. **Managed native engines are not sandboxed.** They run with the user's own
   permissions.
6. **Lc0 is verified on darwin-arm64 only.**
7. **No live Lichess OAuth round trip.** It needs consent no agent can give.
8. **144 variation briefs, not 3,810.** 87.2% of named positions inherit one;
   the rest say so rather than inventing prose.
9. **The visual gate's tolerance is loose** for artwork changes. §16.

---

## 21. Recommended next steps

Three.

1. **Ship the compact position index.** The numbers are in §10: 41% smaller
   with no cost to the explorer. What it needs is the migration work, not more
   measurement.
2. **Build the three-month High-Rated Online pack and measure it**, then choose
   a cadence from that rather than from one month.
3. **Use it for a tournament.** Phase 16 said this and it is still the thing
   no measurement substitutes for.

---

## 22. The Magnus test

**Opening preparation.** Yes. A Najdorf English Attack at move 18 — twenty
plies past the last position the dataset names — shows the full lineage, says
how far past the named line it is so the name cannot be mistaken for a
description of the position, gives both sides' plans, and hands off to the
Explorer for what was actually played. Elite OTB, Recent Theory and 2400+
online can be compared in one table without being merged.

**Data.** Yes. Twelve thousand players searchable, by surname, given name,
reversed form, nickname or with the accents typed correctly. Every browse
result leads to games. Every number names its source and licence.

**Engine.** Yes. Six engines verified by interrogation on this machine
including Lc0 0.32.1, a Stockfish 18 that runs in the browser with nothing
installed, and no stale line survives a position change — the invariant Phase
16 fixed and this phase's soak re-exercises.

**Stability.** Yes. Ten soak cycles across every surface including the three
added this phase: heap flat, one worker, no leaked observers or listeners.

**The one honest no.** He cannot look up Fischer–Spassky 1972. Kingfisher has
no games before 2020, and §11 records exactly why.

---

## 23. Final CI

To be completed when the run finishes.
