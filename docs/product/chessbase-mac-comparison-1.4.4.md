# Kingfisher and ChessBase for Mac, 2026-10-03 (third pass): what 1.4.4 closes

Research date 2026-10-03, after 1.4.3 was published. Baseline: `master` at
`902a364` (source and public Mac 1.4.3, build 1055). Sources: the
publisher's page <https://macland.chessbase.com/>, read live again; frames
sampled every four seconds from its six screen recordings (analysis, search,
databases, engines, tactics, the hero clip); and the owner's ten photographs
of the development build shown at the Chess Olympiad. ChessBase for Mac is
announced for early November 2026 and was not run. Everything said about it
is the publisher's description or what the recordings and photographs show.
Nothing here claims parity.

This continues
[`chessbase-mac-comparison-2026-10-03.md`](chessbase-mac-comparison-2026-10-03.md).
The publisher's page had not changed in content since that pass; the
recordings, read frame by frame this time, showed what the text does not.

## Screen by screen

| ChessBase for Mac (recordings and photographs)                                                                                 | Kingfisher 1.4.3                                                                       | 1.4.4                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Notation toolbar under the moves: `! ? !! ?? !? ?!`, evaluation symbols, comment, delete                                       | glyphs only from a move's context menu or the number keys                              | **Annotation bar** in the Notation header (or under the moves when the notation is elsewhere), acting on the current move: the six move glyphs, a menu of the eight judgements from +− to −+, comment, and a menu for move up / delete after / delete from.                                                                                            |
| Library filter popover: Position, **Opponent**, Colour, Result, Annotations                                                    | all but Opponent                                                                       | **Opponent**: with a player, the games between the two; alone, every game the opponent played. In My games, companion databases and the reference; kept by saved queries.                                                                                                                                                                              |
| Library searches every database — "Databases: 1 of 10", Mega Database among them                                               | My games and companion databases; the reference packs' games only from a player's page | **The installed reference packs are Library sources**, searched by player as a pack can be: the search box finds players by part of a name, Player and Opponent name people, the other filters apply to their games. A pack keeps a player's newest 300 games with moves and counts the rest, and the Library says so ("Carlsen, Magnus, 300 of 705"). |
| Reference table: Moves, Score, Draws, Games, **Played**, Trend, **Best Players**, Frequent Players                             | Games, Freq, recent trend, Score; W/D/B and Elo when wide                              | A **Last** column (the latest year the source has the move) and **Strongest players**: who made the move in the eight strongest games the pack keeps after it. A pack has no per-move player list; the header says what the column is and is not. Frequent players stay open.                                                                          |
| **Top games** table under the reference: Move, Date, White, Elo, Black, Elo, Medals, Result, ECO, Moves, Event; opens in place | "Model games": names, result, event, year; opened at move one                          | **Top games**: the move each game played at this position (found by replaying it, so a transposition still says), both ratings, date, ECO, length, event; a click opens the game at the position being explored. Renamed, because Kingfisher's Model games are the games a player keeps.                                                               |
| Databases: **New Folder**, tiles dragged into folders                                                                          | one flat grid                                                                          | **Folders**: New folder, drag a tile onto it or use its Move to folder menu, search looks inside folders, removing a folder returns its databases. No games move.                                                                                                                                                                                      |
| Tactics: difficulty and your rating, Give hint, Show solution, rating change after a solve                                     | present (1.4.2–1.4.3)                                                                  | Unchanged.                                                                                                                                                                                                                                                                                                                                             |
| Preparation: photo, score ring with wins/draws/losses, as White/as Black, openings by name per colour, Blunder report          | present; opening families per colour are on the Dossier tab                            | Unchanged. The photos were checked again (below).                                                                                                                                                                                                                                                                                                      |
| Analysis window titled by its opening ("Analysis: 1 d4 d5: Unusual lines"); engine under the board                             | present                                                                                | Unchanged.                                                                                                                                                                                                                                                                                                                                             |
| Medals and the "Beauty" filter; Annotator, Sources, Teams, Text titles tabs; Weekly updates for Mega                           | none                                                                                   | Not built. Medals and beauty are editorial judgements in ChessBase's own data, which no source here carries; annotators are not stored per game.                                                                                                                                                                                                       |
| Fritztrainer, Magazines, Coach, Playchess, Shop, Engine Cloud, Let's Check, cloud databases, DGT board                         | none, or Lichess equivalents (cloud evaluation, remote engines)                        | Not built: publisher products and services; DGT by the owner's earlier decision.                                                                                                                                                                                                                                                                       |

## Defects found by using it

- **A player could not be found in a companion database by the name as
  printed.** The Library sent "Carlsen, Magnus" to the companion, which
  compares the lower-cased keys games are stored under; the same filter
  worked in My games. Names are now keyed before they are sent. The new
  companion e2e failed without the change.
- **Downloaded online games came out oldest at the top.** The download is
  newest first and My games lists the most recent import first, so the
  order reversed. Found by downloading DrNykterstein's Lichess games.
- **The reference's name variants dropped games.** A pack files one person
  under every spelling the archive merged; matching one spelling dropped 6 of
  Nakamura's 300 games and every Carlsen–Nakamura game when Carlsen was typed
  "Magnus Carlsen". Names now resolve to the pack's identity.
- **Restoring the Library on a reference before the pack had loaded** failed
  once and for good, under the title "Local storage is unavailable". The
  query now waits for the pack, and an error names its source.
- **The annotation bar's first form cost a line of notation.** It hid its
  last buttons at the dock's default width; made to wrap, it took a second
  row, and at 1280 × 720 the end of a game fell out of view — the full
  browser suite caught it (`analysis-laptop.spec.ts`). It is one row now,
  in the Notation header where the notation is stacked, costing no height.
- **"Carlsen" in the reference search box named him three times** in the
  coverage note: a pack keeps a row for every spelling it merged. Players
  are taken one per identity.

## The player photos, checked again

The owner asked that the photos be seen to arrive and to carry no safety
concern. In the running application on 2026-10-03, Carlsen's player page
made exactly three requests — `www.wikidata.org` (the item),
`commons.wikimedia.org` (the file's credit) and `thumb.wikimedia.org` (a
250 × 350 thumbnail) — and showed the picture from a `blob:` URL, so the
page's image policy stays `'self' data: blob:`. The credit linked the
file's Commons page and its CC BY-SA 2.0 licence, opening in a new tab
without a referrer. Three things were tightened:

- the credit's link must be a `commons.wikimedia.org/wiki/` page, or no
  photo is shown (a `javascript:` or foreign URL from a tampered answer is
  refused);
- Wikidata keeps a replaced or vandalised image as a _deprecated_
  statement; those are never used, and a _preferred_ one wins;
- **Settings → Database → Player photos** turns the feature off. Off, the
  query never runs: no request reaches Wikimedia at all (asserted by an e2e
  that counts requests). On remains the default, as chosen for 1.4.3.

What remains is the nature of the source: Commons and Wikidata are edited
by the public, and a vandal can change an item's image until it is
reverted. Kingfisher shows the picture Wikidata currently names, with its
credit; it does not and cannot vouch for the picture itself.

## Evidence

Every figure here came from a run in this session.

- Opponent: four-game fixtures in My games and in a real companion database
  (Playwright's own companion) — Carlsen vs Nakamura 2 games, as White 1,
  Nakamura alone opposite White 2. Unit tests for the browser matcher, the
  SQLite matcher and the query AST round trip.
- Reference in the Library, Kingfisher Starter Reference: "Carlsen" lists
  his newest 300 of 705 pack games; Nakamura 294 of 300 before the identity
  fix, 300 after. Carlsen against Nakamura: 34 games once both players'
  lists are read (13 in Nakamura's list alone), by either spelling of
  Carlsen.
- Top games after 1.d4 Nf6: c4, Bf4, Bg5, Nf3… with ratings, dates, ECO and
  lengths; Carlsen–Firouzja opened at 1…Nf6 with 2.Bf4 next, as the row said.
- Strongest players after 1.d4 Nf6: c4 — So, Carlsen, Caruana; Bf4 —
  Carlsen, Aronian, Vachier-Lagrave.
- Download: 15 real Lichess games of DrNykterstein.

Each new e2e was made to fail once by reverting or mutating what it checks:
`annotation-bar`, `library-opponent` (the companion half, on the key fix),
`download-online-games` (order), `explorer-top-games` (opening at the
position), `database-folders` (search inside folders), `player-photo` (the
off switch). `library-reference` passes on the real pack; the identity fix
is proved by its unit test, which fails without it, because the starter
pack's spellings do not exercise it end to end.

## What is still open

- Frequent players per move, and full per-move player lists: packs would
  have to be rebuilt to keep them.
- Reference search by anything other than a player: a pack keeps no list of
  all its games.
- ChessBase's editorial data (medals, beauty, annotators), its courses,
  magazines, services and cloud databases.
- A measured comparison with ChessBase for Mac itself needs the product.
