# Phase 18 — final report

```
Phase 18 status: COMPLETE, with three things deliberately not shipped
                 and four the phase did not reach
```

The three not shipped were each a decision with a reason, and they are §14,
§15 and §16: Chess960, which was the owner's call after a licensing audit; a
historical game corpus, which cannot be obtained legally; and the three-month
High-Rated Online pack, which was built, measured, and argued against on its
own numbers.

The four the phase did not reach are listed plainly in §24. Nothing in this
report is marked verified on the strength of an earlier report, and every
number in it names the command that produced it.

---

## 1. Executive verdict

**What Phase 18 changed.** The thing Phase 17 measured and declined to ship —
the compact position index — shipped, and was migrated on a real 150,119-game
collection that was deliberately killed mid-migration and resumed. Kingfisher
gained an Opening Report that answers "what is this position called, what is
played here, and what are both sides trying to do" from evidence with
denominators rather than from prose. A repertoire became a review session in
the queue that already schedules everything else. The engine fleet stopped
being a claim about one machine and became a matrix across four platforms,
which immediately found something about Stockfish nobody had looked for. And
native engines stopped inheriting the shell's environment.

**What the phase is really about, though, is the gap between a feature that
passes its tests and a feature a person can use.** Six of the defects in §19
were invisible to a green suite: two plan sections that were built, tested,
documented and unreachable; a count with no source attached; a visual gate that
could not see the board; a review session that only ever grew; a link into that
session that opened everything instead; and a CI matrix that reported six
engines and qualified none. Every one of them was found by driving the product
rather than by reading it.

**Known release blockers.** None.

**The Magnus test.** §26.

---

## 2. Git

|                  |                                                        |
| ---------------- | ------------------------------------------------------ |
| Branch           | `master`                                               |
| Phase 18 begins  | `24a30ac` (the Phase 17 handover)                      |
| Last code commit | `9667a73`; `c0c0277` and this report are documentation |
| Commits          | **40, including this report**                          |
| Diff             | **83 files, +11,325 / −251**, before this report       |
| New files        | **37**                                                 |
| Working tree     | clean                                                  |

The list is `git log --oneline 24a30ac..HEAD`.

---

## 3. Storage — the compact position index

Phase 17 measured a prototype on a copy of 60,469 games and did not ship it,
for a reason worth restating: it is a forward-only migration of the table
holding 81% of a user's data, and a half-applied schema change to that table is
worse than a database that is larger than it needs to be.

It shipped in `3a1a98d`. The numbers below are from the shipped code on
**150,119 real over-the-board games, 11,303,059 indexed positions** — two and a
half times the scale Phase 17 measured — imported through the application's own
path (`parsePgn → normalizeGame → classifyTree → indexGame → insertGames`) from
the Lichess broadcast archives, CC BY-SA 4.0, on an Apple M3 Pro.

|                    |      before |       after |
| ------------------ | ----------: | ----------: |
| Whole database     | **8.70 GB** | **4.96 GB** |
| Bytes per game     |  **57,928** |  **33,061** |
| Bytes per position |       769.4 |       439.1 |
| A million games    | **57.9 GB** | **33.1 GB** |

**3.73 GB saved on 150,119 games — 42.9%**, against Phase 17's predicted 41.1%.
It does better at larger scale, which is what the design predicts: the saving
comes from repeated values being stored once, and a bigger collection repeats
more.

The "before" file is a real text-schema collection, not a simulation of one —
created with the `positions` DDL exactly as it stood at `24a30ac`
(`companion/src/__fixtures__/text-schema.mjs`) and imported into. `GameDatabase`
detects the text schema and writes to it, which is what a collection created
before this phase does.

Three caveats are stated rather than buried, in
[`docs/performance/phase-18-storage.md`](../performance/phase-18-storage.md):
four "before" query timings were never captured because that run was
interrupted and a migration is not reversible; the "before" run shared the
machine with a browser suite and the "after" run did not, so the honest reading
of the roughly-halved rows is "not slower, probably faster"; and the explorer
was never measured before at all.

---

## 4. Migrating without losing anything

The schema change is the part that could destroy someone's work, so it is the
part with the most machinery.

- **A disk preflight that refuses rather than starting.** The peak requirement
  is the file's own size again, and the migration will not begin without it.
- **A chunked cursor.** The migration was deliberately killed mid-run on the
  150,119-game collection and **resumed from its cursor**; the collection
  verified afterwards.
- **Triggers that rewind the cursor** when a concurrent write touches a row the
  migration has already copied, so a companion answering requests during a
  migration cannot leave a stale row behind.
- **An atomic cutover** in one transaction, and a resumable `VACUUM` after it.
- **Nothing is dropped before the destination is verified** — the project's
  move invariant, applied to a schema.
- **Compaction and integrity run off the request thread** (`bca0876`), and a
  cancelled compaction leaves the collection untouched (`d17a8a7`).

`companion/src/schema-equivalence.test.mjs` runs the whole `GameDatabase` API
against a migrated collection and a natively-compact one and requires identical
answers — **24 tests**.

That suite had a blind spot that mutation testing found and this phase closed:
comparing two compact collections cannot catch a defect present in both.
Replacing the compact FEN expression with `NULL` passed every comparison. Four
absolute assertions were added, and they fail on that mutation.

---

## 5. Opening plans, counted from games

`src/theory/opening-plans.ts` replays the recorded continuations of the games
that reached a position and counts where each piece got to, keeping a piece's
identity as it travels. It replays validated moves rather than generating them,
so it needs no rules engine and never touches the chess.js boundary.

Two real defects in it were found by mutation testing, not by review:

1. **Castling never recorded the rook's arrival.** A rook that castled to f1
   was invisible to every count.
2. **`medianPly` used the index into the arrivals array, not the ply.** Every
   "typically by ply N" was wrong.

Two of my own tests survived mutation and were rewritten: the en-passant test
now requires a later move from the vacated square to abort the replay, and the
promotion test asserts `promotedTo` and a promoted piece moving again.

---

## 6. The Opening Report

`src/features/openings/opening-report.ts` builds it and the panel decides
nothing. Every section carries a provenance line or a stated reason it is
empty, and `e2e/opening-report.spec.ts` checks that **in the browser** — for
every section rendered, one of the two must be present.

Nine sections: identity, brief, branches worth the time, populations, named
branches, where the pieces go, pawn advances, repertoire, model games. A section
whose input was never supplied is **absent rather than empty**, which is a
different statement from one that was looked for and found nothing.

The branch ordering collapses to a single number to sort by, and that number
**never leaves the module**. A reader gets `reasons`, complete without it. The
browser test asserts the words "score", "criticality" and "rank" appear nowhere
in the section.

---

## 7. The report in front of a real collection

This is where the phase's worst defects were, and all three were found by
putting the feature in front of data rather than in front of a test.

**The two plan sections could never appear.** The panel looked for a source that
could supply game continuations among the _reference sources_ it draws its
population columns from. A reference pack aggregates its games into per-position
counts before Kingfisher ever sees it, so no pack implements `continuations`
and none ever will — the search was over the one list guaranteed not to contain
an answer. A companion SQLite collection, the only source that still holds
per-game moves, lives in the provider registry and was never consulted. "Where
the pieces go" and "Pawn advances" were built, unit tested, documented, and
invisible. Fixed in `66c6251`.

**A pawn's destination was written as though it were a move.** On a real
2,918-game Najdorf collection the b7 pawn reaches b4 in 21.7% of games, by way
of b5 — printed as `b7-b4`, a move no pawn can play. A report that prints an
illegal move forfeits the reader's trust in every number beside it. Fixed in
the same commit; it now says which pawn reached which square.

**And the counts had no source.** With the first fix in, the browser suite
failed where the test had passed alone: the report took whichever collection
registered first, and in the suite that was another spec's two-game fixture. It
reported "1 games replayed" from a collection nobody had asked about and named
none of them. Fixed in `3114d24` — the provenance now reads "106 games from
Plans, replayed 30 plies past this position", and the report prefers the
collection already chosen as the explorer source.

What it says now, verified in the browser on a 2,918-game SQLite collection
(compact schema, through the companion) at the Najdorf after 5...a6 — 106 games
replayed 30 plies:

| Where the pieces go    |       | Pawn advances        |       |
| ---------------------- | ----- | -------------------- | ----- |
| Black's bishop f8 → e7 | 74.5% | Black's e7 pawn → e5 | 65.1% |
| Black's king e8 → g8   | 72.6% | Black's b7 pawn → b5 | 52.8% |
| Black's knight b8 → d7 | 65.1% | White's f2 pawn → f4 | 48.1% |
| White's bishop c1 → e3 | 61.3% | White's a2 pawn → a4 | 33.0% |
| White's knight c3 → d5 | 54.7% | White's g2 pawn → g4 | 31.1% |

That is the Najdorf English Attack, derived from games rather than written
down, with a denominator on every row.

---

## 8. Variation briefs

The brief asked for 180–250 briefs and also said not to produce filler to reach
a number. Measuring which families were actually uncovered turned those two
instructions into one answer.

|                                | before |     after |
| ------------------------------ | -----: | --------: |
| Briefs                         |    144 |       157 |
| Families with a brief          |     65 |        79 |
| Named positions reached by one |  3,321 |     3,567 |
| Share of the 3,810 named       |  87.2% | **93.6%** |

Thirteen briefs, not a hundred. The 84 uncovered families accounted for 489 of
3,810 positions between them, and the largest were the Van Geet Opening, the
Pterodactyl Defense, the Hungarian Opening, the Kádas Opening and the Ware
Opening. Writing "what each side is playing for" in the Pterodactyl Defense
would be inventing chess knowledge to move a counter.

Two of the thirteen are not openings at all. **Queen's Pawn Game** and **King's
Pawn Game** are the dataset's own labels for a position that has not yet become
a named opening, and they are the two largest uncovered families by a distance
— 82 and 38 positions. A player who lands in one is exactly the player with
nothing else to read.

**70 families remain uncovered — 243 positions, 6.4%** — and they say so rather
than inventing prose.

---

## 9. Reviewing a repertoire

`4106d34`, `ae4e7ec`, `9667a73`. A repertoire becomes a queue of prompts
scheduled by `src/training/schedule.ts` — the SM-2 derivative the training queue
already uses — rather than by a second system, so a repertoire prompt and a
tactics card compete on the same terms.

One prompt per position however many move orders reach it, which ADR 0010 makes
mostly free. What was not free is card identity: nothing stopped two training
cards existing for one position. `reviewCardKey` makes recall a memory of a
_decision_ — the position plus its answers — so the same position with the same
answers is one card.

**Two defects surfaced together at the end of the phase, with one symptom.** A
second, smaller session still showed "All 2":

- The dialog **added** its prompts to the set it found by name, so a static
  review set only ever grew. A player who reviewed forty positions and then
  wanted the five they keep failing got forty-five. `replaceItems` sets
  membership instead, changing no card and no schedule — a session is a
  selection, not a syllabus.
- That fix did not move the number, which is how the second surfaced. The
  training workspace seeded `?set=`, `?item=` and `?scope=` from
  `window.location.search` inside `useState` initialisers — right after a page
  load and wrong after a client navigation, where the component renders before
  the address changes. So the parameter read as absent and the queue opened
  everything, permanently, because an initialiser runs once. **Every link into
  that route from inside the application is a client navigation**: the
  repertoire review, a critical position, the command palette. Measured rather
  than reasoned about: the pushed navigation showed "All 2" and a reload of the
  identical URL showed "All 1". It reads `useSearchParams` now, with the
  Suspense boundary a prerendered page requires for it.

`e2e/repertoire-review.spec.ts` builds a repertoire on the board through the
product's own flow, opens the review, reads what it says about the session,
starts it, and answers a prompt in the training queue the review sent it to. It
runs the review twice and requires `0 new`, and runs a smaller second session
and requires the queue to hold only that.

---

## 10. Engines — what changed

**Stockfish 19** replaced Stockfish 18 as the managed native engine, the day
after release, once it had been downloaded, hashed, launched and made to search.
The browser engine stays at **18**, for four reasons checked rather than
assumed: the WASM 19 build carries no embedded network, does not speak the
worker protocol Kingfisher's browser session uses, has not been seen to run
here, and changes licence from GPL-3.0 to AGPL-3.0-or-later. That asymmetry is
documented where a reader will meet it.

**Native engines stopped inheriting the companion's environment** (`eab3d2e`).
Four findings, each with a test:

| Finding                                     | What it cost                                             |
| ------------------------------------------- | -------------------------------------------------------- |
| `spawn` was handed `process.env`            | an engine saw any token in the shell that started it     |
| `child.kill()` killed one process           | helpers an engine started kept running, untracked        |
| the partial-line buffer was unbounded       | a line with no end accumulated without limit             |
| `Hash value 33554432` was accepted as given | an engine could ask for more memory than the machine has |

Engines now run in a process group that is terminated as a group, see an
allowlisted environment, have `setoption` values clamped to the machine, and are
told when a clamp happened rather than having it applied silently.

**The multi-engine resource split was wrong** (`80058d9`): threads were divided
between running engines and hash was not, so a comparison allocated more memory
than the setting permitted.

**MultiPV 5 computed five lines and stored one** (`a6714a1`). Four fifths of
every wide pass was thrown away, and the one critical-position rule that needed
the others — the played move leaving the engine's candidate set — had no stored
evidence to run on.

---

## 11. The engine qualification matrix

`npm run engines:verify` asks an engine what it can do. `npm run engines:qualify`
asks what a session actually depends on: does it stay correct across nine
positions — the start, a quiet middlegame, a back-rank mate, a promotion, an en
passant, a both-sides castling position, a king-and-queen ending, a stalemate
trap, and a Chess960 start for engines that declare it — and five protocol
sequences, including three malformed inputs **sent one at a time**.

`.github/workflows/engines.yml` runs it on four platforms. **Run 34048549010 is
the first in which all four actually reported**: the matrix named `macos-13`, a
retired runner label, so that leg queued indefinitely — two dispatches sat over
three hours with the other three long finished — and every earlier table here
was written from a matrix with a hole in it.

| Engine            | Linux x64 | Windows x64 | macOS arm64 | macOS x64 |
| ----------------- | :-------: | :---------: | :---------: | :-------: |
| Stockfish 19      |     ✓     |      ✓      |      ✓      |     ✓     |
| Stormphrax 8.0.0  |     ✓     |      —      |      ✓      |     —     |
| Viridithas 20.0.0 |     ✓     |      —      |      ✓      |     —     |
| Halogen 16.0.0    |     ✓     |      ✓      |      ✓      |     ✓     |
| PlentyChess 8.0.0 |     ✓     |      ✓      |      ✓      |     —     |
| Koivisto 9.0      |     ✓     |      ✓      |      —      |     —     |
| Berserk 14        |     —     |      ✓      |      —      |     —     |
| **Qualified**     |   **6**   |    **5**    |    **5**    |   **2**   |

macOS x64 is the thinnest platform by a distance, and that is a fact about what
the projects publish rather than about the runner: five of the seven declare no
darwin-x64 build at all, and Lc0 is not installed there. An Intel Mac user gets
Stockfish 19 and Halogen 16.

Every engine passed **all nine positions** on every platform. They differ on one
row, and Stockfish is in it: **Stockfish 19 exits on `position fen not-a-fen`
and on `go depth banana`**, on all four platforms, and it was reproduced off the
runners entirely against the official `stockfish-macos-universal` binary on a
development machine.

Kingfisher never sends either line — `position fen` is built from a FEN its own
parser validated, `go depth N` from a number — and a dead engine is already
failed rather than waited on. It is recorded because an engine that exits on
malformed input will exit on malformed input nobody has thought of yet, and
because "Stockfish is robust to anything" is the sort of thing a codebase
assumes until it measures.

Sending the three inputs one at a time is what makes this a finding rather than
a complaint. Together they would only have said "it died on garbage".

The matrix also corroborates `searchmoves` from the answer rather than from the
option list: Stormphrax hands back the restricted move, PlentyChess reports
`searchmoves ignored` and plays its own. Three of the five engines installable
on macOS arm64 ignore it, and the session now checks that the move it got back
was one of the moves it asked about — because an engine can accept a restriction
and ignore it, and only the answer proves what happened.

---

## 12. Four engines at once

`engines:qualify` drives one engine at a time, which leaves the question a
comparison depends on. UCI output carries no request identity, so an attribution
defect between concurrent sessions would look exactly like a working comparison:
several panels, several evaluations, silently swapped.

So `npm run engines:lab` asks it as a question about chess. Four positions with
**pairwise disjoint legal-move sets** — asserted before the run, so that editing
one FEN cannot quietly turn this into a test that cannot fail. A bestmove from
the wrong session is then illegal in the position it arrived at, and the script
names the position it really belongs to.

Live on darwin-arm64, four real processes through a running companion:

| Engine            | Position                       | bestmove | Answered | Verdict          |
| ----------------- | ------------------------------ | -------- | -------: | ---------------- |
| Stormphrax 8.0.0  | rook ending, White             | `a1a8`   | **7 ms** | its own position |
| PlentyChess 8.0.0 | two connected pawns, White     | `b1a2`   | 2,907 ms | its own position |
| Halogen 16.0.0    | knight against pawns, Black    | `d6d5`   | 2,906 ms | its own position |
| Viridithas 20.0.0 | queenside castling free, Black | `a8a5`   | 3,007 ms | its own position |

Stormphrax's 7 ms is not an anomaly to explain away: `a1a8` is mate, and a
search that has found mate ends. It is also why the concurrency claim is made on
the _last_ answer rather than on the spread — the last arrived 3,007 ms after
all four were told to `go movetime 3000`; taking turns it would have been about
12,000 ms.

Confirmed capable of failing by sending each engine its neighbour's position
while still verifying against the original: three reported `ANSWERED POSITION`
by name and the fourth returned no bestmove at all.

**This is not a four-engine comparison view, and the documentation now says so
in as many words.** `SlotId` in `src/stores/engine-store.ts` is
`'primary' | 'secondary'`; there is no third slot. The lab is a companion-level
attribution check. A draft of `docs/ENGINES.md` written during this phase
claimed the comparison "supports up to four deliberately"; it was reverted,
because a capability claim the code does not support is the one thing this
project treats as a defect rather than as untidiness.

---

## 13. Analysis passes, narrowed to one player

`230e268`. A background engine pass can now be limited to one side's decisions,
which is what a player reviewing their own game wants. The part that is easy to
get wrong, and wrong in a way that looks right, is that judging a move needs the
evaluation _before_ it and _after_ it — so narrowing to White cannot simply drop
Black's positions, or every swing becomes incomputable and the review queue
silently finds nothing. `positions.test.ts` states that as its central case.

---

## 14. Chess960

**Not shipped**, and that was the owner's decision after the audit in
[ADR 0048](../adr/0048-chess960-needs-a-rules-decision-first.md).

Chess960 changes exactly one rule, and that rule sits behind
`src/chess/position.ts`. The brief said not to hand-roll it and named the
alternative: a proven **permissively licensed** library. Every JavaScript chess
library with a plausible claim to Chess960 was checked against its registry
metadata and its own documentation:

| Library             | Licence              | Chess960 | Verdict                   |
| ------------------- | -------------------- | -------- | ------------------------- |
| `chess.js` (in use) | BSD-2-Clause         | no       | cannot provide it         |
| `chessops`          | **GPL-3.0-or-later** | yes      | capable; licence conflict |
| `chess960.js`       | **none declared**    | claims   | rejected                  |
| `chess.ts`          | BSD-2-Clause         | no       | cannot provide it         |
| `@rumenx/chess`     | MIT                  | no       | cannot provide it         |

**There is no maintained, permissively licensed JavaScript library with Chess960
support.** The brief's preferred route does not exist, so the decision was a
licensing one, and it was the owner's to make.

What did ship is `src/chess/chess960.ts`: all 960 arrangements under the world's
own Scharnagl numbering, Shredder-FEN, and the castling squares for each — a
fact about the game, with no rules claim of any kind. Kingfisher still refuses
positions it cannot play rather than guessing, and `chess960.test.ts` and
`variant-contract.test.ts` hold that.

---

## 15. Historical games

**None shipped**, unchanged from Phase 17 and for the same reason: no source
audited both contains historical over-the-board master games and grants
redistribution on compatible terms. Chess moves are facts and carry no
copyright; that is not the same as a database being redistributable, because EU
database rights protect substantial extraction from a compilation even when
every item in it is a fact.

What this phase added is the distinction the audit had been missing.
**Redistributing a corpus and researching one are different questions.**
Kingfisher cannot ship Fischer–Spassky 1972, but a user with their own Lichess
token can look it up through the masters explorer, and `b598b75` checks that the
position is actually reachable rather than assuming it — the FEN was wrong in
three places when it was first written from memory, and was replayed through the
rules code instead.

`npm run smoke:lichess` **has not been run**: it needs a token, which needs a
person.

---

## 16. High-Rated Online, and the pack that was not kept

Phase 17's second recommendation was to build the three-month pack and choose a
cadence from the measurement. It was built, measured, and **deleted**.

Three months buys breadth, not depth: positions grow 3.1× against games at 3.0×,
which is the signature of new positions being admitted rather than existing ones
being deepened, and the median line runs two plies further. Three times the
download for two plies and three lines.

The limit it fails to move is the one that matters. **23 of 45 sampled lines
stop at a move nobody in the 2400+ online population has played at all**, and
tripling the months moved that number by zero — those are lines strong players
play over the board and not online. Which is what the Elite OTB and Recent
Theory packs are for, and why Kingfisher compares populations instead of merging
them.

The speed mixture is unchanged and has to be said out loud: **96.9% blitz in
both**. `--months 3` rebuilds it if the distribution cost ever stops mattering.

---

## 17. The visual gate

The board is the one thing every surface shares, and the gate protecting it
could not see a change to it. Every snapshot was a whole page at a 2% tolerance,
so a **7% change to every piece on the board passed**.

Fixed in `8752a8f`: per-snapshot tolerances, 2% for a page and **0.2% for the
board**, with two new shots scoped to `[data-chessboard]` in both themes. The
fix was proved by reverting the artwork and confirming the new shots fail.

A related lesson nearly produced a false green and is worth recording:
`PIECE_INK_TARGET` is not read at runtime, so mutating it gives a passing run
that would have "proved" the gate works. The constant that matters is the
per-set `visualScale`.

Linux baselines for the two new shots were generated in CI. The 21 existing
Linux baselines came back **byte-identical**, which is the check that the
generation ran against the same code.

---

## 18. The route walk

Every route driven client-side in one session on a populated profile — an
imported game, a paired companion, a 2,918-game SQLite collection — with
`console.error`, `window.onerror` and `unhandledrejection` instrumented before
the walk began:

`/recent` `/analysis` `/openings` `/studies` `/repertoire` `/preparation`
`/players` `/opening-files` `/review` `/training` `/endgame` `/games`
`/databases`

**13 of 13 rendered. Zero console errors, zero unhandled rejections.**

---

## 19. Bugs found beyond the brief

Fifteen, each with its test.

| #   | Defect                                                    | Cost                                                        | Fix       |
| --- | --------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| 1   | The report's plan sections were unreachable               | two finished features invisible in the product              | `66c6251` |
| 2   | A pawn's journey printed as a move — `b7-b4`              | an illegal move beside eleven correct numbers               | `66c6251` |
| 3   | Plan counts named no collection, and picked one at random | a count with no source, from a database nobody chose        | `3114d24` |
| 4   | Castling never recorded the rook's arrival                | every rook that castled was invisible to the counts         | `e636730` |
| 5   | `medianPly` used the array index, not the ply             | every "typically by ply N" was wrong                        | `e636730` |
| 6   | `spawn` was handed `process.env`                          | an engine saw any token in the shell that started it        | `eab3d2e` |
| 7   | `child.kill()` left an engine's helpers running           | untracked processes after a stop                            | `eab3d2e` |
| 8   | The partial-line buffer was unbounded                     | a line with no end accumulated without limit                | `eab3d2e` |
| 9   | `Hash` was accepted as given                              | an engine could ask for more memory than the machine has    | `eab3d2e` |
| 10  | Only threads were split between comparing engines         | a comparison allocated more hash than the setting permitted | `80058d9` |
| 11  | MultiPV 5 stored one line                                 | four fifths of every wide pass discarded; a rule left inert | `a6714a1` |
| 12  | The engine CI job qualified nothing, everywhere           | a matrix that reported six engines and tested none          | `5caff62` |
| 13  | The matrix named a retired runner                         | one platform never reported at all, for the whole phase     | `9667a73` |
| 14  | A review session only ever grew                           | a five-position revision session handed back forty-five     | `9667a73` |
| 15  | `?set=` was read before the address changed               | every in-app link into the training queue opened everything | `9667a73` |

Plus three in the tests themselves: the visual gate that could not see the board
(§17), the schema-equivalence suite that could not see a defect present in both
schemas (§4), and two opening-plans tests that survived mutation (§5).

---

## 20. Tests

|                            |                              |
| -------------------------- | ---------------------------- |
| Unit and integration files | **151**                      |
| Unit and integration tests | **2,057 passed, 11 skipped** |
| Browser spec files         | **27**                       |
| Browser tests              | **219 passed**               |
| Playwright retries         | **0**                        |

New this phase: `position-schema.test.mjs`, `schema-equivalence.test.mjs`,
`database-maintenance.test.mjs`, `engine-sandbox.test.mjs`,
`opening-plans.test.ts`, `critical-branches.test.ts`, `opening-report.test.ts`,
`chess960.test.ts`, `review.test.ts`, `enrol.test.ts`, `positions.test.ts`, and
the browser specs `opening-report.spec.ts` and `repertoire-review.spec.ts`.

Every regression test named in §19 was confirmed capable of failing by reverting
the implementation and watching it fail, except numbers 12 and 13, which are CI
configuration and were confirmed by the run that had been silently reporting
nothing.

---

## 21. Working alongside another agent

Part of this phase was written by a second agent while this session was running,
and that is worth recording because it changed the outcome twice.

Its work arrived in the working tree mid-session: the review-set replacement and
its test, the repertoire input the report's repertoire section had been declared
for and never given, an error state when plan evidence cannot be loaded, and the
two workflow repairs in §11 and §19. All of it was kept, and all of it was
reviewed rather than merged on trust — which mattered, because two pieces needed
correcting.

It had rewritten `docs/ENGINES.md` to say the engine comparison "supports up to
four engines". It does not; there are two slots. That was reverted (§12).

And it had removed the report's `useMemo` entirely, on a correct observation —
the memo key was a string of each source's game totals, and equal totals do not
mean equal move distributions, while "loading" and "unavailable" both stringify
to nothing. The observation was right and the remedy was too broad: the plan
sections replay up to three hundred games thirty plies deep, and this panel
re-renders on every board interaction. It is memoised again, on each source's
actual move distribution.

Its failing test is also what exposed §19.15, which neither agent was looking
for.

---

## 22. Phases 1–18 verification

[`docs/product/phase-verification.md`](../product/phase-verification.md) carries
one row per capability with its invariant, its unit evidence, its browser
evidence, and the commit that repaired it if it was ever broken. Phase 18 added
thirteen rows and corrected three entries that had outrun the code.

---

## 23. Documentation corrected

Four documents had outrun the code and were fixed as defects, not tidied:

- `ARCHITECTURE.md` cited **ADR 0048 — which is about Chess960** — for what the
  opening report does not do, and said nothing about which sources can supply
  the continuations its plan sections need.
- `docs/product/competitors.md` still said the plan sections are always dropped
  because no source exposes continuations.
- `docs/product/phase-verification.md` pointed at `candidates.test.ts` in the
  wrong directory and was missing the browser evidence written this phase.
- `README.md` had no row for either of the phase's headline features.

---

## 24. What was asked for and not reached

Named plainly, because a phase report that omits them is worth less than one
that lists them.

- **Kingfisher-built engines in CI.** Not started. The fleet workflow downloads
  published binaries; it compiles none.
- **The full 18-step soak chain.** `e2e/soak.spec.ts` drives ten cycles and its
  assertions hold — heap flat, one worker, no leaked observers or listeners —
  but the brief's specific chain was not walked.
- **The complete 42-step acceptance walk.** §18 is a 13-route walk, which is not
  the same thing.
- **A live Lichess OAuth round trip.** It requires the user's own consent, which
  no agent can give.

---

## 25. Known limitations

1. **Claim search is still slow** — 2,312 ms on 11.3M positions, down from
   3,399 ms. The new index helps and is not the answer; a claim-to-position
   table is, and it was out of scope.
2. **Four "before" storage timings were never captured.** The text-schema query
   run was interrupted and a migration is not reversible.
3. **Chess960 is not supported**, deliberately and enforced by a test.
4. **Managed native engines are not sandboxed.** They run with the user's own
   operating-system permissions.
5. **Lc0 is verified on darwin-arm64 only**, and is absent on macOS x64.
6. **The engine comparison takes two engines, not four.**
7. **157 variation briefs, not 3,810.** 93.6% of named positions inherit one;
   the rest say so rather than inventing prose.
8. **No games before 2020.**

---

## 26. The Magnus test

**Opening preparation.** Yes, and more than before. A Najdorf at move 6 now
answers three questions at once: what it is called and how far past the last
named position the board is; what each population played, in its own column with
its own count and no combined figure anywhere; and what both sides are actually
trying to do, counted from the games that reached it — ...Be7 74.5%, ...Nbd7
65.1%, Be3 61.3%, ...e5 65.1%, f4 48.1%, g4 31.1%, each with its denominator and
the collection it came from.

**Data.** Yes, and a collection 43% smaller for it. A million games costs 33 GB
rather than 58, and migrating an existing one can be interrupted without loss.

**Engine.** Yes. Six engines qualified on Linux, five on Windows, five on macOS
arm64, two on macOS x64, against nine positions and five protocol sequences
each — and four driven at once with proof that each answered its own board.

**Repertoire.** Yes, and it now revises itself: a repertoire becomes prompts in
the same queue as everything else, one per position, running it twice adds
nothing, and a smaller second session is a smaller second session.

**Stability.** Yes. Thirteen routes, zero console errors. Ten soak cycles on the
final tree left the heap at 97.7 MB with one worker, one observer, sixteen
listeners and no intervals — the numbers the soak test prints itself.

**The honest no.** He still cannot look up Fischer–Spassky 1972 inside
Kingfisher's own data — but he can reach it through his own Lichess token, and
§15 records the difference between the two claims.

---

## 27. Final gates

Every gate in `AGENTS.md`, run on this tree.

### Locally, on darwin-arm64, node 24.14.0

| Gate                   | Result                                                       |
| ---------------------- | ------------------------------------------------------------ |
| `npm test`             | ✓ 151 files, 2,057 passed, 11 skipped                        |
| `npm run typecheck`    | ✓                                                            |
| `npm run lint`         | ✓                                                            |
| `npm run format:check` | ✓                                                            |
| `npm run build`        | ✓                                                            |
| `npm run test:e2e`     | ✓ **219 passed** (12.2m), retries 0                          |
| `npm run benchmark`    | ✓ heaviest route `/review`, 371.4 kB gzipped over 23 scripts |
| `git diff --check`     | ✓ clean                                                      |

### CI

Run **34048809600**, commit **`c0c0277`** — which is `9667a73`'s code plus a
documentation change. All four gating jobs green.

| Job                 | Result |   Time |
| ------------------- | ------ | -----: |
| Quality             | ✓      |  3m02s |
| Production build    | ✓      |    47s |
| Visual gate (Linux) | ✓      |  2m39s |
| Browser tests       | ✓      | 22m55s |

|                      |                                         |
| -------------------- | --------------------------------------- |
| Unit and integration | **151 files, 2,057 passed, 11 skipped** |
| Visual gate          | **24 passed**                           |
| Playwright           | **219 passed (21.7m)**                  |
| Retries              | **0**                                   |
| Flaky                | **0**                                   |

### Off the gates

| Check                      | Result                                                         |
| -------------------------- | -------------------------------------------------------------- |
| Engine fleet (4 platforms) | run **34048549010**, all four legs reported for the first time |
| `npm run engines:lab`      | ✓ every session answered about its own position                |
| Route walk                 | ✓ 13 of 13, zero console errors                                |
| Soak                       | ✓ 10 cycles, heap 97.7 MB, 1 worker, 1 observer, 0 intervals   |

An earlier CI run on `9667a73` (**34048522642**) shows as failed. It was
**cancelled** by the next push to `master`, at test 44 of 219, with its other
three jobs already green — not a test failure. Run 34048809600 covers the same
code.

This report is a documentation-only commit on top of that run. Nothing in it
touches the code those jobs verified.
