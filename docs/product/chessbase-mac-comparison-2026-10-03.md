# Kingfisher and ChessBase for Mac, 2026-10-03 (second pass): what 1.4.3 closes

Research date 2026-10-03, second pass of the day. Baseline: `master` at
`5c96643` (source and public Mac 1.4.2, build 1039). Sources: the publisher's
page <https://macland.chessbase.com/>, read live, including its in-browser
"Which move scores best at your rating?" simulation; and ten photographs of
the development build shown at the Chess Olympiad, supplied by the owner
(analysis board, preparation and style report, Library with its filter
popover, the database overview, the databases grid, the shop). ChessBase for
Mac is announced for early November 2026 and was not run; everything said
about it is the publisher's description or what the photographs show. Nothing
here claims parity.

This continues [`chessbase-comparison-2026-10-03.md`](chessbase-comparison-2026-10-03.md),
which built seven features the morning's inventory found missing. This pass
compared the Mac product screen by screen, used each Kingfisher counterpart as
a player would — with a real Lichess export, a real annotated collection, the
built-in reference and the browser engine — and fixed what that use turned up
as well as what was missing.

## Screen by screen

| ChessBase for Mac                                                                                            | Kingfisher before 1.4.3                                                                                                    | 1.4.3                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reference: rating-class switch ("≤1400 … 2601+"), moves re-ordered per class; position across rating classes | Min Elo filter — **silently ignored** by the built-in and streamed packs, which keep one count per move                    | **By rating class and year** under the move table, from the pack's own position histories (games of each band reaching the position after each move, by any move order — said on screen); the position across classes; each move's share year by year. Filters a source cannot apply are disabled and named. |
| Reference moves drawn on the board                                                                           | none                                                                                                                       | Hovering a row previews the move; a toggle draws the most played moves, wider for the more played, in a colour that is never the engine's.                                                                                                                                                                   |
| Library filter: Position, Opponent, Colour, Result, **Annotations** (annotated / commented)                  | Player, colour, result, ratings, dates, material, themes, routes, comment text; position only in the advanced query editor | **Position** (a FEN or the board's, any move order) and **Annotations** in the mask; both round-trip through saved queries.                                                                                                                                                                                  |
| Database overview: games, players, tournaments … each a list; newest tournaments                             | games count, size, location                                                                                                | **Players and tournaments**: tiles and two browsable lists (score, years; editions newest first), each row opening the Library.                                                                                                                                                                              |
| Databases toolbar: **Download Online Games**                                                                 | only the user's own linked accounts                                                                                        | **Download online games…**: anyone's public Lichess or Chess.com games, newest first, capped, into My games.                                                                                                                                                                                                 |
| Preparation: **Blunder report**                                                                              | none                                                                                                                       | **Costly moves**: the engine reads the opponent's newest games and counts the moves that gave up 3/10/20 points of win chance, by phase and colour, each opening the game there. Not called blunders (`review/annotate.ts`).                                                                                 |
| Preparation: player photograph                                                                               | initials                                                                                                                   | The Wikidata/Commons photo with author and licence, loaded automatically (the owner's choice), on the preparation card and the player page.                                                                                                                                                                  |
| Tactics puzzles: "Stuck? One click opens the position on the analysis board"                                 | Analyse only after the puzzle ended                                                                                        | **Analyse (counts as unsolved)** while solving.                                                                                                                                                                                                                                                              |
| Style report with graded bars (Aggressiveness: very high …)                                                  | measured, ungraded style report                                                                                            | Unchanged, deliberately: a grade needs a population to be graded against (`preparation/style.ts`).                                                                                                                                                                                                           |
| DGT board (Setup, Record, Analysis)                                                                          | none                                                                                                                       | **Not built.** No board was available to test against; the owner chose to record it rather than ship an integration nobody has run on hardware.                                                                                                                                                              |
| Fritztrainer video courses, Magazines, Shop, Playchess, Mega Database, Opening Encyclopaedia                 | none                                                                                                                       | Not built: publisher products and services, and proprietary formats.                                                                                                                                                                                                                                         |
| Engine Cloud, remote engine (128 cores), Let's Check, cloud databases                                        | remote engines, Lichess cloud evaluations; sync remains a Proposed ADR                                                     | Unchanged.                                                                                                                                                                                                                                                                                                   |

## Defects found by using it

Each of these was found by doing what a player would, not by reading code.

- **Chess960 games imported as invented standard games.** A 300-game Lichess
  export of DrNykterstein contains 33 Chess960 games. Kingfisher reported
  "300 games added"; each 960 game had been replayed from RNBQKBNR (its
  `[FEN]` was refused and the parser substituted the standard start; the
  `[Variant]` tag was never read), stored, classified as "A00 Ware Opening"
  and indexed into the explorer. The parser now refuses such games, every
  importer inherits it, and the summary names them. The contract test titled
  "does not import a game that starts from an impossible castling position"
  had asserted the opposite.
- **Explorer filters ignored without a word**, on the default source, and the
  readiness panel printed "Counts apply to these filters." under the same
  unfiltered counts.
- **A position search found nothing.** The query executor took a match's
  "moment" only from moves it knew, the Library dropped every match without
  one, and so a saved query with a symbol or a "variations too" position
  counted games it never listed.
- The download summary said "2 downloaded" when 3 were (the refused game was
  not counted); the costly-moves page printed "depth 12–245" (Stockfish's
  report for a position with one legal move); the rating-class chart drew with
  CSS variables that only exist inside Tailwind's theme block, so its lines
  had no colour; the preparation card said "0 from My games (the newest of 14
  that match …)"; a living legend was "Lived b. 1992"; Review's tabs ran off
  the edge at 1280 px; Openings printed `12301 / 12781 / 9933`.

## Evidence

Every number below came from a run in this session.

- Rating classes, starter pack, after 1.e4 c5: b3 has 0 games at 2600+ and 88
  at 2200–2399; Nf3 leads both classes (1,834 and 22,520).
- Library position search, QGD after 1.d4 d5 2.c4 e6: 3 of 322 games; an
  independent chess.js replay of the same PGN found the same 3. "Commented":
  the 14 Capablanca games.
- Collection index: DrNykterstein 267 games, +192 =21 −54; a separate count of
  the same export agrees.
- Download, live: 30 Chess.com games of MagnusCarlsen; 40 Lichess games of
  penguingim1 ending on the date of his latest Lichess game.
- Costly moves, Carlsen's ten newest starter-pack games: 545 of his moves in
  161 s at 0.15 s a position, median depth 18; 4 costly at 10%; the top one
  opened the game at Black to move, move 25.
- Photo, live: Carlsen (Q106807), Andreas Kontokanis, CC BY-SA 2.0; Caruana,
  Frans Peeters, CC BY-SA 2.0.

Each new e2e spec was made to fail once by reverting or mutating the code it
checks: `explorer-rating-classes`, `library-position-annotations`,
`collection-index`, `download-online-games` (failed on the miscount before the
fix), `preparation-costly-moves`, `player-photo`, `explorer-board-arrows`.

## What is still open

- DGT boards, per the owner's decision above.
- Per-move rating classes for sources that can really filter (Lichess, a
  companion collection) use the existing Min Elo; ChessBase's fixed class
  buttons are offered only where a pack carries histories.
- "Who plays it" per move (ChessBase's frequent and best players): the packs
  keep no per-move player lists.
- A measured comparison with ChessBase for Mac itself needs the product, which
  is not released.
