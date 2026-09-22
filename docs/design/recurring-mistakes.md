# Recurring mistakes — facts, not labels

> Research → decisions → design. The brief is §3.4, §3.5 and §6 of
> `docs/product/market-research.md`. This extends Review → Improvement; it does
> not create a second improvement database or a separate route.

## 1. Research

Four complaints define the feature.

- Players ask how often the same mistake occurred, rather than for another
  per-move badge (`Lichess-Weak`, `64Squares`).
- They distrust invented “brilliant”, “accuracy”, style and rating-gain labels
  (`Chess.com-Brilliant`, `Chess.com-Wrong`, `ChessMind`).
- The same pawn structure can recur through different move orders; counting a
  move sequence would split the fact (`Solon-Files`).
- Endgame work should come from the endings the player actually reaches, not a
  generic catalogue (`Aimchess`).

The structural answer is a set of counts whose rules are visible and whose
games can be opened. The feature never calls a move a blunder, never assigns a
style, and never compresses the player into one score.

## 2. Decisions

- The four sections sit above the existing theme counts in Review →
  Improvement. The existing period control supplies the named game set.
- The player is identified only by exact profile aliases, using the same
  case-and-whitespace normalization as the games index. With no matching
  alias, the report is empty rather than guessing.
- Every row carries a unique list of games and W/L/D from the player's side.
  A game that reaches the same key twice counts once in that row.
- Engine loss is measured from White-relative stored scores and flipped for
  Black. The default threshold is 100 centipawns (1.0 pawn), inclusive; the
  Improvement view offers 0.5, 1.0, 1.5 and 2.0 pawn thresholds. Mate scores
  remain decisive through the existing score conversion.
- Pawn structures require at least five games and a score below 50%, where a
  win is 1, a draw 0.5 and a loss 0. This is a record, not an accuracy score.
- Endgame categories and repertoire positions require at least one matching
  game and the same below-50% record. Their denominators are always shown, so a
  one-game fact cannot masquerade as a broad claim.
- Repertoire rows only count games in which the player had the repertoire's
  colour. The record answers what that prepared position left, not what an
  opponent did with the other side.

## 3. The four sections

### 3.1 What the engine flagged

For each main-line move by the player, the reader needs stored engine evidence
for both the position before the move and the position one ply later. It keeps
the latest compatible pair from the same analysis job and engine. A row appears
when the score drops by at least the selected threshold from the mover's point
of view.

Rows are grouped by canonical `positionKey`, so transpositions meet. An
occurrence names the game, the move played, the before/after scores, the loss,
engine, depth and node. The position link opens `/position?fen=…`; every game
entry opens that stored game at the move.

No evidence on either side means no claim. The engine and both depths are shown
as provenance; evidence from different engines or jobs is never paired.

### 3.2 What the same structure lost

`PositionRecord.pawnSkeleton` is the key. Each skeleton collects unique games
from the selected period. Rows with fewer than five games or a score of 50% or
more are omitted. The visible description comes from
`describePawnSkeleton`, so the row names the pawns rather than exposing only an
opaque key. A representative FEN opens the position page; the game entries are
the evidence behind the record.

`structureSignature` remains available for deterministic structure search but
is not a fifth recurring-mistakes section. The brief asked for the pawn
structure key and four sections.

### 3.3 What this endgame type lost

Saved `EndgamePositionRecord.category` supplies the category. A game reaches a
category when one of its indexed canonical positions matches a saved endgame
position in that category. Games are unique per category. Rows below 50% show
the number of distinct saved positions and the exact games. The category link
opens `/endgame?category=…` and the game entries open on the board.

The category is player-authored. Kingfisher does not infer “fortress” or
“technical conversion” from material.

### 3.4 What this opening left

Saved `RepertoirePositionRecord.positionKey` supplies the position. Games that
reach it are counted only when the player's colour matches the repertoire's
colour. A row below 50% names the repertoire, position, W/L/D and exact games.
The position link opens Phase 77's position page.

This is distinct from an engine flag. It says the player's games reached a
prepared position and the record from there was below 50%; it does not claim
the repertoire move was wrong.

## 4. Pure reader

`src/recurring/recurring.ts` accepts:

- `readonly GameRecord[]` for the selected period;
- exact profile aliases;
- stored engine evidence for those games;
- their deterministic `PositionRecord[]` structure index;
- saved `EndgamePositionRecord[]`;
- repertoires and `RepertoirePositionRecord[]`;
- the engine-loss threshold, default 100 centipawns.

It returns four row arrays plus the total fact count. Tests pin these
properties:

1. A 100 cp loss qualifies and a 99 cp loss does not; White and Black are
   signed correctly.
2. Repeated occurrences in one game never duplicate that game's denominator.
3. A pawn skeleton needs five unique games and a score below 50%.
4. Endgame category rows join through canonical positions and keep unique
   games.
5. Repertoire rows respect repertoire colour and keep canonical
   transpositions together.
6. Every emitted row has at least one game and its W/L/D sum equals the game
   denominator.

One deliberate mutation changes the engine comparison from `>=` to `>`; the
100 cp boundary test must fail before the feature is accepted.

## 5. Data loading and UI

`useRecurringFacts` walks game-summary pages, filters by the selected period and
exact profile aliases, fetches only those full games, then reads their evidence. `indexGame` derives the same
structure records the importer stores. Endgames and repertoires come from their
existing repositories. Independent reads run in parallel; evidence reads are
bounded in batches so a large period does not issue thousands of IndexedDB
requests at once.

The headline is factual: `N facts in your games this period, none of them
labeled “style”`. Each section names its source rule, renders an explicit empty
state, and lists the game buttons behind every row. Loading or repository
errors occupy the section; they do not erase the existing theme counts below.

## 6. Acceptance criteria

1. Review → Improvement renders the four headings in the order above.
2. The engine threshold defaults to 1.0 pawn and is configurable in the view.
3. Every row shows its denominator and W/L/D; its game list opens the stored
   games that produced it.
4. Engine and repertoire rows open the position page; structure rows open a
   representative position; endgame rows open the category.
5. No row exists without games, no game is counted twice within a row, and no
   engine row crosses the threshold silently.
6. The headline and row copy contain no “accuracy”, “style”, “brilliant”,
   “blunder”, rating gain or invented trend.
7. A browser spec seeds the four kinds of evidence, opens Improvement, changes
   the engine threshold and opens one backing game.

## 7. Out of scope

- A new store or schema migration. Existing games, engine evidence, structure
  keys, endgames and repertoire positions are the complete input.
- Runtime model classification, a coaching label or an accuracy score.
- Cloud accounts, telemetry, streaks or rating-gain charts.
- A two-period direction. The existing theme comparison remains two counts and
  continues to say it is not a trend.
