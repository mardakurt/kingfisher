# The query model — one question, one meaning, one executor

_Design and record, 2026-09-26 (Phase 86). P0.2 of the parity program
(`docs/product/parity-ledger.md`). What shipped is at the end, with what did
not._

## The problem

Every search surface built its own request: the Library's header filters
(`GameSearchQuery`), its move-level mask (`DeepQuery`), the position search,
the explorer's filters. Each could only AND its own fields; none could be
saved whole; and nothing could check that two of them meant the same thing
by the same words.

## The model

`src/database/query/`:

- **`ast.ts`** — a `GameQuery` is a tree of predicates under `and`, `or` and
  `not`: text, player (whole name, optional colour), result, year, date
  (year-only dates count by their year), rating (either/both), rating
  difference, event, site, time class, opening, ECO prefix, the canonical
  position (`positionKey()`, so transpositions meet; main line or variations
  too), material, theme, piece route, comment text and annotation symbol.
  `parseQuery` validates a query from anywhere untrusted and refuses one that
  cannot mean anything, in words. `describeQuery` says it in words and lists
  what it leaves out for want of a field (unknown is not zero).
- **`evaluate.ts`** — the oracle. A header predicate is decided by
  `matchesGameSearch` (`persistence/game-match.ts`, now shared with the local
  repository), a move predicate by `scanGame`, so every predicate means here
  exactly what it means to the store and to the move search.
- **`plan.ts`** — the top-level conjunction's index-backed header predicates
  are pushed down to the store, one per field; everything else is the
  residual, evaluated exactly per selected game.
- **`execute.ts`** — the pushdown selects, each selected game is decided (by
  its summary, or by reading its moves), in batches, cancellable; it reports
  the denominator, what it read and what it found.

## Proof

`src/database/query/query.test.ts`: games imported into the real local
repository; **300 seeded random queries** of every predicate kind under
`and`/`or`/`not` run by the executor and compared with evaluating every game
— identical for all 300, with more than 60 non-empty and more than 60 reading
moves so the equality is not vacuous. The test fails with the planner
dropping the rating scope, the planner overwriting a field already pushed,
and the executor skipping the residual (each shown, then restored). Before
the Library's move search was moved onto the executor, the two were compared
on four mask queries: the same games and the same moments.

## What uses it now

- The Library's move search (`runDeepSearch`) runs through the executor.
- **Saved queries**: the whole question — header and moves — saved in the
  `savedQueries` store (schema v22, in `PORTABLE_STORES`). Run it: "N of M
  games read match"; run it again after an import: "Since <date>: n new,
  m gone". A query that is a plain conjunction goes back into the mask.
  The saved filters of earlier versions (header only, in localStorage, in no
  backup) are carried into the store the first time it is listed.
  `e2e/saved-queries.spec.ts`.

## Not yet

- A structured editor for `or`/`not` queries in the interface; they are
  saved, described and run, but built programmatically.
- Companion collections: saved queries run over My games; a companion's
  header search and line-index move search are not yet driven by the plan.
- Position, Preparation, reports and the repertoire scan still issue their
  own requests.
- An authored-work index (studies, Team, notes) and full-text search inside
  variations at scale.
