# Text search: what was profiled, what was wrong, and what was fixed

Phase 16 recorded a common-term text search at **2,605 ms cold, 101 ms warm**
on a 210,013-game collection, and called it "the slowest thing a user can trip
over". Phase 17 was asked to profile it rather than guess at a fix. Doing so
found that the headline number measures something other than what it looks
like, and that the real cost was somewhere else entirely.

Measured on a rebuilt real collection: **60,469 broadcast games, 4,435,492
positions, 3.41 GB**, Apple M3 Pro.

## The cold number is a post-import artefact

The benchmark queries the database in the same process that has just spent
eighteen minutes importing into it. Running the identical query phase again
against the same file, opened fresh, gives completely different figures:

| Query                    | immediately after import | same file, fresh open |
| ------------------------ | -----------------------: | --------------------: |
| text search, common term |                 348.8 ms |           **28.0 ms** |
| explorer, filtered       |                 247.6 ms |            **2.7 ms** |
| open + count             |                  19.7 ms |            **0.0 ms** |

Reproduced at a second scale (20,349 games): 85.4 ms → 10.4 ms, 68.0 ms →
1.0 ms, 4.4 ms → 0.0 ms.

So three of the four "cold" costs in the Phase 16 table are the price of the
first read in a process whose caches are full of what it just wrote. **A user
opening an existing collection does not pay them.** The figures are correct
measurements of the wrong thing, and the report should be read with that in
mind.

### A hypothesis that was wrong, and is recorded because it was

The obvious suspect was the write-ahead log: the import left a **192 MB** WAL
beside the database. Checkpointing during and after the import was implemented
and measured against a control build of the same 20,349 games with the change
disabled. The two were **identical** — 86.0 ms against 85.4 ms. The WAL is not
the cause, and the change was reverted rather than shipped on a story.

## The real cost, and the fix

With the post-import artefact set aside, the warm cost is the query itself, and
profiling it is unambiguous. On the 60,469-game collection the term "open"
matches **17,566 games (29%)**. Timing each part on a fresh connection:

|                                                   |            |
| ------------------------------------------------- | ---------: |
| FTS posting list alone (17,566 rowids)            |     4.7 ms |
| Full query, `ORDER BY imported_at DESC LIMIT 101` |    21.2 ms |
| Same query with the `ORDER BY` removed            | **1.7 ms** |

`EXPLAIN QUERY PLAN` says `USE TEMP B-TREE FOR ORDER BY`. There is no index
that can order an FTS match set, so SQLite sorts it — and because the query
said `SELECT *`, it carried **every column of all 17,566 rows** through that
sort to return a hundred.

**The fix is to sort ids and then fetch the page.** Step one selects only
`id`, so each entry in the temp B-tree is a single integer; step two fetches
the hundred rows by primary key. Identical rows, identical order.

Measured with the two forms alternating, five runs each, on fresh connections:

| Term     | Matches | `SELECT *` + sort | ids, then page |
| -------- | ------: | ----------------: | -------------: |
| open     |  17,566 |           23.3 ms |     **7.1 ms** |
| sicilian |  10,776 |           16.9 ms |     **6.4 ms** |
| masters  |   2,717 |            3.5 ms |     **1.2 ms** |

And through the project's own benchmark on the 60,469-game collection, warm
median: **28.0 ms → 9.2 ms** for a common term, 1.0 ms → 0.4 ms for a rare one.

Cold figures are not quoted for the comparison because they are dominated by
the operating system's page cache, which cannot be dropped on this machine
without privileges. The warm median is the number the change is claimed on.

### Plans that were measured and are worse

Recorded so nobody tries them again. All on the same collection.

| Plan                                     | "open" (17,566) | "masters" (2,717) | no matches |
| ---------------------------------------- | --------------: | ----------------: | ---------: |
| Current: `IN (…)` + sort                 |         22.9 ms |            3.5 ms |     0.1 ms |
| `EXISTS` (walks the `imported_at` index) |         36.8 ms |           30.8 ms | **636 ms** |
| `EXISTS` + `INDEXED BY games_imported`   |         37.3 ms |           30.9 ms | **623 ms** |

The index-walk plans are worse everywhere and catastrophic when nothing
matches, because they scan the whole `imported_at` index probing the FTS index
for each of 60,469 rows. The planner's original choice was right.

`ORDER BY id` instead of `ORDER BY imported_at` is 1.7 ms — twelve times
faster still — and was **rejected**. The two orders agree today (zero
inversions across 60,469 rows, because `id` is the rowid and `imported_at` is
stamped at insert), but `insertGames` accepts an explicit `importedAt` and
imports run through a worker, so nothing guarantees it stays true. A faster
answer that is sometimes in the wrong order is not the same feature.

## A second defect, found on the way

Every sort column the search offers has ties — a bulk import stamps hundreds
of games with the same `imported_at` millisecond, and thousands share a rating
or an opening. `ORDER BY` on one of those columns leaves the order within a tie
to the query plan, so **paging could show the same game on two pages and omit
another entirely**.

The order is now `<column> <direction>, id <direction>`. The primary key breaks
every tie, costs nothing — it is the rowid the row is being read by anyway —
and makes paging deterministic. `database.test.mjs` walks a forty-game
collection in pages of seven, sorted by a column full of ties, and asserts it
sees every game exactly once.

## Reproducing

```bash
node scripts/bench-real-scale.mjs --games 60000 --keep --out /tmp/kf-scale
node scripts/bench-real-scale.mjs --query-only /tmp/kf-scale/real.sqlite
```

The first reports post-import figures, the second the settled ones. The
difference between them is the artefact described at the top of this file.
