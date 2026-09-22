# The season — what your last N games add up to

> Research → decisions → design. The format is the one `team-hub.md` and
> `position-page.md` established. The brief is §6 "Later — leading" of
> `docs/product/market-research.md`, where the prompt for this phase names
> the gap.

## 1. Research

§3 of the market research is the place the player lives. Three
complaints sit behind this design.

- **Time management** — §3.4 and §3.5 of the research, with Aimchess as
  the named benchmark (§3.6; "Time Management" is the only feature of
  Aimchess reviewers name in isolation). The After the round panel reads
  one game's clock; what the player wants is the time trouble across the
  last twenty games, because one slow move is a fact and a habit is a
  complaint.
  [Aimchess review](https://thechessadvisor.com/website-review/aimchess/).
- **"How many times I made a particular mistake"** — `Lichess-Weak`,
  `64Squares`. The recurrency is the part: a single move is a fact, a
  recurring position is a complaint the player can act on.
  [Lichess — how do I analyse my opening weaknesses?](https://lichess.org/forum/game-analysis/how-do-i-analyse-my-opening-weaknesses).
- **The named set, not the bucket** — the player's complaint is not "my
  OTB games" plus "my Lichess games" in one chart. §3.3's "Reviewing
  opening lines that never actually get played" is a complaint about a
  population that was merged; §3.7 (OTB capture) and §3.2 (study
  organisation) are both about sets that lose their identity when they
  are mixed. A season reader that adds OTB to Lichess to Chess.com in
  one bar chart has answered nothing.
  [Solon — how I store my opening files](https://www.zwischenzug.gg/p/how-i-store-my-opening-files);
  [Digitize OTB Games with ChessCam](https://lichess.org/@/BlindfoldBlunderer/blog/digitize-otb-games-with-chesscam/6qtmsoNA).

These accounts support a season reader that joins a named set of games
with denominators on every section and never merges populations. They
do not establish that no other tool has this; we make no exclusivity
claim.

## 2. Decisions

- The season is a `/season` route, not a tab in Review. A route keeps
  the named-set picker first-class; Review already has its Improvement
  tab to extend (the recurring-mistakes feature is the one that goes
  there). The two features are joined at the store level (the engine
  evidence store, the structure keys) but live in different workspaces
  by design — a season reader answers one question at a time and the
  reader's first sentence is the named set's name.
- A named set is one of:
  - **Last N days** — the last 30, 90, 180 or 365 days of games where
    the player was one of the players (`whiteKey` or `blackKey` matches
    a profile alias through `nameKey`, the same rule `round/identity`
    uses).
  - **An event** — `GameRecord.event` (string, exact match,
    not a tag the player cannot reach by name). The player picks from
    a list of events that exist in their games; typing one in is a
    search-and-select, never free-form creation.
  - **A site** — `GameRecord.site`, same rule. "Lichess",
    "Chess.com", "OTB" (the player types OTB once as a convention and
    the workspace remembers it as a fact).
  - **An ECO / opening** — `GameRecord.eco` or the player-
    facing opening name, exact match. Same picker as `Event` — pick
    from a list of openings that exist in the games, never free-form.

    Tags on games are not in scope for v1. Games carry `Study` and
    `Chapter` tags (Phase 76), but no tag store on the game itself;
    a season by tag is a join through chapters and is a future
    feature. The named-set predicate accepts the four kinds listed
    here and refuses others at the type level.
- OTB, Lichess and Chess.com games are never merged. A season
  computed across all three is three seasons; the picker shows three
  rows, each with its own denominator, and the headline says so in
  words.
- The phase thresholds (opening / middlegame / endgame) and the
  time-trouble threshold (under 30 s remaining on the move's clock)
  are explicit reader options. The defaults are move 12 / move 30
  and 30 seconds. No Settings control is added in this phase; the
  defaults live beside the reader and tests pin them.
- A trend line with no historical seasons is not a trend; it is one
  period. Each section carries a short audit line: the first view says
  `First season for this set`; later views say when the current section
  reading first appeared. A changed section starts a new date. The
  section never invents a direction.
- The reader is pure: `season.ts` reads `readonly GameRecord[]` and
  a named-set predicate, and returns the five sections. Tests fail
  when a game is double-counted across sections, when the
  denominators disagree, when the time-trouble threshold is silently
  crossed, and when the OTB and Lichess games are merged into one
  bucket.

## 3. Design

### 3.1 The route

`/season` — same `AppShell` and `WorkspaceFrame` as every other
workspace, with its own header. The named-set picker is the only
control in the header; the URL carries the picked set as `?set=`,
`?event=`, `?site=` or `?opening=`, so a season can be linked and
reloaded. The picker is a `Segmented` of the four kinds, then a
single-line select showing the matching sets in alphabetical order.

### 3.2 The five sections, in order

1. **Per phase** — total think time and average think time per move
   for the named set, broken into opening / middlegame / endgame by
   move number. Each phase row says `Xm thinking across Y moves,
Zaverage per move (Y of your N games this season)`. Missing clock
   data is shown as `Z of your N games had no clock` rather than
   rolled in as zeros.
2. **Per move number** — a sparkline of average think time per move
   over the named set, with the bars highlighted when at least one
   game was under the time-trouble threshold (default 30 s) on that
   move. The hover shows the count and the game labels; the heading
   says `Average think time per move, by move number` and `Bars
highlighted: at least one game was under 30 s on this move`.
3. **The positions you spent longest on** — top N (default 5) by
   total think time across the named set, position-keyed so a
   position reached by transposition meets at the same row. Each row
   says `X minutes across Y games, first reached on move Z, last
reached on move Z'` and shows the follow-up move, eval change and
   result for each occurrence. The row opens the position page
   (Phase 77) at the position.
4. **Time trouble per event** — how many games in the named set had
   the player under threshold on move 30 / 35 / 40, with the same
   denominator surfaced in words: `4 of your 18 games this season`.
   When the set is itself an event, this section collapses to
   `4 of 18` and the heading drops the per-event frame.
5. **Your slowest openings** — openings where the average clock
   after move 15 was the lowest; each row says `After 15 moves,
average clock X·Y, in Z games (W wins, L losses, D draws)` and
   opens the existing Preparation dossier for the player's exact
   profile name, colour and ECO.

A section may be empty. The empty state names what the player would
need to add to make it non-empty, the same way the daily session's
empty states do.

### 3.3 The "First seen" line

Each section carries one short line that points to when the current
reading first appeared. Each viewed report records five hashes per
source in the persisted `useSeasonLog` store, with the set URL and
timestamp. If one section changes, only that section's date resets.

When there is no earlier season for the same set, the line says
`First season for this set` — a fact, not a direction. The reader
never computes a trend from two data points.

### 3.4 What is **not** in scope, and is named so the next leap is

clear

- A bar chart of "accuracy by opening". §3.4 and §3.5 list the labels
  the player distrusts; a chart whose categories are openings and whose
  values are invented scores is in the same complaint file. The
  "slowest openings" section is therefore not a chart of accuracy; it
  is the average clock after move 15, with wins / losses / draws in
  the same row.
- A merge of OTB and Lichess and Chess.com games into one season.
  The named-set picker refuses a multi-source set until the player
  enables "All sources, shown separately". The result is still one
  section per source, each with its own denominator.
- A rating chart. The player has ratings per source (the linked
  accounts panel), and a per-source rating line is not the season's
  job. A trend that requires "your OTB rating this month" is a trend
  with one data point a month and is never trustworthy.
- A "you've improved" headline. §5 of the research is explicit on
  this: no invented score, no direction. The reader counts; the
  player reads.

### 3.5 The reader

`src/season/season.ts` is the pure module that builds a season from
the games in the named set. The tests assert:

- A game whose `[%clk]` carries neither a seconds reading nor a
  `[%emt]` is counted in the "no clock" row, not zeroed into the
  phase totals; one mutated fixture (a clock removed) flips a
  passing assertion to fail.
- A phase threshold change moves games between phases; one mutation
  (the opening threshold raised to 14) reorders the rows and the
  test fails.
- The time-trouble highlight on move 30 fires when at least one game
  was under 30 s on that move, not when the **average** was under
  30 s — one mutation (the average replaced with the minimum)
  changes which bars are highlighted, and the test fails.
- The "positions spent longest on" rows are position-keyed: a
  transposition that reaches the same FEN meets at one row, with
  the count summed across the games. One mutation (the positionKey
  flipped to a different value) splits the row into two and the
  test fails.
- The denominators on each section agree: the phase section's
  denominator equals the per-event denominator equals the openings
  section's denominator (it is the same `games.length` minus the
  "no clock" games for the clock sections; the openings section's
  denominator is the count of games that reached that opening). One
  mutation (a game removed from one denominator) breaks agreement
  and the test fails.
- OTB and Lichess games are never merged into one bucket. A season
  set with both kinds produces two seasons or refuses to compute
  one. The mutation: a mixed set passed without `allowMixed: true`
  throws.

### 3.6 The named-set picker

The picker is one control: tabs for the four kinds, then a
single-line select with the matching sets in alphabetical order.
The selection lives in the URL (`?set=90`,
`?event=Club%20Open%202026`, `?site=Lichess`, `?opening=C50`), so a
season can be linked, reloaded and walked back through.

The picker refuses a named set that resolves to zero games with a
readable message in the workspace frame, not a silent empty state:
`No games match "Club Open 2025". The tag exists in your work but
no game carries it.` The empty state names what would change the
result.

### 3.7 What joins to where

- The position page (Phase 77) is the deep-dive for "the positions
  you spent longest on": each row is position-keyed, and the row's
  "Open position page" entry opens `/position?fen=…` with the
  position and the games array as the row's evidence.
- The Preparation dossier is the deep-dive for "your slowest
  openings": each row opens it for the player's exact name, colour
  and ECO through `?player=…&side=…&eco=…`.
- The persisted engine-evidence store is **not** read here — it is the
  recurring-mistakes feature's input, not the season's. The two
  features are designed to be readable independently. If a game tree
  itself already carries evaluations, the longest-position occurrence
  reports the stored before/after scores as part of "what happened next".

### 3.8 The audit trail

Every time a player opens a named set, the workspace writes one
entry to the persisted `useSeasonLog` store with the set's URL, the
timestamp and the section hashes (five per source so a
later visit can answer "did this section change since you last
looked?"). The reader uses the log for the "First seen" line only;
it is never the source of a trend or a count.

## 4. Acceptance criteria

1. A pure module builds the five sections from `readonly GameRecord[]`
   and a named-set predicate; unit tests fail when a game is
   double-counted, when denominators disagree, when the time-trouble
   threshold is silently crossed, when a phase threshold change does
   not move games between phases, when a transposition is split into
   two rows, and when an OTB+Lichess mixed set is computed without
   `allowMixed`.
2. The `/season` route is reachable from the navigation tile, the
   command palette (`Open season`) and the URL (`/season?set=90`).
3. The named-set picker lists the matching sets for each kind in
   alphabetical order; the picker refuses a
   zero-game set with a readable message.
4. Each section shows its denominator in words (`X of your Y games
this season`); the denominators agree across sections.
5. Each section carries a "First seen" line when an earlier season
   exists for the same set, and `First season for this set` when
   it does not.
6. A position reached by transposition meets at one row in
   "the positions you spent longest on"; the row opens the
   position page with the position.
7. An opening row opens the dossier for the colour, scoped to the
   named set when the URL carries `?set=…`.
8. The OTB and Lichess games never appear in the same bucket. The
   player must explicitly toggle "All sources, shown separately" to
   compare them, and each source keeps its own denominator.
9. No invented score, no rating chart, no "you've improved" headline
   is reachable from any string the workspace renders.
10. A browser spec seeds a small named set (one event, three
    games) and walks the five sections; a second spec walks the
    picker and confirms the "All sources" toggle.

## 5. Files

- `src/season/season.ts` — pure module; tests in
  `src/season/season.test.ts`.
- `src/season/named-set.ts` — the named-set predicate model (last
  N days / event / site / ECO opening).
- `src/features/season/SeasonWorkspace.tsx` — workspace frame.
- `src/features/season/SeasonPicker.tsx` — the picker control.
- `src/features/season/SeasonSections.tsx` — the five sections.
- `src/app/season/page.tsx` — route.
- `e2e/season.spec.ts` — browser walk.

## 6. Out of scope (re-stated)

- A streak or rating-gain chart anywhere. Anything that scores an
  attempt by an invented number is in §3.4's complaint file.
- A merge of OTB, Lichess and Chess.com into one bucket without
  an explicit toggle. The player trusts the named set as a fact.
- A separate authored "season history" database. The small local
  `useSeasonLog` audit record contains URLs, hashes and dates only.
- A trend over two data points. The reader counts; the player
  reads.
- The recurring-mistakes sections (engine evidence, structure keys,
  endgame category, repertoire). They live in Review → Improvement;
  this design does not touch that tab.
