# ChessBase preservation matrix

_Phase 86, 2026-09-26. P0.4 of the parity program. What survives a
ChessBase database coming into Kingfisher, and a Kingfisher collection going
out as a new CBH database, field by field. The table is generated from
`src/database/chessbase/preservation.ts`, and
`preservation.test.ts` fails if a field here and there disagree or a
cited test does not exist._

**Read** is `database.ts` and `annotations.ts` importing a CBH or CBV
(`archive.ts`). **Write** is `write.ts` and `encode.ts` making a new
database; Kingfisher never writes into a database another program owns.

| Field                                                                                                    | Import (read)     | Export (CBH write) | What happens                                                                                                                                                                                                 | Tests                                                   |
| -------------------------------------------------------------------------------------------------------- | ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Main line                                                                                                | kept              | kept               | Every move replayed through Kingfisher’s rules; the writer reproduces ChessBase’s bytes for its fixtures, and 8,895 archive games match the publisher’s PGN.                                                 | `moves.test.ts`, `write.test.ts`, `archive.test.ts`     |
| Variations, nested                                                                                       | kept              | kept               | Opened and closed in the movetext stream; any depth.                                                                                                                                                         | `moves.test.ts`, `write.test.ts`                        |
| Comments before and after a move                                                                         | kept              | kept               | Every language is read; written as one text, language unset (ChessBase: “any”).                                                                                                                              | `database.test.ts`, `write.test.ts`                     |
| Annotation symbols (NAGs)                                                                                | kept              | partly             | ChessBase holds three per move; a fourth is counted in the write report.                                                                                                                                     | `database.test.ts`, `write.test.ts`                     |
| Coloured squares and arrows                                                                              | partly            | partly             | Green, yellow and red both ways; another ChessBase colour is read as green, and Kingfisher’s blue is counted in the write report and left out.                                                               | `database.test.ts`, `write.test.ts`                     |
| Clock times and time spent                                                                               | kept              | kept               | As PGN [%clk] and [%emt] on the move.                                                                                                                                                                        | `database.test.ts`, `write.test.ts`                     |
| Engine evaluations, medals, training questions, multimedia, critical-position and other annotation types | counted, left out | not written        | Kingfisher has no field they could become without inventing one; each is counted by its type byte in the loss report.                                                                                        | `annotations.test.ts`                                   |
| Players, Elo, result, ECO, date, round and subround                                                      | kept              | kept               | Unknown date parts stay unknown (????.??.??); names are cut to their ChessBase field width on write, counted.                                                                                                | `database.test.ts`, `write.test.ts`                     |
| Tournament                                                                                               | partly            | partly             | Title and place become Event and Site; type, category, nation and round count are not kept.                                                                                                                  | `entities.test.ts`, `write.test.ts`                     |
| Annotator and source                                                                                     | partly            | partly             | Their names become the Annotator and Source tags; a source’s publisher, date and quality are not kept.                                                                                                       | `entities.test.ts`, `database.test.ts`, `write.test.ts` |
| Teams                                                                                                    | unverified        | not written        | Read into WhiteTeam and BlackTeam from the team file and the extended header (.cbe, .cbj). No database ChessBase wrote with teams in it was available, so this is unverified; the writer makes no team file. | —                                                       |
| Set-up start position                                                                                    | kept              | kept               | As SetUp and FEN; the position is checked by Kingfisher’s own FEN parser.                                                                                                                                    | `moves.test.ts`, `write.test.ts`                        |
| ChessBase player and tournament ids, search-booster and key files (.cbk)                                 | counted, left out | not written        | Games carry names, not ChessBase’s record numbers; keys are not read.                                                                                                                                        | `database.test.ts`                                      |
| Deleted games, guiding texts and Chess960 games                                                          | skipped, counted  | not written        | Deleted games and texts are not games; Chess960 is refused with the reason. All are counted.                                                                                                                 | `database.test.ts`                                      |
| Damaged records                                                                                          | skipped, counted  | not written        | A game whose movetext does not decode, or plays an illegal move, is refused with its number and the reason.                                                                                                  | `moves.test.ts`, `database.test.ts`                     |

## The loss report

Every ChessBase import now offers **Download the loss report** — a JSON
file (`kingfisher-chessbase-import-loss-report`, version 1) with the games
examined, imported, duplicated and refused; everything left behind, by what
it was, in how many games and how many items in all (an annotation type Kingfisher has no
field for is named by its type byte, never guessed at); the first refused
games with reasons; and this matrix. The export side already counts what it
cannot write (blue shapes, a fourth symbol, names cut to field width,
characters Windows-1252 cannot hold) in its write report.

## What is not claimed

- That ChessBase opens the files Kingfisher writes. The writer reproduces
  ChessBase's own movetext bytes for its fixtures and the files are read back
  by Kingfisher's reader; no ChessBase licence was available to open them in
  ChessBase itself (the parity ledger keeps this criterion **blocked**).
- Team reading is **unverified**: implemented from the layout, never run on a
  database ChessBase wrote with teams in it.
- The annotation types counted and left out are listed by type byte; this
  document does not name what each byte means where ChessBase does not
  publish it.
