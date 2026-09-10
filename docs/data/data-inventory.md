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

### Recent Theory

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

### Recommendation

Do **not** publish a v2 in Phase 34. The candidate that
optimises bytes-per-recency is the 6-month window, but the audit
shows that the v1 build pipeline runs out-of-repo, takes many
minutes, and would require a follow-up phase to land safely.
The freshness UX work in this phase (date window visible in
Data Center, version-by-source identities in the player and
explorer caches) is the part of "fresher data" that does not
depend on a build.

The 6-month v2 build is documented in
`docs/reports/phase-34-handover.md` §14 as the next data
priority. It is independently versioned from Kingfisher 1.0 and
can ship as `reference-recent-v2` while the application stays
1.0.0.
