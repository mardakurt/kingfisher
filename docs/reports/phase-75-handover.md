# Phase 75 handover — closing the gap: the round, the reach, the search

The owner's direction on 2026-09-21: become the ChessBase of this era —
first close the gaps, then lead; build for the tournament player who is
not a professional; research the market like the next incumbent would.
Three features were named from that research and built the same day, in
order, from `1926608` (the 1.2.6 release, Phase 74 handover): After the
round, Played against you, and search across all of a player's own work.
The research is `docs/product/market-research.md`; the parity list is its
§6.

## 1. Orientation

`git status` clean, `HEAD` = `origin/master` = `1926608`, on `master`. The
1.2.6 release closed in Phase 74 §6–7; nothing uncommitted. Gates re-run
before editing (typecheck, lint, format, 3,172 unit tests, `docs:check`
344/344, Node 24).

What already existed, and shaped the work: `runGameReview` (a whole-game
engine pass) with no UI consumer; the background analysis queue and
Review's `suggestReviewCandidates`; `findDeviation`; `[%clk]`/`[%emt]` on
every node and `src/chess/clock.ts`; `buildReviewSession` accepting
`population` and `opponent` ordering that the dialog never supplied;
`searchByPosition` reading nine stores but not studies; pawn-skeleton keys
and `searchStructures` for games. Most of the phase is joining these.

## 2. After the round (`96b5da7`)

- `src/round/clock.ts` — think times per move from `[%emt]` or successive
  clock readings plus the increment; three longest; last reading; the
  first move under a third of the control (`isTimeTrouble`, unchanged: it
  declines the label under a 30 s increment). `available: false` when the
  game has no clock commands; never zeros.
- `src/chess/clock.ts` — `parseTimeControlTag` reads the over-the-board
  `40/5400+30:1800+30` form (first period, `periodMoves`), which it used to
  refuse as ambiguous. The moves/seconds test was inverted accordingly.
- `src/round/identity.ts` — which side you played, from the profile's
  aliases matched with the games index's key (`playerKey`: case and
  whitespace only). A looser match was tried and reverted: it said "you
  played White" over counts that said 0 (§3), and the product's rule is
  that Kingfisher never guesses which player is you. The panel names the
  exact spelling to add.
- Journal store: `JournalEntryRecord`, schema **v19**, unique `fingerprint`
  index, `updatedAt` index; `LocalJournalRepository` (write with expected
  revision, `StaleJournalWriteError`); in `PORTABLE_STORES` with the
  completeness fixture; v18→v19 historical migration test; validation.
- `src/features/round/AfterRoundPanel.tsx` — dock tool `after-round` on
  Analysis, Games and Review: identity, repertoire deviation with who left
  it, clock, engine (Queue this game → the existing dialog; Send positions
  to review → `suggest-for-game.ts`, extracted from the Review button so
  both produce identical items), the learning point. `RoundsJournal.tsx` —
  Review → **Rounds**, grouped by event, opens the game.
- `e2e/after-round.spec.ts` (2 tests): the whole evening, including the
  queue run and the 3.Qh5 swing landing in the review queue.

## 3. Played against you (`56980fe`)

- `src/repertoire/reach.ts` — `rankByReach` (own games, then population
  share, then depth) and `neverReached` (own = 0 and share < `RARE_SHARE`
  0.5%, deepest first; uncounted rows are unknown, not never).
- `src/repertoire/review.ts` — a `reached` reason ("reached in 7 of your 40
  games"), weight 3, from a new `own` input.
- `src/features/repertoire/reach.ts` — the hook: own counts via
  `games.explore(fen, {player, playerColor})` per alias (or every local
  game, and it says so, when no alias is set); reference via the provider
  at each position over its root; bounded concurrency 4; cached by
  repertoire, source and aliases.
- `PlayedAgainstYouPanel.tsx` in the Repertoire context panel; the review
  dialog reads the same hook (Starter) and states its ordering. No
  rating-band control: the pack provider serves its population as-is
  whatever the filter says (`remote-reference.ts` ignores `filters`), so
  each pack is its band and is named. `SOURCES` moved to `sources.ts`.
- `e2e/repertoire-reach.spec.ts`: 22-ply Spanish file, three games; "2 of
  your games"; the Chigorin at d21 never reached and under 0.5% of Starter.

## 4. Search everything (`dacf999`)

- `searchByPosition` walks every node of every chapter and every hand-in's
  PGN; hits carry `nodeId`, `parentId` and where ("at 2.Nf3", "hand-in by
  Ana"); a second list `structure` — same pawn skeleton, not the position —
  over chapters, hand-ins and repertoire positions.
- The palette opens a hit where it was found: `/studies?study=&chapter=&node=`
  (Studies now reads `useSearchParams`, with the Suspense boundary the
  training page documents), `/team?team=&assignment=`, a stored game at
  its ply. Known position? gains a Same pawns row.
- `e2e/position-search.spec.ts`: the position only in a chapter sideline;
  found, opened at the move with Black to play; the same-pawns chapter
  under its own heading.

## 5. Verification — `docs/operations/after-a-fix.md`, section A

```
A1–3 typecheck, lint, format:check       clean
A4   npm test                            270 files, 3197 passed, 0 skipped
     test:no-skips                        OK
A5   docs:check                          344/344
A6   git diff --check                    clean
A7   test:e2e                            318 passed (18.8 m), 0 failed, 0 flaky
     build                               exit 0, 34/34 pages
     benchmark                           client JS 4,079.6 kB across 114 files
```

Each new browser spec was run alone first (after-round 2, repertoire-reach
1, position-search 1, all passed). The first full run failed one test,
`team.spec.ts`, deterministically: the header's action row was painted
unfolded for ~115 ms after "ready" on a route that now mounts under a
Suspense boundary (probed: unfolded at 26 ms, folded at 141 ms). Fixed by
not painting the row until its fold is measured (`2003784`); the second
full run then failed six specs on `/repertoire`, where the frame already
knew its room, folded on the first render, and the folded actions —
never drawn — never got a width, so "measured" never held; fixed by
measuring over the drawn buttons only (`e7c7aa3`). The same run also lost
`soak.spec.ts` to `ENOENT` on its own trace files, caused by a probe I ran
concurrently — my error, not the product's. The third run, clean, is the
number above.

## 6. Remaining concerns

- The Mac 1.2.6 is behind `master` by everything in this phase; it is
  Mac-facing (`platform-parity.md`, Phase 75 entry) and section B has not
  been run.
- `RepertoireWorkspace` still reads `?repertoire=` in a `useState`
  initialiser, so a palette hit for a repertoire from within `/repertoire`
  does not switch; Studies and Team were converted, Repertoire was not.
- The reach counts are recomputed per source; a repertoire of several
  hundred positions against a remote pack takes seconds and shows
  "Counting…" until done — no progressive fill as the coverage panel has.
- The parity list (`market-research.md` §6) is the owner's queue; nothing
  from it was started.
