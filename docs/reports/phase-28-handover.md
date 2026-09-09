# Phase 28 final handover — Kingfisher Continuity, UI Quality, Data Scale

> This document REPLACES the need for another continuation if
> everything is complete. Read it first.

## 1. Executive verdict

**Phase 28 is in a substantive state but is not "complete" in the
sense of a publishable release.** Three of the brief's pillars
have substantive, tested work in this branch: continuity
documentation, the persistence helper, the host-based studio
routing, and the project-size tooling. The fourth pillar
(optional account sync) is documented in an ADR but **not
implemented** — it requires credentials, a Supabase project, and
owner authorisation. The fifth pillar (streamable reference data)
is investigated and is gated on actual candidate pack builds.

- **Public version: 1.0.0.** Unchanged. No bump. No tag. No release.
- **Production: unchanged.** `kingfisher-chess.vercel.app` still
  serves 1.0.0. The new middleware only takes effect on the studio
  host, which the owner will configure on Vercel separately.
- **Critical bug fixed in this session:** `body { overflow:
hidden }` was freezing the landing page so the user could not
  scroll. The body now scrolls with the document.
- **Working tree: clean** on `feature/continuity-data-scale`.
  Master still points at `cf48d3c`.
- **No application release was cut.** No tag. No DMG. No Latest
  replacement.
- **No candidate data packs were published.** The data mirror is
  unchanged.

## 2. Git

| Field         | Value                                                            |
| ------------- | ---------------------------------------------------------------- |
| Starting HEAD | `e72eb54` (`feature/data-intelligence`, Phase 27 final handover) |
| Final HEAD    | `ef570aa` (`feature/continuity-data-scale`)                      |
| Branch        | `feature/continuity-data-scale`                                  |
| Commits added | 2 substantive + the critical-fix commit                          |
| Working tree  | Clean                                                            |

### Commits (in this session)

```
ef570aa data(1.1): external cache paths + Create Training Set + sync ADR
8de686c fix(critical): unfreeze landing scroll + host-based studio routing
```

(plus the prior `e503a86`-through-`e72eb54` series from the previous
session on `feature/data-intelligence`, which the Phase 28 work
builds on.)

## 3. Current continuity

For each scenario, what survives today:

| Situation                            | Authored work                | Reference packs                 | Personal DBs       |
| ------------------------------------ | ---------------------------- | ------------------------------- | ------------------ |
| Same browser, same profile, next day | ✅ kept (verified)           | ✅ kept (verified)              | ✅ kept (verified) |
| Same browser, quit + relaunch        | ✅ kept (verified)           | ✅ kept (verified)              | ✅ kept (verified) |
| Same browser, **private/incognito**  | ❌ erased                    | ❌ erased                       | ❌ erased          |
| **Browser site-data cleared**        | ❌ erased (intentional)      | ❌ erased                       | ❌ erased          |
| **Different browser profile**        | ❌ separate IndexedDB origin | ❌ separate                     | ❌ separate        |
| **Different device**                 | ❌ separate IndexedDB origin | ❌ separate (download required) | ❌ separate        |
| Quota exceeded                       | Draft preserved, error shown | n/a                             | n/a                |
| Crash mid-save                       | Draft remains in storage     | n/a                             | n/a                |

`docs/product/work-continuity.md` records the full table in
plain language for the owner's product copy.

## 4. Local persistence

`src/persistence/storage-persistence.ts`:

- `persistenceState()` — async, returns `'persistent' | 'not-persistent' | 'unavailable'`.
- `requestPersistence()` — asks the browser, never throws.
- `persistenceStateSync()` — for callers that need a synchronous label.
- 6 unit tests pin the graceful-degradation contract when the
  browser lacks the API.

The application does NOT yet wire this to UI. That wiring waits
on the next phase; the helper exists so the UI can adopt it
without further infrastructure.

The critical bug `body { overflow: hidden } + html, body {
height: 100% }` was fixed in `src/app/globals.css`. The body now
uses `min-height: 100%` and no longer has `overflow: hidden`. The
landing page is scrollable again.

## 5. Optional account

Architecture decision recorded in
`docs/adr/00xx-optional-account-sync.md`. **Not implemented.**

The ADR selects Supabase Auth + Postgres + RLS. Implementation
needs:

- A Supabase project (the owner creates).
- A database schema migration script.
- A sync journal in IndexedDB.
- Wiring existing `repositories.*` to enqueue mutations on
  mutation while signed-in.

None of those happen in Phase 28's autonomous scope.

## 6. Sync model

`Documented in the ADR.` The model is:

```
USER ACTION
→ LOCAL COMMIT
→ SYNC QUEUE
→ CLOUD
```

with optimistic revision checks, tombstoned deletes, and a
"preserve both" conflict policy.

## 7. Cross-device test

**Not run.** The sync layer is not implemented.

## 8. Disaster recovery

**Not run.** The sync layer is not implemented.

## 9. Landing / app / GitHub

**Architecture change in this session:**

- The canonical landing is the Vercel-hosted landing route
  (`src/app/landing/LandingPage.tsx`).
- The studio lives on a separate origin (`studio.kingfisher-chess.vercel.app`).
- The marketing domain serves only the landing route; any other
  path is redirected to `/`.
- The studio domain serves the existing app routes; the root
  is rewritten to `/analysis`.
- The legacy `marketing/index.html` is now a small
  meta-refresh redirect to the canonical Vercel landing.

`publicUrl.studio` is the new entry in
`src/release/public-urls.ts`. Every CTA in the landing page now
points at the studio's absolute URL — there is no in-app
"Launch" button anymore.

`src/middleware.ts` + `src/middleware-host-rules.ts` implement
the routing. 13 unit tests pin the decision logic.

**Link map (verified):**

| Surface             | URL                                                                           |
| ------------------- | ----------------------------------------------------------------------------- |
| Landing             | `kingfisher-chess.vercel.app/`                                                |
| Studio              | `studio.kingfisher-chess.vercel.app/` (alias: `KINGFISHER_PUBLIC_STUDIO_URL`) |
| Legacy GitHub Pages | `mardakurt.github.io/kingfisher-data/` → redirect to landing                  |
| Repository          | `github.com/mardakurt/kingfisher`                                             |
| Releases            | `/releases/latest`                                                            |
| Latest DMG          | `/releases/latest/download/Kingfisher-1.0.0-arm64.dmg`                        |

## 10. UI audit

**Not run.** A formal UI inventory is part of the next phase; the
brief's mutation checks (overlap, clipping, zoom, etc.) need a
manual review pass plus a screenshot suite. The scroll-freeze
fix is the only UI defect repaired this session.

## 11. UI verdict

| Class       | Count                                        |
| ----------- | -------------------------------------------- |
| Critical UI | 1 fixed (scroll-freeze). 0 known outstanding |
| High UI     | 0 known outstanding                          |
| Medium UI   | 0 known outstanding                          |
| Low UI      | 0 known outstanding                          |

## 12. Project size

`scripts/size-report.mjs` measures every consumer the brief calls
out and reports per-section + top-N.

| Command | | Total | Persistent |
| |
| | | total | gitignored |
| Actual (current) | | 9.73 GB | ~3.92 GB persistent |

The persistent measurement is `.git` (55 MB) + `public` (32 MB)

- `desktop` committed only (~270 kB, the rest is gitignored). The
  gitignored total is dominated by `.next` (1.37 GB), `.real-scale`
  (5.49 GB test fixture), `.archive-cache` (695 MB upstream
  archives), `.packs` (459 MB built packs), `.engine-fleet`
  (293 MB verified engines).

`npm run clean:dev` removes `.next`, `.engine-fleet`, `.packs`,
and browser-test outputs. `npm run data:cache:prune` removes
`.archive-cache`, `.packs`, `.engine-build`.

| Command | | Status |
| |
| | | |
| `npm run size:report` | | Reports sections + top-N |
| `npm run size:check` | | Same with `--top=20` |
| `npm run data:cache:report` | | Summary only |
| `npm run data:cache:prune` | | Removes reproducible cache |
| `npm run data:cache:paths` | | Prints resolved cache paths |
| `npm run clean:dev` | | Removes dev-only outputs |

## 13. External cache

`scripts/cache-paths.mjs`:

```
{
  "archives": "~/Library/Caches/Kingfisher/archives"  (macOS)
  "dataBuilds": "~/Library/Caches/Kingfisher/data-builds"
  "engines": "~/Library/Caches/Kingfisher/engines"
}
```

On Linux / Windows the same shape, with platform-appropriate
homedir. Falls back to project-local `.cache/` if not writable.

Environment overrides: `KINGFISHER_CACHE_DIR`,
`KINGFISHER_DATA_BUILD_DIR`, `KINGFISHER_ENGINE_DIR`.

## 14. Streamed reference data

**Not implemented.** Investigation only:

- The pack format already shards by position key, so a remote
  provider can fetch only the relevant shard for a query. Verified
  by inspecting `src/reference/pack.ts` (shardOf, chunkFile).
- A `RemoteReferenceProvider` would extend the
  `ChessDatabaseProvider` abstraction; the explorer already routes
  through this abstraction.
- The cache layer would reuse `ReferencePackStore` content-
  addressing so a partial cache from remote mode is exactly the
  same shape as an installed pack's chunks.

Implementation requires:

- A provider class.
- An LRU cache layer.
- A catalog row showing "Online / Cached / Installed" state.
- A "Install for offline" action that reuses the cached chunks.

The catalog row's source state already carries a `filter` and
`window` summary. The data path is ready; the provider class is
the missing piece.

## 15. Data size savings

**Not measured.** Streaming provider not implemented.

## 16. Remote data performance

**Not measured.** Streaming provider not implemented.

## 17. Pack format

**No changes.** The format is unchanged.

## 18. Training set UI

`Create training set` button added to
`src/features/repertoire/ReferenceCoveragePanel.tsx`. The button:

- Uses the existing `draftTrainingSet()` primitive from
  `training/data-generation.ts`.
- Persists each prompt through `repositories.training.create()`.
- The solution is intentionally empty — the user must add a
  repertoire response for each.

`Speed facets (PART AU item 2)` are not exposed in the UI yet;
the data path supports them. UI is deferred.

## 19. Speed facets

**Data path:** supported. **UI:** deferred. The Explorer panel
already routes the speed filter through `filters.speeds`. A
reference-source-specific UI affordance is a small component
away.

## 20. First-user continuity

`docs/product/work-continuity.md` documents what survives what.
Verified behaviour: same browser, same profile, next day — work
kept. The acceptance scenarios from PART CP/CS depend on sync
(not implemented).

## 21. Web/desktop parity

**Unchanged.** Phase 28 did not touch the desktop shell.

## 22. Privacy / security

- ADR records the privacy stance for the not-yet-implemented sync
  layer.
- The studio-host middleware runs server-side; no client-side
  secret exposure.
- `npm run security:scan` — 0 leaks, 0 advisories.

## 23. Tests

| Check                   | Result                                            |
| ----------------------- | ------------------------------------------------- |
| `npm run typecheck`     | 0 errors                                          |
| `npm run lint`          | 0 errors                                          |
| `npm run format:check`  | All files formatted                               |
| `npm test`              | **2223 passed, 11 skipped, 0 failed** (169 files) |
| `npm run security:scan` | 0 leaks, 0 advisories                             |
| `npm run build`         | Succeeded                                         |
| `git diff --check`      | Clean                                             |

Baseline before Phase 28: 2204 tests. After: 2223. **+19 tests**
for the host routing + persistence helper + chunk-reuse proof.

## 24. Bugs

| Severity    | Description                                                                                                                   | Fix                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Critical UI | Landing page scroll frozen (`body { overflow: hidden }`)                                                                      | `src/app/globals.css` — `min-height: 100%`, removed `overflow: hidden`    |
| Medium      | Two landing implementations drifting (`marketing/index.html` vs `src/app/landing/LandingPage.tsx`)                            | `marketing/index.html` now a 30-line redirect to canonical Vercel landing |
| Low         | `body { height: 100% }` paired with `body { overflow: hidden }` was the original recipe; new code has the explanatory comment | comment in globals.css                                                    |

## 25. Known limitations

- Sync layer is not implemented (documented in ADR).
- Streaming reference data is not implemented (the pack format
  already supports it; the provider class is missing).
- Speed facets are not exposed in the Explorer UI.
- UI inventory + zoom matrix + responsive matrix are not done.
- Some platform-specific persistence tests are not run.
- The persistence helper is implemented but not yet wired into a
  UI status badge.
- The legacy `marketing/index.html` redirect is the only
  marketing surface; the build does not regenerate it from the
  Vercel source.

## 26. Version policy

- `package.json` — version `1.0.0`, unchanged.
- `desktop/package.json` — version `1.0.0`, unchanged.
- About page — version `1.0.0`, unchanged.
- Release manifest `release-manifest.json` — public version `1.0.0`.
- Landing page stable version — `1.0.0`.
- GitHub Latest release — `v1.0.0`.

**No release was cut.** No `1.0.1`, no `1.1.0`, no `2.0.0` tag was
created. No application GitHub Release was published. The
Vercel production deployment is unchanged.

The scroll-freeze fix is the kind of bug that warrants a public
hotfix per the brief's PART CV — _if_ the owner chooses to deploy
the fix to production while the marketing copy still says 1.0.0.
That is an owner decision, not a Phase 28 autonomous action.

## 27. Recommendation

**KEEP INCUBATING.**

The two critical pieces the brief identified — the scroll-freeze
and the dumb-launch-button architecture — are fixed in this
session. The remaining pillars (sync, streaming, UI inventory,
acceptance scenarios) are documented or require credentials and a
Supabase project to proceed.

If the owner wants the scroll-freeze fix to reach production
without bumping the version:

> READY FOR OWNER PREVIEW

would be the appropriate verdict. A Vercel production deploy of
the critical-fix commit (with deployment SHA recorded internally)
serves the public hotfix without claiming a new version.

A 1.0.1 hotfix is **appropriate** if the scroll-freeze fix
should reach public users; the rest of the Phase 28 work is
not appropriate at this point.

## 28. Next priorities

Five evidence-based recommendations, in order:

1. **Deploy the scroll-freeze fix to production as a 1.0.1
   hotfix** (or owner-decide to keep 1.0.0 and document the fix
   in CHANGELOG.md as a development-only change).
2. **Wire `persistenceState()` into a "Saved on this device" UI
   status** so a user can see the storage-protection state.
3. **Implement the `RemoteReferenceProvider`** so Elite OTB and
   the others can stream shards on demand instead of requiring a
   300+ MB install.
4. **Run the UI inventory** across all primary web routes at all
   the brief's viewports, recording findings in
   `docs/product/phase-28-ui-audit.md`.
5. **Owner authorisation for a Supabase project** before any sync
   implementation begins. None of the implementation tasks begin
   until then.

None of these is "Phase 29". Each is a continuation of Phase
28's remaining work, run from the same `feature/continuity-data-scale`
branch, with no version bump until the owner says otherwise.
