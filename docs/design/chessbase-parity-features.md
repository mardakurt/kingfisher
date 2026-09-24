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
