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
recorded below, in §6.

## 6. Session close — audit, fixes and section A

The session's first agent ran out of context after committing both features
(`3bd684e`), before the milestone gates, the push or this section. The closing
pass re-ran everything rather than trusting the notes above, and found four
defects — one of them had kept the public web application three phases behind.

### 6.1 What was found and fixed

| Commit    | Defect                                                                                                                                                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8ef7caf` | _Positions you spent longest on_ printed `across N game(s)` from the number of thinks, so a repeated position counted its game twice. Rows now carry `gameCount`. New test; replacing the distinct count with the occurrence count fails it (`expected 2 to be 1`).                                |
| `de7732a` | Three specs clicked `getByRole('link', { name: 'Games' })`, which since `17db004` also matches _Similar games_; strict mode refused the click. `exact: true`.                                                                                                                                      |
| `0435d55` | The round brief's _What they play_ printed a title and a bare dash when the dossier held no games for that colour. It now says which input was missing. New unit test fails against the old condition. The browser spec that should have caught it now reaches the folded header action.           |
| `f596853` | `.gitignore`'s unanchored `coverage` hid `src/features/coverage/CoveragePanel.tsx` (Phase 76). Every local gate passed; every clean checkout failed with _Module not found_. Production deploys of `e8ca15d`, `ea0c6a8` and `0435d55` failed, and kingfisherchess.app served `9c39de0` until this. |
| `9c7e1b7` | `docs:check` check 19, `source:no-ignored-files`, refuses an untracked, ignored code file under the source trees. The unanchored rule plus a new file under it fails the check (344/345, exit 1).                                                                                                  |

A mutation of my own on the recurring reader: removing the dedup in both
`keepEarliest` and `recordFact` failed three of the five tests. Removing it from
`keepEarliest` alone fails nothing, because `recordFact` dedups again. The guard
is real, but it lives in `recordFact`.

### 6.2 Section A, at `0435d55` (application code), then `9c7e1b7`

```text
npm run typecheck        exit 0
npm run lint             exit 0
npm run format:check     All matched files use Prettier code style!
npm test                 295 files, 3412 passed, 0 skipped
npm run docs:check       344/344 at 0435d55; 345/345 at 9c7e1b7 (check 19 added)
git diff --check         exit 0
clean clone of f596853:  npm ci && npm run build   exit 0
npm run test:e2e         336 tests: 334 passed, 2 failed (20.5 min, retries 0)
```

The two browser failures, stated rather than hidden:

- `e2e/daily-session.spec.ts:13` — the Phase 78 seed-then-route wait. The
  session prompt names it the next clean-up and keeps it out of scope. It also
  failed in the earlier full run.
- `e2e/visual.spec.ts:240` _preparation renders to the documented viewport_ —
  `page.goto: Target page, context or browser has been closed` during
  navigation, with no assertion and no timeout. It passed in the first full run
  of this session. `npx playwright test e2e/visual.spec.ts -g preparation
--repeat-each=5` then passed 10 of 10. It is recorded as an unexplained
  browser closure that did not reproduce. It is not recorded as green.

So step 7 (`0 failed`) is **not** met. The first full run, at `8ef7caf`, had 5
failures: the daily spec plus the four fixed in `de7732a` and `0435d55`.

Step 8 (`public:check`) does not apply: no public page, claim or URL changed.

Steps 9–11: pushed; `deploy:status` →
`kingfisherchess.app: up to date (9c7e1b7)`. In the in-app browser,
`https://kingfisherchess.app/season` rendered the named-set picker (with no
games in that profile, it reads `No games match "Last 90 days".`), and
`/review` → Improvement showed _Recurring facts_ asking for profile aliases.

### 6.3 The five answers

1. **Same source?** No. The web serves `9c7e1b7`. The public Mac build is 1.2.6,
   build 714, commit `6281e03`. Phases 75–80 and the fixes above are
   Mac-facing and recorded in the parity record's _Published revision check_.
   Section B is due before the next Mac release. As the session prompt
   requires, it was not run: no version bump, no notarisation.
2. **Documents accurate?** `docs:check` 345/345. The CHANGELOG has the brief fix,
   the parity record has this close, and the design documents describe the
   shipped behaviour.
3. **Vercel latest commit?** Yes: `up to date (9c7e1b7)`. The handover
   commit that follows changes only `docs/`, which the build scope skips.
4. **Landing/install version, build, filename, hash =
   `macos-download.json`?** Yes, as far as `docs:check` asserts it: 1.2.6,
   build 714, `Kingfisher-1.2.6-arm64.dmg`, `67921938…66b3`. The live landing
   was not re-read byte for byte in this pass.
5. **GitHub DMG = descriptor?** `gh release view --json tagName` →
   `v1.2.6`, published `2026-09-20T19:21:54Z`, as the descriptor states.
   `desktop:public:verify` was not run: there was no Mac release this session.

### 6.4 What remains

- `e2e/daily-session.spec.ts` — the Phase 78 follow-up, still open.
- Section B for the next Mac release (1.2.7 or later): everything since build 714. Include the clean-checkout lesson: build from a clean tree.
- §6 "Later — leading" of the market research: the overnight tree next, then
  the importers, the academy's morning, the landing comparison, the remote
  companion and the structured tournament brief. Each needs its design first.
