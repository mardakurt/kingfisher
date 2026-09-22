# Phase 79 handover — the season, with every denominator named

Phase 79 turns the single-game clock reading in _After the round_ into a
named-set report at `/season`. It started in commit `b2ec65a`; the completion
pass below corrected the parts that did not yet match
`docs/operations/next-session-prompt.md` and added the missing browser and
documentation evidence.

## 1. The reader

- `src/season/season.ts` reads full `GameRecord[]` and one named-set predicate.
  Opening is through move 12; endgame starts at move 30. Think time belongs to
  the position before the player's move. The top-position occurrence reports
  the move that followed, result and the stored before/after evaluation when
  the game tree has both.
- The slow-opening row reads the player's clock exactly after move 15. It is
  grouped by ECO and player colour, carries W/L/D and opens Preparation with
  that exact player, colour and ECO.
- Clock sections state how many games in the named set had clock evidence.
  Time-trouble rows use that same denominator at moves 30, 35 and 40.
- `src/season/named-set.ts` supports last 30/90/180/365 days, exact event,
  exact site and exact ECO. A multi-source set is refused until the player
  enables comparison. The result remains one source block per OTB, Lichess,
  Chess.com or other source; populations are never merged.

## 2. Route and audit trail

- The navigation rail and command palette both open `/season`; the selection
  is in the URL. `mixed=1` now round-trips across reloads.
- Each of the five sections has a small audit line. `useSeasonLog` stores only
  the canonical URL, five hashes per source and dates. When one section's
  facts change, that section receives a new date without turning the log into
  a second game database.
- The slow-opening link extends `/preparation`'s existing query input with
  `side` and `eco`; it does not add a new dossier.

## 3. Tests that can fail

`src/season/season.test.ts` has 19 reader tests. A deliberate mutation changed the
opening comparison from `<=` to `<`; the boundary test failed with 11 opening
moves and 18 middlegame moves instead of 12 and 17. Restoring the implementation
returned all 19 tests to green.

`use-season-games.test.ts` pins the complete-database read: the loader walks
successive 1,000-row metadata pages before fetching the full records. A bare
repository search would silently stop at its default 100 rows.

`e2e/season.spec.ts` seeds a three-game OTB event and walks the five sections.
Its second test starts from a refused OTB/Lichess event, enables _All sources,
shown separately_, verifies two one-game source blocks, reloads and verifies
the URL choice remains active.

## 4. Evidence at the feature boundary

```text
npm test -- --run src/season/season.test.ts src/features/season/use-season-games.test.ts
  2 files passed; 20 tests passed

npm run typecheck
  exit 0

npx playwright test e2e/season.spec.ts --project=chrome
  2 passed (10.3s), one worker, zero retries
```

The first Playwright invocation used the nonexistent project name `chromium`
and was rejected before any test ran; the committed configuration names the
project `chrome`, which is the passing command above.

The complete section-A gates and full browser suite are intentionally deferred
until Phase 80 in the same session, as the prompt requires one milestone run at
the end rather than a full matrix per feature.

## 5. Release state

This changes shared application code and is Mac-facing. The public Mac 1.2.6
build is behind `master`; `docs/product/platform-parity.md` records it. The
session explicitly excludes a version bump, Mac release and notarisation, so
section B is due before the next Mac release and was not run here.
