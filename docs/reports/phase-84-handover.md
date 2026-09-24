# Phase 84 handover — ChessBase parity, and past it where the evidence allows

The owner's brief of 2026-09-24: research what serious players need and what
makes ChessBase the professional standard, audit Kingfisher as a player would
use it, close the gaps that matter, go beyond ChessBase where that is real,
test like a serious user, and end with an explicit verdict — is Kingfisher at
ChessBase's functional level for serious research and preparation, YES or NO.

## 0. Two sessions, one phase

Two agent sessions worked on this brief on the same day. One committed to
`master` (`024dd1a`..`e0ea197`: merge into one tree, the repertoire scan, the
Lichess cloud evaluation, a position's history, the Library over any
database, questions inside a chapter with a worksheet, "keep the chapter the
board holds", "a move before a reload", the One Kingfisher design and the
1.3.0 release preparation, with `docs/product/chessbase-parity-audit.md`).
The other — this handover's — worked on `claude/wizardly-franklin-qre1bd` and
built four of the same things before it saw master.

Two implementations of one feature is a defect here, so the branch merged
master (`780f513`) taking master's tree whole, deleted its own merge, cloud
evaluation, lesson questions and their specs, and then carried over only what
master did not have, rewritten against master's code. Nothing in §2 below
duplicates a master feature. The discarded lesson work is not in the
repository.

## 1. Research and audit

**Research** (`docs/product/market-research.md` §3.8, sources listed there):
ChessBase's own documentation of Find Novelty, merging, training annotations
and the CB26 Opening Report; a GM's use of that report ("a fast, informed
first impression"); two practitioners' preparation routines (two hours, the
opponent's recent long games, stop before the game); the Leela-and-Stockfish
request Lichess declines; En Croissant's most active requests. One finding is
a finding about the evidence: the best-documented professional team's
coordinator describes people and logistics, not software, so nothing in this
phase rests on a claim about how elite players use ChessBase.

**Audit, as a player** (Chromium against the dev server, 1440×900):

| Found                                                                                                                                                   | Status                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Preparing against Carlsen printed "200 games" over "300 from Kingfisher Starter Reference" — the sources' counts were taken before the newest-200 limit | fixed (`6cd8e88`)                                                    |
| The Explorer's move table started at y = 887 of a 900 px window with a game at move 9: four lines of source prose and the variation brief sat above it  | fixed (`9dd9224`): y = 656                                           |
| A comment written in a chapter and followed by a click on Studies within the autosave debounce was lost from the board and from storage                 | fixed on master (`65f532b`); this branch adds the navigation spec    |
| The Library's merge opened over the board, replacing an unsaved untitled analysis                                                                       | fixed (`9dd9224`): merges open in a new tab                          |
| For the first moment of a page load the explorer resolves to Lichess Masters, before the built-in pack registers                                        | not changed; the departure section reports that source's own refusal |
| CI on master has been red since before this phase: two Sparkle tests assume macOS, and two timing tests exceed their budget on shared runners (§4)      | not changed; recorded                                                |

## 2. What this branch added

- **Where the game leaves the source** (`src/theory/departure.ts`,
  `DepartureSection`) — ChessBase's Find Novelty / Novelty Annotation against
  the explorer's chosen population, stopping at the first move none of its
  games played; never called a novelty; past-depth, possibly-cut lists and
  games that never left reported as themselves; written into the game as a
  fact with the population's most played move, one undo.
- **Deep analysis** (`src/engine/deepen.ts`, `deepen-graft.ts`,
  `DeepenSection`) — a tree grown on its own engine session, breadth first
  inside a 0.5 margin, reported as the start's own search beside the tree's
  backed-up score and line, and every position whose own search disagreed
  with the line that led to it; grafted as one undo.
- **Move search over a companion database** (`runPagedDeepSearch`,
  `companionMoveSearch`, `exportPage` `positions: 'line' | false`) — the
  Library's material, theme, route and comment search over a SQLite file,
  reading the main line the companion indexed at import (the PGN only for a
  comment query or a line with a repetition gap).
- **Results in their own tab** (`openInNewTab`) — merges, the explorer's
  model-game merge, predecessor games and a deep-analysis tree whose start
  is not in the game.

Rules and non-goals: `docs/design/chessbase-parity-features.md`.

## 3. The gap matrix

ChessBase 26 (from its documentation and reviewer; no ChessBase licence or
Windows machine was available here) against Kingfisher before Phase 84 (1.2.6
plus Phases 76–83) and after it (master's Phase 84 and this branch). **missing,
partial, equivalent, superior** judge the workflow a serious player runs, not
the presence of a button.

| Capability                                    | ChessBase                                             | Before Phase 84                                         | After Phase 84                                                                               |
| --------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Reference corpus                              | Mega 2026, 11.7M games, annotated subset, weekly      | partial — ~1M games in aggregated packs, none annotated | partial — unchanged; a licensing problem, not a code one                                     |
| Header search over large databases            | search mask, booster index                            | equivalent to 500k games (measured in earlier phases)   | equivalent                                                                                   |
| Position / structure search                   | position search, similarity                           | equivalent                                              | equivalent                                                                                   |
| Material / theme / manoeuvre / comment search | search mask over any database                         | partial — My games only                                 | equivalent in answers; **partial in speed** — linear, ~340 games/s on a companion file       |
| Opening tree and statistics                   | reference tree, Elo classes                           | equivalent; populations never merged                    | equivalent                                                                                   |
| Opening report                                | CB26 report: lines, pioneers, popularity, Elo classes | partial                                                 | partial — history for dated collections (master); Elo classes and pioneers need a population |
| Novelty detection                             | Find Novelty, Novelty Annotation                      | missing                                                 | equivalent for one game; no batch pass over a collection                                     |
| Merge games into a preparation file           | select, Enter                                         | missing                                                 | equivalent (master), in its own tab                                                          |
| Opponent preparation and dossier              | player prep, Style Report                             | equivalent, facts instead of style adjectives           | equivalent; counts corrected                                                                 |
| Repertoire                                    | repertoire database and scan                          | superior — position-keyed, spaced repetition            | superior — plus the scan (master)                                                            |
| Annotation: variations, comments, glyphs      | full                                                  | equivalent                                              | equivalent                                                                                   |
| Training questions / worksheets               | training annotation, points, timers                   | missing                                                 | equivalent without points and timers (master)                                                |
| Engine analysis, MultiPV, two engines         | full, engine manager                                  | equivalent                                              | equivalent                                                                                   |
| Deep Analysis                                 | overnight tree                                        | missing                                                 | partial — the tree and its report exist; a run does not survive a reload or a sleep          |
| Cloud / remote engines                        | Engine Cloud, remote to 128 cores, Let's Check        | missing                                                 | partial — Lichess stored evaluations (master); no remote engines                             |
| Monte Carlo                                   | yes                                                   | missing                                                 | missing                                                                                      |
| Tablebases                                    | Syzygy                                                | equivalent                                              | equivalent                                                                                   |
| Whole-game check, batch analysis              | Tactical Analysis, Blunder check                      | equivalent — queue, evidence written as facts           | equivalent                                                                                   |
| Duplicates and maintenance                    | rebuilt finder                                        | superior — reviewed, never auto-deleted                 | superior                                                                                     |
| Import, export, ChessBase files               | native CBH/CBV                                        | equivalent read-only                                    | equivalent read-only                                                                         |
| One position with all the player's own work   | spread over windows                                   | superior — the position page                            | superior — plus history                                                                      |
| Sharing and cloud databases                   | cloud databases, shop, magazine                       | partial — packet files, HTML/PDF                        | partial — plus the worksheet                                                                 |
| Platforms                                     | Windows; Mac announced for November 2026              | Mac and web                                             | Mac and web; no Windows build                                                                |
| Stability                                     | the complaints in `market-research.md` §3.1           | superior — certified walks, suspend, restart            | superior                                                                                     |

## 4. Evidence

Run in this container (Linux, 4 cores, Chromium 1194 via
`playwright.local.config.ts`, a local copy of the chrome project pointing at
the installed binary; not committed):

```text
npm run typecheck        exit 0
npm run lint             exit 0; 2 warnings (the local config above, and the
                         pre-existing src/performance/move-search.test.ts)
npm run format:check     clean
npm test                 3613 passed, 3 failed, 0 skipped (320 files):
                         desktop/src/sparkle-updater.test.mjs ×2 — assume macOS;
                         fail identically on master's CI (run 36006521621);
                         src/performance/move-search.test.ts theme — a 5 s
                         budget on a shared 4-core box: 0.41–0.52 ms/game here
                         against 0.66 on master's scanner; fails on master CI
npm run test:no-skips    no prohibited skip constructs
npm run build            exit 0
npm run benchmark        exit 0; heaviest route /review 569.2 kB gzipped
npm run docs:check       344/345; the one failure is .vercel/project.json, an
                         ignored file only the maintainer's machine has
git diff --check         clean
```

```text
npm run test:e2e         340 passed, 23 failed (363 tests, 41.2 min, chrome
                         project on Chromium 1194):
  e2e/visual.spec.ts ×20 — the Linux baselines were last committed in Phase
                         74 (6281e03), before the Phase 82 redesign; they fail
                         on master too. This branch also adds a row to the
                         engine panel, so the Darwin baselines need
                         `npm run visual:baselines` on the owner's Mac.
  e2e/prod-phase60.spec.ts ×3 — they load the live kingfisherchess.app, and
                         this container's egress proxy re-signs TLS with a CA
                         Chromium does not trust (ERR_CERT_AUTHORITY_INVALID);
                         they test the deployed site, not this branch.
```

Every spec this phase added or extended passes in that run: departure (2),
deep-analysis (1), merge-games (3 — commit `9dd9224` says 4; it was three,
run beside departure's two), library-databases (2), chapter-continuity (1).

**Companion move search, measured on real games.** Lichess's January 2013
archive (CC0; SHA-256 `aa40b367…1635` matched Lichess's published sum),
30,000 games imported into a companion database through the Settings import
(623 s). "R v B" and the route `N g1 f3 d4 f5`, on the dev server:

| Version                                 | R v B        | Route        |
| --------------------------------------- | ------------ | ------------ |
| PGN replayed per game, full rows sent   | 234.6 s, 418 | 235.5 s, 396 |
| PGN replayed, no rows                   | 216.9 s, 418 | 212.8 s, 396 |
| Indexed main line (`positions: 'line'`) | 87.6 s, 418  | 87.5 s, 396  |

PGN replay costs 7.71 ms a game against 0.040 ms for the scan itself. The
same games are found by every version. About 340 games a second is a linear
read: a ten-million-game file is a night, which is why the matrix says
partial in speed.

**Deep analysis, with a real engine.** From the Spanish after 3.Bb5, two moves
a position, six plies, a second each: 56 positions searched by Stockfish 18
Lite (WASM), 108 moves, the tree's line 3...a6 4.Ba4 Nf6 5.O-O Be7 6.Re1, seven
changed minds (after 5.O-O the line expected 5...Nxe4, the search there
prefers 5...Be7).

Not run here: any packaged Mac gate (`desktop:certify` and the rest need macOS
and a window server), the Firefox and WebKit projects, the Linux visual
baselines.

## 5. Verdict

**Is Kingfisher now at the functional level of ChessBase for serious research
and preparation? NO.**

A tournament player or a coach can do every everyday ChessBase workflow in
Kingfisher, and several of them better. A professional who prepares from a
large annotated reference, with engines that run overnight and on remote
machines, on Windows, cannot yet depend on it. The blockers, in order:

1. **The reference corpus.** No licensed, annotated, dated master database;
   the packs aggregate about a million games by position and keep no per-game
   years or ratings, so the Opening Report's pioneers and Elo classes cannot
   be answered from a population.
2. **Search speed at millions of games.** The companion's move search answers
   correctly but linearly (~340 games/s measured); ChessBase indexes.
3. **Engine tooling that runs unattended.** Deep analysis does not survive a
   reload or a sleep; there are no remote engines and no Monte Carlo.
4. **Windows.** No build has been produced or run.

**Where Kingfisher meaningfully surpasses ChessBase**, on the evidence above:
one position-keyed store across all of a player's work (the position page);
evidence without invented labels — no "brilliant", no style adjectives, a
departure called a fact about a named population rather than a novelty, a
deep-analysis report that prints both verdicts and where the engine changed
its mind; populations never merged; the repertoire as a position map with
coverage, a scan and spaced repetition; the web and the Mac from one source
with no account and no subscription; and certified stability.

## 6. What remains

- The four blockers above. The second and third are code; the first is a
  licensing decision (`docs/data/historical-games-audit.md`); the fourth is a
  machine and a certificate.
- A batch departure pass over a collection (ChessBase marks novelties in many
  games at once).
- The explorer's first-moment source (§1).
- Master's red CI (§4) predates this phase and was not changed.
- A Mac build from this branch, certified with `npm run desktop:certify`.
