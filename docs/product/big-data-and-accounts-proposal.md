# Big data and accounts — a proposal, not an implementation

2026-10-04. Written at the owner's request after the 1.4.6 ChessBase pass:
propose how Kingfisher could answer from data on ChessBase's scale **without
filling a small SSD**, and say whether sign-in accounts are worth building
now. Nothing here is built. Every figure is either measured in this
repository (and says where) or marked as an estimate.

## 1. What ChessBase has that Kingfisher does not

| ChessBase                        | What it is                                                            | Can Kingfisher have it?                                                                                  |
| -------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Mega Database 2026               | 12.3M games, curated, partly annotated, weekly updates (screenshot 9) | **Not the product** — publisher data and rights. A comparable _population_ from open data, yes (below).  |
| Opening Encyclopaedia            | Editorial opening surveys                                             | No — editorial content. The Theory Book (CC0 classification) and variation briefs stay what they are.    |
| Let's Check                      | Engine evaluations collected from users, per position                 | Only with a server that accepts writes, i.e. after accounts (§3). Lichess's cloud evaluations meanwhile. |
| Engine Cloud                     | Rented engine time on ChessBase's machines                            | A paid hosted service. Kingfisher's remote engines already let a person use their _own_ other machine.   |
| Online database, CloudClip, Shop | Hosted services and a store                                           | Out of scope.                                                                                            |

What Kingfisher has today, for scale: the bundled Starter Reference is
**40 MB** on disk for **206,451** elite games (`public/reference/kingfisher-starter`,
`du -sh`); two larger packs (Recent Theory, Elite OTB) install on demand from
the public data site; Lichess Masters and Rated Games answer online.

## 2. Big data without a big disk: query it where it lives, keep what you touch

### The idea

Build a large position index **once, on a server-side pipeline**, publish it as
immutable, content-addressed **shards** on a cheap object store, and let the
application fetch **only the shard a position needs**, verify it, and keep it
in a cache **with a size limit the person sets**. Nothing is "installed"; the
disk holds what has been looked at, up to a budget, and the oldest goes first.

Kingfisher already has most of the pieces:

- the pack format and builder that aggregate games by canonical position
  (`scripts/build-reference-pack.mjs`, `src/reference/pack.ts`), with
  seekable-zstd reading and early header rejection for 90M-game months;
- a **skeleton streaming provider**, `src/database/providers/remote-reference.ts`
  (Phase 28): resolve the shard for a position key, fetch over HTTPS, accept it
  only against the manifest's SHA-256, cache by content hash, answer the
  Explorer through the ordinary `ChessDatabaseProvider` shape;
- cache-eviction and streaming-cache benchmarks
  (`scripts/bench-cache-eviction.mjs`, `scripts/bench-streaming-cache.mjs`);
- a free GitHub-hosted runner already used for 10M-game work
  (`.github/workflows/real-scale.yml`), so building never touches the owner's
  disk.

### Data, all redistributable

| Upstream                              | Licence      | Use                                                                                       |
| ------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| Lichess broadcast archive (all years) | CC BY-SA 4.0 | Over-the-board elite games — the closest open match to Mega's top level. Already used.    |
| Lichess standard rated database       | CC0          | Billions of online games; filtered (e.g. 2000+ classical/rapid) for statistics by rating. |
| Lichess puzzle database               | CC0          | Already shipped (`public/data/puzzles`).                                                  |
| TWIC, federation PGNs                 | **Unclear**  | Not without written redistribution permission — `docs/data/historical-games-audit.md`.    |

Each source stays its **own** population with its own counts and licence, as
everywhere in Kingfisher; nothing is merged into a pretend "Mega".

### Shape on the server (estimates, to be measured before committing)

- **Position shards**: aggregates keyed by a prefix of the position hash, so a
  shard holds every position sharing it — the Explorer's whole answer is one
  small read. Phase 86 measured the posting layout at **1.1 kB per game**
  (`bench:collection-report`), so 10M games ≈ 11 GB of index _on the server_.
- **Game shards**: PGN by game id, zstd, so one game is one ranged read of a
  few kilobytes.
- **Manifest**: shard list with SHA-256 each, signed or pinned in the app like
  the pack manifests today.

### Hosting (cost estimates, prices to be checked when chosen)

| Host                    | Fit                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cloudflare R2           | No egress fees, HTTP range requests; storage around $0.015 per GB-month (≈ $0.20/month for 11 GB). Recommended. |
| Hugging Face Datasets   | Free for public data, range requests; a reasonable no-cost option for CC0/CC BY-SA sets.                        |
| GitHub Pages / Releases | Current data site; file-size limits and uncertain `Accept-Ranges` — the reason the skeleton stopped.            |

### On the person's machine

- A **cache budget** in Settings (default e.g. 500 MB, can be 0), shown with
  what it holds; least-recently-used shards are evicted; **Clear cache** frees
  it all. A typical opening session touches a few megabytes (estimate).
- Offline, the Explorer answers from cached positions only and says so — the
  same "this source cannot say" rule the packs follow past their depth.
- Privacy: a shard request reveals a hash prefix shared by many positions, not
  the position; the privacy page would say exactly that.
- The Mac companion reads the same shards, so desktop and web agree.

### Order of work

1. Measure: build 1M games from the broadcast archive on the runner; record
   shard sizes, request counts per opening session, latency from the chosen
   host.
2. Finish `remote-reference.ts` (ranged fetch, verification, LRU budget,
   offline statement) behind the existing provider contract.
3. Publish one population (elite OTB, all years) and certify it the way packs
   are certified.
4. Add a rated-online population for statistics by rating.
5. Only then: game retrieval by id for every listed game.

Risks: hosting outlives attention (mitigation: immutable shards, a host that
needs no running server); ShareAlike obligations (already met for packs);
upstream format changes (the builder already verifies publisher digests).

## 3. Accounts (sign-in, sign-up): postponed

**Recommendation: do not build accounts now.** An account by itself does
nothing for a local-first application; its value is what it carries —
syncing studies and repertoires between devices, sharing, and community
evaluations. Each of those needs:

- a **server and a database** for people's authored work, with backups,
  security reviews and someone on call when it fails;
- an **identity provider** (or our own password handling) and email for
  sign-up and recovery;
- **cookies or tokens**, which reverse public claims Kingfisher makes today —
  "No account. No cookies." on the landing, the privacy page and
  `docs/product/public-claims.md` — and change `SECURITY.md`'s "No
  cross-device Sync" section;
- **conflict handling** when the same chapter is edited on two devices
  (chapters have revisions, so this is solvable, but it is real work);
- data-protection duties: export and deletion on request;
- a sign-in flow inside the Mac application.

That is not "easy to implement and maintain"; it is a standing service.

### What to do instead, when cross-device work is wanted

**Sync through the person's own cloud folder, without Kingfisher accounts.**
Kingfisher already writes a complete portable backup (`PORTABLE_STORES`) and
imports it. A desktop setting "Keep a backup in: ~/iCloud Drive/Kingfisher"
(or Dropbox, Google Drive's folder) and a reader that offers the newer copy on
another machine would move studies and repertoires between devices with no
server, no account and no change to the privacy claims. Conflicts are
reported, not merged, exactly as cross-tab conflicts are today.

### If real accounts are wanted later

A minimal, maintainable shape: a hosted auth-and-database service (for
example Supabase: email magic links, Postgres with row-level security),
syncing the same portable records with per-record revisions; opt-in, with the
local-only mode remaining the default and the public claims rewritten
before release. Estimate: several weeks including the security review, plus
running costs and ongoing maintenance.
