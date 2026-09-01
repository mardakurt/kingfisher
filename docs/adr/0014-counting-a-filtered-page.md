# 0014 — A page reports `hasMore`; a total is opt-in

**Status:** Accepted

## Context

Phase 3 left a documented limitation: a result set of more than about 2,000
matches, sorted by a field no index carries, paged correctly but paid a full
scan to work out its total.

The scan is not an implementation accident. IndexedDB can count an index range
through a key cursor without deserialising anything, but a filter the index
cannot answer — free text, an opening substring, a rating bound — has to visit
every record to decide whether it matches. Counting such a query costs exactly
as much as running it over the whole store, however small the page.

The question is therefore not "how do we count faster" but "who actually wants
the count". On a database screen the answer is almost nobody: the user wants
rows, and they want to know whether the Next button does anything.

## Decision

`GameSearchResult` carries `total: number | null` and `hasMore: boolean`.

- `hasMore` is always exact. It costs one extra row: the scan asks for
  `limit + 1` and stops there.
- `total` is exact when the plan's index range answers the whole query, because
  then it is a key-cursor count and effectively free. It is also exact when the
  query was small enough to be read and sorted in full, because the match set
  is already in hand.
- Otherwise `total` is **null**, and a caller that genuinely needs a number
  passes `exactTotal: true` and pays for it. Opponent preparation does exactly
  this, because its report says "42 of 137 games" and that second number is
  worth one count.

Null is not zero and not "about this many". The repository declines to produce
a number rather than producing an estimate, and the games footer renders the
difference: `1–100 of 12,480 games` when the total is known, `1–100 of 12,480
games` against the _stored_ count with a working Next button when it is not.

## Alternatives considered

- **Cache the count per query.** Correct only until the next import or delete,
  and every invalidation bug shows up as a confidently wrong number.
- **Estimate from a sample.** Fast, and the one thing a database screen must
  never do. A count that is wrong by 3% is indistinguishable from a count that
  is wrong because the filter is broken.
- **Index every filterable field.** Helps the fields that can be indexed and
  does nothing for free text or substring matching, which is where the cost is.
- **Always scan.** What Phase 3 did. Correct, and pays the full price on every
  keystroke of a search box.

## Consequences

- Paging a filtered search no longer scans the collection.
- The interface can no longer always say "page 3 of 47" — it says "page 3" with
  Next enabled. That is a real loss, and it is smaller than the loss of making
  every filtered search proportional to the database.
- `total: null` is a case every caller has to handle, which is deliberate: the
  type makes "I don't know" impossible to confuse with "none".
