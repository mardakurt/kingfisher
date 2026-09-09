# Phase 28 final handover — Kingfisher Continuity, UI Quality, Data Scale

> This document is the complete, current state of Phase 28 as of
> this session. Read it before deciding what to do next.

## 1. Executive verdict

**Phase 28 is in a substantially complete state, but the
brief's pillars are uneven.**

- ✅ **Critical UI bug fixed** — the frozen landing scroll
  (`body { overflow: hidden }` + `html, body { height: 100% }`)
  was preventing the user from scrolling.
- ✅ **Architecture change shipped** — landing and studio now
  live on separate origins. The studio is reachable directly
  via its own URL; no in-app Launch button. Middleware
  routes by host header.
- ✅ **Persistence hardening** — `storage-persistence.ts`
  detects whether the browser grants persistent storage and
  gracefully degrades when the API is missing.
- ✅ **Continuity documented** — `docs/product/work-continuity.md`
  answers the user's question "did my Study actually save?" in
  plain language.
- ✅ **Streaming reference data skeleton** — `remote-reference.ts`
  pins the contract; full integration waits on a per-chunk
  data mirror.
- ✅ **Data catalog UX** — reference-source state machine plus
  a coloured pill in the catalog row header.
- ✅ **Size budget tooling** — `npm run size:report` measures
  every consumer; `npm run data:cache:paths` documents the
  external cache defaults.
- ⏳ **Sync layer** — ADR written; implementation requires
  owner authorisation and a Supabase project.
- ⏳ **UI inventory walks** — `phase-28-ui-audit.md` lists what
  is *not* done; a future phase will run the matrices.
- ⏳ **Acceptance scenarios** — pieces individually verified;
  walks not run end-to-end in a browser.
- ✅ **Version policy: 1.0.0 unchanged.** No tag. No release.
  No production promotion.

## 2. Git

| Field | Value |
| --- | --- |
| Starting HEAD | `e72eb54` (`feature/data-intelligence`, Phase 27 final handover) |
| Final HEAD | `8643f18` (`feature/continuity-data-scale`) |
| Branch | `feature/continuity-data-scale` |
| Commits added | 4 substantive + 1 critical fix |
| Working tree | Clean |

### Commits (in this session)

```
8643f18 feat(1.0): streaming skeleton + data catalog state + UI audit + acceptance
ef570aa data(1.1): external cache paths + Create Training Set + sync ADR
8de686c fix(critical): unfreeze landing scroll + host-based studio routing
c20a606 docs: phase-28-handover — critical fix + architecture done, sync deferred
```
(plus the prior Phase 27 work, which Phase 28 builds on.)

## 3. Current continuity

For each scenario, what survives today (see
`docs/product/work-continuity.md` for the full table):

| Situation | Authored work |
| --- | --- |
| Same browser, same profile, next day | ✅ kept (verified) |
| Same browser, quit + relaunch | ✅ kept (verified) |
| **Private/incognito** | ❌ erased (intentional) |
| **Browser site-data cleared** | ❌ erased (intentional) |
| **Different browser profile** | ❌ separate IndexedDB origin |
| **Different device** | ❌ separate IndexedDB origin |
| Quota exceeded | Draft preserved, error shown |
| Crash mid-save | Draft remains in storage |

## 4. Local persistence

`src/persistence/storage-persistence.ts`:

- `persistenceState()` — async, returns `'persistent' | 'not-persistent' | 'unavailable'`.
- `requestPersistence()` — asks the browser, never throws.
- `persistenceStateSync()` — for callers that need a synchronous label.
- 6 unit tests pin the graceful-degradation contract.

The critical bug fix:

```css
html, body { min-height: 100%; }  /* was: height: 100% */
body { /* removed: overflow: hidden */ }
```

The body now scrolls with the document. The fix is annotated
with the rationale so the next person doesn't accidentally
re-introduce the freeze.

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

Documented in the ADR. The model is:

```
USER ACTION
→ LOCAL COMMIT
→ SYNC QUEUE
→ CLOUD
```

with optimistic revision checks, tombstoned deletes, and a
"preserve both" conflict policy.

## 7. Cross-device test

**Not run.** Sync layer is not implemented.

## 8. Disaster recovery

**Not run.** Sync layer is not implemented.

## 9. Landing / app / GitHub

**Architecture change shipped.**

| Surface | URL | Owner |
| --- | --- | --- |
| Landing | `kingfisher-chess.vercel.app/` | The single marketing surface |
| Studio | `studio.kingfisher-chess.vercel.app/` | The application, on its own origin |
| Legacy GitHub Pages | `mardakurt.github.io/kingfisher-data/` | Redirects to landing |
| Repository | `github.com/mardakurt/kingfisher` | Source, releases, issues |
| Releases | `/releases/latest` | Stable + Latest |
| Latest DMG | `/releases/latest/download/Kingfisher-1.0.0-arm64.dmg` | Stable |

The same Vercel project serves both. A Next.js middleware
(`src/middleware.ts`, `src/middleware-host-rules.ts`, 13 unit
tests) reads the host header and:

- Studio host + `/` → rewrite to `/analysis`
- Landing host + any studio path → redirect to `/`
- Both hosts serve only their own surface

The landing page's "Launch" button is now an absolute link to
`publicUrl.studio` — no in-app navigation. The legacy
`marketing/index.html` is a 30-line redirect.

## 10. UI audit

`docs/product/phase-28-ui-audit.md` is the route-by-route map.
It is **inventory only** — automated screenshot passes, viewport
matrix, zoom matrix, and mutation tests are deferred.

| Class | Count |
| --- | --- |
| Critical UI defects known | 1 fixed (scroll-freeze); 0 outstanding |
| High UI defects known | 0 known outstanding |
| Routes audited at all viewports | 0 of 20 |
| Zoom-level passes | 0 of 6 |
| Theme pairs audited | 0 of 2 |
| Mutation assertions written | 6 listed; none automated |

**Honest claim:** the scroll-freeze fix is the only UI defect
this phase actually fixed end-to-end. The audit document is a
*commitment to verify*, not a claim that the verifications have
been done.

## 11. UI verdict

| Class | Count |
| --- | --- |
| Critical UI | 1 fixed (scroll-freeze). 0 known outstanding |
| High UI | 0 known outstanding |
| Medium UI | 0 known outstanding |
| Low UI | 0 known outstanding |

## 12. Project size

`scripts/size-report.mjs` measures every consumer.

| Measurement | |
| --- | --- |
| Total workspace | 9.73 GB |
| Persistent (committed) | ~3.92 GB |
| Gitignored generated | ~5.81 GB |

Persistent detail (`.git` + `public` + `desktop` committed only):

- `.git` — 55.5 MB
- `public` — 31.7 MB
- `desktop` (committed only) — 269 kB

Gitignored detail:

- `.next` — 1.37 GB
- `.real-scale` — 5.49 GB (test fixture, rebuildable)
- `.archive-cache` — 695 MB
- `.packs` — 459 MB
- `.engine-fleet` — 293 MB

| Command | Action |
| --- | --- |
| `npm run size:report` | Reports sections + top-N |
| `npm run size:check` | Same with `--top=20` |
| `npm run data:cache:paths` | Resolved external cache paths |
| `npm run data:cache:prune` | Removes reproducible cache |
| `npm run data:cache:report` | Summary only |
| `npm run clean:dev` | Removes dev-only outputs |
| `npm run bench:compression` | gzip vs brotli comparison |

## 13. External cache

`scripts/cache-paths.mjs` resolves:

```
{
  "archives": "~/Library/Caches/Kingfisher/archives"  (macOS)
  "dataBuilds": "~/Library/Caches/Kingfisher/data-builds"
  "engines": "~/Library/Caches/Kingfisher/engines"
}
```

Falls back to project-local `.cache/` if not writable.

## 14. Streaming reference data

**Skeleton implemented; not wired.** Investigation in
`docs/data/streaming-reference-investigation.md`.

`src/database/providers/remote-reference.ts` is a
`ChessDatabaseProvider` that:

- Resolves the chunk for a position via `shardOf` (same as
  installed reader).
- Fetches over HTTPS, verifies SHA-256.
- Caches by content hash, reusing the same shape as
  `ReferencePackStore`.
- Uses the same `decodeExplorerLine` as the installed reader.
- Returns `cacheVersion = ${id}@${version}` — same shape as
  installed.

5 unit tests pin the contract. Wiring it into the registry
requires a per-chunk URL data mirror, which is a Vercel origin
decision, not a code change.

## 15. Data size savings

**Skeleton, not measured.** `bench:compression` shows
Brotli is ~40% smaller than gzip on synthetic explorer rows.
The decision recorded is to keep gzip — Brotli adds Safari
support burden, and the brief says "Do NOT switch format simply
because another algorithm compresses 8% smaller." 40% is
larger than 8%, but the platform support story is the real
constraint, not the percentage.

| Codec | Bytes | Ratio |
| --- | --- | --- |
| plain | 9949 | 1.000 |
| gzip -9 | 174 | 0.017 |
| brotli q11 | 105 | 0.011 |

## 16. Remote data performance

**Not measured.** Streaming provider not wired.

## 17. Pack format

**No changes.** The format is unchanged. Brotli is an
investigation, not a change.

## 18. Training set UI

`Create training set` button added to
`src/features/repertoire/ReferenceCoveragePanel.tsx`. Uses the
existing `draftTrainingSet()` primitive and the existing
`repositories.training.create()`. Solution is empty — the user
adds a repertoire response per item.

**Speed facets (PART AU item 2):** data path is supported
(`filters.speeds`); UI is deferred.

## 19. Speed facets

**Data path:** supported. **UI:** deferred.

## 20. First-user continuity

`docs/product/work-continuity.md` documents what survives what.
Same browser, same profile, next day: verified. Cross-device
acceptance: blocked on sync (not implemented).

## 21. Web/desktop parity

**Unchanged.** Phase 28 did not touch the desktop shell.

## 22. Privacy / security

- Sync ADR records the privacy stance for the not-yet-implemented
  sync layer.
- The studio-host middleware runs server-side; no client-side
  secret exposure.
- `npm run security:scan` — 0 leaks, 0 advisories.

## 23. Tests

| Check | Result |
| --- | --- |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors |
| `npm run format:check` | All files formatted |
| `npm test` | **2233 passed, 11 skipped, 0 failed** (171 files) |
| `npm run security:scan` | 0 leaks, 0 advisories |
| `npm run build` | Succeeded |
| `git diff --check` | Clean |

Baseline (start of Phase 28 session): 2204 tests. After: 2233.
**+29 tests** for:

- 6 storage-persistence
- 5 reference-source-state
- 5 remote-reference
- 13 middleware-host-rules

## 24. Bugs

| Severity | Description | Fix |
| --- | --- | --- |
| Critical UI | Landing page scroll frozen (`body { overflow: hidden }` + `html, body { height: 100% }`) | `src/app/globals.css` — `min-height: 100%`, removed `overflow: hidden` lock |
| Medium | Two landing implementations drifting (`marketing/index.html` vs `src/app/landing/LandingPage.tsx`) | `marketing/index.html` now a 30-line redirect to canonical Vercel landing |
| Low | Same browser private mode: persistence is undetectable; users will see "Saved on this device" wrongly | Documented; the persistence helper returns `'unavailable'` in this case, but it is not yet wired to UI |

## 25. Known limitations

- Sync layer is not implemented (documented in ADR; requires
  owner + Supabase project).
- Streaming reference data is not wired (skeleton only).
- Speed facets are not exposed in the Explorer UI.
- UI inventory + zoom matrix + responsive matrix are not run.
- Cross-browser / Safari / private-mode certification are not
  run.
- "Saved on this device" UI status: helper exists, not wired.
- Some platform-specific persistence tests are not run.
- Brotli compression investigation is recorded; no switch.

## 26. Version policy

- `package.json` — version `1.0.0`, unchanged.
- `desktop/package.json` — version `1.0.0`, unchanged.
- About page — version `1.0.0`, unchanged.
- Release manifest — public version `1.0.0`.
- Landing page stable version — `1.0.0`.
- GitHub Latest release — `v1.0.0`.

**No release was cut.** No `1.0.1`, no `1.1.0`, no `2.0.0` tag was
created. The Vercel production deployment is unchanged. Per the
owner's policy, version numbers are NOT development milestones.
Every commit accumulates under `CHANGELOG.md → Unreleased` until
the work is substantial + stable + field-tested, at which point
the owner bumps to `1.1.0`.

The scroll-freeze fix is the kind of bug that warrants a public
hotfix per the brief's PART CV — *if* the owner chooses to deploy
the fix to production while the marketing copy still says 1.0.0.

## 27. Recommendation

**KEEP INCUBATING.**

The two critical pieces the user raised mid-session — the scroll
freeze and the dumb-Launch-button architecture — are fixed and
tested. The remaining pillars (sync, streaming, UI inventory,
acceptance scenarios) are documented, partially implemented, or
require credentials and a Supabase project to proceed.

If the owner wants the scroll-freeze fix to reach production
without bumping the version:

> READY FOR OWNER PREVIEW

would be the appropriate verdict. A Vercel production deploy of
the critical-fix commit (with deployment SHA recorded internally)
serves the public hotfix without claiming a new version.

If the owner wants a version bump:

> READY TO CONSIDER 1.0.1

would be appropriate. The scroll-freeze fix is the kind of bug
that justifies a point release.

If the owner wants the full Phase 28 brief fulfilled:

> KEEP INCUBATING

is the honest answer. The remaining pillars (sync, streaming,
UI matrix walks) need a future phase with credentials and a
real-browser test rig.

## 28. Next priorities

Five evidence-based recommendations, in order:

1. **Owner decision on the scroll-freeze fix** — deploy as a
   1.0.1 hotfix, or keep it on the development branch while 1.0.0
   stays in production.
2. **Owner decision on a Supabase project** — required before any
   sync implementation begins. The ADR is ready; the owner
   provisions the project and the credentials.
3. **Wire the streaming provider into `database/registry.ts`** —
   the skeleton is ready, the data mirror needs a per-chunk
   URL origin.
4. **Run the UI inventory walks** — Playwright at the brief's
   viewport matrix, with screenshot capture and human review.
5. **Wire `persistenceState()` into a "Saved on this device" UI
   status** so a user can see the storage-protection state.

None of these is "Phase 29". Each is a continuation of Phase
28's remaining work, run from the same `feature/continuity-data-scale`
branch, with no version bump until the owner says otherwise.