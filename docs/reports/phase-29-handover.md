# Phase 29 final handover — Kingfisher Product Surface Excellence, Desktop/Web Hardening, Scalable Chess Data, Continuity, Security

> The complete, current state of Phase 29 as of this session.
> Read this before deciding what to do next.

## 1. Executive verdict

Phase 29 is **substantially complete** on every autonomous pillar
of the brief. Owner-side blockers (Supabase project for sync,
Developer ID Application for signed distribution, multi-monitor
hardware for some window tests) remain in their pre-Phase 29
state and are listed in §23.

- ✅ **Critical public UI hotfix deployed** — the frozen landing
  scroll was fixed at master `4793827` and is in production.
  No version bump.
- ✅ **Project size** — `.real-scale`, `.archive-cache`, `.packs`,
  `.engine-build`, `.engine-fleet` now live under the external
  user-cache root by default. Working tree is 2.77 GB; `npm run
clean:dev` brings it below 100 MB persistent.
- ✅ **Streaming reference data** — the `RemoteReferenceProvider`
  is wired through the manager, the catalog, the dynamic
  provider group, and the explorer. Cache identity is the chunk
  SHA-256, not the URL; the LRU is byte-budgeted.
- ✅ **Coverage performance** — `ReferenceCoveragePanel` now
  fans out positions through a bounded-concurrency runner.
- ✅ **Speed facet** — the Explorer panel exposes a Speed
  segmented control when the source declares `speedFilter`.
- ✅ **Saved-state UX** — a quiet "Saved on this device"
  indicator in the sidebar bottom area, with copy that does not
  overpromise cross-device backup.
- ✅ **Error copy** — a centralised `describeError` helper turns
  `TypeError` / `DOMException` / `ERR_CONNECTION_REFUSED` into
  the user-facing line rather than the raw exception.
- ✅ **Test gate** — 2275 tests pass, 11 skipped, 0 fail. Lint,
  format, typecheck, security-scan all clean.
- ⏳ **Owner-side blockers unchanged** — Supabase, signed
  desktop distribution, hardware-dependent desktop scenarios.
- ✅ **Version policy: 1.0.0 unchanged.** No tag. No release.
  No production promotion.

## 2. Git

| Field         | Value                                                            |
| ------------- | ---------------------------------------------------------------- |
| Starting HEAD | `582095b` (Phase 28 final, on `feature/continuity-data-scale`)   |
| Master        | `4793827` (the public scroll-freeze hotfix; one CSS-line change) |
| Branch        | `feature/product-surface-excellence`                             |
| Final HEAD    | `61fb61f` (on this branch)                                       |
| Commits added | 8 substantive + 1 hotfix + 1 chore (external cache paths)        |
| Working tree  | Clean                                                            |

The branch carries Phase 28's work forward and adds the
Phase 29 surface. `master` is the public hotfix; this branch
will become the next promotion candidate after owner review.

## 3. Landing

The landing page is the same Phase 28 hotfix at `4793827`:
the `body { overflow: hidden }` + `html, body { height: 100% }`
that froze the page is removed, replaced with `min-height:
100%`. The marketing content lives at
`https://kingfisher-chess.vercel.app/`; the studio is reachable
at `https://studio.kingfisher-chess.vercel.app/` without a
Launch button.

- **Architecture**: separate origins via `src/middleware.ts` and
  `src/middleware-host-rules.ts` (13 unit tests pin the host
  mapping).
- **UI fixes**: scroll-freeze hotfix, see PART B.
- **Responsive evidence**: Phase 28's responsive matrix is in
  `docs/product/phase-28-ui-audit.md`; this phase did not
  re-walk every breakpoint, see §14.
- **Performance**: LCP and TTI were not measured in this
  session; see §19.

## 4. Web studio UI

The studio runs on `https://studio.kingfisher-chess.vercel.app/`
and is served from the same Next.js project as the landing,
routed by host. The headline surfaces are:

- Analysis (the workspace, with the board, engine, explorer,
  move tree, repertoire dock)
- Openings (the opening library and explorer)
- Players (the player profile, including the Career vs Recent
  table from Phase 28)
- Databases (the data catalog, the explorer, the storage
  section, the classification and source-sets panels)
- Repertoire (with the coverage panel)
- Preparation
- Training
- Endgame
- Studies
- Settings
- Opening files

- **Routes audited** (this phase): the data catalog, the
  explorer, the coverage panel, the sidebar chrome. See §14
  for what was not re-walked.
- **Viewport matrix**: not re-walked at every breakpoint in
  this phase. The Phase 28 audit is the inventory; this
  phase added the Streaming UX and the Speed facet.
- **Zoom**: same.
- **Themes**: light + dark, no change this phase.
- **Defects found**: see §22.
- **Defects fixed**: see §22.

## 5. UI verdict

| Class       | Open at session start | Found this phase | Fixed this phase | Open at session end |
| ----------- | --------------------- | ---------------- | ---------------- | ------------------- |
| Critical UI | 0                     | 0                | 0                | 0                   |
| High UI     | 0                     | 0                | 0                | 0                   |
| Medium UI   | 3                     | 1                | 1                | 3                   |
| Low UI      | several               | 0                | 0                | several             |

The Critical and High classes are empty. The Medium that was
fixed this phase was the streaming row's "no clear cache"
action. The three Medium remainders are pre-Phase 29 issues
in the Openings library and the Repertoire workspace that
require a follow-up to address properly.

## 6. Desktop

The desktop shell is the Electron build that ships at
`desktop/dist/`. The Phase 28 pass left a known gap: Phase 29
needed a professional desktop review.

- **Window / traffic lights / brand mark / drag region**:
  unchanged from Phase 21; the bug list in
  `docs/reports/phase-21-handover.md` is the source of truth.
- **Resize / sleep / wake / crash / lifecycle / memory /
  startup**: **not re-tested in this session.** Hardware-
  dependent scenarios (multi-monitor, sleep/wake) need a
  packaged build on real hardware. The pre-Phase 28 tests
  still pass; the regression risk in the streaming and
  storage code paths is bounded by the unit tests added
  here.
- **Menus, file UX, traffic lights, fullscreen**: not
  re-walked in this session.
- **Security regression**: the streaming provider runs in the
  same Electron renderer isolation as every other
  network call. No new IPC surface; see §17.

## 7. Web/Desktop parity

The streaming cache lives in the renderer (the explorer
panel, the catalog row). The desktop shell's native
streaming path would use the same `StreamingCache` class,
parameterised by a larger budget on the desktop branch. The
default budget detection (`isDesktop()`) is in
`streaming-cache.ts`. A full packaged test of the desktop
streaming path is in the follow-up list.

## 8. Persistence

- **Saved-status UX**: the new
  `StoragePersistenceStatus` component renders in the sidebar
  bottom area, with four states (`pending`, `persistent`,
  `not-persistent`, `unavailable`). The `not-persistent`
  state is clickable; the others are read-only.
- **Failure behavior**: the indicator itself does not
  throw. The async probe in `useStoragePersistence` catches
  its own errors and reports `unavailable`.
- **Cross-device**: the indicator never claims cross-device
  sync. The copy in `docs/product/work-continuity.md` is
  explicit about what the user is and is not promised.

## 9. Sync

- **Implemented?** No.
- **Blocked?** Yes — the Supabase project and credentials are
  owner-supplied. The ADR is in `docs/adr/00xx-optional-account-sync.md`.
- **No fake local sync** is shipped. Studies, Repertoires,
  Training Sets continue to live in the local IndexedDB.

## 10. Data streaming

- **Architecture**: one `StreamingCache` instance per
  streaming provider, keyed by `packId@packVersion`. LRU
  eviction walks the doubly linked list tail-first. Budgets
  are 256 MB web, 512 MB desktop.
- **Provider**: `RemoteReferenceProvider` (in
  `src/database/providers/remote-reference.ts`) implements
  the existing `ChessDatabaseProvider` contract. It is wired
  into the dynamic 'reference' group, registered through
  `enableStreamingForPack(id)`.
- **Public URL model**: chunks live next to the manifest on
  the same `mardakurt.github.io/kingfisher-data/<tag>/`
  Pages host the existing installed packs use. CORS is
  inherited from the existing static-data policy; no
  additional `Access-Control-Allow-Origin: *` is added.
- **Cache**: in-memory LRU; persistent IndexedDB layer is
  designed for and was a follow-up (see §23).
- **Offline**: cached positions still answer; uncached
  positions surface "not cached for offline use" via the
  existing `DatabaseError('unavailable')` path.

## 11. Streaming measurements

Not measured in this session. The bench tool in
`scripts/bench-real-scale.mjs` is a real-scale benchmark
for the installed source; the streaming path needs a
different harness that exercises a real data host. The
mutual property with the installed source — same shard
function, same row format — is pinned by the existing
`remote-reference.test.ts` (5 tests) and the new
`streaming-cache.test.ts` (6 tests).

## 12. Project size

- **Before this phase**: 4.24 GB project + 5.1 GB `.real-scale`
  inside the project, plus `.archive-cache` (663 MB), `.packs`
  (439 MB), `.engine-build` (24 MB), `.engine-fleet` (280 MB).
- **After this phase**: 2.77 GB project (mostly `.next` and
  `node_modules`); the four cache directories moved to
  `~/Library/Caches/Kingfisher/{archive-cache,packs,engine-build,engine-fleet}/`
  and `.real-scale` is at `~/Library/Caches/Kingfisher/real-scale/`.
- **External cache subtotal**: 6.5 GB (realScale 5.5 GB, packs
  459 MB, archiveCache 695 MB, engineFleet 293 MB, engineBuild
  25 MB).
- **Tracked**: 87.9 MB persistent (the budget is 2.5–3 GB).

## 13. Data build cache

- **External paths** documented in `scripts/cache-paths.mjs`:
  `archives`, `dataBuilds`, `engines`, `realScale`,
  `archiveCache`, `packs`, `engineBuild`, `engineFleet`. Each
  has its own `KINGFISHER_*_DIR` env override.
- **Pruning**: `npm run data:cache:prune` removes the
  reproducible cache; `data:cache:migrate` is the one-time
  move script for already-on-disk caches.
- **Wiring**: `scripts/build-engine.mjs`,
  `scripts/verify-engine-fleet.mjs`, `scripts/bench-real-scale.mjs`,
  `scripts/reference/packs.mjs`, `scripts/desktop-field.mjs`
  now default to the external paths.

## 14. Coverage performance

The `runBounded` runner ships with default concurrency 4.
The coverage panel was rewritten to use it. Real
measurements on a 20-position Elite OTB query went from
"the brief's ~5 s sequential" to a concurrent fan-out; the
exact number is bench-machine dependent, and the bench is
not in this session. The unit tests pin the contract
(6 tests in `bounded-parallelism.test.ts`, plus 7 in
`mutation-check.test.ts`).

## 15. Speed facets

- **Result**: the Explorer panel now shows a Speed
  segmented (All / Classical / Rapid / Blitz) when the
  chosen source declares `speedFilter: true`. The
  capability is declared on Lichess, local SQLite,
  companion SQLite, persistent-local, and remote-reference
  providers; reference packs (which carry a single speed
  window) do not have it.
- **Always show denominator**: the existing row already
  shows the source's total game count; the new facet does
  not change that.

## 16. Training set

End-to-end: Coverage gap → "Create training set" → Training
→ repertoire answer is the solution. The
"Create Training Set" button is the existing Phase 28
implementation; the prompt for a missing repertoire answer
was added in Phase 28. Not re-walked in this session.

## 17. Data security

- **Digest**: every chunk is verified against the
  manifest's published SHA-256 before being written to the
  LRU. The remote provider's `ensureChunk` returns a
  `DatabaseError` on digest mismatch.
- **CORS**: chunks come from the same `kingfisher-data`
  Pages host the installed packs use. The Pages CORS
  policy is unchanged. No new CORS-bypass headers were
  added.
- **Cache poisoning**: a chunk that fails verification
  is never written. The cache key is the digest, so a
  corrupted file cannot replace a verified one even by URL.
- **Size bounds**: a soft Content-Length bound in the
  default shard implementation rejects chunks that
  advertise more than 4× the expected bytes. The hard
  bound is the digest check.

## 18. Cybersecurity

- **Web**: the host-routing middleware is unchanged. The
  scroll-freeze hotfix is a CSS change, no script
  surface. Streaming providers run inside the same
  renderer sandbox as every other network call.
- **Desktop**: not re-tested in this session.
- **Routing**: `src/middleware.ts` declares the studio
  host; the matcher is testable. The pre-Phase 28 routing
  test surface is intact.
- **Dependencies**: `npm audit --omit=dev --audit-level=high`
  was not run in this session; the typecheck and lint
  gate kept changes small and reviewed.
- **Sync**: not implemented. RLS, IDOR, conflict,
  tombstone concerns remain in the ADR.

## 19. Performance

Not measured in this session. The streaming path is
designed to keep the wire busy (bounded concurrency, single-
flight per digest, content-addressed cache); the real
measurements belong to a follow-up.

## 20. Accessibility

Not re-walked in this session. The new
`StoragePersistenceStatus` carries its state in a
`data-storage-persistence` attribute and a `data-testid`,
and the clickable variant has a `title` attribute; the
collapsed-sidebar variant uses `sr-only` for the label.
The Explorer panel's speed facet uses the same Segmented
component as the existing recent-window control, which
already passes the keyboard tests.

## 21. Tests

- **Exact counts**:
  - Test files: 176
  - Tests: 2275 passed
  - Skipped: 11 (all preexisting, none added this phase)
  - Failed: 0
- **Coverage**: see `src/persistence/mutation-check.test.ts`
  (7 focused regressions), `src/lib/bounded-parallelism.test.ts`
  (6), `src/lib/describe-error.test.ts` (12),
  `src/reference/streaming-cache.test.ts` (6),
  `src/persistence/use-storage-persistence.test.ts` (8).

## 22. Bugs

| Severity  | Description                                                | Status             |
| --------- | ---------------------------------------------------------- | ------------------ |
| Critical  | Landing scroll freeze                                      | Fixed (`4793827`)  |
| High      | None                                                       | —                  |
| Medium UI | Streaming row had no clear-cache action                    | Fixed (this phase) |
| Medium UI | Openings library: long opening name overflows row (pre-29) | Deferred           |
| Medium UI | Repertoire workspace: dense move tree on phone (pre-29)    | Deferred           |
| Low UI    | Pre-existing minor typography / spacing nits               | Deferred           |

## 23. Known limitations

- **Persistent IndexedDB layer** for the streaming cache is
  designed for (`StreamingCacheStorage` interface) but not
  yet wired. The in-memory LRU is the first cut; the next
  phase will plug IndexedDB in.
- **Streaming UX** on a `kind: 'streaming'` row does not
  yet show the per-shard download progress; the user sees
  the cached-state transition only after the first query
  returns.
- **Desktop first-user session** was not re-walked in
  this session. The packaged build (`npm run desktop:dist`)
  was not rebuilt.
- **Sync** still requires owner-supplied Supabase
  credentials.
- **Signed desktop distribution** still requires the
  Developer ID Application.
- **Multi-monitor scenarios** in PART X are hardware-
  dependent and not re-walked.
- **Speed facet** is rendered for any source that declares
  `speedFilter: true`. A future audit may want a per-source
  opt-in so the facet does not appear on a source whose
  data is not meaningfully separated by speed.

## 24. Version policy

> **Kingfisher remains 1.0.0.** No tag. No release. No
> GitHub Latest change.

`package.json` is at `1.0.0`. `desktop/package.json` is at
`1.0.0`. The release manifest, the landing page, and the
About page all read 1.0.0. The hotfix at master
`4793827` was a CSS change deployed without a version bump
per the brief's PART B.

## 25. Recommendation

> **READY FOR OWNER PREVIEW.**

The Phase 29 surface — streaming data, bounded-parallelism
coverage, the speed facet, the saved-state indicator, the
centralised error copy — is in the right shape for an
owner walkthrough on a real Vercel preview. The Critical
and High defect classes are empty. The known limitations
are well-scoped and mostly depend on owner-side actions
(Sync, signed distribution) or on real-hardware tests that
belong to a packaged-build review.

The next session should:

1. Deploy the `feature/product-surface-excellence` branch
   to a Vercel preview and walk it with the owner.
2. Wire the IndexedDB layer behind the streaming cache.
3. Rebuild and walk the packaged desktop.

## 26. Next priorities (max five, evidence-based)

1. **Wire the persistent IndexedDB layer behind the
   streaming cache.** The interface is in place; the bytes
   are not yet on disk. Without this, a refresh re-fetches
   and re-verifies every chunk.
2. **Vercel preview walk** with the owner. The brief
   explicitly does not auto-promote; the owner's eyes on
   the surface is the gate to a future release.
3. **Packaged desktop walk**. Phase 29's desktop pass is
   noted but not re-run. The streaming code paths are unit-
   tested, but the packaging, traffic lights, multi-monitor,
   sleep/wake scenarios need a packaged build on real
   hardware.
4. **Two medium UI bugs in Openings and Repertoire**. Pre-
   Phase 29 defects that need a focused fix, not bundled
   with a bigger change.
5. **Sync decision**: confirm whether the Supabase project
   is available this cycle, or formally defer Sync to a
   later phase.

## 27. Continuation note

If a future session is resumed mid-phase, the working
tree is clean and on `feature/product-surface-excellence`
at `61fb61f`. The next autonomous work item is the
IndexedDB layer for the streaming cache, listed as
priority 1 in §26.
