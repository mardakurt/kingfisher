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
