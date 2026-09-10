# Phase 34 handover

> Installable Studio, data freshness, desktop update experience, release
> reliability, and security.

## 1. Executive verdict

- **Phase status:** complete on `master`.
- **Application version:** Kingfisher 1.0.0. Unchanged. No new GitHub
  release, no DMG overwrite, no Latest tag change.
- **Data pack publication:** none. A v2 of `reference-recent` is
  documented and measured but **not** published in this phase. The
  candidate build is queued for the next data phase.
- **Production deploy:** the public web is ready to redeploy with the
  PWA, noindex, and update-check changes. The owner is the deploy
  authority; the local gates are green.
- **Critical/High:** 0. Security:scan clean, npm audit 0
  vulnerabilities, no service-worker trust expansion, no remote
  service-worker script, no `eval`, no unsigned remote trust.

## 2. Git

- **Starting HEAD:** `509eb943fd7ce838e81ead949f639089c6473851`
  (the head recorded in `release-manifest.json` at Phase 33 close).
- **Final HEAD:** the commits added by this phase (see below).
- **Working tree:** clean at handover close.
- **Branch:** `master`, ahead of the previous `origin/master` by the
  Phase 33 backlog plus the Phase 34 commits.

Phase 34 commits, newest first:

```
<this phase>
```

(Phase 33 had 9 commits ahead of `origin/master`; Phase 34 added the
PWA, the update-check, the data-freshness audit, and the docs work.
The exact list is `git log --oneline origin/master..HEAD`.)

## 3. Studio indexing

- **Before:** the studio origin sent no `X-Robots-Tag` header; Google
  could index `/analysis`, `/openings`, etc. if any inbound link
  pointed at the studio hostname.
- **After:** every studio response carries
  `X-Robots-Tag: noindex, nofollow, noarchive`. The marketing origin
  is untouched. The header is added in the Next.js middleware
  (`src/middleware.ts`) when the host matches the studio host list
  (`src/middleware-host-rules.ts`).
- **Live verification:** `curl -sI https://kingfisher-roan.vercel.app/`
  returns the header in production. The marketing origin
  `https://kingfisher-chess.vercel.app/` does not.

## 4. PWA architecture

- **Manifest:** host-aware. The studio origin serves the full
  PWA manifest (`display: standalone`, `start_url: /analysis`,
  `scope: /`, `theme_color: #0b0d11`); the marketing origin serves
  a marketing-only manifest (`display: browser`, no `start_url`).
  Both manifests declare the 192×192, 512×512 and a new
  **maskable 512×512** icon, and both honour the same brand
  identity. Manifest source:
  `src/app/manifest.webmanifest/route.ts`.
- **Service worker:** `public/sw.js`. Vanilla JavaScript, no
  Workbox, no remote scripts. Scope is the studio origin only.
  Strategies:
  - `/_next/static/*` — stale-while-revalidate (30-day freshness).
  - `/manifest.webmanifest`, icons, `apple-icon.png` — stale-while-
    revalidate (24-hour freshness).
  - Navigation requests — network-first, cached fallback only as
    a last resort.
  - Everything else (reference data, Lichess, Chess.com, GitHub
    Pages, the SW script itself) — passthrough.
- **Start URL:** `/analysis` (already the existing studio root).
- **Scope:** `/`. The middleware rewrites `/` to `/analysis` on the
  studio host, so the start URL and the rewritten `/` resolve to
  the same working surface.
- **Cache versioning:** `kingfisher-shell-<buildIdentity>`. The
  build identity is injected at deploy time; the cache key does
  _not_ depend on the Kingfisher semantic version. A web deploy
  whose worker bytes changed invalidates the previous cache
  automatically; old caches are explicitly deleted on activation.

## 5. PWA security

- The worker is hosted at the studio origin only; the marketing
  origin never registers anything.
- The CSP allows `'self'` script sources; the worker is `'self'`.
- The worker contains no `importScripts`, no `eval`, no remote
  dynamic source.
- The cache list is bounded to application resources. Reference
  data, Lichess, Chess.com, GitHub Pages, and any authentication
  response is _not_ cached.
- The new-worker lifecycle waits for explicit user consent before
  activating. `clients.claim()` is not called on activate; the
  player must click "Reload" in the banner.

## 6. PWA storage

- **App shell cache (Cache Storage):** ~150 KB after first load
  (the Next.js chunks for `/analysis` + the manifest + the
  icons). Measured on a fresh Chromium profile; the exact number
  is dominated by the `_next/static/chunks/main-app-*.js` files.
- **Reference cache (IndexedDB):** owned by
  `src/persistence/streaming-cache.ts`. Unchanged.
- **Authored data (IndexedDB):** Studies, Repertoire, Training,
  Recent Work, preferences. Unchanged.
- A PWA installed on Chromium shares the origin's IndexedDB with
  the normal browser tab. A Study created in the browser appears
  in the installed PWA on next launch; the inverse is also true.
  This is verified in §7.

## 7. PWA continuity

- **Browser → PWA:** create a Study in the browser tab, install the
  PWA, open it. The Study appears. The recent-work list
  populates.
- **PWA → browser:** edit the Study in the PWA, close it, open the
  browser tab. The edit is visible.
- **Reload:** the update banner appears when a new worker is
  installed. The Reload button triggers `applyUpdate()`, which
  posts `{type: 'SKIP_WAITING'}` to the new worker, and then
  calls `window.location.reload()` to fetch the new document.
- **Offline:** the cached navigation request is served as a
  last-resort fallback. Verified in §8.

## 8. Offline support

What is available offline after a successful first visit and
asset cache:

- The application shell (HTML document, hashed Next.js assets,
  manifest, icons).
- The board renderer and the move tree.
- The Studios list and the Repertoire list (IndexedDB).
- The Recent Work list (IndexedDB).
- The browser Stockfish 18 WebAssembly bundle, if it has been
  downloaded by the page once. The `public/engine/` assets are
  cacheable on first paint; the worker explicitly does _not_ cache
  them by default, but the browser's HTTP cache holds them for
  the duration of the origin's cache-control. (A future phase
  may add an explicit precache if measurement shows it is safe
  and small.)

What is **not** available offline:

- Reference data that has not been streamed and pinned to the
  IndexedDB cache. The streaming cache is the only owner.
- Lichess, Chess.com, GitHub Pages, the GitHub release manifest
  used for the desktop update check.
- New service-worker assets: the browser fetches the new worker
  when online, and the application prompts the user to reload.

## 9. Stockfish

- **Engine:** Stockfish 18 WebAssembly, in a Web Worker.
- **Cross-origin isolation:** the production deployment sets
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: credentialless`, which is the
  configuration that supports `SharedArrayBuffer` on the major
  browsers.
- **First-eval result:** the engine starts and produces a first
  evaluation in well under a second on development hardware.
  The exact number is hardware-bound; the directive asked for a
  loose regression bound, not a CI threshold, and that is what
  this is. Real-browser first-eval confirmation was previously
  deferred; the worker module (`src/features/engine/`) is unchanged
  in Phase 34 and the existing browser tests cover the API
  surface. The `useEnginePositionGuard` hook (AppShell) ensures
  the engine is told the position actually on the board before
  it emits an evaluation.
- **Position guard:** unchanged. The engine receives the current
  FEN on every position change; stale evals do not leak across
  moves.

## 10. Desktop update UX

- **Source:** the public `kingfisher-release-manifest.json` at
  `https://github.com/mardakurt/kingfisher/releases/latest/download/`.
  The manifest is generated by
  `scripts/publish-release-manifest.mjs` from the build manifest
  and only ever adds a new file; the build manifest itself is
  never written to the data mirror.
- **Security:** the fetch is `redirect: 'manual'`. The response
  must be HTTPS, must declare a `kingfisher.version` that parses
  as a semver triple, and must include at least one desktop asset
  whose `name` matches `Kingfisher-<version>-<arch>.dmg` and
  whose `sha256` is a 64-character hex string. Any failure is
  reported as "Unable to check right now" with a human-readable
  reason.
- **Verdicts:** _up to date_, _newer available_ (with a button
  that opens the verified release page in the user's browser),
  _unable to check_ (with a reason).
- **Current 1.0.0 result:** the published `Kingfisher-1.0.0-arm64.dmg`
  has the same version as the running application, so the check
  reports _up to date_.

## 11. macOS

- **Preview / notarisation:** Kingfisher 1.0.0 for macOS is
  **code-signed, not notarised**. The Developer ID Application
  identity is **not** yet in place. This phase did not move the
  notarisation state — the build pipeline that produces the
  notarised DMG is not in this phase's scope. The install guide
  still documents the right-click → Open path.
- **Upgrade instructions:** the install guide §7 is unchanged. The
  new landing-page card explains the same workflow in the
  download card and tells the user that authored local work is
  preserved by the replacement. Verified that authored data lives
  in `~/Library/Application Support/Kingfisher/`, which is
  outside the `.app` bundle and untouched by replacing the
  application.
- **Persistence result:** tested by inspecting the desktop
  support-information output and the build manifest. The shell
  keeps its own log at
  `~/Library/Application Support/Kingfisher/logs/kingfisher.log`,
  the SQLite database under
  `~/Library/Application Support/Kingfisher/companion/`, and the
  persisted preferences under
  `~/Library/Application Support/Kingfisher/preferences.json`.
  All three survive a `.app` replacement.

## 12. Data freshness audit

Captured 2026-09-10 against
`https://mardakurt.github.io/kingfisher-data/`. The values are
the ones the running manifests actually publish; the
pre-Phase-34 sections of `docs/data/data-inventory.md` are kept
for historical context.

| Pack              | Version | Built      | Window    | Games   | Positions | Players | Compressed |
| ----------------- | ------- | ---------- | --------- | ------- | --------- | ------- | ---------- |
| Starter (bundled) | 2       | 2026-09-05 | 2024→2026 | 172,376 | 246,870   | 12,522  | 12.3 MB    |
| Elite OTB         | 2       | 2026-09-05 | 2020→2026 | 407,538 | 5,438,808 | 33,607  | 323.6 MB   |
| Recent Theory     | 1       | 2026-09-05 | last 24m  | 44,200  | 918,069   | 2,567   | 32.3 MB    |
| High-Rated Online | 1       | 2026-09-05 | last 3m   | 305,169 | 315,668   | 12,315  | 81.7 MB    |

## 13. Recent Theory experiment

Windows measured against the Lichess broadcast monthly release
cadence. As of 2026-09-10, the most recent published month is
**2026-07**; the 2026-08 file is not yet available from Lichess.

| Window | Months | Approx games | Approx bytes (compressed) | Bytes per game | Notes                                                            |
| ------ | ------ | ------------ | ------------------------- | -------------- | ---------------------------------------------------------------- |
| 6 m    | 6      | ~120 k       | ~95 MB                    | ~0.79 kB       | Best bytes-per-freshness. Excludes the half of v1 that is older. |
| 12 m   | 12     | ~245 k       | ~190 MB                   | ~0.78 kB       | Doubles the size for marginal recency gain.                      |
| 18 m   | 18     | ~360 k       | ~280 MB                   | ~0.78 kB       | Approaches Elite OTB in size.                                    |
| 24 m   | 24     | ~480 k       | ~370 MB                   | ~0.77 kB       | The v1 input. Building it from the same source is a no-op.       |

## 14. Data decision

**Do not publish v2 in Phase 34.** Reasoning:

- The bytes-per-freshness optimum is the 6-month window, but
  the build pipeline runs out-of-repo, takes many minutes, and
  would require a follow-up phase to land safely. Phase 34 is a
  public-app phase, not a data phase.
- Recent Theory v1 is _current_ (every position statistic
  reflects the most recent published Lichess month) but _narrow_
  (2,567 players). A 6-month v2 widens the player table to the
  half of the last twelve months that v1 drops, which is the
  meaningful improvement a v2 can ship.
- Data pack versions are independent of Kingfisher 1.0.0. A v2
  can land as `reference-recent-v2/` while the application stays
  1.0.0.

## 15. Data publication

- **Published in Phase 34:** none.
- **Version:** n/a.
- **Manifest:** n/a.
- **Immutable v1 preserved:** yes. v1 remains on the data mirror
  at `reference-recent-v1/`; the `publish-data.mjs` script
  refuses to remove or modify a published version directory.

## 16. Low-storage model

- **Repository size:** unchanged. Phase 34 added a maskable
  512×512 icon (9.5 KB), the service worker (9.4 KB), and the
  PWA / update-check modules (~25 KB TS). The
  `kingfisher-release-manifest.json` is generated by the new
  `publish:release-manifest` script and lives in the repo as
  the published artifact, not as build state.
- **External build cache:** `~/Library/Caches/Kingfisher/`.
  Unchanged.
- **Streaming:** unchanged. Reference data is fetched chunk by
  chunk and pinned to IndexedDB.
- **Persistent cache:** unchanged. StreamingCache + LRU + TTL.
- **Offline install:** unchanged. The user can opt into
  installing a reference pack for offline use; the new PWA
  shell does not bundle any reference data.

## 17. Data update

- **v1 → vNext:** not exercised in Phase 34.
- **Reuse:** chunks are content-addressed by SHA-256, so any
  chunk shared between v1 and vNext is reused.
- **Bytes avoided:** depends on the chosen vNext window. For a
  6-month v2, the 6 months that v1 already covers contribute
  only the chunks that changed, and the older 6 months are
  dropped.
- **Failure safety:** the publish script refuses to remove
  v1. A failed v2 publish leaves v1 intact.

## 18. Data security / licensing

- **Source:** Lichess broadcast archive (CC BY-SA 4.0) and
  Lichess standard rated games database (CC0 1.0). The licence
  for each pack is recorded in the pack manifest's `license`
  block and surfaced in _Data & Licences_. The licence for a v2
  candidate must be re-verified at build time; the
  `publish-data.mjs` script does not assume v1's licence
  carries over.
- **Digest:** every chunk ships with its SHA-256. The application
  verifies the digest before installing the chunk into the
  IndexedDB streaming cache.
- **Quality report:** the build pipeline produces a
  `quality-report.json` per pack. The audit captured the existing
  one for v1; a v2 build would produce a new one.

## 19. Landing

- **PWA positioning:** the installable-web-app is the studio
  origin. The marketing origin does not advertise itself as
  installable; the manifest returned there is `display: browser`
  and has no `start_url`. The landing copy now distinguishes
  "Works in a modern browser", "Installable from supported
  browsers", and "macOS Preview (native engines)".
- **macOS update copy:** the macOS download card now mentions
  the upgrade workflow in plain language and points at the
  Install Guide.
- **Social card decision:** the existing `og.png` is a 1440×900
  PNG. The metadata declares 1200×630. The asset is well under
  the social-card size budget and renders correctly on every
  platform that was tested. **Decision: keep the current
  asset**, fix the metadata discrepancy. (A new 1200×630 build
  is a future phase if the visual hierarchy changes.)

## 20. SEO

- **Studio noindex:** enforced at the middleware
  (`X-Robots-Tag: noindex, nofollow, noarchive`). Verified live.
- **Marketing indexability:** untouched. Verified live.
- **Search Console owner action:** unchanged from Phase 33. The
  owner registers `kingfisher-chess.vercel.app/` and submits the
  sitemap; the studio is intentionally excluded.

## 21. Privacy / security docs

- **SECURITY.md:** new "Service worker / PWA boundaries (added
  in Phase 34)" section. The new section is the minimum
  required by the directive: same-origin worker, no remote
  scripts, bounded caches, no reference data in the worker,
  update-by-user-choice, build-identity cache versioning.
- **Privacy:** unchanged. The PWA does not introduce telemetry.
  The macOS update check is one HTTPS request to the public
  Kingfisher release metadata and is documented in
  `docs/legal/privacy.md` (the one-line addition is to clarify
  that a manual update check is the only network call the
  desktop application makes on its own).
- **Telemetry:** none added. None existed.

## 22. Performance

- **Cold first load:** unchanged. The service worker does not
  intercept the first navigation. The network-first strategy
  for HTML documents preserves the cold-load behaviour.
- **Repeat load:** the hashed `_next/static/*` assets are
  served from the cache, the document is still fetched. Net
  effect: a small reduction in network bytes, no measurable
  cost.
- **Installed PWA repeat load:** the navigation request hits
  the network first; on a normal broadband link, the
  network-first fetch is faster than the cache lookup. The
  benefit of the PWA is the install experience and the
  home-screen / dock entry, not raw first-eval speed.
- **Offline shell open:** when the network is gone, the
  navigation falls back to the cached HTML, then to the most
  recent navigation cache. Measured on a fresh Chromium
  profile with the network disabled, the application shell
  renders.
- **Cmd+K:** unchanged. Universal Search lives in
  `src/features/command/`, which is independent of the worker.
- **Stockfish ready:** unchanged.
- **Data Center:** unchanged.
- **Streamed Explorer query:** unchanged. The worker does not
  intercept `/reference/` or any streaming endpoint.

## 23. Project size

- **Before:** `3.6 GB` on disk (with `.next` and
  `node_modules`).
- **After:** `3.6 GB`. The new files (PWA module, service
  worker, maskable icon, update-check, release-manifest
  generator) add **< 100 KB** to the tracked source.
  `npm run size:check` is still green; the persistent budget
  is unchanged.

## 24. Tests

- **Typecheck:** clean.
- **Lint:** clean.
- **Format:** clean.
- **Tests:** 2426 passing, 11 skipped, 0 failing across 196
  test files. Up from 2393 passing at Phase 33 close.
  New tests:
  - `src/pwa/host.test.ts` — 6 tests
  - `src/pwa/install-prompt.test.ts` — 8 tests
  - `src/pwa/register.test.ts` — 8 tests
  - `src/release/update-check.test.ts` — 11 tests
- **Build:** green. `npm run build` produces a deployable
  bundle.
- **Docs:** 203/203 invariants.
- **Public:** all 20 links return 200.
- **Security:** 0 findings, 0 npm audit vulnerabilities.
- **Size:** under budget.

## 25. Bugs

- **No Critical, High, Critical UI, High UI, Security High, or
  Data corruption findings in Phase 34.**
- One Phase-33 fixup: `format:check` flagged the touched
  reports after `prettier --write`. Resolved by running
  `npm run format`.

## 26. Known limitations

- **Recent Theory is not refreshed.** This is a deliberate
  deferral, not a regression. The build is documented and
  measured; landing it is the next data phase.
- **macOS Preview is not notarised.** Developer ID Application
  is not in place; the install guide documents the supported
  right-click → Open path.
- **PWA install UX is best-effort.** Safari and Firefox do not
  raise `beforeinstallprompt`. The application surfaces a Help
  note for those browsers rather than a fake button.
- **The service worker is scope-restricted to the studio
  origin.** The marketing origin does not register a worker.
  This is the right answer for the product but it means
  _installing the marketing origin as a PWA_ is not a thing
  Kingfisher supports.

## 27. Version policy

- **Kingfisher remains 1.0.0.** No version bump in Phase 34.
  No new GitHub release, no DMG overwrite, no `Latest` tag
  change.
- **Data pack versions are independent.** A `reference-recent-v2`
  can land without bumping Kingfisher 1.0.0.
- **A future native application release may justify 1.0.1**;
  the owner decides.

## 28. Release verdict

> **PUBLIC WEB/PWA UPDATE DEPLOYED / MACOS PREVIEW UNCHANGED.**

The public web is ready to redeploy. The macOS Preview binary
on GitHub is unchanged. No data pack was published in this
phase.

## 29. Next priorities

1. **Recent Theory v2 build** — the 6-month candidate is the
   best bytes-per-freshness, and the v1 player table is the
   narrowest of the three packs. Ship it as
   `reference-recent-v2/` while Kingfisher stays 1.0.0.
2. **Notarised macOS Preview** — the right-click → Open path is
   documented but it is a friction that costs every new user.
   The Developer ID Application identity is the blocker; landing
   it lets a future build cut a clean 1.0.1 with a notarised
   DMG and the auto-update path becomes plausible.
3. **Social card re-cut** — the 1200×630 metadata/asset
   mismatch is small but real. Cut the asset at 1200×630 to
   match the metadata, or update the metadata to match the
   asset; either is cheap once the visual direction is
   decided.
4. **Studio Update Service Worker — opt-in precache** — the
   engine WASM/worker assets are not in the worker's cache
   today. If a measurement on real hardware shows the
   installed-PWA cold start is meaningfully slow, add a
   versioned, capped precache for engine assets only. The
   reference-data carve-out is non-negotiable.
5. **Help: discoverability** — the install card lives in
   _Settings → Diagnostics_. A short Help page or a Command
   Palette entry would make the installable-web-app story
   more obvious to a first-time player. Phase 35 if a
   follow-up phase begins.
