# 0013 — Large local queries use summaries, bounded pages, and a Worker

**Status:** Accepted

## Context

At 50,000 games, loading every game tree for a list or opening report is no
longer credible. IndexedDB also has a non-obvious join tradeoff: many point
reads are efficient for a rare position, but 50,000 sequential reads for the
initial position measured about 2.1 seconds.

## Decision

Schema v3 separates searchable game summaries from trees and normalized PGN.
Lists use indexed cursor pages of 100. Opponent preparation loads no more than
1,000 full games in one transaction. Local exploration uses point reads up to
500 matching games and a bulk summary join above that threshold.

A query is _planned_, and the plan states two separate facts: whether its index
range answers every predicate (`exact`), and whether walking that index already
produces the requested order (`ordered`). `exact` is derived by counting the
predicates the query carries against the number the chosen branch consumed, so
no branch can drop a filter by forgetting to mention it.

Where the plan narrows but does not order, the page is produced in one of two
ways rather than by sorting whatever the cursor returned: if the range holds at
most 2,000 matches they are read and ordered in full, and above that the sort
index is walked instead with the remaining predicates applied per record,
stopping when the page is full. A key-cursor count decides between them, and
supplies the total either way.

Key ranges are described as plain data and converted to `IDBKeyRange` only by
the native driver. This is a correctness decision, not a style one: while the
planner constructed `IDBKeyRange` values directly it had to guard on the
global's existence, and in Node — where the tests run — every guard failed, so
the entire indexed path was both unexercised and silently different.

The persistent local explorer runs in a module Worker. IndexedDB lookup,
filtering, and aggregation therefore do not block board input even in the
pathological case where all 50,000 games share a position. Repository tests use
the same pure aggregation function without requiring a Worker.

## Alternatives considered

- **Sort the page the cursor returned:** what an earlier version did. It is
  fast and wrong: "the hundred most recent games" became "a hundred arbitrary
  games, displayed in date order", and consecutive pages could overlap.
- **Always scan everything:** simplest and measured to scale linearly on every
  list interaction.
- **Always bulk-read summaries:** fast for the initial position but wasteful for
  rare middlegames.
- **Pre-aggregate every filter combination:** fast reads, but impossible to
  maintain for arbitrary player, rating, and date filters.
- **Add a database dependency:** not needed; the measured indexes and cursor
  wrapper meet the 50k local target.

## Consequences

- Paged list latency stays essentially flat as the collection grows.
- Worst-case exploration remains proportional to matching evidence, but work is
  off the UI thread.
- Pages are stable: page 2 continues page 1 in the requested order, and a total
  counts every match rather than the page.
- A `player` filter therefore means one whole normalized name in both the index
  and the per-record predicate. Partial names belong to the free-text search;
  see ADR 0009 for why identity is never inferred.
- Sorting by a field no index carries (rating, opening) costs a read of the
  matching set. That is the honest price of ordering by something unindexed,
  and it is bounded by matches rather than by collection size.
- The thresholds are evidence-based and documented in
  `docs/performance/phase-3-indexeddb.md`, with the date they were measured;
  they can be remeasured rather than treated as folklore.
