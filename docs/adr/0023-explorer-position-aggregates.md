# 0023. A derived aggregate table for the unfiltered opening explorer

Status: Accepted

## Context

Phase 6 measured the SQLite companion at 100,000 games and named the slowest
ordinary interaction plainly: the unfiltered opening aggregation, at 129 ms
median and 397 ms worst case. Every other query was under 30 ms.

The reason is structural rather than a missing index. Answering "what is played
here" means visiting every `positions` row for that key, joining each to its
game for the result, rating and year, and grouping. A position every game
reaches is therefore a query whose cost is the size of the collection. Indexes
make finding the rows fast; they cannot make there be fewer of them.

`EXPLAIN QUERY PLAN` confirmed the index on `positions(position_key)` was used
and the join was by rowid — there was nothing left to tune. The work itself was
the problem.

## Decision

**A derived table, not a cache.** `position_aggregates` holds one row per
`(position_key, move_uci)` with the counted games, the three result totals, a
rating sum and count, and the latest year. It is `WITHOUT ROWID` with that pair
as its primary key, so a lookup is a range scan returning at most a couple of
dozen rows.

**Maintained by triggers inside the writer's transaction.** An insert into
`positions` upserts its aggregate row; a delete rebuilds the affected move from
the source rows. Import stays O(1) per position, which is the high-volume path.
Deletion recomputes, because removing the row that held the maximum year cannot
be undone by arithmetic — and deletion is rare. Because the maintenance is a
trigger, it holds for any writer, including a future one, rather than depending
on every call site remembering.

**Filtered queries do not use it.** This is the line that must not be crossed.
An all-time reduction cannot answer "last twelve months" or "Elo ≥ 2400", and
pretending otherwise would make Kingfisher state a chess fact that is false.
Any query carrying a filter takes the normalized `positions JOIN games` path and
pays the scan. Making _that_ fast is a different piece of work, and this ADR
does not claim to have done it.

**Consistency is checkable and repairable, never repaired silently.**
`aggregateIntegrity()` reports indexed positions against aggregated positions
and row count; `rebuildAggregates()` reconstructs the table in one transaction.
Both are exposed over the companion (`/db/integrity`, `/db/rebuild-aggregates`)
and surfaced as Settings → Database → Verify explorer index. A collection
written before this table existed rebuilds once on open.

## Consequences

The measured aggregation at 100,000 games went from 129.2 ms to 0.3 ms, with the
same query on the same rows via the normalized path re-measured at 132.0 ms in
the same run as the honest before-figure. The `bench:aggregates` suite confirms
the lookup stays under 0.1 ms with 900,008 aggregate rows, because its cost
tracks moves at a position rather than games reaching it.

Inserts got 31% slower: 100,000 games went from 12.1 s to 15.9 s through the
companion. That is the price, stated rather than hidden, and it is the right way
round for this application — imports are started once, aggregations happen on
every move.

The SQLite file is larger by one row per distinct `(position, move)` pair. On a
real archive that is a small fraction of `positions`, which holds one row per
game per move.

Two representations of the same truth now exist, which is exactly the kind of
thing that rots. The triggers, the integrity check and the rebuild are all there
because of that, and the companion test suite covers insert, delete and rebuild
agreement.
