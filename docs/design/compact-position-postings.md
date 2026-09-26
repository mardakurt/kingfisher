# Compact position postings — ten million games on a laptop's disk

_Design and measured proposal, 2026-09-26 (Phase 86). Answers the storage
half of the Phase 85 verdict's row 10: the explorer and the position page
were not measured at 10,680,708 games because their per-position rows would
need about 330 GB. Status: **proposed and proven on real games; not yet the
companion's schema.**_

## 1. The problem, measured

Phase 85 imported Lichess standard 2014-07 (1,048,440 games) through the
product's own path: **33.2 GB**. Scaled to Lichess 2017-01 (10,680,708 games)
that is about **330 GB**, more than the free space on the maintainer's Mac
and on most laptops, so the 10M import was made search-only and the explorer
and position page went unmeasured at that size.

Phase 86 measured where the bytes go with SQLite's `dbstat`, on
100,445 real broadcast games imported through the same path
(`scripts/bench-real-scale.mjs`), and `scripts/probe-compact-postings.mjs`
accounted for every table and index:

The database: **3.80 GB for 100,445 games (37,794 bytes a game)**,
7,484,042 position rows, 74.5 plies a game. **85.8% of it (3,257.7 MB) is
the position side**:

| Object                                                                                       | Kind             | MB    |
| -------------------------------------------------------------------------------------------- | ---------------- | ----- |
| `positions`                                                                                  | table            | 815.5 |
| `position_aggregates`                                                                        | table            | 542.8 |
| `positions_key`                                                                              | index            | 465.6 |
| structure dictionaries (claim sets, skeletons, signatures, members) and their unique indexes | tables + indexes | 889.0 |
| `positions_rank`, `positions_recent`                                                         | index            | 197.4 |
| `positions_game`                                                                             | index            | 88.0  |
| the three structure-id indexes                                                               | index            | 258.5 |
| the game side (games, content, text, line index)                                             | —                | 539.4 |

(Full `dbstat` listing: `docs/release-evidence/phase-86/compact-postings/probe-result.json`.)

The cause is structural, not a missing `VACUUM`:

- **One row per (game, ply), and the position identity is text.** Each row
  carries the canonical position key (a FEN without counters, about 55–60
  bytes), the move as UCI text and again as SAN text, the mover, and the
  result, beside the rowid.
- **Every row is indexed again.** `positions_key` copies the text key a
  second time; `positions_game`, `positions_rank`, `positions_recent` and the
  three structure-id indexes each add a row per ply.
- **The aggregates are nearly a second copy.** `position_aggregates` holds
  one row per (position, move), again with the text key and SAN. Most
  positions past the opening occur in exactly one game
  (5,791,195 of 6,017,030, 96% of distinct positions here), so the "aggregate" of the
  long tail is the tail itself.

## 2. The proposal

Keep every ply of every game. Change what a ply costs.

```sql
-- One b-tree, clustered by position: all of a position's occurrences are
-- adjacent, so the explorer reads one contiguous range and needs no index.
CREATE TABLE postings (
  pos  INTEGER NOT NULL,  -- first 8 bytes of SHA-256(positionKey), signed
  game INTEGER NOT NULL,  -- games.id
  ply  INTEGER NOT NULL,
  move INTEGER NOT NULL,  -- from | to << 6 | promotion << 12 (15 bits)
  PRIMARY KEY (pos, game, ply)
) WITHOUT ROWID;

-- A game's moves, two bytes a ply: continuations after a position, deleting
-- a game (replay it, delete its postings by key), and rebuilding anything
-- derived, without a secondary index on postings.
CREATE TABLE game_moves (game INTEGER PRIMARY KEY, moves BLOB NOT NULL);
```

What is **not** stored, and why that loses nothing:

| Dropped per ply        | Recovered from                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the text key           | the caller's own `positionKey()`, hashed; the key is what the question is asked with                                                                                  |
| SAN                    | the rules code: the position and the UCI move determine it (derived for 9,040 moves in the probe, all equal)                                                          |
| the mover              | the key's side-to-move field                                                                                                                                          |
| result, year, rating   | `games`, joined by id, as the filtered explorer already does                                                                                                          |
| `positions_game` index | `game_moves`: replay the game to find its keys                                                                                                                        |
| structure ids per ply  | a property of the _position_: one row per distinct position in an optional `position_facts(pos, skeleton, signature, claims)`, built only if structure search is used |

**Identity is still the canonical position.** The hash is of `positionKey()`
— placement, side to move, castling rights, en passant — so transpositions
meet exactly as they do now, and nothing is keyed on a move sequence.

### Hash collisions

64 bits over the positions of ten million games (about 5 × 10⁸ distinct):
the chance that the position a player asks about shares its hash with any
other in the database is about 5 × 10⁸ / 1.8 × 10¹⁹ ≈ 3 × 10⁻¹¹ per query.
That is not zero, and Kingfisher does not put an unchecked number in front
of a player, so two checks close it:

1. **At build**: the distinct-key count equals the distinct-hash count, or
   the build reports which keys collided (the probe: 6,017,030 keys,
   6,017,030 hashes — none).
2. **At read**: every continuation returned must be a legal move in the
   position asked about (the SAN derivation already plays it). A colliding
   position's moves are, with overwhelming likelihood, illegal here; they are
   excluded and the answer says so. Opening a backing game replays it to the
   position, so a game list can never contain a game that does not reach it.

### Hot positions

A clustered range makes a rare position a handful of rows. The start
position in ten million games is ten million postings; counting them with
the join is seconds, not milliseconds. So the unfiltered aggregates stay —
but only for positions with at least _N_ games (say 64), keyed by `pos`:
thousands of rows, not hundreds of millions. Below _N_ the range is read
directly. The filtered cache (`position_filter_cache`) is unchanged in role
and keyed the same way.

## 3. What the probe measured

`node scripts/probe-compact-postings.mjs --db <the 100,445-game database> --sample 3000 --top 200`,
run twice with identical results (`docs/release-evidence/phase-86/compact-postings/`):

| Measure                                      | Current schema   | Postings                                         |
| -------------------------------------------- | ---------------- | ------------------------------------------------ |
| Position side, whole                         | 3,257.7 MB       | **179.9 MB** (postings 163.5, `game_moves` 16.4) |
| Position side without structure search       | 2,110.2 MB       | 179.9 MB — **11.7× smaller**                     |
| Per game                                     | 32,433 B         | **1,791 B**                                      |
| Per ply                                      | 435 B            | **21.8 B** a posting + 2 B of `game_moves`       |
| Explorer query, median / p95 (8,952 queries) | 0.013 / 2.155 ms | 0.012 / **0.753 ms**                             |
| Build from the existing rows                 | —                | 62 s                                             |

**Equivalence: 0 mismatches.** 2,984 positions (the 200 most frequent and
2,800 drawn by row, so most are the long tail), each asked unfiltered,
rating ≥ 2200 and year ≥ 2025: every move, game count, white/draw/black
split, average rating and last year identical; SAN derived through the rules
code for all 9,040 moves returned and equal to the stored SAN; the set of
games reaching each position identical; 500 games' moves read back from
`game_moves` identical to their rows. **Collisions: none** (6,017,030
distinct keys, 6,017,030 distinct hashes).

**Structure search is the part not carried.** Its dictionaries and indexes
are 1,147.5 MB here, a third of the position side, because nearly every
position has its own claim set. At the sizes this proposal is for, those
questions already have a measured answer that needs no per-position rows:
the line index's scan, equal to the replayed oracle and 30–39 s at
10,680,708 games (Phase 85, row 3). So schema 3 keeps structure rows only
for collections small enough that they are cheap (a threshold set by
measurement), and answers structure questions on large ones from the line
index.

**What ten million games would cost — an estimate, not a measurement.**
Lichess 2017-01, 10,680,708 games: the search-only import Phase 85 measured
is **22.96 GB** (games, content, text search, line index). Postings add
23.8 B a ply; at 60–80 plies a game that is **15.3–20.3 GB**. Together
**about 38–43 GB, against about 330 GB** for the current schema — within
this Mac's free space. The plies a game of that month and the hot-position
aggregates are the two unknowns; the 10M import with postings is what
settles it (§6).

## 4. What the proposal costs, and what it does not do

- **A forward-only migration** (schema 3), chunked and resumable exactly as
  the Phase 17 compact migration (`companion/src/position-schema.mjs`), and a
  reader resolved once per database, so no query carries a runtime branch.
  Every historical schema keeps a fixture.
- **Every positions query changes**: explorer, filtered explorer, games at a
  position, continuations, the structure and claim searches, deletion,
  verification and aggregate rebuild. Each gets an equivalence test against
  the current reader on the same imported games, as the probe does.
- **It does not change what a pack is.** Reference packs are separately
  aggregated shards; this is the companion's own database.
- **It is not compression.** Page-level compression (a zstd VFS) would
  roughly halve it again at a CPU cost, and needs a native extension the
  companion does not load today. Not proposed until the posting schema is in.

## 5. Alternatives, and why not first

| Option                                             | Saves                   | Why not first                                                                                                                                            |
| -------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep positions only to ply _k_ (e.g. 40)           | about half              | Deep positions become "no games" when they mean "not indexed": unknown shown as zero. Possible later as an explicit, labelled import choice              |
| Put the database on an external SSD                | all of it, from the Mac | Works today with no code (`KINGFISHER_COMPANION_DATA_DIR`, or attach a database file); a disk, not a fix — 330 GB is still 330 GB                        |
| Ask a remote explorer (Lichess) instead of storing | all of it               | A different population, live rather than owned, and unavailable offline. Already offered as its own column; never a substitute for the player's database |
| Dictionary-encode the key (key table + integer id) | the key's two copies    | Most keys occur once, so the dictionary is nearly as large as what it replaces                                                                           |

## 6. Recommendation

Adopt the posting schema as companion schema 3, behind the existing
explicit migration, in this order: (1) import writes postings and
`game_moves` for new databases; (2) every positions reader gains a schema-3
branch with an equivalence test; (3) the migration for existing databases;
(4) the 10M import with positions, and the explorer and position page
measured there — Phase 85's unmeasured half of row 10. Until then, a player
with a 10M-game file keeps using the search-only import, which already
answers headers, the move search, preparation and duplicates in
milliseconds-to-seconds.
