# Kingfisher data inventory

The current state of every data source Kingfisher knows about, as the 1.1
cycle begins. Read by `node scripts/build-reference-pack.mjs` for the
first-party packs and by the application code for the online providers.

All counts and dates below are the values the manifests actually published.
If a value disagrees with what you think, the manifest wins; the manifest is
what the application verifies against on install.

## First-party reference packs

All three are built by `scripts/build-reference-pack.mjs` from Lichess
published archives. The pipeline is the same for all three; only the
filters change. Every game entering the pack is:

- parsed
- filtered by rating / speed / title
- deduplicated within the pack
- replayed through Kingfisher's own rules code (castling, en passant,
  promotion, check state)
- reduced to per-position move aggregates, a player table, and full
  game scores

If a replay fails the game is **rejected**, not repaired. Metadata
normalisation is allowed; chess move reconstruction is not.

### Kingfisher Starter (bundled with the application)

- **Pack id:** `kingfisher-starter`
- **Logical name:** Kingfisher Starter Reference
- **Pack version:** 2
- **Built at:** 2026-09-05
- **Source:** Lichess broadcast archive
- **Licence:** CC BY-SA 4.0 (Lichess broadcast archive)
- **Upstream files (most recent first):** last 36 months of
  `lichess_db_broadcast_YYYY-MM.pgn.zst`
- **Population:** rating ≥ 2200 (open: 2600), ceiling 2900, GM/IM/WGM
  titles, exclude online events, minimum 12 plies, recent years window
  2
- **Build location:** `public/reference/kingfisher-starter/`
- **Distribution:** ships inside the application bundle — no install
  step, no network access required
- **Update mechanism:** re-released with each Kingfisher application
  release

### Elite OTB

- **Pack id:** `kingfisher-elite-otb`
- **Logical name:** Elite OTB Reference
- **Pack version:** 2
- **Built at:** 2026-09-05
- **Source:** Lichess broadcast archive
- **Licence:** CC BY-SA 4.0 (Lichess broadcast archive)
- **Upstream files (most recent first):** all available
  `lichess_db_broadcast_YYYY-MM.pgn.zst` (2020–present)
- **Population:** rating ≥ 2000 (open: 2000), ceiling 2900,
  GM/IM/WGM/WIM/FM titles, exclude online events, minimum 10 plies
- **Counts (live at the time of inventory):**
  - games: 407,538
  - openable: 407,538
  - positions: 5,438,808
  - players: 33,607
- **Shards:** 96 explorer / 48 game / 8 players / 8 playergames
- **Distribution:** GitHub Pages data mirror; installed on demand
- **Update mechanism:** new version published to the data mirror as
  `reference-elite-v<N>/`; installable from the Databases workspace

### Recent Theory (v1)

- **Pack id:** `kingfisher-recent-theory`
- **Logical name:** Recent Theory Reference
- **Pack version:** 1
- **Built at:** 2026-09-05
- **Source:** Lichess broadcast archive
- **Licence:** CC BY-SA 4.0 (Lichess broadcast archive)
- **Upstream files (most recent first):** last 24 months of
  `lichess_db_broadcast_YYYY-MM.pgn.zst`
- **Population:** rating ≥ 2400 (open: 2500), ceiling 2900, GM/IM/WGM
  titles, exclude online events, minimum 12 plies, recent years
  window 1
- **Counts:**
  - games: 44,200
  - openable: 18,151
  - positions: 918,069
  - players: 2,567
- **Time window:** _last 24 months of broadcast archive_ (a recency
  source, not a weight-of-evidence one)
- **Distribution:** GitHub Pages data mirror; installed on demand
- **Update mechanism:** new version published to the data mirror as
  `reference-recent-v<N>/`

### Recent Theory (v2, 6 months)

- **Pack id:** `kingfisher-recent-theory`
- **Logical name:** Recent Theory Reference (6 months)
- **Pack version:** 2
- **Built at:** 2026-09-10
- **Source:** Lichess broadcast archive
- **Licence:** CC BY-SA 4.0 (Lichess broadcast archive)
- **Upstream files (most recent first):** last 6 months of
  `lichess_db_broadcast_YYYY-MM.pgn.zst`
  (2026-03, 2026-04, 2026-05, 2026-06, 2026-07, 2026-08)
- **Population:** rating ≥ 2400 (open: 2500), ceiling 2900, GM/IM/WGM
  titles, exclude online events, minimum 12 plies, recent years
  window 1 — same thresholds as v1
- **Counts (Phase 35 actual build):**
  - input games: 223,248
  - accepted games: 11,280 by the build log; the published
    manifest's `counts.games` is **11,277**, and that is the number
    the application shows. The three-game difference between the
    filter's acceptance count and the packed count has not been
    traced; treat the manifest as authoritative.
  - rejected games: 211,968 (178,350 below min rating; 12,416 bad
    result; 8,440 missing rating; 4,797 online event; 4,559 too
    short; 2,438 non-standard variant; 950 above max rating; 14
    bot match; 4 set up position)
  - duplicates: 0
  - replay failures: 0
  - openable full scores: 4,600
  - positions: 250,498
  - players: 1,577
  - compressed bytes: 8,985,913 (8.6 MB on disk, 29.4 MB raw)
  - chunks: 48
- **Time window:** 2026-03 → 2026-08 (six complete Lichess broadcast
  months). A recency source, narrower than v1.
- **Distribution:** GitHub Pages data mirror; installed on demand.
  The v1 directory remains published and is not deleted when v2
  lands — users who installed v1 keep using it until they choose
  otherwise.
- **Update mechanism:** new version published to the data mirror as
  `reference-recent-v<N>/`. v1 → v2 reuses chunks with matching
  SHA-256 across versions because the chunk format is
  content-addressed.

### High-Rated Online

- **Pack id:** `kingfisher-high-rated-online`
- **Logical name:** High-Rated Online Reference
- **Pack version:** 1
- **Built at:** 2026-09-05
- **Source:** Lichess standard rated games database
- **Licence:** CC0 1.0 (Lichess standard rated games database)
- **Upstream files:** a rolling 3 months of
  `lichess_db_standard_rated_YYYY-MM.pgn.zst` (current build: 2026-07)
- **Population:** both players rated ≥ 2400; speeds classical / rapid /
  blitz; bullet and ultrabullet excluded by design (see `packs.mjs`
  rationale); ceiling 4000; minimum 12 plies
- **Counts:**
  - games: 305,169
  - openable: 305,169
  - positions: 315,668
  - players: 12,315
- **Time window:** _rolling 3 months_ (a current-events source, not
  historical)
- **Distribution:** GitHub Pages data mirror; installed on demand
- **Update mechanism:** new version published to the data mirror as
  `reference-online-v<N>/`

## Online providers

These are queried at runtime over the network. They are not installed,
not versioned by Kingfisher, and are not merged with first-party packs.

### Lichess Masters

- **Source URL:** <https://lichess.org/api/broadcast>
- **Redistribution:** none — the provider's own terms; Kingfisher
  queries live
- **Used for:** top-engine / historical-master games
- **Status:** available when online; shows Offline if not

### Lichess rated (player)

- **Source URL:** <https://lichess.org/api/games/user/{user}>
- **Redistribution:** none — the provider's own terms; Kingfisher
  queries live
- **Used for:** a logged-in Lichess user's recent games
- **Status:** requires a Lichess OAuth token; otherwise hidden

### Lichess Explorer

- **Source URL:** <https://explorer.lichess.ovh/master> /
  <https://explorer.lichess.ovh/lichess>
- **Redistribution:** none — live API
- **Used for:** opening tree beyond Kingfisher's installed packs
- **Status:** available when online

### Lichess tablebase

- **Source URL:** <https://tablebase.lichess.ovh/api>
- **Redistribution:** none — live API
- **Used for:** 7-piece exact endgame evaluation
- **Status:** available when online

## User-authored data

Local to the machine. Not redistributed, not uploaded by Kingfisher
infrastructure.

- **My Games** — personal PGN imports, indexed in the same shape as
  reference packs so the Explorer can include them when selected
- **Studies** — annotations, move trees, engine output, persisted
  per study
- **Repertoire** — decisions per position, persisted
- **Preferences** — UI, engine settings, piece set, theme
- **En Croissant** imports — third-party database, attached, queried
  by the same Explorer pipeline

## Update mechanism summary

- First-party packs are versioned **immutable directories** under
  `reference-<id>-v<N>/`. The manifest pins every chunk's SHA-256.
- A new version is published by adding a new directory; the old one
  is never modified.
- The application code references packs by **logical name** (e.g.
  `Elite OTB`), not by version, so a v2 → v3 update does not break
  saved layouts.
- The user must explicitly trigger an install / update from the
  Databases workspace. There is no automatic background download.
- Chunk reuse by content hash is a 1.1 design goal — see
  `docs/reports/phase-27-handover.md` § Update architecture for
  the current state.

## Catalogue trust

The application trusts the **GitHub Pages data mirror** for pack
manifests and chunks. The mirror is published via
`scripts/publish-data.mjs`, which is the only path that may add a
new version directory; it refuses to delete or modify a published
version. No remote catalogue can silently push a new pack version
into Kingfisher.

## Phase 34 freshness audit

Captured 2026-09-10 against the live
`https://mardakurt.github.io/kingfisher-data/` mirror. These are
the values the running manifests actually publish; the previous
sections of this document were last edited before Phase 34 and
are kept for context.

| Pack              | Version | Built      | Window    | Games   | Positions | Players | Compressed |
| ----------------- | ------- | ---------- | --------- | ------- | --------- | ------- | ---------- |
| Starter (bundled) | 2       | 2026-09-05 | 2024→2026 | 172,376 | 246,870   | 12,522  | 12.3 MB    |
| Elite OTB         | 2       | 2026-09-05 | 2020→2026 | 407,538 | 5,438,808 | 33,607  | 323.6 MB   |
| Recent Theory     | 1       | 2026-09-05 | last 24m  | 44,200  | 918,069   | 2,567   | 32.3 MB    |
| High-Rated Online | 1       | 2026-09-05 | last 3m   | 305,169 | 315,668   | 12,315  | 81.7 MB    |

The audit found two important constraints that any future pack
build must respect:

1. **Lichess broadcast monthly release cadence.** Each upstream
   file is one month of broadcast games; Lichess publishes a new
   file at the start of the following month. As of the audit
   date the most recent published month is **2026-07**; the
   2026-08 file is not yet available. A "6-month" candidate
   today is in practice 6 months minus the most recent month
   that is not yet published.

2. **Recent Theory v1 is not stale, it is shallow.** With 2,567
   unique players and 44,200 games the pack is _current_ — every
   position statistic it produces is up to date as of 2026-07 —
   but it is _narrow_. The 24-month window in v1 was applied as
   a "last 24 monthly files" filter, so the only practical
   improvement a v2 could ship is more depth over the same
   window (the same Lichess files, the same filters, more
   permissive rating and length floors) or a tighter window with
   more depth.

### Recent Theory candidate windows (sketch)

These are the four windows the directive asks for, measured
against the Lichess archive as it stood at the audit date.
Numbers are derived from the published monthly file sizes; the
actual build is a separate `node scripts/build-reference-pack.mjs`
run that has not been executed in Phase 34.

| Window | Months | Approx raw PGN | Approx games | Approx bytes (compressed) | Notes                                                                                 |
| ------ | ------ | -------------- | ------------ | ------------------------- | ------------------------------------------------------------------------------------- |
| 6 m    | 6      | ~28 GB         | ~120 k       | ~95 MB                    | Drops the half of the 24 m file that is older than 2025-02. Best bytes-per-freshness. |
| 12 m   | 12     | ~55 GB         | ~245 k       | ~190 MB                   | Half a year of additional surface; doubles the size for marginal recency gain.        |
| 18 m   | 18     | ~83 GB         | ~360 k       | ~280 MB                   | Approaches Elite OTB in size; exceeds the "remote, on demand" intent.                 |
| 24 m   | 24     | ~110 GB        | ~480 k       | ~370 MB                   | The v1 input. Building it from the same source does not improve anything.             |

> **Phase 35 audit, 2026-09-10.** The Phase 34 sketch over-estimated
> the compressed size of a 6-month build by a factor of 10. The
> filter pipeline discards ~95% of input games (rating, title,
> online-event, length), so the published pack is **8.6 MB**, not
> the ~95 MB the file-size sketch suggested. The sketch was right
> about the **shape** of the answer (the 6-month window is the best
> bytes-per-recency candidate) and wrong about the magnitude of the
> result. The Phase 35 actual build numbers are in the _Recent
> Theory (v2, 6 months)_ section above.

### Phase 35 v1 vs v2

The values the build script reports for the v2 candidate
(2026-09-10, six months 2026-03 → 2026-08), against the v1
values from the same source family:

|                          | v1 (24 months)    | v2 (6 months)     | Ratio v2 / v1 |
| ------------------------ | ----------------- | ----------------- | ------------- |
| Accepted games           | 44,200            | 11,280            | 0.26          |
| Openable full scores     | 18,151            | 4,600             | 0.25          |
| Position aggregates      | 918,069           | 250,498           | 0.27          |
| Player identities        | 2,567             | 1,577             | 0.61          |
| Compressed bytes on disk | ~32.3 MB          | 8.6 MB            | 0.27          |
| Per-month games          | ~1,842            | ~1,880            | 1.02          |
| Per-month players        | ~107              | ~263              | 2.46          |
| Window                   | 2024-09 → 2026-08 | 2026-03 → 2026-08 | 1/4           |

The v2 is smaller on every absolute metric (it covers a quarter of
the calendar), and substantially **denser** on the recency question
it exists to answer: 263 unique 2400+ players per month against
v1's 107 per month. A position question the v1 build has to dilute
across two years is the same answer in v2 against six months of
recent play, which is what the user is reading off the page.

The v1 pack is **not** deprecated. Users who installed v1 keep
using it; the v2 directory lands beside v1 in the catalog and the
data mirror. Chunk reuse is content-addressed, so a v1 → v2
install only downloads the chunks that changed.

### Recommendation

Publish `reference-recent-v2` as soon as the data mirror is ready.
It is independently versioned from Kingfisher 1.0.0 (it is
dataset version 2, not application version 1.1), and the brief
explicitly says: _"Recent Theory v2 remains: data version 2. It
does not mean: Kingfisher 2.0."_
