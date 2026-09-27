# The posting layout at 7,484,400 real games (Phase 86)

Lichess standard rated 2017-01 (`lichess_db_standard_rated_2017-01.pgn.zst`,
CC0, digest checked against the publisher's `sha256sums.txt`), imported
through the product's own path (`runImport`, the bundled import kit, five
workers, bulk load) into a companion collection with the **posting** layout.

**Not the whole month.** The import was started from a Claude Code session
at commit `308d404` (`import-commit.txt`) and stopped at 7,484,400 of
10,680,708 games when that session ended at 00:22 on 2026-09-27. It was not
restarted: at the measured 4,859 bytes a game the whole month would take
about 52 GB, over the ~45 GB the owner approved for this test. Figures for
10,680,708 games below are **extrapolations**, labelled as such.

## Commands

    node scripts/bench-import-file.mjs --file <archive> --out <dir> --layout postings --workers 5 --oracle 50
    # stopped at 7,484,400 games (import-run.txt); then, on the same file:
    node scripts/bench-import-file.mjs --query-only <dir>/collection.sqlite --out <dir> --oracle 50 --rebuild-hot

The second run used the working tree at `7c9439f` plus the game-ordered hot
rebuild committed as `128ab64`. Opening the interrupted collection finished
its staged postings (the interrupted-load recovery of `4795c4c`).

## Results (`query-run.txt`, `result.json`, `pages.txt`)

| Measure                                        | 7,484,400 games (measured)                           |
| ---------------------------------------------- | ---------------------------------------------------- |
| File                                           | 36.37 GB (0.55 GB of it free pages) — 4,859 B a game |
| Import rate                                    | ~650 games/s, peak RSS 4.6 GB                        |
| Hot aggregates rebuilt (end of every import)   | 646 s (before `128ab64`: over 60 min, not finished)  |
| Explorer, start / Najdorf (warm median)        | 0.1 ms / 0.1 ms                                      |
| Explorer with a filter                         | 4.85 s cold (builds its cell), 0.6 ms warm           |
| Games at a position                            | 92 ms median                                         |
| Move search: material, theme, route, combined  | 25.9–38.2 s median, 0 unindexed                      |
| Move search against the linear read            | identical on 30,000 games × 3 queries                |
| **Explorer against a linear oracle**           | **50 positions (9 hot) identical**; 157 s to read    |
| Aggregate integrity diagnostic                 | ~7 min (a maintenance check, not a user query)       |

Player queries asked for `carlsen m`, who is not in Lichess 2017; Phase 85
measured player and preparation queries with a real player at 10.68M
(`../../phase-85/real-scale-10m/queries-with-real-player.txt`).

Extrapolated to 10,680,708 games: about **52 GB** with every position
indexed, against about **330 GB** for the row layout and 22.96 GB for
Phase 85's search-only import (no per-position index). The design's earlier estimate of 38–43 GB, scaled from 100,445 broadcast games, was low; the measured bytes a game are the figure to use.

The collection (36 GB) and the archive (1.9 GB) were deleted after this
folder was written; the commands above recreate them.
