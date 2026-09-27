# Where Kingfisher's bytes go, and where they should

_Proposal, 2026-09-27 (Phase 86). Status: **proposal** — nothing here deleted
a collection, moved personal data, provisioned a paid service or started a
download. The one large file on disk during the investigation was the
owner-approved 10M-game test import (§3), which is removed after its
evidence is kept._

## 1. What is on this Mac today

Measured with `du -sh` on 2026-09-27 on the maintainer's Mac (460 GB
volume, 64–67 GB free during the measurement):

| What                                                                 | Where                                                             | Size                | Whose                   |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------- | ----------------------- |
| Managed native engines (5, with their networks)                      | `~/Library/Application Support/kingfisher-desktop/engines`        | 2.2 GB              | the user's installation |
| — of which Stockfish (binary + NNUE)                                 | `…/engines/stockfish-native`                                      | 805 MB              |                         |
| Browser storage of the desktop app (all profiles' IndexedDB origins) | `…/kingfisher-desktop/IndexedDB`                                  | 896 MB              | the user's work         |
| Companion collections (SQLite)                                       | `…/kingfisher-desktop/companion`                                  | 20 KB (none yet)    | the user's games        |
| Syzygy tablebases                                                    | the repository's 3-piece fixture only                             | < 1 MB              | —                       |
| Sparkle's update cache                                               | `~/Library/Caches/app.kingfisher.chess`                           | 4 MB                | —                       |
| **Development only** — the 10M test collection (§3)                  | `~/KingfisherWork/real-scale/p86-10m`                             | 36–38 GB, temporary | test data               |
| Development only — Lichess 2017-01 archive for that test             | `~/KingfisherWork/archives`                                       | 1.8 GB, temporary   | test data               |
| Development only — Next.js build cache                               | `.next`                                                           | 4.9 GB              | —                       |
| Development only — Playwright browsers                               | `~/Library/Caches/ms-playwright`                                  | 2.2 GB              | —                       |
| Development only — kept release apps, staged packs, build outputs    | `~/KingfisherWork/{release-*,desktop-out*,stage-*,archive-cache}` | 1.9 GB              | —                       |

A person using Kingfisher, not developing it, has the first six rows:
about **3 GB**, most of it engines. The 330 GB that prompted this document
is not on anybody's disk — it is what one month of Lichess would have cost
in the companion's original row layout, which is why the 10M import in
Phase 85 was made search-only.

## 2. Four kinds of data that are not the same problem

| Kind                                                            | What it is                                                                                   | Grows with                         | Can it be re-derived?                        | Can it leave the machine?                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| **Game databases** (companion collections, My games)            | every game, its moves, and an index from each position to the games reaching it              | games × plies                      | no — the user's own games are the authority  | only at the user's choice, and never silently                                 |
| **Opening statistics** (reference packs, the Explorer's column) | per-position move counts for a named population (e.g. Lichess 2200+), aggregated and sharded | distinct positions kept, not games | yes — rebuilt from the publisher's archive   | yes; a remote explorer is a different population, labelled as such            |
| **Engines**                                                     | binaries and networks                                                                        | engines installed                  | yes — re-downloaded against recorded digests | n/a (a remote engine is a separate, labelled capability, `remote-engines.md`) |
| **Tablebases**                                                  | Syzygy WDL/DTZ files: 3–5 pieces ≈ 1 GB, 6 pieces ≈ 150 GB, 7 pieces ≈ 17 TB                 | pieces covered                     | yes — fixed public files                     | yes — lichess.org answers ≤ 7 pieces online, and the page says so (Endgame)   |

Only the first is the user's own and irreplaceable. The other three are
reproducible reference material, and the right place for each differs: the
disk should hold the user's games compactly, and reference material either
on demand or elsewhere.

## 3. The game database, measured

The companion now has two position layouts (`docs/design/compact-position-postings.md`):

| Layout                                   | Position side per game | Measured on                                                                                                                                                        |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| rows (original)                          | 32,433 B               | 100,445 broadcast games (Phase 86 probe)                                                                                                                           |
| postings (Phase 86, opt-in per database) | 1,791 B                | the same 100,445 games, 0 mismatches against rows                                                                                                                  |
| postings, whole file at scale            | see §3.1               | Lichess 2017-01 imported through the product path until the session running it ended at 7,464,900 games (`docs/release-evidence/phase-86/real-scale-10m-postings`) |

### 3.1 At scale

Measured on 7,484,400 games of Lichess 2017-01 in the posting layout
(`docs/release-evidence/phase-86/real-scale-10m-postings/`): **36.37 GB,
4,859 bytes a game**, every position indexed; the explorer identical to a
linear oracle on 50 positions, warm explorer answers in 0.1–0.6 ms, games
at a position in 92 ms, the move search in 26–38 s. Extrapolated to the
whole month (10,680,708 games): **about 52 GB**, against about 330 GB in
the row layout. That is small enough for an external SSD and too large to
be a laptop default for every month a player might want — which is what
the recommendations below are for.

## 4. Options

| Option                                                          | Disk on the Mac                                       | Offline                          | Latency                     | Privacy                     | Cost      | Honesty risk                                                     | Work                                  |
| --------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------- | --------------------------- | --------------------------- | --------- | ---------------------------------------------------------------- | ------------------------------------- |
| **A. Compact postings** (done, opt-in)                          | ~18× less on the position side                        | yes                              | explorer ≤ 1 ms p95 at 100k | unchanged                   | none      | none — 0 mismatches against the row layout                       | shipped                               |
| **B. Remote queries with a bounded cache**                      | cache only (bounded, e.g. 500 MB)                     | no, except what is cached        | network round trip          | positions sent to a service | none/paid | a remote population must never stand in for the user's own games | medium                                |
| **C. Compressed reference packs on demand**                     | only the packs installed (tens–hundreds of MB each)   | yes, for installed packs         | local                       | unchanged                   | none      | a pack not installed must read "not installed", never zero       | mostly exists                         |
| **D. External SSD through the companion**                       | none — the collection lives on the external volume    | yes, while the volume is mounted | local (USB/Thunderbolt SSD) | unchanged                   | the disk  | an unmounted volume must read "unavailable", never "empty"       | small–medium                          |
| **E. Streaming, selective imports** (header rejection, subsets) | only what is kept (e.g. 2200+, or one player's games) | yes                              | local                       | unchanged                   | none      | a subset must say what it kept and what it rejected              | exists (packs), small for collections |

Notes:

- **B** is already how the Explorer offers Lichess and Masters — as their
  own labelled columns (populations are never merged). It is the wrong
  answer for the user's own database: the user's games are theirs, private
  and the authority.
- **C** is how reference packs already work (`scripts/build-reference-pack.mjs`):
  aggregated, sharded, compressed, installed per pack, with provenance.
  Pack contents are deliberately outside backups; pack metadata is inside,
  so a restore says what to reinstall.
- **D** works today in two ways: `KINGFISHER_COMPANION_DATA_DIR` points the
  whole companion at another folder, and `/db/attach` opens any Kingfisher
  collection file the user chose in a dialog — read-only, through the one
  native-file boundary. What does not exist is creating or moving a
  collection onto a chosen volume from the interface.
- **E** exists for packs (`readGames(file, { accept })` rejects on headers
  before tokenising movetext); a collection import has a licence and a
  source record but no "keep only…" choice.

## 5. Recommendation

Layer them, each for the kind of data it fits:

1. **Postings by default for new companion collections** (A). It is the
   largest single saving, needs nothing from the user, and is proven equal
   to the row layout. Today it is an explicit checkbox at creation and a
   Convert action per collection; make it the default once the Phase 86
   gates have run on it for one release.
2. **Collections on a volume the user chooses** (D). Add "Create in…" and
   "Move to…" for companion collections, with a folder chosen in a dialog.
   This is the answer for the person who really does want every Lichess
   month: 50 GB a month belongs on an external SSD, and a laptop's disk
   should not be the limit on a research database.
3. **Selective imports** (E) for large public archives: "keep games where
   both players are 2200+", "keep this player's games", with the rejected
   count stated on the source record.
4. **Reference data stays on demand** (C) for statistics and (B, labelled)
   for live populations; tablebases stay online-by-default with local
   Syzygy as an explicit install, as the Endgame page now states.

Not recommended: silently evicting old games, truncating positions past a
ply (unknown would read as zero), or merging a remote population into the
user's numbers.

## 6. Architecture for "on a volume the user chooses"

- **A collection is still one SQLite file** (plus its WAL). The companion
  keeps a registry of collections — id, display name, absolute path,
  volume identity (the volume UUID from `diskutil info`/`statfs`), layout,
  last-known size — in its own data folder, never on the external volume.
- **Paths are chosen in a dialog**, via the existing native-file boundary.
  No `readFile(path)` on the bridge; the companion receives the chosen path
  from the shell's dialog, exactly as `/db/attach` does today.
- **Availability is a state, not an absence.** On startup and on
  `didMount`/`didUnmount` volume events the companion marks each registered
  collection `available`, `unavailable (volume "Research SSD" not mounted)`
  or `missing (the file is gone)`. Every surface that counts games
  shows the state and the last-known count, never zero.
- **Writes go only to available collections**; an import started against a
  volume that disappears stops, records what was committed (the bulk-load
  mark added in this phase finishes the rest on the next open) and says so.
- **Backups are unchanged**: collections are the companion's, not
  IndexedDB's, and are already outside `PORTABLE_STORES`; the registry entry
  (name, path, volume, counts) goes into the backup so a restore can say
  where the collection lived.

## 7. Migration plan

For an existing collection the user chooses to move — never automatically:

1. **Preflight**: destination writable, free space ≥ file size × 1.1,
   same companion version; for a row-layout collection, offer converting to
   postings first (it shrinks what is moved; the conversion needs free
   space for the new index and for `VACUUM`'s copy).
2. **Checkpoint** the WAL (`PRAGMA wal_checkpoint(TRUNCATE)`) with the
   collection closed to new writes.
3. **Copy** to the destination under a temporary name.
4. **Verify at the destination before anything is deleted** (the move
   invariant): `PRAGMA integrity_check`, game count, a sample of
   fingerprints, and the explorer's answer for the 50 most frequent
   positions equal to the source's.
5. **Switch** the registry entry to the new path atomically; the old file
   is renamed `…moved-<date>` and kept.
6. **Delete the source only when the user confirms**, after the new
   location has been opened once successfully. Until then both exist.
7. **Rollback** is the registry entry pointing back at the kept source.

Tests to write with it: a move interrupted at each step leaves exactly one
authoritative collection; an unmounted volume reads as unavailable in the
Library, the Explorer's column and the position page; a restore on a Mac
without the volume says where the collection lived.

## 8. What was not done

- No collection was created on, moved to or deleted from any volume.
- No personal data was relocated; the desktop profile was only measured.
- No paid service was provisioned; no download was started for this
  investigation. (The Lichess 2017-01 archive and the 10M test import were
  the owner-approved P0 scale test, and are deleted after their evidence is
  committed.)
- §6 and §7 are designs, not code. Recommendation 1 is shipped as an
  opt-in; recommendations 2 and 3 are not implemented.
