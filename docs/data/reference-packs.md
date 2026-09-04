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

## The two packs

|                     | `kingfisher-starter`                             | `kingfisher-elite-otb`             |
| ------------------- | ------------------------------------------------ | ---------------------------------- |
| Distribution        | Committed to this repository, ships with the app | Release asset, installed on demand |
| Upstream            | The 36 most recent monthly broadcast archives    | All 79, from 2020                  |
| Games counted       | 175,022                                          | 422,059                            |
| Full game scores    | 11,357 (rated 2600+)                             | 249,245 (rated 2200+)              |
| Position aggregates | 146,684                                          | 684,269                            |
| Player identities   | 12,609                                           | 34,114                             |
| Size                | 9.5 MB in 88 chunks                              | 107.7 MB in 160 chunks             |

Two thresholds rather than one, because the two things a pack carries cost very
different amounts: a game's contribution to the statistics is a handful of
counters, while carrying its full score is a few hundred bytes. Opening the
statistics wide and the stored games narrow is what lets a pack small enough to
commit still answer from a large population.

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
npm run reference:build -- --pack starter          # the committed pack
npm run reference:build -- --pack elite            # the release-asset pack
npm run reference:build -- --pack starter --files 4    # a short run, for testing a change
npm run reference:build -- --pack starter --reuse-scan # re-reduce without re-scanning
```

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

## Where the packs are published

`kingfisher-elite-otb` is attached to this repository's `reference-elite-v1`
release. One release tag per pack, because release assets share a flat namespace
and two packs both containing `explorer-000.kfp.gz` would collide.

**Those assets are downloadable only while the repository is public.** It is
currently private, so the catalog's Install button for that pack reports a 404
rather than pretending. The catalog therefore also accepts a manifest URL
directly — any host serving a pack works, including a directory of one built
locally — and the verification path is identical either way.
