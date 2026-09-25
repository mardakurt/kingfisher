# The Phase 84 parity features: rules and non-goals

Six workflows ChessBase users rely on, built in Phase 84 from the comparison
in [`../product/chessbase-parity-audit.md`](../product/chessbase-parity-audit.md).
Each is written into the existing architecture — position identity, the
collection abstraction, the palette's commands, Training — rather than beside
it. What each does, the rule it keeps, and what it deliberately does not do.

## Merge games into one tree

`src/chess/tree/merge.ts`, from the Library's selection.

- Every move of every source, variations included; shared moves once.
- A move's first annotations are kept; a later game fills gaps only (NAGs
  joined, comment and evaluation only where there were none).
- The last main-line move of each merged game carries the game's label, so
  every branch can be traced. Labels are plain text: a brace would end a PGN
  comment.
- The tree starts where most of the selected games start; a game from
  elsewhere is skipped with the reason. (The first version took the first
  row's start; the Library lists newest first, and an endgame at the top
  threw out three opening games.)
- **Not done:** joining transpositions. A tree is a set of move orders; the
  result counts positions reached by two paths and says the position page
  joins them.

## The repertoire scan

`src/repertoire/scan.ts` over `src/database/collections/scan.ts`.

- Any collection, read page by page through the collection's own `read`, with
  progress and a stop that keeps what was found and says it was stopped.
- A game is walked by position. The departure is the move from the _last_
  prepared position it reached, so a transposition back into the line is
  followed. Prepared replies at a position are the recorded ones and every
  legal move that leads to a position the repertoire answers — a repertoire
  written from lines stores only the player's own moves.
- Three kinds, never one list: a new move against the line, another choice
  for the repertoire's side, past the preparation. Grouped by position and
  move, deepest first; games that left before a minimum depth are omitted.
- **Not done:** writing anything. The scan reports; adding a line is the
  player's decision.

## Lichess cloud evaluation

`src/engine/cloud-eval.ts`, in the engine panel.

- Off at the start of every session; the off state says what turning it on
  sends. A session switch, not a preference.
- Labelled as stored analysis with Lichess's depth and node count; lines
  replayed through Kingfisher's rules (`e1h1` castling read only when the
  move as written is illegal).
- Kept apart: never the tree, the bar, the arrows or the review
  (`e2e/cloud-evaluation.spec.ts` asserts the bar and the tree).
- "Nothing stored" and "slow down" are different answers.

## Position history

`src/position/history.ts`, on the position page.

- First and latest dated game, games per year (empty years shown), White's
  score with its denominator, the players who reach it most.
- From the games stored in this browser, bounded by
  `GameRepository.summariesAtPosition`. The section names that population
  and says why the reference packs cannot answer (one aggregate per
  position, no dates).
- **Not done:** trend words. A collection's years say as much about what was
  imported as about what was played.

## The Library over any database

`src/features/games/library-source.ts`.

- A database picker in the Library's toolbar, kept in the address.
- A companion collection answers the Library's own query with its matcher;
  a filter it cannot apply (the time class) is named on screen.
- Its games preview and open through `/db/content` and the import parser; a
  companion game opens as a new analysis, never as something the board could
  write back to.
- Selection, delete, the move search and the analysis queue stay My-games
  actions and are offered only there.

## Questions inside a chapter

`src/chess/tree/questions.ts`; solving in `SolveQuestionsDialog`; the
worksheet in `src/publish/chapter-html.ts`.

- The marked move is the answer, asked at the position before it; a sibling
  marked `!` or `!!` is accepted too. `meta.question` holds the prompt, and
  PGN carries it as `[%kfquestion …]`.
- Solved with Training's own control and check — one way to answer a move
  question.
- The summary says what was found and missed; the misses go to Training on
  request, linked to the chapter.
- _Publish → As a worksheet_: positions and prompts, the game withheld,
  solutions on the last page.
- **Not done:** points and timers per question, and delivery to a student's
  machine (the Team hub's packet is the delivery that exists).

## Where the game leaves the source

`src/theory/departure.ts`, in the Explorer (`DepartureSection`). ChessBase's
Find Novelty and Novelty Annotation, as a fact about a named population.

- Asked of the game on the board, against the source and filters the
  explorer is showing; the main line is read one position at a time and the
  walk stops at the first move no game in the source played, so an online
  source gets as few requests as the game allows. It can be stopped.
- The answer names the source, how many of its games reached the position
  before the move, what they played, and the games themselves (they open in a
  new tab). It never says "novelty": a population is not all of chess.
- Three answers are kept apart from a departure because each would be false as
  one: a pack past the depth it aggregated, a move missing from a list as long
  as the one asked for (it may be further down), and a game that never left.
- _Write it into the game_: a comment on the departing move and the source's
  most played move as a variation with its count, one undo, no glyph.
- **Phase 85:** _Where these games leave the source…_ runs the same factual
  walk over a selected collection with progress and stop, and writes a report;
  it still never turns absence from one population into a universal novelty.

## Deep analysis

`src/engine/deepen.ts` and `deepen-graft.ts`, in the engine panel
(`DeepenSection`). ChessBase's Deep Analysis, reported as evidence.

- A tree grown breadth first on its own engine session: each position is
  searched with MultiPV; the moves kept are the best and any within 0.5 of it
  for the side to move (one to three), to a chosen depth in plies and a
  position budget (at most 400). The panel's own search stops while it runs.
- The report prints the start's own search beside the tree's backed-up
  (minimax) score and the line the tree prefers, and every position whose own
  search disagreed with the line that led to it — the move expected, the move
  preferred, the score and depth.
- _Add to the analysis_ writes the moves as variations, each searched
  position's evaluation with its engine, depth, nodes and time (a deeper
  stored one is kept), and one comment where the engine changed its mind; one
  undo. The main line is never reordered.
- **Phase 85:** the frontier, tree, options and evidence are persisted after
  every searched position. Reload and relaunch resume it; in the Mac app a
  close hides the window while its native engine continues. Remote engines on
  other machines remain a separate, unimplemented capability.

## Move search over a companion database

`runPagedDeepSearch` (`src/features/games/deep-search.ts`) and
`companionMoveSearch` (`library-source.ts`).

- The Library's material, theme, route and comment search now reads a SQLite
  database behind the companion as well as My games. The companion selects by
  header with its own matcher and serves games a page at a time with their
  PGN (`/db/export-page`); each is replayed by the PGN parser and asked the
  same `scanGame` question.
- The count comes first so progress has a denominator; an unreadable game is
  neither read nor selected; a stop keeps what was found.
- **Phase 85:** imported games carry a compact line index. The companion scans
  indexed material runs, theme claims and piece trajectories in worker slices;
  comment text and pre-index games keep the exact linear fallback. Equivalence
  tests compare index answers with replayed games.

## Phase 85 corpus, report and evidence additions

- Reference-pack history is an optional, digest-verified chunk family. It
  stores per-position counts by year and 200-point Elo class plus earliest
  game references. The Opening Report renders each pack separately and a test
  rejects figures labelled with another population.
- Large-file import is owned by the companion. It streams PGN, gzip, seekable
  zstd and ChessBase records, uses the application's parser/indexer bundle,
  writes only the destination collection, and records user-supplied licence
  provenance.
- Shared analysis follows the owner's file-exchange decision. Imported engine
  evidence is validated, stored separately and never re-exported as local
  work. No hosted pool or account service was added.
- The rolling six-month pack has a scheduled publisher and a monotonic channel
  document. An installed client checks that channel and still verifies every
  manifest and chunk before adoption.

## Results open in their own tab

`openInNewTab` (`src/features/tabs/tab-actions.ts`).

- A merged file, a merge of the explorer's model games, a predecessor game and
  a deep-analysis tree whose start is not in the game open in a new working
  tab. The Library's merge first opened over the board, and an unsaved
  untitled analysis there was replaced.
