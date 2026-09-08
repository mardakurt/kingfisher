# Reference packs

How Kingfisher gets chess data, what shape it is in, and how to rebuild it.

The licence and provenance of every source is in
[`THIRD_PARTY_DATA.md`](../../THIRD_PARTY_DATA.md). This document is the
architecture.

## The problem

Before Phase 13, "a database" in Kingfisher meant one of two things: a remote
service, or games the user had imported. A fresh installation therefore had
_no chess data at all_ — and since April 2026 the Lichess opening explorer has
required an authenticated request, so the first thing a new installation showed
where the evidence belongs was a prompt to go and create an API token.

That is the wrong first impression for a chess application, and it is not a
presentation problem. The fix is to ship data.

## The shape of a pack

A pack is a **manifest** plus a set of **gzip-compressed chunks**.

```
manifest.json          licence, provenance, counts, and a SHA-256 per chunk
explorer-000.kfp.gz    position aggregates, sharded by a hash of the position key
game-000.kfp.gz        full game scores, sharded by a hash of the game id
players-000.kfp.gz     one row per player identity
playergames-000.kfp.gz game ids per player
```

Every line format is plain text — gzip removes the size difference a binary
encoding would buy, and a corrupt pack should be readable by a human deciding
what went wrong. `src/reference/pack.ts` is the only encoder and the only
decoder; the build script imports it, so the program that writes a pack and the
program that reads it cannot drift.

### Why sharding

Answering "what is played in this position" reads **one chunk of a few hundred
kilobytes**, whichever pack it is. That is what makes the size of a reference
source stop mattering: the bundled 175,000-game pack and the 422,000-game elite
pack cost the same per query. A pack that had to be loaded whole would put a
ceiling on how much data Kingfisher could ship, and the ceiling would be low.

The hash is FNV-1a over the key. It decides only which shard a key lives in, so
its distribution matters and its cryptographic strength does not.

### Why chunks stay compressed in storage

Three reasons, and the second is the one that is easy to miss:

1. Storage is about a third of the size.
2. **The bytes stay byte-identical to what the digest in the manifest covers**,
   so an installation can be re-verified at any time — not only while it is
   being installed. `verifyPack()` reports which chunks no longer match, and
   deliberately repairs nothing: silently re-downloading data a user has been
   citing is a change of evidence nobody was told about.
3. `DecompressionStream('gzip')` is native in every browser this application
   supports. (`zstd` is not — which is why the _upstream_ archives, which are
   `.zst`, are decompressed by the build script and never by the browser.)

## The four packs

Three are drawn from the same over-the-board broadcast archive and differ by a
threshold; the fourth is a different population entirely, and is kept apart for
exactly that reason.

|                     | `kingfisher-starter`                             | `kingfisher-recent-theory` | `kingfisher-elite-otb`    | `kingfisher-high-rated-online` |
| ------------------- | ------------------------------------------------ | -------------------------- | ------------------------- | ------------------------------ |
| Distribution        | Committed to this repository, ships with the app | Installed on demand        | Installed on demand       | Installed on demand            |
| Population          | Broadcast, over the board                        | Broadcast, over the board  | Broadcast, over the board | Lichess rated, online, 2400+   |
| Upstream            | The 36 most recent monthly broadcast archives    | The 24 most recent         | All 79, from 2020         | One monthly standard archive   |
| Licence             | CC-BY-SA-4.0                                     | CC-BY-SA-4.0               | CC-BY-SA-4.0              | CC0-1.0                        |
| Games counted       | 172,376                                          | 44,200                     | 407,538                   | 305,169                        |
| Full game scores    | 10,707 (rated 2600+)                             | 18,151 (rated 2500+)       | 407,538 — every game      | 305,169 — every game           |
| Position aggregates | 246,870                                          | 918,069                    | 5,438,808                 | 315,668                        |
| Deepest query ply   | 40 (20 full moves)                               | 40 (20 full moves)         | 40 (20 full moves)        | 40 (20 full moves)             |
| Player identities   | 12,522                                           | 2,567                      | 33,607                    | 12,315                         |
| Size                | 12.4 MB in 88 chunks                             | 33.9 MB in 80 chunks       | 339.4 MB in 160 chunks    | 85.8 MB in 160 chunks          |

Separate thresholds for statistics and for stored games, because the two cost
very different amounts: a game's contribution to the statistics is a handful of
counters, while its full score is a few hundred bytes. Opening the statistics
wide and the stored games narrow is what lets a pack small enough to commit
still answer from a large population.

Explorer depth is measured in **plies**, never ambiguously as “moves”. All
four packs index the outgoing move at ply 40, which is 20 full moves.

`kingfisher-recent-theory` exists because the two broader broadcast packs answer
the wrong question for preparation. They weigh evidence over three and seven years; a
line played twice in the last eighteen months by 2600s is news, and in a
seven-year aggregate it is a rounding error. Recent Theory is the same
pipeline over a two-year window with a lower deep threshold, so it is a
_recency_ source and is labelled as one. Its numbers are not comparable with
Elite's and the explorer never adds them together.

## What the pruning threshold costs, measured

A position is kept when enough games reached it. One threshold for the whole
tree is the wrong shape: near the start every position has thousands of games
and the number does nothing, and past move nine the tree fans out faster than
any archive fills it — so the same number is what makes an explorer go blank
exactly where preparation begins. `deepFromPly` and `deepMinGames` state a
second, lower threshold for the deep half.

Measured on the starter pack's own scan, which is the same 172,376 games in
every row:

| Rule                                      | Positions |    Size | Corpus answered at 20 plies |
| ----------------------------------------- | --------: | ------: | --------------------------: |
| 3 games everywhere (the Phase 13 rule)    |   150,128 |  9.5 MB |                       58.1% |
| 3 games, then 2 from ply 24               |   197,349 | 11.0 MB |                       58.1% |
| **3 games, then 2 from ply 18** (shipped) |   246,870 | 12.3 MB |                   **64.5%** |
| 3 games, then 1 from ply 24               | 2,755,981 | 79.5 MB |               not measured¹ |

¹ Rejected on size before it was benchmarked: a pack committed to this
repository has to stay small enough that cloning it is not an event.

The elite pack, which is downloaded rather than committed, can afford the
expensive end and takes it — 1 game from ply 28, which is 5,438,808 positions
and 339.3 MB against 650,206 and 157.8 MB for a flat two-game rule. That is
where its 20-ply and 30-ply advantage over the starter comes from.

Reproduce any row with `npm run reference:build -- --pack starter` after
editing `scripts/reference/packs.mjs`. Since Phase 15 the scan cache is
fingerprinted on the limits the _scan_ applies, so changing a frequency
threshold re-reduces in about a minute instead of re-parsing every archive.

## How deep the packs actually answer

`npm run bench:explorer-depth` replays 31 hand-written theoretical lines
through the application's own rules and asks each pack what is played at each
ply. Measured 5 September 2026:

|                     | Starter | Recent Theory | Elite OTB |
| ------------------- | ------: | ------------: | --------: |
| 10 plies (5 moves)  |  100.0% |        100.0% |    100.0% |
| 20 plies (10 moves) |   64.5% |         54.8% |     74.2% |
| 30 plies (15 moves) |   10.3% |          6.9% |     20.7% |
| 40 plies (20 moves) |    0.0% |          0.0% |     25.0% |
| Median continuous   |      22 |            21 |        24 |
| Most-played chain   |      36 |            41 |        41 |

Two caveats, both of which the benchmark output states:

- The corpus is written from memory. It is real theory for the first twelve to
  fifteen moves; past that the continuations are _legal_ rather than topical,
  so a miss at 30 plies can mean "the pack is shallow" or "nobody has played
  this exact move order". The absolute percentages at 30 and 40 plies are
  therefore a floor, not a measurement of theoretical depth.
- The **most-played chain** has no authoring risk in it at all: it starts from
  the initial position, takes whatever the pack says is the commonest
  continuation, and counts how far that can be repeated. It is the literal
  experience of a player clicking the top row. Recent Theory and Elite both
  run out at 41 plies — which is the pipeline's own `maxPly` cap, not the end
  of their data. The starter's 36 is a genuine frequency limit.

## The filters, and why each exists

`scripts/reference/packs.mjs` holds the thresholds; `scan.worker.mjs` applies
them. In the order they run:

- **Decided result, minimum length, standard chess, no set-up position.** A
  game with `*` for a result cannot contribute to a score, and a game that
  starts from a FEN is not part of an opening reference.
- **Rated at or above the threshold, _or_ between titled players.** The second
  clause matters: match and exhibition events frequently carry titles and no
  ratings, and those are exactly the events former world champions play in. A
  rating threshold alone silently excludes the players a reference most
  obviously ought to contain.
- **A rating the archive did not state is not evidence against.** `min(stated
ratings)`, not `min(elo || 0)`. Relays routinely carry one player's rating and
  not the other's.
- **No stated rating above 2900.** Not a quality filter but a _species_ filter:
  the archive relays engine tournaments (TCEC) and online-rated events alongside
  over-the-board chess, and both carry numbers no human has held — the highest
  FIDE rating ever achieved is 2882. Left in, engines dominated every "strongest
  games here" list and made every recorded peak meaningless. This was found by
  looking at the top games for the Najdorf and finding six computer games.
- **A year outside 1475–now is treated as no year.** One relay typo reading 2308
  was enough to move a whole pack's "recent" window past every game in it.
- **Deduplicated by a content hash of the game**, because one game relayed into
  two broadcasts appears twice upstream.

## Recent counters, and what an aggregate cannot do

A position aggregate cannot be sliced by date. That is ADR 0023's rule and it
has not been relaxed: an all-time reduction cannot answer "since 2024", and
pretending otherwise would make Kingfisher state a chess fact that is false.

But a pack can carry a _second set of counters_ built alongside the totals. Each
move stores its games, wins, draws and losses again, restricted to
`manifest.recentSince` onwards. Two numbers per move, and it buys the one
comparison an opening explorer is actually asked for — is this still played —
without pretending the aggregate can be sliced arbitrarily.

The explorer shows the two apart, because "recent" means a different window in
each case: a filtered query answers the window the user chose, and a carried
counter answers the one the pack was built with.

## Player identities

Two spellings become one player **only when the archive recorded the same FIDE
identifier against both**. That is the source stating they are one person, not
Kingfisher guessing from a resemblance — so "Carlsen, Magnus", "Magnus Carlsen"
and "MagnusCarlsen" are one career, and two similar names that never shared an
identifier stay apart however obvious the guess would be. Phase 12's rule that
Kingfisher does not decide identities is unchanged.

A name that appears with _two different_ identifiers keeps neither: it is either
two people sharing a spelling or a relay's typo, and a wrong identifier is worse
than an absent one.

The merged row is written under every spelling, so a lookup by any of them finds
the same career, while `id` lets a search show one row rather than three.

## Rebuilding

```bash
npm run reference:build -- --pack starter        # the committed pack
npm run reference:build -- --pack recent         # the two-year recency pack
npm run reference:build -- --pack elite          # the deep pack
npm run reference:build -- --pack starter --files 4   # a short run, for testing a change
```

Scans are cached per archive under `.archive-cache/`, fingerprinted on the
archive's digest and on the limits the scan itself applies. Changing a
reduce-time threshold — `minGames`, `deepFromPly`, `topGames`,
`gamesPerPlayer` — therefore reuses every scan and finishes in about a minute.
Changing a rating filter, a title list or `maxPly` re-parses.

The pipeline downloads the monthly archives, checks each against the SHA-256
lichess.org publishes, decompresses (frame by frame — the archives carry
skippable zstd frames that Node's streaming decoder rejects, so
`zstd-frames.mjs` walks the frame headers), parses, filters, deduplicates,
replays every game through **Kingfisher's own rules code** via a worker pool,
aggregates by position, builds the player table, shards, compresses, and writes
a manifest naming the exact upstream files it used.

Replaying through the application's own `Position` rather than a second
implementation is the same decision `build-opening-index.mjs` made and for the
same reason: the position keys a pack is written with are then, by
construction, the keys the running application computes.

A full elite build is about 45 minutes on twelve cores and needs roughly 5 GB of
scratch space.

## Installing

`src/reference/install.ts`. The contract is that a pack is **either wholly
installed and verified, or not installed at all**. There is no state in which
the catalog lists a source holding half a million games and silently answers
from three hundred thousand.

- The manifest is written as `installing` before any chunk is fetched.
- Each chunk's SHA-256 is checked against the manifest before it is stored.
- A digest mismatch, a 404, or a closed tab leaves a pack marked `installing`,
  which nothing reads from and which the next attempt _resumes_ rather than
  restarts — chunks already present are re-verified, not re-downloaded.
- A cancel is the one failure that keeps what it has, because the user may well
  press Install again.

The bundled pack installs itself on first run, from the application's own static
assets. That is a deliberate choice over reading `/reference/` directly, and it
costs code: a static asset is fetched over the network like any other, so an
explorer reading one stops working on a train — and a source that every fresh
profile uses would have been the one source no test of installation, failure or
removal ever exercised.

## Where the packs are published — and the fact that they are not

**Nothing optional is published. Every Install button for a pack that is not
bundled fails.** Verified 8 September 2026:

```
$ curl -s -o /dev/null -w '%{http_code}\n' \
    https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json
404
$ curl -s -o /dev/null -w '%{http_code}\n' https://github.com/mardakurt/kingfisher-data
404
```

The `mardakurt/kingfisher-data` repository does not exist, so its Pages site
does not either, and all three catalog entries — Elite OTB, Recent Theory and
High-Rated Online — point at addresses that answer 404. The packs themselves
are built and verified (see the matrix below); they have never been uploaded.

This is the single largest thing standing between Kingfisher and a useful first
week for somebody who is not the maintainer. Three of the four reference sources
in the product are visible, described, sized, licensed — and unobtainable.
Publishing them is an owner action: it needs a public repository created under
the owner's account and about 460 MB pushed to it. No amount of application work
substitutes for it.

Until then the application is at least **honest about it**. A 404 no longer
tells a chess player to check their connection and try again — both halves of
which were wrong, since their connection is fine and no retry can publish a
pack. It says the source is not published at the address this version looks for,
and that Diagnostics records the address that was tried.
`src/reference/install.test.ts` holds that copy in place.

### What publishing looks like when it happens

The intended arrangement, which the catalog already encodes:

```
https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json
https://mardakurt.github.io/kingfisher-data/reference-recent-v1/manifest.json
https://mardakurt.github.io/kingfisher-data/reference-online-v1/manifest.json
```

**Pages rather than release assets**, which is not a matter of taste. A release
download is a redirect to an object store that answers without an
`Access-Control-Allow-Origin` header, so a browser cannot read it at all; the
Pages mirror answers with `access-control-allow-origin: *`. Release assets
remain useful as an archival or manual download and nothing else.

**A separate repository**, so that anonymous installation does not require
making the Kingfisher application source public. That repository contains
manifests, chunks, checksums and licence text — no application code.

Version directories are not replaced in place: `reference-elite-v3` will be a
new directory, so a build that shipped against v2 keeps working.

The catalog also accepts any compatible manifest URL a user pastes in, and its
verification path is identical — which is what makes the certification below
possible without a publisher.

## Certification matrix

Measured 8 September 2026 on darwin-arm64, Node 24.14.0, from the packs built on
5 September 2026.

|                                                            | Starter                                         | Elite OTB                 | Recent Theory              | High-Rated Online              |
| ---------------------------------------------------------- | ----------------------------------------------- | ------------------------- | -------------------------- | ------------------------------ |
| Pack id                                                    | `kingfisher-starter`                            | `kingfisher-elite-otb`    | `kingfisher-recent-theory` | `kingfisher-high-rated-online` |
| Version                                                    | 2                                               | 2                         | 1                          | 1                              |
| Licence                                                    | CC-BY-SA-4.0                                    | CC-BY-SA-4.0              | CC-BY-SA-4.0               | **CC0-1.0**                    |
| Source                                                     | Lichess broadcast archive                       | Lichess broadcast archive | Lichess broadcast archive  | Lichess standard rated games   |
| Upstream months                                            | 2023-08 … 2026-07                               | 2020-01 … 2026-07         | 2024-08 … 2026-07          | 2026-07                        |
| Games represented                                          | 172,376                                         | 407,538                   | 44,200                     | 305,169                        |
| Full games openable                                        | 10,707                                          | 407,538                   | 18,151                     | 305,169                        |
| Positions                                                  | 246,870                                         | 5,438,808                 | 918,069                    | 315,668                        |
| Players                                                    | 12,522                                          | 33,607                    | 2,567                      | 12,315                         |
| Deepest query position                                     | ply 40 (20 moves)                               | ply 40                    | ply 40                     | ply 40                         |
| Chunks                                                     | 88                                              | 160                       | 80                         | 160                            |
| Size on disk                                               | 12.4 MB                                         | 339.4 MB                  | 33.9 MB                    | 85.8 MB                        |
| **Integrity** — every chunk re-hashed against the manifest | **88/88**                                       | **160/160**               | **80/80**                  | **160/160**                    |
| Installed state                                            | bundled, installs itself on first run           | built, **not published**  | built, **not published**   | built, **not published**       |
| Startup behaviour                                          | installs on first run, then read from IndexedDB | absent                    | absent                     | absent                         |
| Offline behaviour                                          | answers with the network cut                    | n/a                       | n/a                        | n/a                            |

488 chunks were re-hashed; **none mismatched and none was missing.**

### What was exercised through the application, and how

The three unpublished packs cannot be installed from their catalog rows, so the
install path was certified through the same code by way of the catalog's
"Install from a URL" control, with a pack served from a local static server.
That is not a substitute for publication and it is not claimed as one — it is
the identical `installPack` path, and it is what makes the rows below evidence
rather than intention. `e2e/reference-packs.spec.ts`, against Recent Theory
(33.9 MB, 80 chunks), in **40.6 s** for both tests:

| Behaviour                                  | Result                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| Install at real scale through the UI       | 80/80 chunks, progress reported in MB, source becomes usable                      |
| Reports its own manifest's counts          | row shows 44,200 games                                                            |
| The Explorer offers it and answers from it | selected as Evidence source, moves returned                                       |
| Verify integrity after install             | all chunks verified                                                               |
| Remove                                     | source gone; the bundled Starter untouched                                        |
| **A chunk that hashes wrong**              | source never becomes usable, toggle stays disabled, never offered to the Explorer |

The corruption test flips one byte in the middle of `explorer-000.kfp.gz` — a
body that arrives whole and hashes to the wrong thing, which is the failure a
mirror or a bad disk produces and the one the digest exists for, rather than a
truncation or a 404, which fail at the transport instead. It was
mutation-checked: with the byte flip disabled the test fails, as it must.

### Not yet certified

- **Upgrade behaviour** (`reference-elite-v2` → a later version directory)
  cannot be exercised without a publisher, since it turns on two version
  directories existing at one address.
- **Disk-space exhaustion** during a 339 MB install.
- Memory with all four packs installed at once.

## What is not here, and why

**Nothing, now, that was listed here before.** This section used to say that
high-rated online play was the obvious missing population and that building it
was a scheduling problem rather than an architectural one. It was built:
`kingfisher-high-rated-online` streams one month of the Lichess standard
archive — 89,288,421 games considered, 305,169 retained — and is described in
[`high-rated-online.md`](high-rated-online.md). What remains missing is not a
population but a publisher; see the section above.
