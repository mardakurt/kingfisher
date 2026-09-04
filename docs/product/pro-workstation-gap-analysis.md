# Where Kingfisher stands against the workstations professionals actually use

Rewritten at the end of Phase 12. The purpose is unchanged: this is only worth
anything if it is honest about what is missing, so every "still missing" below
is a real gap and several are gaps a strong player would notice in their first
week.

Compared against **ChessBase 18** (with Mega Database), **En Croissant 0.15**
(March 2026), and **ChessMonitor**. Each row is classified as _Kingfisher
stronger_, _Equivalent_, _Different by design_, or _Still missing_.

The bar for "stronger" is deliberately high. Having a checkbox for the same
concept is not stronger; the comparison is on speed, friction, reliability,
depth, discoverability and data correctness, and where Kingfisher merely has
the feature the row says _Equivalent_.

---

## Analysis and engines

| Capability                         | Verdict             | Detail                                                                                                                                                                                      |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run a local UCI engine             | Equivalent          | Any UCI engine, registered by path through the companion, with a real handshake before it is accepted. En Croissant's engine management is at least as convenient.                          |
| Capability detection               | Kingfisher stronger | Options are read from the engine's own `option` lines, never a per-engine table. Lc0's missing `Hash` and zero-default `Threads` are handled because they are asked about, not assumed.     |
| Multi-engine comparison            | Equivalent          | Two engines on one position with agreement and PV divergence reported. En Croissant also runs multiple engines; Kingfisher additionally explains disagreement by search family where known. |
| Engine evidence as a stored record | Kingfisher stronger | A pinned line keeps engine, build, settings, depth and time. ChessBase stores a number in a comment; this stores a measurement you can still interpret in a year.                           |
| Cloud engine analysis              | **Still missing**   | ChessBase sells engine cloud time. Kingfisher has no equivalent and no plan for one.                                                                                                        |
| Automatic full-game analysis       | Equivalent          | The background analysis queue is resumable and yields to interactive work, which ChessBase's blunder-check does not.                                                                        |
| Opening books (Polyglot/CTG)       | **Still missing**   | En Croissant added Polyglot/PGN/EPD book support in 0.15; ChessBase has CTG. Kingfisher has repertoires and an explorer, which is not the same thing as a book an engine can consult.       |

## Databases and search

| Capability                          | Verdict             | Detail                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Large local database                | Equivalent          | SQLite through the companion, measured to 500,000 games for player and text search and to 100,000 for every Phase 12 operation. ChessBase handles larger sets more comfortably at the very top end, and Mega Database is ten million games.                                                                       |
| Position and pawn-structure search  | Equivalent          | Deterministic structural identity with a versioned signature. ChessBase's search is broader; Kingfisher's is reproducible and its definitions are published.                                                                                                                                                      |
| Strategic theme search              | Kingfisher stronger | Sixteen themes decided by counting, each definition versioned and shown beside the match. ChessBase's equivalent does not publish its rules.                                                                                                                                                                      |
| Duplicate detection on import       | Kingfisher stronger | Fingerprint uniqueness is a schema-level constraint, so a duplicate cannot be stored and later found.                                                                                                                                                                                                             |
| Copy / move games between bases     | Equivalent          | Now real, in all four directions, paged, with progress and cancellation. A move copies, asks the destination to confirm, and only then deletes — an invariant ChessBase does not state and this one tests. ChessBase's own copy is faster on very large sets and has decades of edge cases in it.                 |
| Merge collections                   | Kingfisher stronger | The exact overlap is counted before anything is written — 452 ms across two hundred-thousand-game collections. ChessBase merges and tells you afterwards.                                                                                                                                                         |
| Cross-collection duplicate handling | Kingfisher stronger | Byte-identical copies and the same game annotated two different ways are different findings with different actions, and the second is never resolved automatically. Every competitor's dedupe will happily discard somebody's notes.                                                                              |
| Multi-database search               | Equivalent          | One query across selected collections, with per-source counts and no merging of source identity. ChessBase's is faster and covers more filters.                                                                                                                                                                   |
| Reference database designation      | Equivalent          | One action from the Databases screen, plus named source sets that reference rather than copy.                                                                                                                                                                                                                     |
| ECO / opening classification        | Kingfisher stronger | 3,810 named positions keyed by canonical position identity, so transpositions converge without a special case, and a game is named by the deepest position it reaches. The dataset, its licence and its version are published, and the imported tag is preserved beside the computed one rather than overwritten. |

## Preparation and study

| Capability                     | Verdict             | Detail                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repertoire as positions        | Kingfisher stronger | Keyed by canonical position, so two move orders reaching the same position are one entry automatically. ChessBase repertoires fragment by move order.                                                                                       |
| Opponent preparation           | Equivalent          | Preparation sessions, dossiers and a game-day sheet, now one click from any player profile. ChessMonitor's scouting covers more online sources.                                                                                             |
| Position report                | Kingfisher stronger | One click, every source cited, no move labelled "best", and now printable and filable into a study with its measurement date attached. ChessBase's report is broader; this one can be checked line by line.                                 |
| Player profile page            | Equivalent          | Overview, per-colour openings, opponents, recent games and preparation, every figure with its denominator. ChessMonitor's is prettier, covers online ratings and time management, and is the better tool for someone who only plays online. |
| Style / tendency reporting     | Kingfisher stronger | Ten deterministic metrics, each printing the rule it applied, three-valued so a game that cannot answer is excluded rather than counted as a "no". ChessBase's Style Report asserts personality from counts and does not show its working.  |
| Training and spaced repetition | Equivalent          | Scheduling tied to repertoire positions and review history. En Croissant added a full practice mode in 0.15.                                                                                                                                |
| Concealment before reveal      | Kingfisher stronger | Subtractive at the data layer and asserted by DOM absence, not CSS. No competitor treats this as an invariant.                                                                                                                              |

## Online games

| Capability                | Verdict             | Detail                                                                                                                                                                                                                          |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import own online games   | Equivalent          | Lichess and Chess.com by username, incremental per each API's real cursor. ChessMonitor's core loop.                                                                                                                            |
| No account required       | Kingfisher stronger | Local-first. ChessMonitor requires an account and holds your games; Kingfisher holds nothing and uploads nothing.                                                                                                               |
| Online statistics/trends  | **Still missing**   | ChessMonitor's rating trends, FIDE-Elo estimation, time-management and opening-performance dashboards have no Kingfisher equivalent. The player profile covers the stored-game half of this and none of the online-rating half. |
| Automatic background sync | Different by design | Sync is explicit. Continuous polling of someone else's API for a single user is not something this application will do without being asked.                                                                                     |

## Tablebases

| Capability            | Verdict             | Detail                                                                                                                                                                                                                    |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote tablebase      | Equivalent          | The public Lichess Syzygy service, with provenance stated.                                                                                                                                                                |
| Local tablebase       | Equivalent          | Select a directory; the companion builds and manages a Fathom-based probe helper and reads the files. No second service to start. ChessBase's setup is a folder too, and is not gated on a C compiler being present.      |
| Never decoding Syzygy | Kingfisher stronger | Kingfisher ships no decoder and delegates to Fathom, pinned by commit with digests recorded. A wrong tablebase result is worse than none, and this is the only competitor that says so and structures the code around it. |
| Distance to mate      | Different by design | Syzygy has no DTM, so Kingfisher reports none. ChessBase will show DTM from other table formats; deriving one from DTZ would be a fabricated proof.                                                                       |

## Reliability

| Capability                | Verdict             | Detail                                                                                                                                                                                                             |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema migration safety   | Kingfisher stronger | Every historical schema version has a fixture that migrates real data forward and is checked for semantic equality.                                                                                                |
| Corrupt-state recovery    | Kingfisher stronger | A corrupt layout boots as the default, and the root error screen offers "Restore default workspace" without requiring Settings.                                                                                    |
| Randomized correctness    | Kingfisher stronger | Seeded fuzz testing over the game tree and PGN round-trip.                                                                                                                                                         |
| Provider chaos coverage   | Kingfisher stronger | Ten injected infrastructure failures, each asserting that the board, the move tree and the notes stay usable, and that recovery needs no restart. No competitor publishes anything comparable.                     |
| Data-loss safety on move  | Kingfisher stronger | A move never deletes what the destination has not confirmed, and the test suite proves it against a destination that reports success and stores nothing.                                                           |
| Configuration wiring      | Kingfisher stronger | 129 structural checks that every preference has a reader, every tool a renderer, every shortcut a handler, every store a consumer.                                                                                 |
| Zero-retry release gate   | Kingfisher stronger | 121 browser tests must pass first time. A flaky-but-green suite is not a passing gate.                                                                                                                             |
| Multi-tab safety          | Kingfisher stronger | Revision-checked writes refuse a stale overwrite rather than silently losing a variation.                                                                                                                          |
| Accessibility             | Equivalent          | Every interactive control on twelve routes is announceable, keyboard-only paths are driven rather than inferred, focus returns to the opener. No competitor is obviously better; none is obviously audited either. |
| Visual regression testing | **Still missing**   | Thirteen deterministic shots exist and guard local development, but the baselines are macOS-only and the suite therefore skips in CI. It does not yet gate a release.                                              |

---

## The honest summary

The four gaps the Phase 11 analysis called genuine competitive losses are
closed. A player with several archives can now copy, move, merge and de-duplicate
between them without exporting a PGN; a player can open a profile for anybody in
their database and be one click from the board; a game with no `[ECO]` tag gets
classified from the position; and local Syzygy files are read by selecting a
folder.

Kingfisher is now clearly stronger on **evidence discipline** — provenance,
reproducibility, published definitions, concealment, migration safety, and the
refusal to assert what it has not measured — and that lead widened this phase.
The classification, the tendency metrics and the duplicate workflow are all
places where a competitor gives you an answer and Kingfisher gives you an answer
plus the rule that produced it.

It is still behind in four places, and none of them is a small matter:

- **Scale at the very top end.** Mega Database is ten million games. Kingfisher
  is measured to 500,000 and nothing here extrapolates past that.
- **Opening books.** Both ChessBase and En Croissant have a book format an
  engine can consult. Kingfisher has repertoires and an explorer, which serve a
  different purpose.
- **Online analytics.** ChessMonitor's rating trends, Elo estimation and
  time-management dashboards have no equivalent, and the player profile does not
  attempt them.
- **Cloud engine time.** No equivalent and no plan.

And one gap is in the tooling rather than the product: the visual regression
suite does not gate CI, because its baselines exist for one platform only.

Nothing in that list is blocked by an architectural decision. Three of the four
are unbuilt work; the fourth — top-end scale — is a measurement nobody has taken
rather than a limit anybody has hit.
