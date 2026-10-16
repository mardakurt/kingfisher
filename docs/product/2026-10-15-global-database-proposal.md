# A large game database for Kingfisher — proposal for review

2026-10-15. **A proposal, not an implementation.** Nothing here has been
built, downloaded or hosted; the owner asked to review this before any
infrastructure is committed. It supersedes §2 of
[`big-data-and-accounts-proposal.md`](big-data-and-accounts-proposal.md)
(2026-10-04), which it extends with licensing findings, measured sizes and
a cost model; that document's §3 on accounts is overtaken by the account
work of the same date.

Every figure is marked **measured** (with where), **published** (with the
source and the date read) or **estimate**.

## 1. The problem, stated precisely

A ChessBase user opens Mega Database and has, in one place:

- **~11.7 million games, 1475–2025, ~114,000 annotated**, updated through
  the year (published: ChessBase shop and New in Chess listings for Mega
  Database 2026, €229.90; Big Database 2026, the same games without
  annotations, €99.90; read 2026-10-15).
- Every game is searchable by player, event, date, rating, ECO, position,
  material and structure, and every explorer statistic links to the games
  behind it.

Kingfisher today has three kinds of game data, each honest about what it
is (measured, `docs/data/reference-packs.md`, `src/reference/catalog.ts`):

| What                                      | Size                                                | Limitation                                              |
| ----------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| Reference packs (Starter bundled, others) | 206,451 games in Starter, 40 MB; six packs in all   | Aggregates by position; no historical games before 2020 |
| Streaming of those packs                  | verified chunks, LRU cache 768 MB web / 1.5 GB Mac  | Same populations                                        |
| The player's own databases                | PGN, ChessBase `.cbh/.cbv`, En Croissant, companion | Only what the player already has                        |

The companion's SQLite collections were measured at scale in Phase 86:
**10,680,708 games imported search-only; the full posting layout built
to 7,484,400 games at 36.37 GB, 4,859 bytes a game, explorer results
identical to a linear oracle on 50 positions** (measured:
[`docs/reports/phase-86-handover.md`](https://github.com/mardakurt/kingfisher/blob/16d2fcc2/docs/reports/phase-86-handover.md)). So the indexing technology is not
the gap. **The gap is a corpus Kingfisher may legally redistribute, and
somewhere to serve it from.**

## 2. Sources

| Source                                       | Size                                                                                                           | Licence                                                                                                      | Verdict                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Lichess broadcasts** (official OTB relays) | 1,263,913 games, 744 MB zstd, 2020–present, ~28,600 a month (published, database.lichess.org, read 2026-10-15) | **CC BY-SA 4.0**                                                                                             | **Use.** The open answer to over-the-board play. Already the source of Elite OTB, Recent Theory and Starter.      |
| **Lichess rated games**                      | 8,220,312,882 games, 2.6 TB zstd; Sept 2026 alone 29.2 GB, 89.6 M games (published, same page)                 | **CC0**                                                                                                      | **Use, filtered.** Statistics by rating band and year; keep full games only for the strongest slice.              |
| Lichess Masters explorer (API)               | ~2.7 M OTB games (estimate; not re-checked)                                                                    | Lichess API terms, online only                                                                               | **Keep as an online source**, as today. Not redistributable as a dataset.                                         |
| The Week in Chess                            | weekly PGN since 1994                                                                                          | "free for personal use only. All rights are reserved." (published, theweekinchess.com/twic, read 2026-10-15) | **Do not host.** A player may import their own copy locally; Kingfisher reads it and never uploads it.            |
| Caissabase, Lumbra's Gigabase, PGN Mentor    | 4–10 M games                                                                                                   | none stated / **CC BY-NC-SA** / none stated                                                                  | **Rejected** (recorded in `docs/data/historical-games-audit.md`): no chain of rights, or NonCommercial.           |
| ChessBase Mega / Big                         | 11.7 M                                                                                                         | commercial, per-user                                                                                         | **Read locally** (Kingfisher already opens `.cbh/.cbv`). Hosting it needs a licence from ChessBase GmbH — see §8. |
| Public-domain tournament books               | thousands of pre-1930 games                                                                                    | public domain                                                                                                | **Slow but clean**; method exists (`npm run annotated:build`, Phase 85).                                          |
| National federation archives                 | varies                                                                                                         | per federation                                                                                               | **Ask.** Real terms where granted; patchy coverage.                                                               |
| TCEC engine games                            | ~100k                                                                                                          | CC BY-SA 3.0                                                                                                 | Optional; engine play, a separate population.                                                                     |

What this means: **an open corpus can cover modern OTB play (2020+) and
online play at enormous depth. It cannot honestly reproduce Mega's
1475–2019 history.** Two answers coexist: open history grows slowly through
public-domain transcription and federation agreements, and a player who
owns Mega uses their own copy, which Kingfisher already reads.

Populations are never merged (AGENTS.md). Each source above becomes its
own population with its own counts and licence.

## 3. Recommendation

**A hybrid: Kingfisher-hosted open populations as immutable, content-
addressed shards on object storage, queried by the client; the player's own
databases local; licensed data only if a licence is obtained.**

```
           build (CI runner, monthly)                       client (browser / Mac app)
  ┌──────────────────────────────────────────┐       ┌───────────────────────────────────────┐
  │ upstream .pgn.zst  → verify digest       │       │ Explorer / Opening Report / Library    │
  │ → stream frames (zstdFrameStream)        │       │        │ ChessDatabaseProvider          │
  │ → reject on headers (readGames.accept)   │       │        ▼                                │
  │ → replay through src/chess (legality)    │       │ RemoteReferenceProvider (exists)        │
  │ → dedupe within population               │       │  · manifest (signed digests)            │
  │ → aggregate by positionKey               │──R2──▶│  · shard = hash prefix of positionKey   │
  │ → postings, game blocks, header columns  │       │  · fetch, verify SHA-256, cache (LRU)   │
  │ → shards + manifest (SHA-256 each)       │       │  · offline: cached shards / full install│
  └──────────────────────────────────────────┘       └───────────────────────────────────────┘
```

Why this and not the alternatives:

| Option                                              | For                                                                                                                                                   | Against                                                                                                                                                                                                                | Verdict                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Static shards on object storage, client queries** | No server to run or secure; free egress (R2); scales with the CDN; the same shards serve offline installs; Kingfisher's pack format already does this | Complex multi-field searches need more than one shard read                                                                                                                                                             | **Recommended** for position and opening queries, and for header search via columnar files (§4.4) |
| Supabase Postgres for games                         | One vendor                                                                                                                                            | ~50 GB of postings at 10 M games (measured layout ×10 M); Postgres row overhead multiplies it; Supabase egress is billed per GB; every explorer move is a query against the account database that also holds user data | **Rejected.** Supabase stays for accounts and user data only.                                     |
| A query server (ClickHouse / DuckDB service)        | Arbitrary queries in one round trip                                                                                                                   | A service to run, patch, scale and pay for; no offline story                                                                                                                                                           | **Later, only if measured need** — the static design is the baseline it must beat                 |
| Proxy the Lichess API only                          | Nothing to build                                                                                                                                      | Online only, rate-limited, one population, no game postings                                                                                                                                                            | Keep as a source, not the strategy                                                                |

## 4. Storage and indexing

All four structures are keyed by Kingfisher's own canonical identity
(`positionKey()`), so a transposition is the same position everywhere, and
all are built by replaying games through `src/chess/` — the same rules
the application runs.

### 4.1 Position aggregates (the Explorer)

Per position and move: White/draw/Black counts, average rating, first and
last year, counts by rating band and by year. Additive by construction, so
a monthly delta merges by summing (§5). Sharded by a prefix of the position
hash; one Explorer request is one shard read (published design,
`docs/data/streaming-reference-investigation.md`).

Size (measured): Starter's 206,451 games make 300,413 position aggregates
in 40 MB; aggregates grow with distinct positions, not games, and stop at
the indexed depth (20 full moves today).

### 4.2 Postings (games reaching a position)

Per position: the sorted list of game ids that reached it, delta- and
varint-encoded, in the same shards or a sibling set. This is what lets
every statistic link to its games — the property a ChessBase user expects
and the packs lack today (parity ledger: "Every visible aggregate links
to backing games, or says the source cannot").

Size (measured, Phase 86): 4,859 bytes a game including postings to the
indexed depth. **1.26 M broadcast games ≈ 6.1 GB; 10 M games ≈ 49 GB**
(estimates by multiplication).

### 4.3 Game blocks

Games stored compactly — headers plus moves as indices into the legal-move
list (the En Croissant scheme Kingfisher already decodes and verifies,
about one byte a move) — in blocks of ~1,000 games so one game is one HTTP
range read. Estimate: ~120 bytes a game for moves plus ~150 for headers,
so 1.26 M games ≈ 340 MB, 10 M ≈ 2.7 GB.

### 4.4 Header columns (player, event, date, rating, ECO)

Parquet files, row groups sorted by player key and by date, queried in the
client with DuckDB-WASM over HTTP range requests so a player search reads
only the row groups whose statistics match. Estimate: ~60 bytes a game
compressed; 10 M games ≈ 600 MB, of which a typical player query reads a
few megabytes. Material, structure and route searches over a hosted
population are answered from the aggregate shards' position claims where
indexed, and otherwise refused with the reason — never by downloading the
corpus.

## 5. Updates

- **Monthly delta builds.** Lichess publishes one file a month for each
  population. The builder produces a delta set (aggregates for the month,
  postings for new games, new game blocks, a header Parquet file) and a
  new manifest listing base + deltas. Aggregates merge by addition in the
  client; deltas are compacted into a new base yearly.
- **Immutable, content-addressed shards.** A shard is never rewritten; a
  manifest names exactly which digests make a version. Clients keep what
  they have cached across versions where digests are unchanged.
- **Signed manifests**, verified like the pack manifests today, so the
  host cannot substitute data.
- **Corrections** (a withdrawn broadcast game, a fixed result) are a
  tombstone list in the next manifest, applied by the client and folded
  in at compaction. The known defect of packs filing `*` results as Black
  wins (`docs/reports/phase-89-handover.md` §4) is fixed in the builder
  before the first hosted build.

## 6. Data quality

- **Legality:** every move replayed; games that fail are counted and
  dropped, and the count is published in the manifest.
- **Duplicates:** within a population, fingerprint = normalised players +
  date + event + move hash (the companion's existing rule); broadcasts
  carry the same game in several relays and are the main source.
- **Identity:** names resolved to the player keys Kingfisher already uses;
  FIDE ids from broadcast tags where present; the 8,339-player CC0 roster
  for titles.
- **Results and ratings:** a game without a result is in no outcome column
  and counted as such (Phase 89's rule, applied to hosted data).

## 7. Cost

R2 (published, Cloudflare R2 pricing page, read 2026-10-15): storage
$0.015/GB-month, reads $0.36 per million, writes $4.50 per million,
**egress free**; 10 GB-month and 10 M reads free each month.

| Scope                                                          | Hosted size (estimate)              | Storage/month | 5 M Explorer reads/month |
| -------------------------------------------------------------- | ----------------------------------- | ------------- | ------------------------ |
| Broadcasts (OTB, 1.26 M games, full)                           | ~7 GB                               | **free tier** | free tier                |
| + Lichess 2200+ rapid/classical, all years, full games (~10 M) | ~55 GB                              | ~$0.70        | free tier                |
| + Lichess aggregates only, all ratings, by band and year       | ~20–40 GB (estimate; measure first) | ~$0.50        | ~$0.36                   |
| Everything above                                               | ~100 GB                             | **~$1.50**    | ~$0.36                   |

Builds: a public repository's GitHub-hosted runner is free; a month of
Lichess standard is 29.2 GB compressed and is streamed, never stored
whole, which the builder already supports. The first full backfill of all
Lichess months (2.6 TB to stream) is the one heavy job — an estimate of
2–4 days on a rented 8-core machine (~€30–60 once) is safer than the
runner's 6-hour job limit.

**The cost driver is not hosting. It is maintenance:** a monthly job that
must keep working, and someone to read its report.

## 8. Legal

- **CC BY-SA 4.0 (broadcasts):** a derived database must be shared under
  the same licence with attribution — already met by the packs and
  recorded in `THIRD_PARTY_DATA.md`.
- **CC0 (Lichess rated):** no conditions; attribution given anyway.
- **TWIC, ChessBase databases, other commercial data:** never hosted.
  Read locally from the player's own copy. **Accounts do not change this:**
  syncing a player's imported Mega Database to their account would be
  storing a licensed product on Kingfisher's infrastructure, so imported
  game collections are deliberately outside cloud sync (`src/sync/cloud/scope.ts`
  syncs authored work only).
- **A licensed historical corpus** (ChessBase GmbH, or a federation) is
  the only route to Mega-equivalent history in a hosted product. It is a
  commercial negotiation with unknown cost; the architecture admits it as
  one more population with its own licence row. Not recommended to pursue
  before the open populations are live and used.
- Chess moves are facts and carry no copyright; databases may carry
  database rights (EU) and contract terms. That is why the rule is
  "explicit terms or nothing" (`historical-games-audit.md`).

## 9. Offline

Unchanged in kind from today: the cache keeps shards a person has used
within a budget they set; "Install for offline use" downloads a whole
population (estimate: broadcasts ~7 GB full, or ~1 GB aggregates-only
for the explorer); the Mac companion reads the same shards. Offline, a
source answers from what is cached and says when it cannot.

## 10. Integration

- **Explorer, Opening Report, Coverage:** each hosted population is a
  `ChessDatabaseProvider` through the existing `RemoteReferenceProvider`;
  nothing in the UI changes except that rows now link to games.
- **Library:** a hosted population becomes a Library source, searchable
  through the same `GameQuery` model — including the Describe bar — with
  header predicates answered from §4.4 and move predicates from §4.1–4.2
  where indexed.
- **Preparation and player profiles:** player keys resolve across the
  hosted populations and the player's own collections, each still labelled.

## 11. Roadmap

| Step | What                                                                                                                | Done when                                                                           | Effort (estimate) |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------- |
| 0    | Fix the `*`-as-Black-win tally; version the pack schema to carry postings and game blocks                           | builder tests and a rebuilt Starter digest                                          | 3–5 days          |
| 1    | **Measure** on 1 M broadcast games: shard sizes, requests per opening session, latency from R2                      | a recorded benchmark in `docs/reports/`                                             | 1 week            |
| 2    | Host the broadcast population (full: aggregates, postings, game blocks) on R2 with signed manifest; client reads it | Explorer rows open their games; parity row "aggregates link to games" closes for it | 2–3 weeks         |
| 3    | Header Parquet + DuckDB-WASM search for that population; Library source                                             | player/date/rating search measured under 2 s on a laptop                            | 2 weeks           |
| 4    | Monthly delta pipeline and yearly compaction                                                                        | three consecutive monthly runs without hand edits                                   | 1–2 weeks         |
| 5    | Lichess rated: aggregates by band and year for all games; full games for 2200+ rapid/classical                      | measured sizes match §7 within 2×, or §7 is corrected                               | 3–4 weeks         |
| 6    | Public-domain transcription and federation outreach for history                                                     | each set with per-game provenance                                                   | ongoing           |
| 7    | Decide on a licensed corpus, with real usage data                                                                   | owner decision                                                                      | —                 |

Roughly **2–3 months of focused work to step 5**, with steps 1–2 alone
delivering the most visible improvement (OTB statistics that link to
games, hosted, without a 40 MB-per-pack install).

## 12. Decisions for the owner

1. Approve step 0–1 (no hosting cost; measurement only).
2. Choose the host: **Cloudflare R2** (recommended: free egress, range
   requests) or Hugging Face Datasets (free for public CC data; less
   control over availability).
3. Whether to pursue a historical-corpus licence later (§8), and with whom.
4. Whether hosted populations should be available signed out (recommended:
   yes — open data, no account needed) or only to accounts.

## Sources read for this document

- [Lichess open database](https://database.lichess.org/) — sizes, counts, licences (read 2026-10-15)
- [The Week in Chess](https://theweekinchess.com/twic) — "free for personal use only" (read 2026-10-15)
- [Mega Database 2026, New in Chess](https://www.newinchess.com/chessbase-mega-database-2026) and [Big Database 2026](https://www.newinchess.com/chessbase-big-database-2026) — size and price
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) — storage, operations, egress
- In this repository: `docs/data/historical-games-audit.md`, `docs/data/streaming-reference-investigation.md`, [`docs/reports/phase-86-handover.md`](https://github.com/mardakurt/kingfisher/blob/16d2fcc2/docs/reports/phase-86-handover.md), `docs/product/parity-ledger.md`
