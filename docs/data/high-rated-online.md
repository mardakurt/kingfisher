# The High-Rated Online reference — what it is, and why those thresholds

Kingfisher's other two references answer "how has this position scored among
strong players over the board". This one answers a different question: what
strong players are playing online, where far more games exist and theory moves
faster.

Every number below was measured before the definition was chosen, on a real
sample rather than assumed. The sample is the first 400 MB of
`lichess_db_standard_rated_2026-07.pgn.zst` — **1,294,431 real games**.

## The measurement that decided the definition

| Speed          |   Games | both ≥ 2000 | both ≥ 2200 | both ≥ 2400 |
| -------------- | ------: | ----------: | ----------: | ----------: |
| Bullet         | 478,727 |     130,324 |      60,269 |      21,985 |
| Blitz          | 589,230 |      71,105 |      20,323 |       4,844 |
| Rapid          | 216,990 |      10,813 |       2,160 |         364 |
| Classical      |   8,235 |         298 |          73 |          34 |
| Correspondence |   1,249 |         219 |          51 |           5 |

Two facts fall out of that table, and both of them change the design.

**Bullet is 73% of the high-rated population.** Of the 82,876 sampled games
where both players were 2200 or better, 60,269 were bullet. A pack that took
"rated, both players strong" at face value would therefore be, in the main, a
record of what strong players do with sixty seconds and no intention of
following theory. Bullet and ultrabullet are excluded — not as a matter of
taste, but because including them would make every aggregate in the pack a
weighted average of two populations that disagree, with the less useful one
holding the majority.

**Classical barely exists online.** 8,235 games in 1.29 million, and 73 of them
at 2200+. A "classical only" pack would be empty. Classical is kept because it
costs nothing and is the most relevant when it appears, but rapid and blitz are
what actually populate this source, and the manifest says so rather than
letting a reader assume otherwise.

## The definition

```
source     Lichess standard rated games database
speeds     classical, rapid, blitz          (bullet, ultrabullet, correspondence excluded)
rating     both players >= 2400
window     the most recent complete months, newest first
```

**Why 2400 rather than 2200.** At 2200 the retained population is 1.742% of all
games — about 1.63 million games per month, which is four times the size of the
entire Elite OTB pack for a single month of input. At 2400 it is 0.405%, or
roughly 380,000 games per month: a pack of comparable weight to the existing
references over a three-month window, from a population that is genuinely
strong rather than merely above average. The threshold is a sample-size
decision, and this is the sample it was taken from.

**Speeds are counted separately.** The manifest records how many retained games
came from each speed, because "2400 blitz" and "2400 classical" are not the
same evidence and a reader is entitled to know the mixture they are looking at.

## What it costs to build

Measured on the build machine, not estimated:

| Quantity                    | Measured                                 |
| --------------------------- | ---------------------------------------- |
| Monthly archive size        | 27.8 – 29.7 GB compressed (2026-02 … 07) |
| Download rate               | 11.6 MB/s (419 MB in 36.3 s)             |
| Decode + scan rate          | 37.6 MB/s compressed (116,000 games/s)   |
| Games per monthly archive   | ~93.8 million                            |
| Retained per month at ≥2400 | ~380,000                                 |

So one month costs about 42 minutes of transfer and 13 minutes of CPU, and the
two overlap because the pipeline streams. **A three-month build is bounded by
download at roughly 2.1 hours**, and never writes the 87 GB of input to disk —
the archive is decoded and filtered as it arrives, and only retained games are
kept.

## Reproducing

```bash
node scripts/build-reference-pack.mjs --pack online --months 3
```

The archive list, the published SHA-256 digests and the licence all come from
`scripts/reference/sources.mjs`, the same as every other pack.

## Licence

Lichess standard rated games database, released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain
dedication. Unlike the broadcast archive, which is CC BY-SA 4.0, this source
carries no attribution requirement; Kingfisher records the attribution anyway,
because a reader of a statistic should be able to find out where it came from.
