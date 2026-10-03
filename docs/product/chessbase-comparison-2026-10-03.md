# Kingfisher and ChessBase, 2026-10-03: what 1.4.2 closes and what stays open

Research date 2026-10-03. Baseline: `master` at `1759dc2` (source 1.4.1, public
Mac 1.4.0). Sources checked live: the publisher's ChessBase 26 product page,
the ChessBase 18 "what's new" manual page, and the ChessBase for Mac page
(<https://macland.chessbase.com/>). ChessBase itself was not installed or run;
everything said about it below is the publisher's own description, not a
measurement. Nothing here claims parity.

This continues [`chessbase-roadmap-2026-10-02.md`](chessbase-roadmap-2026-10-02.md),
which compared research workflows; this pass inventoried **features ChessBase
advertises that Kingfisher had no version of at all**, by searching the source
for each, and built the ones that can be built honestly without a server or a
proprietary corpus.

## The comparison targets

- **ChessBase for Mac** — announced for early November 2026, macOS 26 or
  later, Apple Silicon, pre-registration only; not a product anyone can run
  today. Advertised: board with engine and reference database side by side,
  rating-filtered statistics, Fritztrainer video courses, **tactics puzzles with
  difficulty and solver ratings**, Mega Database 2026, Opening Encyclopedia,
  cloud database sync, search by position/player/colour/result/annotations,
  local Fritz, Stockfish via Engine Cloud, remote engines up to 128 cores,
  Let's Check, player style reports, repertoire management.
- **ChessBase 26 (Windows)** — Opening Report with Elo-class statistics,
  reference search filters, piece-path visualisation with success rates,
  Monte Carlo analysis, duplicate search, Elo profile in the style report,
  parallel instant analysis, new engine management, remote engine.
- **Long-standing ChessBase/Fritz features** — tournament cross-tables, player
  dossiers with an Elo graph, replay training, tactical analysis, copy/print
  diagrams, engine matches and tournaments, threat display.

## Inventory: what Kingfisher already had

Searched in `src/` before writing anything: Opening Report with Elo classes and
plans (`theory/opening-report`, `theory/opening-plans.ts` — piece destinations
over a population, the evidence behind ChessBase 26's piece paths), opening
surveys, Monte Carlo playouts (`engine/playouts.ts`), duplicate search, style
report (`preparation/style.ts`), remote engines and parallel analysis queue,
cloud evaluations (the Let's Check equivalent, `engine/cloud-eval.ts`), tactical
annotation as evidence (`review/annotate.ts`), Guess the Move (model games
only), CBH/CBV read and write, repertoire inbox, printable study documents with
diagrams (`publish/chapter-html.ts`), position report printing.

## Gaps found, and what 1.4.2 does about each

| ChessBase feature                                  | Kingfisher before 1.4.2              | 1.4.2                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tactics puzzles with difficulty and solver ratings | none                                 | **Puzzles**: 24,587 puzzles from the CC0 Lichess export, offline, rated; solver rating is Glicko-2 over the person's attempts (portable store, schema v24). `src/training/puzzles.ts`, `src/features/puzzles/`                                             |
| Tournament cross-table                             | none                                 | **Tournament** from any game in the Library: round-robin grid or swiss table from the games the database holds, Sonneborn-Berger, Buchholz, FIDE 8.1.1 performance; provisional when pairings are missing. `src/tournament/crosstable.ts`                  |
| Threat display / pieces in danger                  | attack relations for one square only | **Threats and safety** in Features: pieces en prise by static exchange (x-rays, no pins — stated), loose pieces, and the engine's answer with the turn passed, labelled with engine, depth and budget. `src/chess/safety.ts`, `src/stores/threat-store.ts` |
| Copy / save a diagram                              | print a whole report or study only   | **Copy diagram as image**, **Save diagram as PNG/SVG** from the Position menu, with the player's pieces, colours and drawn arrows. `src/features/board/diagram.ts`                                                                                         |
| Engine matches (Fritz)                             | one engine against itself (playouts) | **Engine match** in the engine panel: any two engines or two sessions of one, colours alternating, W/D/L, Elo with a 95% interval, LOS, adjudications counted, PGN and study export. `src/engine/match.ts`, `src/stores/match-store.ts`                    |
| Player dossier Elo graph                           | min / max / average rating           | **Rating history** on the player page: median recorded rating per month and FIDE performance per year, labelled as the games' recorded ratings, not a rating list. `src/player/rating-history.ts`                                                          |
| Replay training on any game                        | Guess the Move on model games only   | Guess the Move offered in Analysis and Studies.                                                                                                                                                                                                            |

## Not built, and why

- **Fritztrainer video courses, Mega Database 2026, Opening Encyclopedia,
  ChessBase's own cloud and the 128-core remote engine** are publisher products
  and services. Kingfisher has no licence to them and no server; buying or
  copying a proprietary corpus is not a substitute for redistribution rights.
- **Cloud database synchronisation** stays outside the owner's file-exchange
  decision (ADR `00xx-optional-account-sync.md` remains Proposed).
- **Piece-path hover with success rates** (ChessBase 26): the destinations
  already exist in the Opening Report over a named collection; drawing them on
  the board on hover is an enhancement of an existing feature, not a gap, and
  was left for a later increment.
- **Voice input** depends on a speech service the Mac shell does not have.

## Big data without a server or a disk

The owner has no server and a nearly full SSD. Two cheap answers, one used:

1. **Certification runs on a free GitHub-hosted runner.** The repository is
   public, so Actions minutes cost nothing. `.github/workflows/real-scale.yml`
   pools the runner's disks, downloads one CC0 Lichess month with the
   publisher's SHA-256 and runs the existing acceptance script (product import
   path, corpus minimum, Explorer checked against an independent replay of every
   stored PGN). Only `result.json` and the log are kept. The run for 2017-02
   (10,194,939 games) is recorded in the 1.4.2 release report.
2. **Large reference data is served, not stored.** Packs are already sharded
   and fetched on demand from a public data mirror with bounded caches; the
   Puzzles set is 4.3 MB in rating shards that load only as needed.

## Expert annotations

The 1.4.1 report left "thousands of licensed expert annotations" open. Project
Gutenberg's chess shelf was searched for further public-domain books whose
authors died at least seventy years ago (so the notes are free worldwide, not
only in the United States). The Morphy (Edge, 1859) and Bird (1893) volumes
contain almost no game scores. Edward Lasker's _Chess Strategy_ (1915) has many
annotated games and is public domain in the United States, but its author died
in 1981, so it is not public domain where the term is life plus seventy years —
publishing it from a worldwide site is the owner's decision, and it was not
shipped. The honest status is unchanged: 14 games and 210 notes by Capablanca.

## Independent comparisons

Running ChessBase, timing strong players on the same tasks, and opening
Kingfisher's CBH exports in a licensed ChessBase all need a licence and
participants this project does not have. The acceptance kit from 1.4.1
(`docs/operations/independent-chessbase-acceptance.md`) is ready for whoever
does; nothing here is offered in place of it.
