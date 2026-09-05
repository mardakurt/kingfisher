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

## The pack that was built

Built on 5 September 2026 from `lichess_db_standard_rated_2026-07.pgn.zst`,
streamed and verified against the publisher's SHA-256 without ever writing the
archive to disk.

|                  |                                                                |
| ---------------- | -------------------------------------------------------------- |
| Games considered | **89,288,421**                                                 |
| Games retained   | **305,169** (0.342%)                                           |
| By speed         | blitz 295,695 · rapid 9,429 · classical 48                     |
| Positions        | 315,668                                                        |
| Players          | 12,315                                                         |
| Full game scores | 305,169                                                        |
| Size             | **82 MB** on disk, 85.7 MB compressed chunks from 220.7 MB raw |
| Indexed to       | ply 40 (20 full moves)                                         |

The speed split is the table at the top of this document arriving as predicted:
blitz is what a high-rated online population actually plays, rapid is a tenth of
it, and classical online barely exists — forty-eight games in eighty-nine
million. Anyone reading a number from this source is reading blitz, and the
manifest says so rather than letting them assume otherwise.

### How deep it answers

Measured by `node scripts/bench-explorer-depth.mjs --pack .packs/kingfisher-high-rated-online`
against the same 45 real theoretical lines the other packs are held to:

| Depth               | Answered           |
| ------------------- | ------------------ |
| 10 plies (5 moves)  | **100.0%** (45/45) |
| 20 plies (10 moves) | 66.7% (30/45)      |
| 30 plies (15 moves) | 7.7% (3/39)        |
| 40 plies (20 moves) | 0.0% (0/4)         |

Continuous answers: median 21 plies, worst 10, best 34. The most-played chain —
following whatever the pack itself says is commonest, which involves no authored
judgement at all — reaches **40 plies (20 moves)** down a Najdorf English Attack.

Why the lines stop: 21 pruned by the pack, 23 never played in it, 1 answered to
the end. So the binding constraint is the corpus, not the indexing: a month of
online games at 2400+ is 305,000 games, and a specific fifteenth move of theory
is often not among them. That is fixed by more months, which is what `--months`
is for, and not by indexing deeper.

This is deliberately a v1 from one month. It is a recency and
what-are-people-playing source, not a weight-of-evidence one; Elite OTB remains
the latter.

### Publishing

**Published, v1, 2026-09-05.** The owner decision in Phase 17 was to ship it.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| Location    | `https://mardakurt.github.io/kingfisher-data/reference-online-v1/` |
| Repository  | `mardakurt/kingfisher-data`, commit `311b64b`                      |
| Catalog row | `kingfisher-high-rated-online` in `src/reference/catalog.ts`       |
| Size        | 85,722,979 bytes across 160 chunks                                 |

Published to the Pages site rather than as a release asset for the same reason
the other two packs are: release download redirects carry no CORS headers, so a
browser cannot install from them at all. Release assets remain a manual
archival download.

**Validated before publication, and again after.** Every one of the 160 chunks
was checked present, byte-length correct and SHA-256 matching the manifest —
locally before the push, and again in the staged copy. After publication the
manifest and a chunk were fetched over the public URL and the chunk's digest
re-checked against the served manifest; `access-control-allow-origin: *` is
present.

**Installed and queried, live.** Installed in a browser from the published URL
in **36 seconds**, and asked for the Najdorf at move 5. It answered from its own
population — 305,169 games, CC0-1.0 — with a distribution visibly its own:

| Move  | High-Rated Online | Kingfisher Starter (OTB) |
| ----- | ----------------: | -----------------------: |
| 6.Bg5 |       27% (1,509) |              17% (1,107) |
| 6.Be3 |       19% (1,061) |              21% (1,351) |
| 6.Bc4 |         11% (603) |                 5% (338) |
| 6.Be2 |          9% (499) |                13% (841) |

The two populations are not merged and each is labelled with its own source and
licence. That difference is the reason to have both, and the reason neither may
be presented as the other.

### Update cadence

**Monthly is not proposed, and this is not a rolling window yet.** A three-month
build was not attempted in this phase, so no measurement exists of what it costs
or what depth it would add; recommending a cadence on the strength of one
month's build would be a guess. What is known is what §"What it costs to build"
records for one month. The next build should be a three-month one, measured
against v1 on games, positions, size and coverage at 30 and 40 plies, and the
cadence chosen from that.

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
