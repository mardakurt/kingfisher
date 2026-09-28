# Kingfisher data inventory

Every data source Kingfisher knows about: what it is, how large, under which
licence, and where it comes from. The pack figures are the published
manifests' own, read on 2026-09-28 from the manifest each catalogue row
installs (`src/reference/catalog.ts`); if a figure here disagrees with a
manifest, the manifest wins, because it is what an install verifies against.
How the packs are built and read is in [`reference-packs.md`](reference-packs.md).

## First-party reference packs

Every pack is built by `scripts/build-reference-pack.mjs` from a Lichess
archive, filtered on its headers, deduplicated, replayed through Kingfisher's
own rules code and reduced to per-position move aggregates, a player table and
full game scores. A game whose replay fails is **rejected**, not repaired;
metadata may be normalised, moves never are. Filters are declared in
`scripts/reference/packs.mjs`.

| Pack (catalogue row)                          | Id                                | Version | Built      | Upstream                                     | Licence      |
| --------------------------------------------- | --------------------------------- | ------- | ---------- | -------------------------------------------- | ------------ |
| Kingfisher Starter Reference (bundled)        | `kingfisher-starter`              | 6       | 2026-09-26 | Broadcast archive, 48 months 2022-09…2026-08 | CC BY-SA 4.0 |
| Elite OTB Reference                           | `kingfisher-elite-otb`            | 4       | 2026-09-26 | Broadcast archive, 80 months 2020-01…2026-08 | CC BY-SA 4.0 |
| Recent Theory Reference                       | `kingfisher-recent-theory`        | 1       | 2026-09-05 | Broadcast archive, 24 months 2024-08…2026-07 | CC BY-SA 4.0 |
| Recent Theory Reference (6 months)            | `kingfisher-recent-theory-narrow` | 4       | 2026-09-26 | Broadcast archive, 6 months 2026-03…2026-08  | CC BY-SA 4.0 |
| High-Rated Online Reference                   | `kingfisher-high-rated-online`    | 1       | 2026-09-05 | Standard rated database, 2026-07             | CC0 1.0      |
| High-Rated Rapid & Classical Online Reference | `kingfisher-high-rated-rapid`     | 1       | 2026-09-26 | Standard rated database, 2026-02…2026-08     | CC0 1.0      |

| Pack                   | Games considered | Games counted | Full scores | Positions | Players |                    Size |
| ---------------------- | ---------------: | ------------: | ----------: | --------: | ------: | ----------------------: |
| Starter                |        1,068,626 |       206,451 |      38,749 |   300,413 |  13,738 |  41.3 MB (168 chunks)\* |
| Elite OTB              |        1,235,278 |       425,022 |     425,022 | 5,669,429 |  34,261 | 426.7 MB (256 chunks)\* |
| Recent Theory          |     not recorded |        44,200 |      18,151 |   918,069 |   2,567 |     33.8 MB (80 chunks) |
| Recent Theory 6 months |          223,248 |        11,277 |       4,600 |   250,498 |   1,577 |   13.5 MB (72 chunks)\* |
| High-Rated Online      |       89,288,421 |       305,169 |     305,169 |   315,668 |  12,315 |    85.7 MB (160 chunks) |
| High-Rated Rapid       |      623,208,492 |       783,262 |      65,927 |   735,702 |  52,284 |  85.8 MB (304 chunks)\* |

\* Including each position's history (games by year and rating band, and its
five earliest games, through ply 30): Starter 17.0 MB, Elite OTB 72.9 MB,
Recent Theory 6 months 4.5 MB, High-Rated Rapid 41.4 MB. Recent Theory v1 was
built before `packs.mjs` recorded the games it considered.

**Populations.** The four broadcast packs keep over-the-board-style events
between rated or titled players and drop events whose name says they were
online, played by engines or at bullet (TCEC, Titled Tuesday and the like).
That test reads the event name, so an online event with a neutral name
(Chessable Masters, for one) is kept — which is why the Starter row says
_including online events_. The thresholds:

A rated game enters on its ratings; a game with no ratings enters only when
both players hold one of the pack's titles, because exhibition and match
events often carry titles and no ratings.

- **Starter** — 2200+, or GM/IM/WGM on both sides; ceiling 2900; at least
  12 plies; full scores for 2500+ or GM/IM against GM/IM, up to 300 a player.
- **Elite OTB** — 2000+, or GM/IM/WGM/WIM/FM on both sides; ceiling 2900; at
  least 10 plies; every game has its full score.
- **Recent Theory** and **Recent Theory 6 months** — 2400+, or GM/IM/WGM on
  both sides; ceiling 2900; at least 12 plies; full scores for 2500+ or GM/IM
  against GM/IM; a lower deep threshold so rare recent lines survive.
- **High-Rated Online** — both players 2400+, blitz 295,695 · rapid 9,429 ·
  classical 48; bullet and ultrabullet excluded.
- **High-Rated Rapid** — both players 2200+, rapid 771,807 · classical
  11,457; bot games excluded; full scores for 2400+ games only.

**Distribution.** The Starter is committed at `public/reference/kingfisher-starter/`
and ships inside the application, so it answers offline before anything is
installed. The rest are installed on demand from _Databases → Reference
sources_ from GitHub Pages: `mardakurt.github.io/kingfisher-data/` for Recent
Theory, Recent Theory 6 months and High-Rated Online, and
`mardakurt.github.io/kingfisher-data-packs/` for Elite OTB and High-Rated
Rapid, which do not fit under Pages' one-gigabyte site limit beside the others.

## Online providers

Queried over the network when the person asks. Not installed, not versioned by
Kingfisher, never merged with a pack, and a failure never blanks local
evidence. `docs/data/online-integrations-audit.md` records what each answered
when last checked, and _Privacy_ says what each request carries.

| Provider                     | Endpoint                                  | Used for                                                        | Needs                                                                                             |
| ---------------------------- | ----------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Lichess Masters explorer     | `explorer.lichess.org/masters`            | the masters database as an explorer source                      | the person's own Lichess token (_Settings → Database_); without one it says so instead of a count |
| Lichess rated-games explorer | `explorer.lichess.org/lichess`, `/player` | Lichess rated games, all or one player's, as an explorer source | the same token                                                                                    |
| Lichess game export          | `lichess.org/api/games/user/{name}`       | syncing a Lichess account's games into My games                 | nothing; a token only raises the rate allowance                                                   |
| Chess.com published data     | `api.chess.com/pub`                       | syncing a Chess.com account's games into My games               | nothing; public and read-only                                                                     |
| Lichess cloud evaluation     | `lichess.org/api/cloud-eval`              | a stored evaluation for the position, only when asked           | nothing                                                                                           |
| Lichess tablebase            | `tablebase.lichess.ovh/standard`          | exact results with seven pieces or fewer                        | nothing; the Mac application also probes local Syzygy tables                                      |

## User-authored data

Local to the machine, never uploaded by Kingfisher: My games (imported or
synced, indexed like a pack so the Explorer can read it when chosen), studies,
the repertoire, training records, notes, preparation dossiers and preferences.
An En Croissant or ChessBase database is read, never written. The portable
backup holds all of the authored work (`PORTABLE_STORES` in
`src/persistence/backup.ts`) and the preferences, and My games when the person
includes them; pack contents are not in it, pack metadata is, so a restore can
say which sources to reinstall.

## How a pack changes

- A published version is an **immutable directory**, `reference-<name>-v<N>/`,
  whose manifest pins every chunk's SHA-256. `npm run publish:data` only ever
  adds a directory and refuses to modify or delete one.
- A catalogue row names a version. A pack rebuilt every month (Recent Theory
  6 months, by `.github/workflows/data-monthly.yml`) also has a channel file,
  `channels/<name>.json`, the one mutable file on the mirror; the update check
  and the install read it, and it can only name something newer.
- The Starter installs itself at first start from the application's own
  files, and again when a release ships a new version of it; nothing is
  fetched from the network for it.
- Any other installed pack whose current version differs shows _Update
  available_. Nothing downloads until the person installs it, and an install
  reuses every chunk already present with the same digest and reports how many
  it reused.

## History

Dated records, kept as they were written. They are not current figures.

### Phase 34 freshness audit

Captured 2026-09-10 against the live
`https://mardakurt.github.io/kingfisher-data/` mirror. These are
the values the running manifests published then. The table's first two
rows were later overwritten with 2026-09-26 figures, and its Starter
size is the pack with its history (24.3 MB without); the current values
are in the table at the top of this document.

| Pack              | Version | Built      | Window    | Games   | Positions | Players | Compressed |
| ----------------- | ------- | ---------- | --------- | ------- | --------- | ------- | ---------- |
| Starter (bundled) | 5       | 2026-09-26 | 2022→2026 | 206,451 | 300,413   | 13,738  | 41.3 MB    |
| Elite OTB         | 4       | 2026-09-26 | 2020→2026 | 425,022 | 5,669,429 | 34,261  | 426.7 MB   |
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
