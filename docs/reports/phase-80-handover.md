# Phase 80 handover — recurring facts, with every game behind them

Phase 80 completes the second half of the season and recurring-facts session.
Review → Improvement now answers four repeatable questions from records
Kingfisher already has. It adds no schema, classifier, player score or authored
store.

## 1. The reader and its rules

`src/recurring/recurring.ts` is pure. It identifies the player only through
exact profile aliases and emits four row sets:

- stored before/after engine evidence from one job and engine, signed from the
  player's colour and filtered by an inclusive centipawn threshold;
- deterministic pawn skeletons in at least five unique games whose W/L/D score
  is below 50%;
- player-authored endgame categories reached through canonical positions, with
  a below-50% record;
- position-keyed repertoire entries reached while the player had that
  repertoire's colour, also below 50%.

Every row has at least one game. A game counts once per row and W/L/D sums to
the visible denominator. Position questions use `positionKey`, so different
move orders meet.

## 2. Data and UI

`useRecurringFacts` walks the complete game-summary index in 1,000-row pages,
filters the selected Improvement period and exact profile aliases, then reads
only those full games.
Independent endgame and repertoire reads run beside the summary scan; engine
evidence is fetched in batches of 50 games. `indexGame` derives the exact same
structure records the importer stores.

The four sections appear above the existing authored-theme summary. The engine
threshold offers 0.5, 1.0, 1.5 and 2.0 pawns. Every emitted row shows W/L/D,
the unique-game count and buttons for its backing games. Position rows open the
position page, endgame rows open `/endgame` with the category selected, and a
game opens on the board at the recorded ply.

## 3. Tests that can fail

`src/recurring/recurring.test.ts` pins the 100-centipawn inclusive boundary,
Black score sign, same-job/same-engine evidence pairing, unique-game
denominators, the five-game pawn-structure floor, canonical endgame joins and
repertoire colour. Changing the implementation comparison from `<` to `<=`
made the exact-boundary test and latest-pair test fail; restoring it returned
all five tests to green.

`e2e/recurring-mistakes.spec.ts` imports five games, stores an engine pair,
saves a repertoire position and an endgame category, and then exercises all
four sections in Chrome. It changes the engine threshold, opens a backing game
at the move and separately verifies the endgame category deep link.

## 4. Focused evidence

```text
npm test -- --run src/recurring/recurring.test.ts src/features/review/queries.test.ts
  2 files passed; 6 tests passed

npm run typecheck
  exit 0

npx playwright test e2e/recurring-mistakes.spec.ts --project=chrome
  2 passed (5.7s), one worker, zero retries
```

## 5. Release state

This is shared Next.js application code and is Mac-facing. The public Mac
1.2.6 build is behind `master`; `docs/product/platform-parity.md` records it.
The session excludes a version bump, Mac release and notarisation, so section B
remains due before the next Mac release.

The complete section-A evidence, pushed commit and web deployment identity are
recorded at the end of this file after the final gate.
