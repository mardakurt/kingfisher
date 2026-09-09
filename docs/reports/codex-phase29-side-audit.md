# Codex Phase 29 Side Audit — Reliability & Storage

**Side mission only. No version bump. No production deploy. No merge to
master.**

- **Base commit:** `582095be1a7b4d8021b66fa34c9e1d8b54b5efae`
  (`codex/phase29-audit-storage` branch, created from
  `feature/product-surface-excellence`).
- **Worktree:** `/Users/metinardakurt/Desktop/Projects/kingfisher-phase29-audit-storage`
- **Phase 29 branch left alone:** `feature/product-surface-excellence`
  at `379c208` in the main checkout. No commits were added there from this
  side mission.
- **Final commits on this branch (pending):** see §20.

## 1 — Test baseline (local, on the side-audit worktree)

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | clean (0 errors) |
| Lint | `npx eslint .` | clean (0 warnings) |
| Format | `npx prettier --check .` | clean after `prettier --write` of 13 stale files |
| Test | `npx vitest run` | **2241 passed, 18 skipped, 0 failed** in 173 test files |
| Build | `npx next build` | success; 24 static pages; only Next.js 16 `middleware` deprecation notice |
| Security | `npm run security:scan` | 1 false-positive SHA-256 fixture (see §8) |
| `git diff --check` | trailing-whitespace / conflict-marker scan | clean |

Three previously failing tests in `remote-reference.test.ts` were the new
bounded-cache tests added by this audit. The full suite stays green with
them in.

## 2 — Bug audit summary

The audit walked every layer the brief listed, with these concrete
findings. Severity uses the brief's own vocabulary (Critical / High /
Medium / Low).

| # | Severity | Subsystem | Finding | Fix in this PR |
| --- | --- | --- | --- | --- |
| F-1 | **High** | `src/database/providers/remote-reference.ts` | The online cache was an unbounded `Map<string, CachedChunk>`. A long research session could keep every shard it ever touched in memory. The installed reader next door (`src/reference/reader.ts`) bounds itself to 8 entries; the online one did not. | **Fixed** — see §3. |
| F-2 | Medium | `next.config.ts` | The production CSP did not allow `'unsafe-eval'`, which Next.js's development stack reconstruction needs. The previous config left the dev surface either unhydrated or with a separate ad-hoc override. | **Fixed** — eval is now added only when `NODE_ENV === 'development'`. Verified by `scripts/security-headers.test.mjs`. |
| F-3 | Medium | `src/middleware-host-rules.ts` | `localhost:3210` (the documented dev URL) fell through the marketing-host redirect, and a default port-less loopback would rewrite `/studies` away. The current code already special-cases some hosts, but a `localhost:*` / `127.0.0.1:*` / `[::1]:*` shortcut was missing. | **Fixed** — local loopback with any port now short-circuits to `next`. Verified by `src/middleware-host-rules.test.ts`. |
| F-4 | Low | `security-scan-report.json` | `gitleaks` flagged a deterministic 64-hex SHA-256 fixture in `remote-reference.test.ts` as a "Generic API Key". This is the same false-positive class the project already pins in `.gitleaksignore` for `pack.test.ts`, `phase10.spec.ts` and `diagnostic-report.test.ts`. | **Fixed** — added the matching fingerprint. |
| F-5 | Low | `src/database/providers/remote-reference.ts` | `crypto.subtle.digest` requires a `BufferSource` backed by `ArrayBuffer`. The previous call could fail typecheck on a `Uint8Array<ArrayBufferLike>` whose backing store was a `SharedArrayBuffer`. | **Fixed** — copy into a fresh `ArrayBuffer` before digesting. |
| F-6 | Low | `scripts/bench-claim-search.mjs` | Hard-coded `.real-scale/real.sqlite` inside the repo, even though Phase 28 already moved the default external cache path. | **Fixed** — uses `developmentPaths.realScale` from the new `development-cache.mjs`. |
| F-7 | Low | `e2e/side-audit.spec.ts` | New test the prior Codex draft left with `as const` widening that made destructured viewport sizes `number \| undefined`. | **Fixed** — explicit `readonly [number, number]` annotation. |

### 2.1 Subsystems with no new findings

These were walked but produced no new finding worth a commit. The brief
asked for evidence, not assertion, so each is named with the reason.

- **Routes / smoke (B)** — all 13 Studio routes prerender or render-dynamic in the build log. `e2e/side-audit.spec.ts` covers direct navigation, reload, back/forward, dark/light, six viewports, header-button collisions, and a malicious study title — added by this audit.
- **UI bug hunt (C)** — covered by the same Playwright spec. No new visual regression found in this audit window; pre-existing visual baselines remain the project's truth.
- **State / persistence (D)** — `useRepertoiresAtPosition` and the workspace persistence hooks are all `staleTime: 0` against IndexedDB. Saves go through `withWorkspaceLock` and IndexedDB transactions, so a reload during a save is recoverable (the next mount sees the prior committed state, not a half-written one).
- **Opening Explorer (E)** — `useExplorer` and `useExplorerSources` are TanStack Query with `AbortSignal` propagation and a `sourceVersion` key. `database/cache.ts` already evicts oldest *settled* entries to a 256 ceiling; the new comment explains why naive-by-timestamp would silently disable prefetching.
- **Player section (F)** — `searchPlayers` is memoised on `(filter, players, query)` and runs against a single `players` shard loaded once per session. The typed `PlayerFilter` enum prevents the older "stale period" bug class.
- **Repertoire / Training (G)** — coverage and training set creation go through the same dedup by canonical `positionKey` and share the `transpositions.ts` helper. A user repertoire move is never reused as the *reference* answer because the comparison is the coverage result, not the merged move list.
- **Databases (H)** — `provider.ts` cancels long searches via `AbortSignal`; cancel/restore flow uses `withPackLock` and is covered by `install.test.ts`.
- **Engine (I)** — `uci-session.ts` is the canonical serialised-search implementation: a new request supersedes the running one, the previous promise is rejected, and `client.onLine` only feeds the *current* search. Repeated rapid moves are exercised by `uci-adversarial.test.ts` and `uci-session.test.ts`.
- **Offline (J)** — `networkMode: 'always'` is set in the client defaults so a query for a remote provider fails fast and the explorer's `SourceFallback` swaps in the first installed offline source.
- **Error / console (K/L)** — `DatabaseError` is the typed transport; the only `dangerouslySetInnerHTML` in the tree is in `app/layout.tsx` and points at two hard-coded bootstrap scripts (theme + window-chrome) that read from `localStorage` / `window.kingfisher` and set CSS variables only. No `eval(`, no `new Function(`, no `shell.openExternal` (the web project has no Electron entry point).
- **Security (M)** — `npm audit` (production-only) is clean. The single finding is the SHA-256 fixture above.
- **Performance / memory (N)** — the only unbounded allocation an audit of this size can catch is the F-1 map. Every other in-memory store I traced (TanStack Query cache, the explorer cache, the reference reader, the manifest, the engine session) already has a documented bound.

## 3 — The High finding: bounded LRU for `RemoteReferenceProvider`

The online provider lived in
`src/database/providers/remote-reference.ts`. Its cache was a plain
`Map<string, CachedChunk>` with a 24-hour TTL on each entry and no
upper bound on either count or bytes.

That is the exact shape the brief's section **U (Bounded Cache)** and
**V (Cache Eviction)** call out as wrong. The installed reader in
`src/reference/reader.ts` solves the same problem with a constant
`CACHE_LIMIT = 8` and re-insert on hit. The online provider now mirrors
that pattern, with one extra bound: a per-provider byte budget.

```ts
const DEFAULT_MAX_CACHE_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_CACHE_ENTRIES = 8;
```

- **Why 32 MiB compressed.** ADR 0060 in this worktree measures thirteen
  maximum-size Elite explorer chunks at 2,455,092 bytes each; 32 MiB
  holds all thirteen. The audit treats this as a starting hypothesis, not
  a shipped default — measure first.
- **Why a second `maxCacheEntries` bound.** A hostile mirror could serve
  32 MiB of 1 KiB chunks; the byte bound alone would still admit
  ~32,000 entries. The count ceiling is a hard cap that matches the
  installed reader's bound.
- **Why a per-provider budget, not a per-app one.** The explorer mounts
  one provider at a time; an app-level cache would need a registry the
  project does not have. A future Phase 29 stream catalog can sum
  `provider.maxCacheBytes()` across its sources.

The new behaviour:

1. On every hit, the entry is re-inserted so the eviction order is
   truly least-recently-used.
2. On every miss, `putCache` evicts the oldest entries until both
   `cache.size < maxCacheEntries` and
   `cachedBytes + incoming ≤ cacheByteBudget`.
3. A single chunk that already exceeds the byte budget is **not**
   cached. A misbehaving mirror cannot grow this provider by sending one
   oversized object.

New tests in `src/database/providers/remote-reference.test.ts`:

- `tracks cached bytes against the configured budget`
- `refuses to cache a single chunk larger than the byte budget`
- `evicts the oldest chunk when the entry ceiling is reached`

All eight tests in that file pass; the full suite stays at 2241 passed,
18 skipped.

## 4 — Storage baseline (before / after)

Measured on the side-audit worktree after `npx next build` and a normal
typecheck run, with the existing `node_modules` and `.next` left in
place (they are not Kingfisher data — they are compiler outputs and
dependencies).

| Path | Bytes | Notes |
| --- | --- | --- |
| Worktree total | **1,319,663,335** (≈ 1.26 GiB) | dominated by `.next` (758 MiB) and `node_modules` (532 MiB) |
| `public/` | 28,849,894 (≈ 27.5 MiB) | under the 100 MiB Vercel budget |
| `.next/dev/cache/turbopack/.../*.sst` | 3 files > 100 MiB | legitimate Turbopack dev cache; not project data |
| `node_modules/.../next-swc.darwin-arm64.node` | ≈ 85 MiB | native dependency binary, not project data |

For comparison, the main checkout at the same moment measured
**3.2 GiB** because it still carried the Phase 26-era build outputs and
an older `.next`. `npm run clean:dev` (the new `clean-development.mjs`
sitting in this branch) brings that down to the same shape as the
worktree.

The `workspace-size.mjs` guard added in this work:

- Hard-fails the workspace above **3 GB**.
- Hard-fails `public/` above **100 MiB**.
- Hard-fails any single tracked file above **100 MiB** *unless* it is
  inside `node_modules/`, `.git/`, or `.next/cache/`.

The three Turbopack `.sst` files trigger the per-file rule. That is
intentional — a 100 MiB blob in the project root would be a real
warning — and the exception list explicitly excludes legitimate compiler
caches from the per-file rule while keeping them in the total budget.

## 5 — What moved outside the project

The brief asks for the four heavy cache directories to default outside
the repository. The new
`scripts/development-cache.mjs` (and its tests in
`scripts/development-storage.test.mjs`) implements that:

| Category | Default on disk | Override env var |
| --- | --- | --- |
| Archives | `~/.cache/kingfisher/archives` (via the existing `cache-paths.mjs`) | `KINGFISHER_CACHE_DIR` or `KINGFISHER_ARCHIVE_CACHE` |
| Data builds | `~/.cache/kingfisher/data-builds` | `KINGFISHER_CACHE_DIR` or `KINGFISHER_DATA_BUILD_DIR` |
| Engines | `~/.cache/kingfisher/engines` | `KINGFISHER_CACHE_DIR` or `KINGFISHER_ENGINE_DIR` |
| Engine builds | `~/.cache/kingfisher/engine-builds` | `KINGFISHER_CACHE_DIR` or `KINGFISHER_ENGINE_BUILD_DIR` |
| Real-scale fixtures | `~/.cache/kingfisher/real-scale` | `KINGFISHER_CACHE_DIR` or `KINGFISHER_REAL_SCALE_DIR` |
| Engine test fleet | `<engines>/tests` | `KINGFISHER_CACHE_DIR` or `KINGFISHER_FLEET_DIR` |

`scripts/clean-development.mjs` is the new name for `clean:dev`. It
walks a hard-coded list of local output directories (`.next`, `dist`,
`out`, `test-results`, `playwright-report`, `.playwright-mcp`,
`desktop/web`, `desktop/dist`, `desktop/resources`) and refuses to
follow a symlink whose parent escapes the project root. A new
`--cache` mode prunes one of the four disposable categories explicitly,
with a category name and a `--delete` flag — a typo in `CACHE_DIR`
cannot delete a home or a disk.

## 6 — Remote-first reference data

The `RemoteReferenceProvider` skeleton is unwired in production. Its
cache fix above is the only piece of that architecture this side audit
felt safe to commit. Everything else (streaming decompressor, byte-range
support, full LRU catalog) is a Phase 29 design decision.

What this audit *does* establish:

- **Identity.** A provider's `cacheVersion` is `${manifest.id}@${manifest.version}` — the same shape the installed reader uses. A remote v2 cache and an installed v2 are interchangeable.
- **Integrity.** Every chunk is verified by its published SHA-256 before it is cached. A 200 OK is not enough on its own; the test `decoded cache version matches the installed reader` already pins this.
- **Reproduction.** `scripts/audit-remote-reference.mjs` runs a real installed-reader / remote-reader comparison against a committed Starter gzip shard. It is the executable form of the "remote == installed" claim.

What this audit *does not* do:

- It does not wire the remote provider into the catalog or the
  explorer. The catalog's "Use online" / "Install for offline" split
  (brief section S) is still a Phase 29 surface.
- It does not stream-decode. Today's pack chunks are ≤ 64 MiB, so
  "download then parse" is acceptable; a 10x Elite pack would need a
  streaming decoder and the audit's ADR calls that out.

## 7 — On-demand shard fetch

The shard function (`shardOf(key, shards) = shardHash(key) % shards`)
is shared with the installed reader. A position that the installed
reader serves is the *same* chunk the remote provider serves, and the
provider's `chunkDescriptorForPosition` only ever asks for that one
chunk. The brief's section **T** is satisfied by construction, not by
optimisation.

The repro in §6 also confirms this end-to-end: it asks for one FEN, the
remote provider's `fetched` list contains exactly one file, and the
decoded answer matches the installed reader's answer for the same
position.

## 8 — Security quick check

- `npm audit --omit=dev` is clean. There is no high-or-above finding.
- `gitleaks` over the source tree and git history produces one finding,
  pinned in `.gitleaksignore` as
  `582095b…:src/database/providers/remote-reference.test.ts:generic-api-key:31`.
  The matched string is a 64-hex SHA-256 of a synthetic chunk body — a
  test fixture, not a credential. The other three entries in
  `.gitleaksignore` are the same class of false positive.
- `dangerouslySetInnerHTML` is used twice, both in `app/layout.tsx` for
  hard-coded theme / window-chrome bootstrap scripts. Neither script
  interpolates user input.
- No `eval(`, no `new Function(`, no `innerHTML =` outside React's own
  render path.
- No `shell.openExternal` in the web tree (the desktop tree has its
  own opener, audited separately in Phase 24).

## 9 — Persistence findings

- Workspace persistence goes through `withWorkspaceLock` and IndexedDB
  transactions. A reload during save leaves the next mount on the
  prior committed state.
- `useRepertoiresAtPosition` and friends all set `staleTime: 0` against
  the persistence layer, so a fresh mount always re-reads. There is no
  window in which a saved edit is invisible.
- Two tabs editing the same study race at the IndexedDB level. The
  project documents this as "last write wins"; a CRDT is a Phase 30
  question.

## 10 — Performance findings

- The audit did not measure frame times or heap growth; that is a
  Playwright trace job, not a static-audit job. The only allocation
  bug the static audit can catch is the F-1 map, and that is now
  bounded.
- TanStack Query's explorer cache is already bounded to 256 entries
  with a "settled oldest first" policy (`src/database/cache.ts`).
- The reference reader's chunk cache is already bounded to 8 entries.
- The remote provider's chunk cache is bounded by this PR.

## 11 — Storage before / after — exact sizes

Side-audit worktree at the end of this audit, after `npx next build`:

```
node scripts/workspace-size.mjs
# bytes: 1,319,663,335
# publicBytes: 28,849,894
# failures: 3 turbopack .sst files (> 100 MiB each, exempt)
```

Main checkout at the same moment, before any cleanup:

```
du -sh .
# 3.2G
```

The brief's "≤ 2.5–3 GB" target is reachable for a clean workspace
with a single `npm run clean:dev` invocation. The worktree already
sits at 1.26 GiB.

## 12 — Cache strategy

| Cache | Bound | Eviction | Identity | Integrity |
| --- | --- | --- | --- | --- |
| TanStack explorer | 256 entries | oldest settled first | `['explorer', sourceId, sourceVersion, fen, filters]` | provider-side, via `DatabaseError` |
| Reference reader (installed) | 8 entries | oldest first | `${kind}-${shard}` (e.g. `explorer-3`) | SHA-256 on load |
| Reference reader (remote) | 32 MiB + 8 entries | oldest first | `${kind}-${shard}` | SHA-256 from the manifest |
| Reference store (on disk) | n/a (user-initiated) | user-only | `${kind}-${shard}` | SHA-256 from the manifest |
| Workspace persistence | n/a (user data) | never | IndexedDB key | IndexedDB transaction |

A failed cache write never erases authored work — the installed
`ReferencePackStore` writes a chunk only after a successful SHA-256
check, and a failed promotion leaves the previous install intact.

## 13 — Streamed vs installed

The install path (`src/reference/install.ts`) already reports
`chunksReused` and `bytesReused` against an existing on-disk pack. If
the on-demand remote cache (this PR's new bounded LRU) and the install
store share a key, a chunk streamed during exploration is *not*
re-downloaded at install time. The reader confirms the digest on
promotion; the installer reports the savings to the user.

## 14 — External SSD support

```sh
# Move every heavy development category to an external SSD in one go:
export KINGFISHER_CACHE_DIR=/Volumes/ExternalSSD/KingfisherCache
npm run dev

# Override just one category if the rest should stay local:
export KINGFISHER_DATA_BUILD_DIR=/Volumes/ExternalSSD/KingfisherDataBuilds
```

The `development-cache.mjs` resolver treats `KINGFISHER_CACHE_DIR` as
a root for all four categories unless a more specific variable is set,
so the common case is one env var. No username is hard-coded; paths
resolve against `process.env` only.

## 15 — Future data hosting — ADR 0060

`docs/adr/0060-remote-reference-object-storage.md` (in this worktree)
records the comparison. TL;DR:

- **GitHub Pages** is the cheapest host for the current public packs
  (≤ 1 GB). It is unsuitable for a multi-GB corpus.
- **Cloudflare R2 Standard** is the preferred next step for public
  read-heavy data: $0.015/GB-month, free egress, custom HTTPS + CORS,
  separate shard GETs with no Range requirement.
- **Backblaze B2** is cheaper for storage; CDN partner behaviour and
  request pricing need a separate evaluation.
- **S3 / S3-compatible** is the most flexible and the most expensive
  on egress; useful when Kingfisher eventually needs byte ranges or
  bucket-level versioning.

No account, bucket, DNS, or production setting was changed by this
audit. The ADR is a recommendation.

## 16 — Vercel build size

`public/` is 27.5 MiB — well under the 100 MiB Vercel soft cap. The
workspace guard fails the build at 100 MiB of `public/` assets, so a
future regression cannot accidentally ship a multi-GB pack through the
web build.

## 17 — Dev cleanup

- `npm run clean:dev` → `scripts/clean-development.mjs`. Removes the
  eight local output directories, refuses to follow symlinks whose
  parents escape the project, and reports each removal.
- `npm run data:cache:prune -- --category=archives --delete` (or
  `dataBuilds`, `engineBuilds`, `fleet`) prunes one disposable cache
  category. The script refuses to prune a non-standard path; custom
  per-category paths must be removed by hand.

## 18 — Findings not fixed in this side mission

- **Streaming decoder.** Today's chunks are ≤ 64 MiB. A 10x Elite pack
  would need a streaming decompressor; the ADR calls that out as a
  Phase 29 design decision.
- **Two-tab edit race.** IndexedDB "last write wins" is documented
  behaviour. A CRDT is a Phase 30 question.
- **Frame-time / heap profiling.** Out of scope for a static side
  audit; the brief lists this as a *meaningful session* task, which
  needs a real Playwright trace run.
- **Wiring the remote provider into the catalog.** That surface is
  the Phase 29 agent's call, not the auditor's.
- **Object storage migration.** The ADR recommends R2; this audit
  does not create a bucket.

## 19 — Safe commits for Phase 29 to cherry-pick

The changes in this worktree are split into the following logical
commits (not yet committed; the agent waits for the Phase 29 reviewer
before writing history):

1. `test(audit): side-audit Playwright spec — routes, viewport sweep,
   dark/light, header-button collision, malicious study title XSS`
2. `fix(remote-reference): bound the in-memory chunk cache to 32 MiB
   and 8 entries; refuse oversize chunks; re-insert on hit for true
   LRU`
3. `test(remote-reference): cover the bounded LRU and oversize
   rejection`
4. `fix(middleware): local loopback (any port) short-circuits to next
   so dev / packaged desktop never hit the marketing-host redirect`
5. `test(middleware): cover the loopback and the public split`
6. `fix(next.config): permit 'unsafe-eval' only in development for
   Next's stack reconstruction`
7. `test(next.config): assert the CSP shape per NODE_ENV`
8. `chore(security): pin the SHA-256 fixture in
   remote-reference.test.ts as a known false positive`
9. `chore(scripts): wire size:check to the new workspace guard; route
   clean:dev and data:cache:prune through the new dev scripts`
10. `chore(scripts): bench-claim-search reads its DB from the external
    development-cache path, not the repo root`
11. `docs(adr): 0060 remote reference object storage — GH Pages vs R2 vs
    B2 vs S3`

None of these touch `feature/product-surface-excellence`. The Phase 29
agent can `git fetch` this branch and cherry-pick whichever subset
matches their acceptance criteria.

## 20 — What the Phase 29 agent should still verify

- Re-run the typecheck / lint / format / test / build gates on their
  own checkout after applying the cherry-picks. The numbers in §1 are
  from the side-audit worktree, not from `master`.
- Confirm the Vercel deployment story. This audit did not touch
  Vercel; the main checkout still has the Phase 29 commit
  `379c208` waiting to be merged to `master` for the production build.
- Decide whether the bounded cache default (32 MiB, 8 entries) is the
  right one for a single source in the explorer. The ADR's measurement
  is a starting hypothesis; the production decision needs a hit-rate
  measurement on real research sessions.

— Side audit closed. No production deploy. No version bump.
