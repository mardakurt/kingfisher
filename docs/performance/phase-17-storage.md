# Storage: the experiment, its numbers, and why it did not ship

Phase 16 measured **58.5 kB per imported game** and named the size of a real
collection as the product's biggest physical constraint: a million games is
about sixty gigabytes. Phase 17 was asked to find out whether that can be cut
without slowing the research paths — **on a copy**, and to ship only if the
trade is clearly positive.

The experiment was run. The trade is clearly positive. **It was not shipped**,
and the last section says why.

Measured on a rebuilt real collection: **60,469 broadcast games, 4,435,492
indexed positions, 3,415 MB**, Apple M3 Pro. Re-measured per-game cost:
**56,467 bytes**, consistent with Phase 16's 58,500.

## Where the space actually is

| Object                          |    GB | Share |
| ------------------------------- | ----: | ----: |
| `positions`                     | 1.858 | 54.4% |
| `positions_structure_signature` | 0.343 | 10.0% |
| `position_aggregates`           | 0.333 |  9.8% |
| `positions_key`                 | 0.313 |  9.2% |
| `game_content` (the PGN itself) | 0.275 |  8.1% |
| `positions_pawn_skeleton`       | 0.197 |  5.8% |
| `positions_game`                | 0.058 |  1.7% |
| `games` and its nine indexes    | 0.030 |  0.9% |

**The position index and its indexes are 81% of the database.** The games are
under 1%; the moves are 8%.

Inside `positions`, per row:

| Column                | bytes/row |    GB | Share of column bytes |
| --------------------- | --------: | ----: | --------------------: |
| `structure_claims`    |     154.2 | 0.684 |                 40.8% |
| `structure_signature` |      57.0 | 0.253 |                 15.0% |
| `fen`                 |      57.0 | 0.253 |                 15.0% |
| `position_key`        |      52.1 | 0.231 |                 13.8% |
| `pawn_skeleton`       |      29.5 | 0.131 |                  7.8% |
| everything else       |      21.7 | 0.096 |                  5.7% |

Two things fall out of that table.

**The structure columns repeat.** 4,435,492 rows carry **669,991** distinct
claim sets, **473,104** distinct signatures and **844,675** distinct skeletons —
between five and nine copies of every value, as text, plus two text indexes.

**The FEN contains the position key.** The key _is_ the FEN with its halfmove
and fullmove counters removed:

```
key  rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -
fen  rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
```

Every row stores both. Only the two integers are new information.

## What was built and measured

A copy in which the three repeating columns become integer ids into lookup
tables, and `fen` becomes two integers the key is concatenated with. Nothing
else changed; the aggregates, the games and the PGN text were left alone.

### Size

|                                     |                              |
| ----------------------------------- | ---------------------------: |
| `positions` and its indexes, before |                 **2,770 MB** |
| `positions` and its indexes, after  |                 **1,367 MB** |
| Saved                               |         **1,403 MB — 50.6%** |
| Whole database before               |                     3,415 MB |
| Whole database after                | **2,012 MB — 41.1% smaller** |
| Per game                            |    56,467 → **33,270 bytes** |
| A million games                     |        56.5 GB → **33.3 GB** |

### Speed

Median of twenty runs each, after a warm-up.

| Query                                      |   before |        after |
| ------------------------------------------ | -------: | -----------: |
| Explorer: every move from a position       | 0.013 ms | **0.012 ms** |
| Structure search by signature              | 0.009 ms | **0.008 ms** |
| Structure search, resolving the text first |        — |     0.012 ms |
| Reading a position's FEN                   | 0.011 ms |     0.016 ms |

**The fast path is not slower.** The explorer lookup is unchanged, because it
goes through `positions_key`, which the experiment did not touch. Structure
search gets marginally faster: an integer index is smaller than a 57-byte text
one. The one cost is rebuilding a FEN — 5 µs on a twenty-row read — and it is
paid only where a whole position is read back, which is not a hot path.

### Migration cost

Re-encoding all 4,435,492 positions took **63 seconds**, indexes included. For
a user's existing collection that is roughly a minute per four million
positions, once.

## Why it did not ship

The numbers say ship it: a 41% reduction with no cost to the paths that matter
is exactly the trade the brief describes as worth taking.

What it needs is not one change. It is a forward-only migration of the largest
table in the product, and by this repository's own rules that means a fixture
for the schema being migrated from, a migration test, and re-validation of
every path that writes or reads a position: the importer, the aggregate
rebuild, structure search, the En Croissant importer, backup and restore, and
the real-scale benchmark. A half-applied schema change to the table holding
81% of a user's data is far worse than a database that is larger than it needs
to be.

That work was not completed in this phase, and shipping the schema without it
would be exactly the "looks smaller theoretically" migration the brief warns
against. So the experiment is recorded with its numbers, and the change is the
first recommendation for the next phase rather than a claim in this one.

## Reproducing

```bash
node scripts/bench-real-scale.mjs --games 60000 --keep --out /tmp/kf-scale
node /tmp/storage-experiment.mjs /tmp/kf-scale/real.sqlite
```

The experiment script is deliberately not in `scripts/`: it builds a schema
Kingfisher does not use, and committing it beside the real builders would
invite somebody to run it against a collection they care about.
