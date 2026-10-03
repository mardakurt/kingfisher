# Kingfisher 1.4.5 and the ChessBase for Mac preview

Checked 2026-10-03 against <https://macland.chessbase.com/>. Baseline was a
clean `master` at `54957da`, source and public Mac 1.4.4. ChessBase advertises
an early November 2026 release and calls its recordings a development version.
It was not installed or measured. This compares the advertised workflows with
Kingfisher's implementation and explicitly names the remaining limits.

## Changes in this pass

- **Local video lessons in Studies.** Choose a local MP4, WebM or other
  browser-supported video, select positions in a chapter and add timed cues.
  Playback and seeking follow the same canonical board, including variations.
  Turn Follow off to explore independently; cue buttons seek both video and
  board. Chapters have independent lessons. `KFVideoFilename` and
  `[%kfvideo seconds]` carry the author's filename and cues through PGN,
  autosave and portable backups. Video bytes are not uploaded, copied into a
  backup or stored in the browser database: reattach the file after reopening.
  This plays open-format lessons, not proprietary Fritztrainer files, and
  supplies no licensed video catalogue.
- **Annotator, PGN source and Team filters in the Library.** Read the imported
  `Annotator`, `Source`, `WhiteTeam` and `BlackTeam` tags, case-insensitively.
  Missing tags do not match; words in comments do not invent metadata. The
  filters combine with existing searches, survive saved queries and work in
  My games, a companion database and a reference's bounded player games.
  The query builder supports conjunction, disjunction and negation of these
  metadata predicates. Metadata searches read PGN rather than pretending the
  compact main-line index carries these tags.
- **Frequent movers in My games.** The Explorer ranks up to three movers per
  move with distinct game counts in the current filtered population. Repeated
  visits to the position in one game count once. Narrow docks show the names
  under the move; wide panels have a Frequent players column. Other sources
  lacking these records do not acquire fictional frequency counts.
- **Strongest-player correction.** A pack's strongest games after a move
  could have arrived there via a different move. Every credited player now
  has a replay-verified occurrence of the queried move from the queried
  position. This remains a bounded sample of up to eight retained games,
  not a complete list of the source's players.
- **Study navigation correction.** Switching chapters before the debounce
  expired lost recent edits. The Studies selection now drains in-flight and
  pending autosave, rereads the selected chapter, and refuses a replacement
  when saving fails. A completed write cannot mark a different document saved.
  Recovery also compares cues, annotations and headers so a reload before
  autosave preserves changes even when the moves and comments are identical.
- **Mac saved-query correction.** Exercising the existing signed 1.4.4
  package with an isolated profile found `prompt() is not supported` when
  saving a query. Naming now uses the shared in-app dialog, preserving the
  captured query and displaying a failed save within the dialog.
- **Dependency maintenance.** Dependabot PRs #1 and #2 were inspected and
  merged: desktop brace-expansion patches and Next.js 16.3.8. The Next ESLint
  package is aligned to 16.3.8. A compatible fast-uri patch was also installed.

## Advertised workflows and the remaining boundaries

| ChessBase Mac preview                                             | Kingfisher implementation                                                                                 | Remaining boundary                                                                                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Board, notation, engine, reference and top games together         | Shared resizable workspace, canonical board, Explorer and in-place top-game opening                       | No direct comparison with the unreleased Mac executable                                                                                |
| Rating-filtered reference statistics                              | Pack rating histories; filters on capable online and local providers                                      | Pack counts describe that named population, not Mega Database                                                                          |
| Databases and folders                                             | Local collections, SQLite companion, database folders, source sets, PGN and CBH/CBV interoperability      | Mega Database and Opening Encyclopaedia require publisher data and rights                                                              |
| Position, player, opponent, colour, result and annotations search | Library filters and deep search; now recorded annotator, source and team metadata too                     | Pack-wide arbitrary search remains limited by retained player games; no complete all-game archive in packs                             |
| Local and remote engines                                          | Browser Stockfish, managed native UCI engines, authenticated remote workers, engine evidence and queues   | No ChessBase Engine Cloud account, rented 128-core machine or capacity guarantee                                                       |
| Let's Check                                                       | Position-keyed Lichess cloud evaluations and stored engine evidence                                       | Different service and population; not ChessBase's community database                                                                   |
| Player Style Report                                               | Source-labelled dossier, opening families, recorded rating history, style measures and costly-move review | No invented personality classification or universal data coverage                                                                      |
| Fritztrainer                                                      | Local open-format video lessons with timed board cues                                                     | No proprietary decoder or licensed Fritztrainer course catalogue                                                                       |
| Rated tactics                                                     | CC0 Lichess puzzle corpus and ratings from actual attempts                                                | Different puzzle population; no ChessBase account rating                                                                               |
| Repertoire                                                        | Position-keyed intended moves, review and recall workflows                                                | No access to a ChessBase cloud repertoire                                                                                              |
| Cloud databases                                                   | Portable file exchange, native collections and backups                                                    | Account sync remains outside the owner's chosen scope                                                                                  |
| Frequent players                                                  | Exact filtered counts in My games; strongest players verified in a bounded pack sample                    | Complete per-move player lists for reference packs require new retained data and a pack rebuild; companion frequency lists remain open |
| Medals, Beauty, magazines and editorial catalogue                 | User annotations and imported PGN metadata                                                                | No licensed editorial scores or publisher content; none inferred or fabricated                                                         |
| DGT board                                                         | Outside this release                                                                                      | Owner retained the no-DGT decision                                                                                                     |

## Validation

Tests use an explicitly synthetic colour-card video as a media fixture, never
as a purported chess course. Chrome decoded and played it; the board followed
the cues, sought backwards, resumed following after free exploration, retained
metadata through reload and switched between chapters without losing edits.
Desktop, laptop and phone layouts and light/dark themes were inspected.

Metadata filters were exercised by importing tagged and untagged PGN into the
actual browser repository and an actual SQLite companion. Tests distinguish
the tag from the same words in a comment. Portable backup/restore and PGN
round trips run through the real implementations. Regression mutations and
the release gates are recorded in the release handover; targeted tests alone
do not certify the public Mac or production deployment.

No full ChessBase parity is claimed. Its licensed ecosystem and hosted services
remain different, and measured interoperability in a licensed ChessBase and
independent player trials require access and participants.
