# Kingfisher 1.5.0 and the ChessBase for Mac preview

Checked 2026-10-06 against <https://macland.chessbase.com/> (re-read in the
browser that day) and the ten screenshots in `chessbase images for
comparison/`. ChessBase for Mac is still unreleased ("early November 2026")
and its page still calls the recordings a development version; it was not
installed or measured.

## What changed on ChessBase's side

The page now leads with system requirements — **Apple Silicon only, macOS 26
(Tahoe) or later, 8 GB of RAM** — and a rating-class simulation ("Which move
scores best at your rating?", 1.e4 d5 2.exd5 Qxd5 3.Nc3 from Mega Database
2026). Its feature list is unchanged from the one
[1.4.6's comparison](chessbase-mac-comparison-1.4.6.md) checked: analysis
board, statistics by rating, databases and folders, search and filters, the
Player Style Report, Fritztrainer, tactics puzzles, a repertoire, Engine
Cloud, remote engines, Let's Check and cloud databases.

For comparison, Kingfisher 1.5.0 needs Apple Silicon and **macOS 14** or
later — two major versions older than ChessBase for Mac's floor — and runs in
any current browser without installing anything.

## This pass

The owner chose to build only low-risk items before 1.5.0, which is the
build a public livestream will use. Every screen-level gap the screenshots
show that Kingfisher can build honestly was closed in 1.4.4–1.4.6 and is
recorded there (sidebar databases with counts, database pages with openings,
newest tournaments, top games, annotators, sources and teams, Preparation's
families and score ring, game headers with photos and flags, figurine
notation, several databases searched together, database pictures, and the
rest). Re-reading the page and the screenshots against 1.5.0 found no new
low-risk gap, so none was built. 1.5.0's work is reliability and evidence
(see the [stability audit](../reports/2026-10-04-professional-stability-audit.md)).

## Still not equivalent

Unchanged from 1.4.6, and each reason still holds:

| ChessBase for Mac                                                                                  | Why Kingfisher does not have it                                                                                      |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Mega Database 2026, Opening Encyclopaedia, weekly updates, magazines, Fritztrainer catalogue, Shop | Publisher data and rights; see [the proposal](big-data-and-accounts-proposal.md) for comparable open populations     |
| Stockfish in the Engine Cloud, a rented 128-core machine                                           | Hosted paid services; Kingfisher's remote engines use a machine the person owns                                      |
| Let's Check, cloud databases, a signed-in account                                                  | Need a server that accepts writes; Lichess cloud evaluations meanwhile                                               |
| Game Title, Text titles, Analysis tabs                                                             | ChessBase record types; the reader's preservation matrix says what each becomes. Buildable, not low-risk             |
| A video-course player                                                                              | Buildable for courses a person owns or that are openly licensed; not low-risk                                        |
| Style evaluations (Low → Very High), theme games                                                   | A grade needs a reference population and a model of the word; the Style tab states measured facts with their samples |
| Medals and the Beauty filter                                                                       | ChessBase's own editorial judgements, which no source here carries                                                   |
| DGT board                                                                                          | The owner's decision                                                                                                 |

The next pass is written as a prompt:
[`docs/operations/chessbase-parity-closure-prompt.md`](../operations/chessbase-parity-closure-prompt.md).
