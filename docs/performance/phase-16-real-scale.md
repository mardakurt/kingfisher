# Kingfisher against a real chess database

Every scale measurement in this repository before this one generated its rows.
That answers whether SQLite can hold a million records, which was never in
doubt. It does not answer the question a chess player is asking, because
generated games share an opening book, a name vocabulary and a length — and
those three things are exactly what the position index, the player table and the
full-text index are sensitive to.

This one reads real games.

## The corpus

|                  |                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Source           | Lichess broadcast archive, 2020-01 … 2026-07                                                          |
| Licence          | CC BY-SA 4.0                                                                                          |
| Available        | **1,186,338 real games** across 79 monthly archives                                                   |
| Filtering        | **none** — the Elite pack's thresholds keep a shipped artifact small; a scale test wants the opposite |
| Imported through | `parsePgn` → `normalizeGame` → `classifyTree` → `indexGame` → `insertGames`                           |

That last row is the point. This is the sequence `/db/import` runs for a user's
own PGN, driven directly rather than over HTTP; nothing was inserted
pre-normalised to make a number appear.

```bash
node scripts/bench-real-scale.mjs --games 1000000 --out .real-scale
node scripts/bench-real-scale.mjs --query-only .real-scale/real.sqlite
```

## What was actually built

|                    |                                                             |
| ------------------ | ----------------------------------------------------------- |
| Games stored       | **210,013**                                                 |
| Positions indexed  | **16,017,224**                                              |
| Positions per game | 76.3                                                        |
| Database on disk   | **12.32 GB**                                                |
| **Cost per game**  | **58.5 kB**                                                 |
| Import throughput  | 25–78 games/s, depending on what else the machine was doing |

**The run stopped because the disk did, not because the import did.** The
benchmark watches free space and stops rather than filling the volume it is
running on, and this machine had no room for the rest.

### What a real million-game database costs

At 58.5 kB per game, measured rather than extrapolated from a small sample:

```
1,000,000 real games  ≈  58.5 GB  and  ~76 million indexed positions
```

That is the headline number Phase 16 set out to establish, and it is worth
stating plainly because it is larger than it sounds: **a million-game Kingfisher
collection is a sixty-gigabyte object**. Four fifths of it is the position index
and its three indexes — the thing that makes "what have I played here" answer
instantly — not the games. A user importing at that scale should be told so
before they start, and that is a product question this phase raises rather than
answers.

## What the queries cost, on real data

210,013 games, 16.0 million positions, 12.32 GB. Cold is the first call after
opening; the rest are warm. Milliseconds.

| Query                    |     cold |   median |      p95 | worst |
| ------------------------ | -------: | -------: | -------: | ----: |
| open + count             |      1.0 |      0.5 |      0.6 |   0.6 |
| first page (100)         |      1.8 |      0.4 |      0.8 |   0.8 |
| deep page (offset 50k)   |      2.3 |      0.9 |      1.7 |   1.7 |
| player prefix            |     20.1 |      0.1 |      0.1 |   0.1 |
| player exact             |      0.9 |      0.0 |      0.0 |   0.0 |
| text search, common term |  2,605.6 |    101.5 |    150.2 | 150.2 |
| text search, rare term   |     14.7 |      2.2 |      2.2 |   2.2 |
| text search, no match    |      1.7 |      0.0 |      0.1 |   0.1 |
| ECO filter               |     11.5 |      0.7 |      0.8 |   0.8 |
| year filter              |      0.2 |      0.2 |      0.2 |   0.2 |
| rating filter            |      0.4 |      0.3 |      0.3 |   0.3 |
| explore, start position  |      0.7 |      0.1 |      0.1 |   0.1 |
| explore, Najdorf         |      0.4 |      0.1 |      0.1 |   0.1 |
| explore, filtered        |      1.4 |      0.9 |      2.4 |   2.4 |
| games at position        |  1,705.9 |     20.0 |     46.4 |  46.4 |
| duplicate scan page      |     25.6 |      5.9 |      7.3 |   7.3 |
| export page (200)        |    174.0 |     57.2 |     58.6 |  58.6 |
| aggregate integrity      | 71,589.5 | 67,478.1 | 69,070.1 |     — |

The explorer — the thing a player uses constantly — answers a real position in
**0.1 ms** against sixteen million indexed positions. Paging, filters and player
lookup are all sub-millisecond warm.

## The two defects this found

Neither was visible at synthetic scale, and both were user-facing.

### Twenty-six seconds to open a collection

Opening a database ran `SELECT COUNT(*)` over `position_aggregates` and over
`positions`, only to decide whether either was empty. On this database that was
**22.1 s and 4.5 s — 26.6 seconds before the collection could answer anything**,
growing with every game imported. The question was "is there a row here", which
the same database answers in 0.1 and 0.2 ms.

Fixed in `1908ac8`, along with the legacy-position migration check, which had the
same shape and now has a partial index so an already-migrated collection pays an
index probe rather than a scan.

### The integrity check could not finish

`aggregate integrity` genuinely takes 67 seconds here — the counts it compares
_are_ the verification, and there is no way to reach them without reading every
row. But every companion request had a twenty-second deadline, so **the integrity
check failed on exactly the collections worth checking**, and reported the
companion as unresponsive when it was working.

Fixed in `c7af6ad`. The four whole-collection operations — integrity, rebuild
aggregates, clear, delete selection — now get ten minutes; everything else keeps
twenty seconds, because a _query_ that takes twenty seconds is a broken
companion and should be reported as one.

## Honest limits of this measurement

- **210,013 games, not 1,000,000.** The disk ran out. The per-game cost is
  measured and the projection is arithmetic, but a 58.5 GB database was not
  built and nothing here should be read as if it were.
- **One machine.** Apple M3 Pro, 18 GB, local SSD.
- Text search's common-term cold cost of 2.6 s is real and is the slowest thing
  a user can trip over that has not been fixed. It warms to 101 ms.
