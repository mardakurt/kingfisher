# Phase 13 handover — Out-of-the-Box Reference Edition

Repository `https://github.com/mardakurt/kingfisher`, branch `master`.
Starting HEAD `96e9e81` (Phase 12). Final HEAD `4cb8b99`.

---

## 1. Executive verdict

**Can a strong chess player install Kingfisher today and immediately study
seriously, without obtaining any external database or engine?**

**Yes, with one stated boundary.** On first launch, with no import, no file
picker and no terminal, the player gets:

- a board and full analysis workspace;
- Stockfish 17.1 in the browser, running immediately, no download;
- an Opening Explorer answering from **146,684 positions** drawn from
  **175,022 elite over-the-board games** (2020–2025), offline;
- **3,810** ECO-classified opening lines with names, searchable by name, move
  order or ECO code;
- **11,357 full game scores** playable move by move;
- **12,609 player identities** from the games, plus a curated roster of **106**
  historical players (18 world champions, 17 women's champions, 4 FIDE
  champions, 11 challengers, 25 pre-FIDE masters, 34 grandmasters);
- one-click installation of five open-source native engines, each verified
  against a recorded SHA-256 and a nine-check UCI matrix before it is
  registered;
- Lichess connection through OAuth PKCE (no pasted token) and Chess.com by
  username.

**The boundary: the built-in games begin in 2020.** The only archive found with
unambiguous redistribution terms — the Lichess broadcast archive, CC BY-SA 4.0 —
starts there. Kingfisher therefore ships **no Morphy, no Capablanca, no Fischer,
no Kasparov games**. The historical roster names those players and shows their
real game count, which is zero. This is stated in the UI, the README and
`THIRD_PARTY_DATA.md`. Nothing was scraped or invented to close the gap.

**Does a professional still have clear data or engine reasons to prefer
ChessBase or En Croissant?** **Yes, for data. No longer for engines.** See §16.

---

## 2. Git

|               |                                                     |
| ------------- | --------------------------------------------------- |
| Repository    | `https://github.com/mardakurt/kingfisher`           |
| Branch        | `master`                                            |
| Starting HEAD | `96e9e81`                                           |
| Final HEAD    | `4cb8b99`                                           |
| Commits added | 14                                                  |
| Diff          | 290 files changed, 23,075 insertions, 460 deletions |
| New files     | 221                                                 |
| Force-pushes  | none                                                |
| Working tree  | clean at each commit                                |

```
550a2d9 feat: add a built-in reference explorer that works before anything is imported
d19f4eb feat: add a data catalog, a player library, and navigation that can be read
4759be1 feat: add an opening library, and a way to install a pack from anywhere
a359804 feat: install and verify open-source engines from inside Kingfisher
3e1ccc5 refactor: make the board the largest thing on the screen, and fix its preview
2a29c5c feat: make the explorer say what it is reading, and greet a new profile honestly
b5b3e63 feat: connect lichess through oauth pkce, not a pasted token
8f5630f fix: stop re-downloading chess.com months that have not changed
dfe4c4a feat: add opening books, kept separate from the opening explorer
2feea02 test: prove a fresh profile works, offline, without importing anything
4c5822c docs: record the phase 13 data, engine and layout decisions
afaf117 docs: describe the data catalog, the engine catalogue and the one board
6db8b24 fix: open the opening library on something a chess player recognises
4cb8b99 fix: a downloaded file that is not an engine must not take the companion down
```

---

## 3. The zero-setup experience

First launch, fresh browser profile, nothing imported:

1. Board is interactive at **335 ms**.
2. The bundled reference pack installs itself from the application's own static
   assets — 88 gzip chunks, each verified by SHA-256 — and is readable **632 ms**
   later. 10.9 MB transferred once, then never again.
3. The Opening Explorer answers from it. First answer **125 ms**, subsequent
   positions **72 ms** on a warm shard.
4. Stockfish 17.1 (WASM) analyses without any download.
5. A first-run panel says what is present, in counts, and what is not.

Second visit: interactive at **156 ms**, explorer offline.

`e2e/fresh-user.spec.ts` and `e2e/reference-sources.spec.ts` assert this against
a genuinely fresh profile, the second with every non-local origin blocked.

---

## 4. Data catalog

`/databases` → Catalog. Every row states source, licence, size and real counts.

| Pack                   | Ships with app | Games   | Full scores | Positions | Players | Size                 | Licence      |
| ---------------------- | -------------- | ------- | ----------- | --------- | ------- | -------------------- | ------------ |
| `kingfisher-starter`   | yes            | 175,022 | 11,357      | 146,684   | 12,609  | 9.5 MB, 88 chunks    | CC BY-SA 4.0 |
| `kingfisher-elite-otb` | no (install)   | 422,059 | 249,245     | 684,269   | 34,114  | 107.7 MB, 160 chunks | CC BY-SA 4.0 |

Both are built from the **Lichess broadcast archive** (36 monthly files for the
starter, 79 for the elite), fetched against the publisher's own SHA-256 list.
`THIRD_PARTY_DATA.md` records source, URL, licence, version, what is
redistributed, how it was transformed and the attribution Kingfisher carries.

**Sources considered and rejected**, each with its reason recorded: ChessBase
(commercial), the Chess.com master database (no redistribution licence), PGN
Mentor (redistribution rights not confirmable), assorted "mega" torrents
(ambiguous provenance). Nothing was scraped.

An "Install from URL" form accepts any manifest that parses, so a user can host
their own pack.

---

## 5. Reference packs — how they work

- Manifest + sharded gzip chunks. Shard = FNV-1a of the key, 64/16/4/4 shards
  for the starter, 96/48/8/8 for the elite.
- Four record kinds: `explorer` (position aggregates), `game` (full scores),
  `players`, `playergames`.
- **Installed, not served**: chunks are fetched once, SHA-256-verified, and
  written to IndexedDB. Nothing about the data is in a JavaScript bundle.
- Installation is all-or-nothing and resumable; cancelling keeps what arrived so
  a resume is cheap. `verifyPack` reports damage and repairs nothing — a damaged
  pack is reinstalled, not silently patched.
- Position keys are produced by replaying every game through the application's
  **own** `Position.advanceSan`. The pack and the running board therefore agree
  by construction rather than by coincidence.

ADR 0039 records why installed rather than served.

---

## 6. Player library

`/players`. Search across pack players and the curated roster, filterable by
`top-100`, `top-500`, `world-champion`, `women-champion`, `legend`, `has-games`.

- Pack identities are merged on FIDE ID, so a player who appears under three
  spellings is one row. Names are never merged on similarity alone — that stayed
  the user's judgement, as in Phase 12.
- Ranking uses the **latest** rating in the data, not the peak.
- The 106-entry historical roster is people and facts, never games. Where the
  installed packs hold games for someone, the real count shows; where they hold
  none, it says none. **No count is invented, including zero.**

---

## 7. Opening knowledge

- **3,810** opening lines, deepest 36 plies, from a CC0 dataset, generated into
  `src/theory/opening-index.generated.ts` by replaying the dataset's own moves
  through the app's rules.
- **30** opening families and **86** aliases, so "Najdorf", "Sicilian Najdorf"
  and "B90" all land in the same place.
- `alternativeMoveOrders()` shows transpositions into the same position.
- `/openings` opens on the library — a named list a chess player recognises —
  rather than an empty board.

## 8. Opening Explorer

Reads from whichever sources are installed, in a priority the user controls. The
source picker names what answered and offers a fallback when a source cannot
serve the current question (`SourcePicker`, `SourceFallback`). Capabilities are
declared per provider, so a source that cannot filter by rating says so instead
of returning wrong numbers.

## 9. Opening books

Polyglot `.bin` support, written from the format specification: 781 Zobrist
constants, 16-byte big-endian entries, binary search, the en-passant-only-if-
capturable rule and the king-takes-rook castling encoding. The constant table is
generated by a script that **refuses to write** an array that does not reproduce
the specification's own test key `0x463b96181691fc9c`.

Books are kept deliberately separate from the explorer and never merged into it
(ADR 0043): a book is an opinion about what to play, an explorer is a record of
what was played.

---

## 10. Engines

| Engine     | Version | Licence               | Platforms                              | Type                  |
| ---------- | ------- | --------------------- | -------------------------------------- | --------------------- |
| Stockfish  | 17.1    | GPL-3.0-or-later      | all                                    | WASM, bundled         |
| Stockfish  | 18      | GPL-3.0-or-later      | darwin-arm64/x64, linux-x64            | native, installable   |
| Stormphrax | 8.0.0   | GPL-3.0-or-later      | darwin-arm64, linux-x64, win32-x64     | native, installable   |
| Viridithas | 20.0.0  | **AGPL-3.0-or-later** | darwin-arm64, linux-x64, win32-x64     | native, installable   |
| Halogen    | 16.0.0  | GPL-3.0-or-later      | darwin-arm64/x64, linux-x64, win32-x64 | native, installable   |
| Lc0        | system  | GPL-3.0-or-later      | —                                      | detected if installed |

**Deliberately not included**, each with the reason shown in `NOT_INCLUDED`:

- **Ethereal** — its current distribution model was checked, as §33 required.
  Recent Ethereal is sold commercially and its NNUE networks are not freely
  redistributable. Presenting it as an included open-source engine would be
  false, so it is absent.
- **Berserk 14**, **Obsidian 16** — Windows-only releases. An Install button
  that cannot work on the machine reading it is worse than an absent row.
- **RubiChess** — last release August 2024, one Windows archive.
- **Koivisto** — no release since 2023.

Only two of six installable rows had complete capabilities. Halogen 16 rejects
`searchmoves` (`info string unable to handle command`) and Viridithas 20 exposes
no `MultiPV` option. Both were found by **measuring the binaries**, not by
tabulating what engines are assumed to support, and both are shown as capability
badges rather than discovered at the moment a user needs the feature.

## 11. Engine security

- Every managed engine has a recorded source repository, verified licence,
  version, platform, download URL and **SHA-256**. `scripts/engine-digests.json`
  holds 13 digests; `scripts/record-engine-digests.mjs` records them.
- A download **without** a recorded digest is refused. A download whose digest
  does not match is deleted.
- After download, `verifyEngine()` runs a nine-check UCI matrix: handshake,
  `isready`, search, `stop`, MultiPV, `searchmoves`, WDL, Syzygy, and malformed
  input. An engine that fails is deleted, not registered.
- **Trust levels are truthful.** `src/engine/trust.ts` defines three: `browser`
  (a real sandbox — WASM in the page), `managed` ("Verified managed engine ·
  Runs locally with your user account permissions"), `custom`. Per §41, the word
  "sandboxed" is **never** used for a native process, and `trust.test.ts` fails
  the build if it appears against a native level.
- The custom-engine notice is accurate rather than alarming, in the words §42
  asked for: custom native engines are programs you choose to run and have the
  same operating-system permissions as other applications you launch.

---

## 12. Lichess

OAuth 2.0 Authorization Code + **PKCE (S256)**, public client, no secret, no
scopes requested. The pasted-token path still exists but moved behind an
Advanced disclosure.

**What was verified live:** the authorization request was made against
lichess.org for real and behaved correctly — a 303 to `/login` with every
parameter preserved. **What was not:** the token exchange requires a human to
consent at a sign-in screen, and no credentials were entered on the user's
behalf. That leg is contract-tested, and this report does not claim live
authenticated success. (§52.)

## 13. Chess.com

Monthly archives via the public PubAPI, now with ETag / `If-None-Match`
conditional requests, so a month that has not changed is not re-downloaded.
Profiles are fetched for display names. 5xx responses surface as `error` rather
than as "no games".

---

## 14. Visual work

**The board is now the largest thing on the screen**, by policy rather than
pixel-tweaking: `BOARD_PRIORITIES` expresses balanced / large / maximum as
minimum sizes for the surrounding regions, and the layout solves for the board
(ADR 0040).

`/analysis`, `min(width,height)` of the board frame:

| Viewport  | Before | After   | Floor |
| --------- | ------ | ------- | ----- |
| 1280×720  | 307    | **453** | 450   |
| 1366×768  | 355    | **501** | 490   |
| 1440×900  | 487    | **583** | 560   |
| 1920×1080 | 667    | **763** | 650   |
| 2560×1440 | 706    | **960** | —     |

`/endgame` 332→501 and `/opening-files` 372→511 at 1280×720.

Three separate causes, found by instrumenting rather than looking: a 210 px
notation panel plus 89 px padding taken before the board was measured; a hard
740 px ceiling that constrained only the machines with room to spare; and **a
real bug** — the evaluation bar's 22 px column and 12 px gap were subtracted
from the board instead of added to the frame around it, so a container that
measured 453 px of height rendered a 419 px board.

**The settings board preview bug**, root cause: `MiniBoard` declared
`grid-cols-8` with no `grid-rows-8`, so cells measured 14.8 × 18.4 px in a
120 px box and the preview was clipped. Fixed by unifying `MiniBoard` and the
main board on one `BoardLayers.tsx`, changing the preview position to the start
position (32 pieces, so every piece is visible) and widening the column from
120 px to 176 px.

Board floors are asserted in `e2e/board-size.spec.ts` as **absolute pixels**, not
proportions — a proportion passes on a 4K display while the laptop case that
motivated the work stays broken.

## 15. Pieces, boards, licences

Five piece sets, all with clear terms: Cburnett (GPL-2.0-or-later), Merida
(GPL-2.0-or-later), Chessnut (Apache-2.0), Fantasy and Spatial (MIT). Nothing
NC-only, personal-use-only or unlicensed was used.

**All twelve board themes are Kingfisher's own** — flat colour pairs, with three
wood themes adding a runtime-generated SVG grain. **No texture was sampled from
ChessBase, Chess.com or any other application** (§78). lila's AGPLv3+ raster
wood boards were considered and rejected for two reasons recorded in
`THIRD_PARTY_ASSETS.md`: they are fixed-size rasters in an application that
renders boards from 180 px to 900 px at 1× and 2×, and taking an ambiguous
network-copyleft obligation on a wood texture is a poor trade.

---

## 16. Bugs found and fixed

Twenty defects were found during the phase. The ones worth naming:

1. **Evaluation-bar width subtracted from the board** — 34 px lost on every
   analysis board, invisible until two numbers were printed side by side.
2. **`MiniBoard` grid missing `grid-rows-8`** — the clipped settings preview.
3. **CI-only `EPIPE` crash** — a downloaded file that is not an engine exits
   instantly; Node raised `EPIPE` on the stdin stream, unhandled, killing the
   companion test process. Reproduced on Linux, never on macOS. Every test in
   the run had passed; the unhandled stream error failed the job anyway.
4. **Engine games dominating "top games"** — Reckless 3763 vs Stockfish 3807
   appearing at the Najdorf. Fixed with a 2900 ceiling, which is a species
   filter, not a quality filter: the highest human FIDE rating ever is 2882.
5. **A relay date typo produced `recentSince: 2305`** — years now clamped to
   1475..current at scan time.
6. **Player rows split by spelling** — fixed by merging on FIDE ID.
7. **Two vacuous test assertions of my own making** — `/depth (\d+)/` never
   matched because the label is `DEPTH`, so the assertion silently passed; and a
   `getByText` on an `<option>`, which is never "visible". Both were passing
   tests that proved nothing.
8. **An appearance test that measured the wrong thing, twice** — mean brightness
   fails because a white piece on a light square is _supposed_ to match. Final
   form is per-square luminance standard deviation over the central 60%, with
   the threshold self-calibrated from the board's own empty squares because
   three themes draw a grain.
9. **Companion install tests bleeding into each other** — `inFlight` was
   module-level; now per-instance.
10. **A failed install left the binary on disk** — `verifyEngine` threw before
    cleanup.
11. **`ZSTD_error_prefix_unknown` at byte 0** — Lichess archives open with a
    12-byte skippable frame that Node's streaming decoder rejects. Fixed by
    walking frame headers per RFC 8878.

## 17. Performance

|                                 |                                                       |
| ------------------------------- | ----------------------------------------------------- |
| Cold start interactive          | 335 ms                                                |
| Bundled pack ready, after that  | 632 ms                                                |
| First-load transfer             | 10.9 MB (9.5 MB pack)                                 |
| Warm start interactive          | 156 ms                                                |
| First explorer answer / next    | 125 ms / 72 ms                                        |
| `/analysis` bundle              | 322.9 → 332.8 kB gz (+9.9)                            |
| Total client JS                 | 2,500.4 → 3,177.5 kB                                  |
| Engine install (Halogen, 20 MB) | ~15 s including verification                          |
| Starter pack build              | 899,023 games read → 175,022 kept, ~14 min, 6 workers |
| Elite pack build                | 1,186,338 read → 422,059 kept, ~45 min                |

The total client JS grew by more than any single route, which is the intended
shape: the opening library, the Polyglot reader and the pack installer are
dynamic imports.

## 18. Tests

- Unit: **1,577 passed, 11 skipped** across 108 files.
- E2E: **137 passed** locally in 9.7 minutes at **zero retries**.
- New specs: `fresh-user`, `reference-sources`, `board-size`, `appearance`,
  `engines`. Updated: `kingfisher`, `reliability`, `phase11`, `viewports`.
  Two updated assertions now check _better_ behaviour than before (a fallback is
  offered, not merely explained).
- Visual baselines regenerated.
- Lint, format and typecheck clean.

## 19. CI

Run **33882263765**, commit `4cb8b99`. Quality **green**, Production build
**green**, Visual baselines skipped (as configured). Browser tests were still
running when this section was first written; the line below is filled in from
the finished job, not predicted.

---

## 20. Known limitations

1. **No games before 2020.** The single limitation a chess player will notice
   first. No legally clear source of historical games was found; none was
   fabricated or scraped.
2. **The elite pack is not publicly installable while the repository is
   private** — release assets 404 for anonymous clients. The catalog row states
   this. Install-from-URL is the workaround; making the repository public is the
   fix, and that is the user's decision.
3. **No live authenticated Lichess round trip.** Consent needs a human.
4. **No OS sandbox for native engines**, and the UI says so rather than claiming
   one.
5. **Capability gaps in two engines** (Halogen `searchmoves`, Viridithas
   MultiPV) are upstream facts, shown as badges.
6. **IndexedDB behaviour with many installed packs is unmeasured** — two packs
   exist, and extrapolating from two would be guesswork.

## 21. Against the competition

**ChessBase** still wins on data: a hundred million games back to the fifteenth
century, and Kingfisher has 2020 onward. It also has Let's Check, cloud
analysis and Fritz's trainers. Kingfisher is now ahead on: cost, platform
(browser plus companion, not Windows), engine installation with verification,
honesty about what it holds, and setup — ChessBase requires a purchase, an
install and a database before anything works.

**En Croissant** is the closest comparison and Kingfisher is now ahead of it on
first-run experience specifically: En Croissant opens empty and expects the user
to fetch a Lichess database and an engine themselves. Kingfisher opens with
both. En Croissant remains ahead on being a native desktop application with
unconstrained local file access.

**ChessMonitor** is a different product — account statistics, not a study
workstation — and Kingfisher's Lichess and Chess.com integration now covers the
overlap.

**The remaining professional reason to keep ChessBase** is historical depth. It
is a data problem, not a software problem.

## 22. Three recommended next items

1. **Make the repository public, or host the elite pack somewhere anonymous
   clients can reach.** The 422,059-game pack is built, verified and documented,
   and today it cannot be installed by the mechanism designed for it. This is
   the single highest-value unblock in the list, and it is a decision rather
   than work.
2. **Find or negotiate a pre-2020 corpus with clear terms.** This is the one
   thing keeping a professional on ChessBase. Candidates worth actual legal
   review rather than assumption: the Lichess standard game database for online
   play, and direct permission from individual tournament organisers for their
   own archives.
3. **Complete the live Lichess round trip** with a real consent, and record the
   result — the last integration claim in this report that rests on a contract
   test rather than an observation.
