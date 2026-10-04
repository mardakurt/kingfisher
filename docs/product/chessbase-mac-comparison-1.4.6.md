# Kingfisher 1.4.6 and the ChessBase for Mac preview

Checked 2026-10-03 against <https://macland.chessbase.com/> and the ten
screenshots of the preview in `chessbase images for comparison/` (analysis,
Preparation's Openings and Style tabs, Library with its filter popover, an
opened game, the Databases grid, Mega Database's page and the Shop). Baseline
was `master` at `ef00408` with 1.4.5 in source. ChessBase advertises an early
November 2026 release and calls its recordings a development version; it was
not installed or measured. [1.4.5's comparison](chessbase-mac-comparison-1.4.5.md)
remains the record of what was already in place.

## Method

Every claim on the page (re-read on 2026-10-04: one window for board, engine,
reference and top games; the sidebar; find any game; filters by position,
opponent, colour, result and annotations; local, cloud and remote engines;
rated puzzles; statistics by rating; video courses; Player Style Report;
cloud Stockfish; community evaluations) and every control visible in the ten
screenshots was listed and checked against the code, then used in the
browser on real data — the bundled Starter Reference (206,451 elite games)
and 1,014 imported games.

## Gaps closed in this pass

| ChessBase for Mac (where it is seen)                                                                                                 | Kingfisher 1.4.6                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Databases listed in the sidebar with counts (every screenshot)                                                                       | Each database under the sidebar's Databases row with its count (12.3M style past 10,000), four then "Show N more", **+** for a new one. A database has an address, `/databases?db=<id>`: Back, reload and workspace tabs keep it                                                                                           |
| Mega Database's page: Games, Players, Tournaments, Annotator, Sources, Teams, Openings; Newest Tournaments; Top Games (screenshot 9) | The collection index already counted players and tournaments. It now also lists **openings** (family, White's wins/draws/losses and score), the **five newest tournaments**, the **five top games** by both ratings, and **annotators, sources and teams** read from the games' headers. Every row opens exactly its games |
| A tournament row opens its games                                                                                                     | The link was a free-text search: "Club Open 1" brought Club Open 10 and every year's edition. It opens that edition now: a quoted value is a whole value, in both stores                                                                                                                                                   |
| Frequent Players (analysis, opened game)                                                                                             | Companion (SQLite) collections name each move's three most frequent movers under the same filters as the counts. At the 100,000-game limit the starting position costs 63.5 ms p95 on an M3 Pro (0.3 ms without); past it the Explorer says it left them out                                                               |
| Preparation → Openings: As White / As Black families with bars, "+N more" (screenshot 4)                                             | The same at the top of the Openings tab; a family opens exactly its games in the Games tab                                                                                                                                                                                                                                 |
| Search history beside the Preparation box (screenshots 3–5)                                                                          | **Recent** opponents on the Preparation start screen                                                                                                                                                                                                                                                                       |
| Photos beside the players of an opened game; flags in the Library (screenshots 6, 7)                                                 | A game header above the notation and in the Library preview: players with rating, photograph and country; flags in the Library list. Citizenship from Wikidata, not federation — the tooltip says so                                                                                                                       |
| "‹ Library" above a game opened from the Library (screenshot 7)                                                                      | "Back to the Library: “…”" and "Back to preparation against …", returning to that list, page and game                                                                                                                                                                                                                      |
| Figurine moves in the reference table (screenshots 1, 2)                                                                             | Settings → Board → Piece notation: figures from the user's own piece set in the notation and move tables; PGN and copies keep letters                                                                                                                                                                                      |
| "Fritz 21 · 5 cores · 4 GB" (screenshots 1, 7)                                                                                       | The engine panel shows the threads and hash the engine actually runs with, from its declared capabilities                                                                                                                                                                                                                  |

## Defects found and fixed on the way

- A tournament link opened the wrong games (above).
- The Library wrote its search into the address on a 400 ms debounce, so a
  game opened quickly after typing recorded a way back without the search.
- The Dossier left out an opponent's games under another spelling.
- Set up position hid its FEN and cut its hint at 1440 × 900.
- Skip was the accent control on an unsolved puzzle.
- At 1440 × 900 the current section sat below the sidebar's fold.
- "1 games" in the Explorer's frequent-player tooltip.
- Every release's `SHA256SUMS` failed `shasum -c` (fixed for 1.4.5 before
  publication).

## Still not equivalent, and why

| ChessBase for Mac                                                                                  | Why Kingfisher does not have it                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mega Database 2026, Opening Encyclopaedia, weekly updates, magazines, Fritztrainer catalogue, Shop | Publisher data and rights. How Kingfisher could reach comparable _open_ populations without filling a disk: [the proposal](big-data-and-accounts-proposal.md) |
| Stockfish in the Engine Cloud, a rented 128-core machine                                           | Hosted paid services. Kingfisher's remote engines use a machine the person owns                                                                               |
| Let's Check (community evaluations)                                                                | Needs a server that accepts writes; Lichess cloud evaluations meanwhile. See the proposal                                                                     |
| Cloud databases, a signed-in account                                                               | Postponed: see the proposal for why, and for backup-folder sync as the cheaper path                                                                           |
| Game Title, Text titles, Analysis tabs                                                             | ChessBase-specific record types; the ChessBase reader's preservation matrix says what each becomes                                                            |
| Style evaluations (Low → Very High), theme games                                                   | A grade needs a reference population and a model of the word; the Style tab states measured facts with their samples                                          |
| Complete best/frequent players for reference packs                                                 | A pack keeps aggregates and a bounded sample of games per player, not every game's movers                                                                     |
| Several databases searched from the Library itself                                                 | Databases → tick several → Search searches them together; the Library reads one database                                                                      |
| Custom database icons                                                                              | Not built; tiles distinguish browser and SQLite collections                                                                                                   |
| DGT board                                                                                          | The owner's decision                                                                                                                                          |
