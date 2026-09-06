# Storage: the compact position index, shipped and measured

Phase 17 measured a prototype of this on a copy and did not ship it. Phase 18
shipped it. These are the numbers from the shipped code, on real games, at two
and a half times the scale Phase 17 measured.

## What was measured

**150,119 real over-the-board games, 11,303,059 indexed positions**, imported
through the application's own path — `parsePgn → normalizeGame → classifyTree →
indexGame → GameDatabase.insertGames` — from the cached Lichess broadcast
archives, CC BY-SA 4.0. Apple M3 Pro, darwin-arm64, node 24.14.0.

The "before" collection is a real text-schema collection, not a simulation of
one: the file is created with the `positions` DDL exactly as it stood at commit
`24a30ac` (`companion/src/__fixtures__/text-schema.mjs`) and then imported
into. `GameDatabase` detects the text schema and writes to it, which is what a
collection created before this phase does.

## Size

|                    |      before |       after |
| ------------------ | ----------: | ----------: |
| Whole database     | **8.70 GB** | **4.96 GB** |
| Bytes per game     |  **57,928** |  **33,061** |
| Bytes per position |       769.4 |       439.1 |
| A million games    | **57.9 GB** | **33.1 GB** |

**3.73 GB saved on 150,119 games — 42.9%.**

Phase 17's prototype predicted 56,467 → 33,270 bytes per game, a 41.1%
reduction, on 60,469 games. The shipped implementation does slightly better at
2.5× the scale, which is what the design predicts: the saving comes from
repeated values being stored once, and a larger collection repeats more.

The "after" figure **includes** the claims index this phase added, which the
text schema could not have. Without it the file is 4.83 GB and the reduction is
44.5%; the index is 130 MB and is worth it — see below.

## Speed

Median of ten runs after a warm-up, on the same collection before and after.

| Query                      |    before |         after |
| -------------------------- | --------: | ------------: |
| Explorer, start position   |         — |      0.053 ms |
| Explorer, Najdorf          |         — |      0.056 ms |
| Explorer, filtered         |  0.694 ms |  **0.681 ms** |
| Games at position          | 20.772 ms | **10.827 ms** |
| Exact position search      | 15.663 ms |  **9.132 ms** |
| Pawn skeleton search       | 18.766 ms | **10.866 ms** |
| Structure signature search |         — |     77.184 ms |
| Claim search               |         — |    2,311.7 ms |
| Read a page of positions   |         — |      6.346 ms |
| Player prefix              |         — |      0.040 ms |

Three caveats, stated rather than buried.

**Four "before" figures are missing.** The text-schema query run was
interrupted, so only the four rows above were captured before the collection
was migrated. A migration is not reversible, and re-importing 150,000 games to
recover four numbers was not worth the two hours. What can be said is what was
measured; what cannot be said is anything about the other six.

**The "before" run shared the machine.** It ran while the browser suite was
running, and the "after" run did not. That biases the comparison in the
compact schema's favour by an unknown amount, so the honest reading of the
three roughly-halved rows is "not slower, probably faster", not "twice as
fast".

**The explorer was not measured before.** It is the query that matters most and
the one the design predicts is unaffected, because it goes through
`positions_key`, which the compact schema does not touch. 0.053 ms after is
consistent with Phase 17's 0.012 ms on a collection a quarter the size, and is
not a comparison.

## Claim search, and the index that is not enough

A claim search asks "which positions have this strategic claim". Under the text
schema that was `structure_claims LIKE '%"open:c"%'` — a leading wildcard, which
no index on the text can serve, so it scanned all 11.3 million position rows and
never had an index at all.

Compacting turns the positions side into an integer `IN`, which an index does
serve, and this phase adds one:

| claim search on 11,303,059 positions |       median |
| ------------------------------------ | -----------: |
| no index on `structure_claims_id`    |     3,399 ms |
| **with the index**                   | **2,312 ms** |

The index costs 130 MB and 2.5 seconds to build. It is still the slowest search
in the product, and the remaining cost is not the index: a common claim matches
a large share of 1,527,506 distinct claim sets, and the result has to be ordered
by relevance before it is cut to thirty. Making that cheap needs a
claim-to-position table, which is a different change and is not in this phase.

## Migration

|                                     |                                            |
| ----------------------------------- | -----------------------------------------: |
| Positions re-encoded                |                                 11,303,059 |
| Preflight estimate                  |                                      162 s |
| Encoding, measured                  | roughly 25 min (chunked, interrupted once) |
| Peak file size during migration     |                               **10.54 GB** |
| Write-ahead log at its peak         |                               **12.82 GB** |
| Free disk required by the preflight |                               **32.69 GB** |

The encoding figure is honest rather than clean: the run was killed part-way,
resumed, and finished, which is the path that mattered more than the stopwatch.
**It resumed and completed correctly**, which is the claim, and the collection
was then checked: schema version 2, 150,119 games, the Najdorf explorer
answering 4,117 games with Be3 824 / Bg5 822 / Be2 625, structure search
returning skeletons and claims, and FENs rebuilt exactly from the position key
plus two integers.

Two things about the peak are worth knowing before running this on a full disk.

**The file grows before it shrinks.** Encoding adds six columns and fills them
while the four text columns are still there, so an 8.70 GB collection was
10.54 GB at its widest. Only the VACUUM at the end brings it down.

**The write-ahead log is the larger number.** It reached 12.82 GB — bigger than
the database. That is why the preflight asks for three times the file size
rather than one, and why the migration commits per chunk instead of once: a
single transaction over eleven million rows would have built a log larger still
before it committed anything.

## Reproducing

```bash
node scripts/bench-compaction.mjs --games 150000 --out ~/kf-compaction-run
node scripts/bench-compaction.mjs --from ~/kf-compaction-run/compaction.sqlite --warm 10
```

The second form migrates a collection that already exists, which is how the
import and the measurement were separated after the import turned out to be
forty-five minutes of the ninety.

The collection these figures came from was deleted once they were recorded.
It was 4.96 GB after migrating and 10.54 GB at its widest, and a measurement
that has been written down does not need its evidence kept on a disk — the two
commands above rebuild it.
