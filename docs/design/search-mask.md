# The search mask — your games, asked the questions ChessBase users ask

_Design, 2026-09-23 (Phase 81). The first item of "Next — parity after
ChessBase 26" in `docs/product/market-research.md` §6. The record of what
shipped is at the end._

## 1. Research

What people do with a chess database every day is **search it**, and the
research names the failure from both sides:

- "Difficult to organize, and almost impossible to search" (Solon, §3.2);
  "Find player" returning the same result whatever you ask (ChessBase 17
  and 18, §3.1).
- ChessBase's answer is the _search mask_: one dialog with a header page
  (players, event, site, date, Elo, result, ECO), a position page, a
  material page, a manoeuvre page (a piece's route, with its starting
  square), an annotation page (text in comments) and, since 18, thirty
  strategic themes [ChessBase help, "Search mask – Manoeuvres";
  "Search for strategic topics with ChessBase 18"]. CB26 added
  time-control filters, and its own reviewer found blitz games showing up
  in a search that excluded them, because the games were misclassified
  [CB26-Review].
- Lichess study search "misses exact titles"; its studies cannot be
  searched across (§3.2). En Croissant has header search and position
  search, and nothing move-level.

Kingfisher already answers the **position** question better than any of
them (`/position`, `/similar`: exact position, pawn skeleton, structure
claims, every store), and that is not repeated here. What is missing is
everything else on the mask. A code audit on 2026-09-23 found:

| ChessBase mask page     | Kingfisher today                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Header                  | player, colour, result, min Elo, from year, ECO, free text. No event, no Elo ceiling, no date range. |
| Time control (CB26)     | Raw tag stored; never classified; not filterable.                                                    |
| Material                | Only the current board's material _difference_, on `/similar`. Nothing typed; no "R v R".            |
| Manoeuvre               | A typed move sequence becomes a position search. No piece route.                                     |
| Annotations             | Study chapter comments are searchable; comments inside games are not.                                |
| Strategic themes (CB18) | 16 themes with written definitions, indexed per position at import; no page asks for them.           |

## 2. Decisions

**The Games route's Filters panel becomes the mask.** It is where the
header filters already are, and saved and recent filters already persist
there. A second search surface would be a second place to look, and the
research complaint is about not finding things. The panel grows sections;
the table stays where it is.

**Header filters are exact about what they compare.**

- _Event_ and _site_: case-insensitive substring. Unlike _player_, which
  is a whole normalised name, an event name is a phrase the person half
  remembers ("Olympiad").
- _Date range_: from and to as dates. A game with a full date is compared
  by date; a game that has only a year counts when its year falls inside
  the range. A game with no date matches no date range. It is never
  assumed to be in it.
- _Elo_: a minimum and a maximum, and a scope, **either player** (the
  existing meaning of min Elo) or **both players**. A game with a missing
  rating cannot satisfy "both".

**Time control is a visible rule, not a guess.** The class is computed
from the `TimeControl` tag with Lichess's published formula: estimated
duration = base seconds + 40 × increment:
under 30 s ultrabullet, under 180 s bullet, under 480 s blitz, under
1,500 s rapid, otherwise classical. `1/N` (one move per N seconds,
Chess.com Daily) is **correspondence**. A multi-period control
(`40/5400+30:1800+30`) is classified by its first period. `-` is **no
time control**, which is what the file says. A missing or unreadable tag
is **unknown**. An unknown game is never put in a class. The rule is
printed under the control, so a surprising result can be traced to its
tag. This is exactly the failure CB26's reviewer found; the defence is
that the rule is one pure function with a test per branch.

**Move-level questions read the moves, and say how many they read.**
Material, route, theme and comment filters cannot be answered from the
game summary. They run over the games the header filters selected: the
summaries first, cheaply, then each selected game's moves, in batches,
with a progress line ("Read 3,120 of 10,442 games") and a Stop button.
The result says how many games were read and how many matched. A stopped
search keeps the matches it had found and says it was stopped. It never
shows a partial count as a total.

- **Material**: typed as ChessBase and books write it: `R v B`,
  `Q v RR`, `RB v R`, `N v P`. Kings are implied. Pawns are ignored by
  default, or taken exactly (`RPP v R`) when the query names them. The
  query is symmetric: `R v B` finds White's rook against Black's bishop
  and the reverse, unless a colour is chosen. It must **hold for two
  consecutive positions**, so a capture that is recaptured next move is
  not a material balance anyone would search for (ChessBase uses a
  similar minimum; ours is stated).
- **Theme**: one of the sixteen strategic themes in `src/chess/themes.ts`,
  with its definition shown beside the choice. Held for two positions, for
  the same reason.
- **Route**: a piece letter and at least two squares, `N f3 d2 f1 g3` or
  `Nf3-d2-f1-g3`. It matches when one piece of that type makes exactly those
  moves, in order. Other pieces may move in between, and the piece may wait,
  but it may not make another move in the middle of the route. The piece is
  followed by its square, so a capture on its square ends the trail. Either
  colour, unless one is chosen.
- **Comment**: case-insensitive text in any comment on the game's main
  line or its variations.

Each match records **where**: the ply of the first position that satisfied
it. The row opens the game at that move. That is the part of ChessBase's
mask people praise: the search takes you to the moment, not to move one.

**Collections in the companion answer only what their columns can.** The
companion's SQLite table has event, site, date, year and both ratings, so
those header filters extend its SQL. It has no time-control column and
reads movetext only as PGN. So the time-control and move-level filters are
**refused by name** for a companion collection ("This collection is
searched by its headers; time control and move filters need the games in
Kingfisher's own store"). Until now, a query field a backend did not know
was silently ignored, which returns too many games and no error. The
backend now refuses any field it cannot honour.

**Nothing new is stored.** No schema change, no derived store and no
backfill in this phase. The move-level scan is a pure function over the
tree the game already has, and the benchmark decides whether that stays
true: the target is 10,000 games read in under 10 seconds on the
reference machine, and if the benchmark misses it, the next step is a
derived per-game index, recorded in the benchmark rather than assumed.

## 3. Design

### 3.1 Modules

- `src/search/time-control.ts` — `classifyTimeControl(tag) → TimeClass`,
  pure, one test per branch. `TIME_CLASS_RULE` is the sentence the UI
  prints.
- `src/search/material-query.ts` — `parseMaterialQuery(text)` returns a
  query or an error that names the token it could not read.
  `materialMatches(board, query, colour?)` is pure.
- `src/search/route.ts` — `parseRoute(text)`, and `findRoute(moves, route,
colour?)` over a list of `{ ply, uci, fenBefore }`.
- `src/search/game-scan.ts` — `scanGame(tree, deepQuery) → { ply } | null`.
  It walks the main line, and variations for comments only, applying every
  deep predicate. A game matches when **every** filter matches somewhere in
  it; the ply reported is the latest of the first plies at which each filter
  matched. With one filter, that is the moment it happened.
- `src/persistence/types.ts` — `GameSearchQuery` gains `event`, `site`,
  `fromDate`, `toDate`, `maxRating`, `ratingScope`, `timeClass`.
  `planQuery` counts them as predicates, so an inexact plan still tests
  them. `matchesSearch` implements them.
- `GameRepository.readContents(ids)` — batched reads of the content store,
  used by the scan.
- `src/features/games/deep-search.ts` — the loop: page through the header
  search in 1,000-row pages, read contents in batches of 100, `scanGame`
  each, report progress, honour an `AbortSignal`.
- `src/database/collections/sqlite.ts` and `companion/src/database.mjs` —
  event, site, date range, max rating and rating scope in SQL. An
  `UnsupportedQueryError` names the fields the backend cannot answer.

### 3.2 The panel

Sections, in the order a person narrows:

1. **Players and event**: free text, player and colour, event, site.
2. **Date and rating**: from and to dates, Elo minimum and maximum,
   either or both.
3. **Result, opening and time control**: result, ECO or opening name,
   time class with its rule printed underneath.
4. **In the moves**: material, theme (with definition), route, comment.
   The section's header says that these read each game's moves.

A row found by a move filter shows a **Found** column ("after White's move
34"). Clicking the row opens the game at that ply. Saved filters carry the
header fields; move filters are not saved, because a move search runs only
when asked. A saved filter from before this phase still loads: its _from
year_ becomes the first of January of that year.

### 3.3 Out of scope

- Position and structure search (they have `/position` and `/similar`).
- Engine-evidence search ("where I blundered") is Recurring facts, Phase 80.
- Medals, annotators, and searching reference packs. Packs aggregate by
  position and keep no games' moves beyond their bounded samples.
- A derived per-game index, unless the benchmark requires one.

## 4. Tests that must be able to fail

- Time control: one case per class, the boundaries (179/180, 479/480,
  1,499/1,500), `1/86400` → correspondence, multi-period → first period,
  `-` → none, missing → unknown.
- Material: `R v B` matches either colour, and with a colour only that
  one; pawns ignored unless named; a one-position transient does not
  match; a malformed query names its token.
- Route: a route with a pause matches; another move by the same piece
  breaks it; a capture of the piece ends it; the same squares walked by a
  different piece type do not match.
- Header: a year-only game inside a date range matches, a dateless one
  does not; "both players" rejects a missing rating; an inexact plan
  still applies every new predicate (the regression ADR 0014 names).
- Companion: a time-class or move-level query against a SQLite
  collection throws `UnsupportedQueryError`, and an unknown field throws.
- Browser: import a handful of games, search each section, stop a scan
  mid-way, open a result at its move.

## 5. What shipped (Phase 81, 2026-09-23)

- `src/search/`: `time-control.ts`, `material-query.ts`, `route.ts` and
  `game-scan.ts`, 41 unit tests. Mutations run: accepting a one-position
  balance fails the transient test; dropping the capture rule fails the
  route capture test.
- `GameSearchQuery` gains event, site, fromDate, toDate, maxRating,
  ratingScope and timeClass. `planQuery` counts all of them. Removing
  `timeClass` from the count fails two repository tests.
- The companion implements the header fields in SQL and refuses anything
  else with `UnsupportedQueryError`. Removing the refusal fails its test.
  `sqliteQuery` refuses `timeClass` before a transfer.
- `features/games/deep-search.ts` (3 tests) and `SearchMask.tsx`. The
  Games Filters panel replaced _From year_ with a date range. The panel
  scrolls within half a phone screen, so results stay in view.
- Measured: 0.034 ms/game for material, 0.029 route, 0.184 theme and
  0.010 comment, on 80-ply games generated through Kingfisher's rules
  (`src/performance/move-search.test.ts`). No index was needed.
- `e2e/search-mask.spec.ts`, 3 tests: header filters, the time-class rule,
  route and material searches with their denominators, a result opened at
  its move, a malformed route named, a stale result retired, a theme's
  definition and a comment found. Showing a stale result fails the
  "changed filter" step.
