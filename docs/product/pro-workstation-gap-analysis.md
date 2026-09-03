# Where Kingfisher stands against the workstations professionals actually use

Written at the end of Phase 11. The purpose is to be useful when deciding what
to build next, which means it is only worth anything if it is honest about what
is missing. Every "still missing" below is a real gap, and several of them are
gaps a strong player would notice in their first week.

Compared against **ChessBase** (with Mega Database), **En Croissant**, and
**ChessMonitor**. Each row is classified as _Kingfisher stronger_,
_Equivalent_, _Different by design_, or _Still missing_.

---

## Analysis and engines

| Capability                         | Verdict             | Detail                                                                                                                                                                                  |
| ---------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run a local UCI engine             | Equivalent          | Any UCI engine, registered by path through the companion, with a real handshake before it is accepted (Phase 11). En Croissant's headline advantage here is closed.                     |
| Capability detection               | Kingfisher stronger | Options are read from the engine's own `option` lines, never a per-engine table. Lc0's missing `Hash` and zero-default `Threads` are handled because they are asked about, not assumed. |
| Multi-engine comparison            | Kingfisher stronger | Two engines on one position with agreement and PV divergence reported, and disagreement explained by search family where known.                                                         |
| Engine evidence as a stored record | Kingfisher stronger | A pinned line keeps engine, build, settings, depth and time. ChessBase stores a number in a comment; this stores a measurement you can still interpret in a year.                       |
| Cloud engine analysis              | Still missing       | ChessBase sells engine cloud time. Kingfisher has no equivalent and no plan for one.                                                                                                    |
| Automatic full-game analysis       | Equivalent          | The background analysis queue is resumable and yields to interactive work, which ChessBase's blunder-check does not.                                                                    |

## Databases and search

| Capability                         | Verdict             | Detail                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Large local database               | Equivalent          | SQLite through the companion, measured to 500,000 games for player and text search. ChessBase handles larger sets more comfortably at the very top end.                                                                                                                                                                                                                                                  |
| Position and pawn-structure search | Equivalent          | Deterministic structural identity with a versioned signature. ChessBase's search is broader; Kingfisher's is reproducible and its definitions are published.                                                                                                                                                                                                                                             |
| Strategic theme search             | Kingfisher stronger | Sixteen themes decided by counting — opposite/same-coloured bishops, bishop vs knight, the bishop pair, rook vs minor, queenless middlegame, rook and minor-piece endings, IQP, hanging pawns, Carlsbad, symmetrical pawns, open central file, opposite-side castling, both wing majorities. Each definition is versioned and shown beside the match; ChessBase's equivalent does not publish its rules. |
| Duplicate detection on import      | Kingfisher stronger | Fingerprint uniqueness is a schema-level constraint, not a cleanup pass, so a duplicate cannot be stored and later found.                                                                                                                                                                                                                                                                                |
| Copy / move games between bases    | **Still missing**   | Only import, delete and clear exist. There is no collection-to-collection copy, no merge, and no bulk dedup across collections. This is a genuine ChessBase advantage.                                                                                                                                                                                                                                   |
| Reference database designation     | **Still missing**   | A default explorer source is remembered, but there are no named source sets and no one-action switch between them from the explorer.                                                                                                                                                                                                                                                                     |
| ECO / opening classification       | **Still missing**   | ECO is passed through from PGN tags. A game with no `[ECO]` tag gets nothing, and no classifier derives one. ChessBase and En Croissant both classify.                                                                                                                                                                                                                                                   |

## Preparation and study

| Capability                     | Verdict             | Detail                                                                                                                                                                              |
| ------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repertoire as positions        | Kingfisher stronger | Keyed by canonical position, so two move orders reaching the same position are one entry automatically. ChessBase repertoires fragment by move order.                               |
| Opponent preparation           | Equivalent          | Preparation sessions, dossiers and a game-day sheet.                                                                                                                                |
| Position report                | Kingfisher stronger | One click, every source cited, and no move labelled "best" (Phase 11). ChessBase's report is broader; this one can be checked line by line.                                         |
| Player profile page            | **Still missing**   | Phase 9 flagged it, Phase 11 did not build it. There is no per-player aggregate page — the ChessMonitor and ChessBase comparison this document exists to make is unfavourable here. |
| Style / tendency reporting     | Different by design | ChessBase's Style Report asserts personality. Kingfisher will only ever report deterministic, defined metrics — but has not yet built the section that would carry them.            |
| Training and spaced repetition | Kingfisher stronger | Scheduling is tied to repertoire positions and review history rather than to isolated puzzles.                                                                                      |
| Concealment before reveal      | Kingfisher stronger | Subtractive at the data layer and asserted by DOM absence, not CSS. No competitor treats this as an invariant.                                                                      |

## Online games

| Capability                | Verdict             | Detail                                                                                                                                      |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Import own online games   | Equivalent          | Lichess and Chess.com by username, incremental per each API's real cursor (Phase 11). ChessMonitor's core loop.                             |
| No account required       | Kingfisher stronger | Local-first. ChessMonitor requires an account and holds your games; Kingfisher holds nothing and uploads nothing.                           |
| Online statistics/trends  | **Still missing**   | ChessMonitor's rating trends, time-management and opening-performance dashboards have no Kingfisher equivalent.                             |
| Automatic background sync | Different by design | Sync is explicit. Continuous polling of someone else's API for a single user is not something this application will do without being asked. |

## Tablebases

| Capability            | Verdict             | Detail                                                                                                                                            |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote tablebase      | Equivalent          | The public Lichess Syzygy service, with provenance stated.                                                                                        |
| Local tablebase       | **Still missing**   | Local probing still requires the user to run a separate `lila-tablebase`-shaped server themselves. Phase 11 did not make the companion manage it. |
| Never decoding Syzygy | Different by design | Kingfisher will not ship its own decoder. A wrong tablebase result is worse than no tablebase result.                                             |

## Reliability

| Capability                | Verdict             | Detail                                                                                                                                      |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema migration safety   | Kingfisher stronger | Every historical schema version has a fixture that migrates real data forward and is checked for semantic equality (Phase 11).              |
| Corrupt-state recovery    | Kingfisher stronger | A corrupt layout boots as the default, and the root error screen offers "Restore default workspace" without requiring Settings (Phase 11).  |
| Randomized correctness    | Kingfisher stronger | Seeded fuzz testing over the game tree and PGN round-trip, biased toward castling, en passant, promotion and terminal positions (Phase 11). |
| Zero-retry release gate   | Kingfisher stronger | Browser tests must pass first time. A flaky-but-green suite is not a passing gate (Phase 11).                                               |
| Multi-tab safety          | Kingfisher stronger | Revision-checked writes refuse a stale overwrite rather than silently losing a variation.                                                   |
| Visual regression testing | **Still missing**   | Semantic layout assertions exist and are strong; screenshot-diff coverage does not.                                                         |

---

## The honest summary

Kingfisher is now genuinely stronger than its competitors on **evidence
discipline** — provenance, reproducibility, concealment, migration safety — and
has closed the two compatibility gaps that were most often decisive: arbitrary
UCI engines, and getting your own online games in without a file export.

It is still behind on **database management** (no copy, merge, or cross-
collection dedup), on **classification** (no ECO derivation), on **aggregate
views of a player** (no profile page), and on **local tablebases** (still needs
a separately-run helper). A professional who works with several collections, or
who wants a player dossier at a glance, will still open ChessBase for those
specific jobs.

Nothing in the "still missing" list is blocked by an architectural decision.
Each is unbuilt work, and the position-report and structural-search
infrastructure already in place is what most of it would be built on.
