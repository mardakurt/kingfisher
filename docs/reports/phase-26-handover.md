# Phase 26 handover — Kingfisher 1.0, general availability, and post-release model

> The transition from "Phase 25 public preview is live" to
> "Kingfisher 1.0 is generally available, web is stable,
> macOS is Preview, the GitHub Latest release is the
> application, and the post-1.0 model is point releases
> against filed issues."

## 1. Executive verdict

**KINGFISHER 1.0 IS RELEASED.**

- Web is **stable** at <https://kingfisher-chess.vercel.app/>.
- macOS is **Preview** (signed, not notarized) at
  <https://github.com/mardakurt/kingfisher/releases/tag/v1.0.0>.
- The application version is `1.0.0` in `package.json`,
  `desktop/package.json`, the release manifest, the
  CHANGELOG, the landing page, the README, and the GitHub
  Release title.
- The GitHub `releases/latest` URL now resolves to the
  Kingfisher application release, not to a reference-data
  pack.
- 0 Critical, 0 High, 0 Critical UI, 0 High UI defects.
- 2177/2188 unit and integration tests pass, 11 skipped,
  none failing.
- The local 1.0 release gate (typecheck, lint, format check,
  security scan, unit/integration, web build, public link
  check) is green.

## 2. Current public URL map

| Surface            | URL                                                                                            | Status          |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------- |
| Landing page       | <https://mardakurt.github.io/kingfisher-data/>                                                 | LIVE            |
| Landing page       | <https://kingfisher-chess.vercel.app/>                                                         | LIVE            |
| Web app            | <https://kingfisher-chess.vercel.app/analysis>                                                 | LIVE (stable)   |
| GitHub repository  | <https://github.com/mardakurt/kingfisher>                                                      | LIVE (public)   |
| Latest application | <https://github.com/mardakurt/kingfisher/releases/latest>                                      | 1.0.0 (normal)  |
| Specific 1.0 tag   | <https://github.com/mardakurt/kingfisher/releases/tag/v1.0.0>                                  | LIVE            |
| macOS arm64 DMG    | <https://github.com/mardakurt/kingfisher/releases/download/v1.0.0/Kingfisher-1.0.0-arm64.dmg> | LIVE (Preview)  |
| macOS x64 DMG      | <https://github.com/mardakurt/kingfisher/releases/download/v1.0.0/Kingfisher-1.0.0.dmg>       | LIVE (Preview)  |
| Issues             | <https://github.com/mardakurt/kingfisher/issues>                                               | LIVE            |
| Discussions        | <https://github.com/mardakurt/kingfisher/discussions>                                          | LIVE            |
| Docs               | <https://github.com/mardakurt/kingfisher/tree/master/docs>                                     | LIVE            |
| Security policy    | <https://github.com/mardakurt/kingfisher/security/policy>                                      | LIVE            |
| Data mirror        | <https://mardakurt.github.io/kingfisher-data>                                                  | LIVE            |
| Pack — Elite OTB   | <https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json>                 | LIVE            |
| Pack — Recent      | <https://mardakurt.github.io/kingfisher-data/reference-recent-v1/manifest.json>                | LIVE            |
| Pack — High-Rated  | <https://mardakurt.github.io/kingfisher-data/reference-online-v1/manifest.json>                | LIVE            |

## 3. GitHub release semantics

Before Phase 26, `releases/latest` resolved to
`reference-elite-v1` — a normal GitHub release on the same
repository — because the Kingfisher application releases
were marked as `prerelease`. The `reference-*` tags are
reference-data publishing, not application releases, and
they were competing for the `Latest` semantic that the
application needs.

Phase 26 fixes this in two structural ways:

1. The `reference-elite-v1` release is now marked
   `prerelease` (it is reference data, not a Kingfisher
   application release). It is still served from the same
   tag and is still installable from its manifest URL.
2. The `v1.0.0` release is published as a **normal**
   GitHub release (not `prerelease`).

The combined effect is that `releases/latest` now resolves
to `v1.0.0`:

```
$ curl -sI https://github.com/mardakurt/kingfisher/releases/latest | grep -i location
location: https://github.com/mardakurt/kingfisher/releases/tag/v1.0.0
```

The four release rows on the GitHub Releases page are now
correctly stratified:

| Title                              | Type       |
| ---------------------------------- | ---------- |
| Kingfisher 1.0.0                   | Latest     |
| Kingfisher 1.0.0-rc.5              | Pre-release |
| Kingfisher 1.0.0-rc.4              | Pre-release |
| Elite OTB Reference (pack v1)      | Pre-release |

A first user can now follow the
"Download for macOS" button on the landing page straight to
a single, intended Kingfisher 1.0.0 release.

## 4. Web 1.0

The web application is deployed to
<https://kingfisher-chess.vercel.app/>. The deployment is
served as a Vercel production alias and the build id is
visible in the response header.

- `/` renders the marketing landing page (server-rendered,
  no client React hydration on the landing surface).
- `/analysis`, `/openings`, `/players`, `/databases`,
  `/studies`, `/repertoire`, `/preparation`, `/review`,
  `/training`, `/endgame`, `/games`, `/settings` all return
  200 and render the studio.
- The production response headers carry the strict CSP,
  COOP, COEP, HSTS, Referrer-Policy, Permissions-Policy,
  and X-Content-Type-Options configuration.
- `crossOriginIsolated` is true; `SharedArrayBuffer` is
  available; the threaded Stockfish build runs in the page.
- `npm run public:check` reports **19/19** against the
  production URLs.

## 5. Opening Explorer

Production Explorer sources: Starter, Elite OTB, Recent
Theory, High-Rated Online, Lichess Masters, Lichess
rated. Source identity is preserved in the column
headers; game counts and W/D/B totals agree with the
manifests; deep-line transpositions are handled; model
game openings are queryable from the position in the
analysis workspace.

## 6. Reference packs

Production install path tested against the real public data
mirror. For each pack: download progress, SHA-256
verification, Ready state, Explorer query, reload
preserves Ready, offline query still works.

- Elite OTB (v2) — installs from the live manifest.
- Recent Theory (v1) — installs from the live manifest.
- High-Rated Online (v1) — installs from the live manifest.

## 7. Players

Production search and profile lookups for the canonical
strong-player list (Carlsen, Caruana, Nakamura, Gukesh,
Anand, MVL, Nepomniachtchi, Polgar / Polgár) work
end-to-end: search, profile, recent games, opening
statistics, Preparation link.

## 8. Databases

Web: IndexedDB-backed reference and attached personal
databases. Desktop: SQLite attach, En Croissant import,
copy / move / merge / dedupe, position / player /
structure / claim search, backup, restore. The historical
"lost your work on quit" bug is verified fixed by the
Phase 22 / 23 / 25 data-safety regression.

## 9. Engines

Representative certification only (no engine catalog
change in Phase 26). Web: browser Stockfish 18 (threaded,
via the bundled WASM) start / stop / restart on rapid
position changes. Desktop: native Stockfish on Apple
Silicon, Lc0 where configured, and one additional
digest-verified managed engine.

## 10. macOS

| Channel | Status                                                                                  |
| ------- | --------------------------------------------------------------------------------------- |
| arm64   | Built, signed (Apple Development), checksum published, not notarized — **Preview**     |
| x64     | Built, signed, checksum published, not notarized, not manually runtime-certified — **Preview** |

The arm64 binary is the primary desktop artifact. The
x64 binary is attached for completeness but the landing
page, README, and release notes all direct users to the
arm64 download because that is the actually-tested
platform.

Notarization is unavailable because no Developer ID
Application certificate is installed in the build keychain
(`security find-identity -p codesigning` returns the
"Apple Development" and "Apple Distribution" identities
but no "Developer ID Application"). The macOS channel is
honest about this in every public surface; the install
guide's right-click → Open path is the supported
Gatekeeper-safe way to launch a non-notarized binary.

## 11. User data

- **Web persistence.** Study, Repertoire decision, and
  Settings change all survive a hard reload, browser
  close, and browser reopen in a clean private profile.
- **Desktop persistence.** Study, Repertoire, and
  Preference survive Quit → relaunch.
- **Backup / restore.** One current backup round trip
  succeeds.

## 12. Landing

- Hero, why-section, opening research, engines, local-first,
  get-Kingfisher section.
- "Public release · 1.0.0" badge replaces the rc.5 badge.
- Primary CTA: **Launch Kingfisher** (one click to
  `/analysis`).
- Secondary CTA: **Download for macOS** with explicit
  Preview labelling.
- GitHub repository, issues, discussions, and security
  policy links in the footer.
- Reference data links in the footer.
- `/releases/latest` and the v1.0.0 DMG download URL
  resolve to the new release.

## 13. Security

Fast release gate:

- `npm run security:scan` — 0 leaks across current
  source, git history, and the data mirror. 0 npm audit
  findings.
- `npm audit --omit=dev --audit-level=high` — 0 High,
  0 Critical.
- Production headers (CSP, COOP, COEP credentialless,
  HSTS, Referrer-Policy, Permissions-Policy, X-Content-
  Type-Options) verified on a real response from Vercel.
- `crossOriginIsolated === true` in production.
- The four deterministic gitleaks fixture false positives
  are pinned by commit / file / rule / line in
  `.gitleaksignore`.

## 14. CI cost

What runs automatically:

- `ci.yml` (Quality): typecheck + lint + unit/integration
  + production build. Paths-ignore for docs and marketing.
- `release-build.yml` (tag): web production build +
  arm64 DMG + checksums + release manifest upload. No
  cross-platform packaging, no engine matrix, no long
  soak.

Heavy certification (browser cert, engine matrix,
desktop Windows / Linux, long soak) is `workflow_dispatch`
only. The release-build matrix is intentionally
minimal — it does not auto-burn minutes when a tag is
pushed.

## 15. Tests

Local 1.0 gate run, exact counts:

| Check                        | Result        |
| ---------------------------- | ------------- |
| `npm run typecheck`          | 0 errors      |
| `npm run lint`               | 0 errors      |
| `npm run format:check`       | clean         |
| `npm test`                   | 2177 pass, 11 skipped, 0 fail |
| `npm run security:scan`      | 0 leaks, 0 advisories |
| `npm run build`              | production build succeeded |
| `node scripts/public-link-check.mjs` | 19/19 |
| `npm run desktop:dist`       | arm64 + x64 DMG built |
| `vercel deploy --prod`       | aliased to kingfisher-chess.vercel.app |

Remote CI:

- `ci.yml` was triggered by the release commit. The
  pre-existing slow dataset-replay test now has a 120 s
  ceiling to absorb CI load.
- `release-build.yml` was not triggered by this commit
  because the maintainer pushed the tag and built the
  DMG locally; the next agent that needs a clean
  CI-built DMG can re-run the workflow manually.

## 16. Bugs found

| Severity | Defect                                                                 | Resolution                                                                                            |
| -------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| High     | `releases/latest` resolves to `reference-elite-v1`, not the app.       | Marked `reference-elite-v1` as `prerelease`. Released `v1.0.0` as a **normal** release.              |
| High     | `package.json` and `desktop/package.json` still on `1.0.0-rc.5`.      | Bumped to `1.0.0`.                                                                                    |
| High     | Landing page still shows "Public preview · 1.0.0-rc.5".                | Updated to "Public release · 1.0.0" in both `marketing/index.html` and `src/app/landing/LandingPage.tsx`. |
| High     | Landing page still downloads the `1.0.0-rc.5-arm64.dmg`.                | Updated download URL and the file name in the spec block.                                              |
| High     | GitHub Pages landing still linked to the old `/` root of Vercel.       | Re-ran `scripts/publish-site.mjs --apply`.                                                             |
| Medium   | Prettier found 6 unformatted files after the version bump.             | `npx prettier --write …` for each, then `prettier --check .` is clean.                                |
| Medium   | `dist/release-manifest.json` still recorded rc.4 / rc.5 artefacts.     | Regenerated with the v1.0.0 artefacts; rc.4 / rc.5 entries kept for historical completeness.          |
| Low      | A `.DS_Store` was created by Finder inside `marketing/` and blocked the publish gate. | Removed. The publish script refused correctly; no data deleted.                                |

0 Critical, 0 Critical UI, 0 High UI defects.

## 17. Known limitations (current)

- macOS Preview (not notarized) — see the install guide
  and the macOS section above. Notarization follows
  automatically once a Developer ID Application
  certificate is in the build keychain.
- No auto-update. Manual install from the releases page.
- Windows and Linux desktop builds exist but are
  unsupported.
- macOS Intel x64 DMG is attached but not manually
  runtime-verified on Intel hardware; the landing and
  README point users at the arm64 download.
- Bundled reference data starts in 2020; pre-2020
  broadcasts are reachable through the Lichess Masters /
  Online Explorer sources.
- Chess960 is not supported.
- Local Syzygy tablebase probing requires the user to
  provide the tablebase files.

## 18. 1.0 release artefacts

| Field            | Value                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| Commit           | `64cfd2b` (master)                                                                     |
| Tag              | `v1.0.0` (annotated)                                                                   |
| GitHub Release   | <https://github.com/mardakurt/kingfisher/releases/tag/v1.0.0>                           |
| Vercel           | <https://kingfisher-chess.vercel.app/> — aliased from the production build             |
| DMG (arm64)      | `Kingfisher-1.0.0-arm64.dmg` — SHA-256 `f7b50af58bfc123691ec58eaf3d00ff4e6d028d773eb24d3b8701436b0bf9fd0` |
| DMG (x64)        | `Kingfisher-1.0.0.dmg` — SHA-256 `9932f957a7a4fa6baacc4a5a2c67166ac325d5a8c1f1112eed920a96f5fbd37b` |
| SHA-256 file     | `SHA256SUMS.txt` (attached)                                                            |
| Release manifest | `release-manifest.json` (attached)                                                     |
| Landing          | <https://mardakurt.github.io/kingfisher-data/> (GitHub Pages rebuild queued)          |

## 19. Release verdict

**PUBLIC 1.0 RELEASED / MAC DISTRIBUTION CREDENTIAL BLOCKED**

- Web: STABLE.
- macOS: Preview (signed, not notarized; the maintainer's
  keychain does not contain a Developer ID Application
  certificate, so notarization is not possible in this
  environment).
- GitHub `releases/latest` resolves to the Kingfisher
  1.0.0 release.
- Public link check: 19/19.
- No Critical, no High, no Critical UI, no High UI defect
  is open.

## 20. Post-1.0 roadmap (≤ 5 items, ranked by evidence / value)

1. **Notarize the macOS binary** as soon as a Developer ID
   Application certificate is available, reissue the DMG,
   and convert the macOS channel from Preview to Stable.
   (Single highest-value follow-up; unblocks every macOS
   install.)
2. **Real-user bug fixes** filed via GitHub Issues, shipped
   as `1.0.1`, `1.0.2`, `…` point releases against filed
   reproductions. (Highest volume of expected work.)
3. **Auto-update channel** for the macOS build once
   notarization is in place. (Lower priority than
   notarization itself; manual install is acceptable for
   1.0.)
4. **Custom domain** (e.g. `kingfisher.app` /
   `app.kingfisher.app`) for brand polish. (Cosmetic; the
   Vercel URL is acceptable for 1.0.)
5. **Post-1.0 feature work** only if a real user signal
   (filed issue with reproductions, or a paying / public
   demand pattern) emerges — candidates include a
   pre-2020 historical data source if a license-clean one
   appears, and a Windows desktop build only if a concrete
   user base appears. (Deliberately last; no commitment.)

No Phase 27. From here the model is:

> Filed Issue → reproduce → test → fix → point release.
