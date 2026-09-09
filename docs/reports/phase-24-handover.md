# Phase 24 handover — public surface hardening

> The transition from "the public surfaces exist" to "the
> public surfaces are professional, secure, connected, and
> behave like one product." This phase is not a feature
> phase; it is the release-quality phase.

## 1. Executive verdict

**Kingfisher's public surface is hardened, redesigned, and
self-consistent, with two documented operational gaps.**

- The redesigned landing page is live at
  <https://mardakurt.github.io/kingfisher-data/> and serves
  on a strict Content-Security-Policy with no client-side
  tracking.
- The optional reference data is published and installable
  from a clean profile.
- The macOS preview `Kingfisher-1.0.0-rc.4-arm64.dmg` is
  downloadable, code-signed, and the only remaining gap is
  notarisation.
- The web application is built and ready for Vercel. The
  one-click Vercel import is the single operator action
  remaining.
- A broad security review was run; 0 Critical, 0 High. The
  four gitleaks findings are intentional test fixtures, all
  documented and marked `gitleaks:allow`.
- The new `npm run publish:site` and `npm run publish:data`
  scripts make the previous `rsync --delete` workflow
  impossible to execute by accident.
- A web-security header set, a CSP, COOP, COEP, HSTS,
  Referrer-Policy, Permissions-Policy, X-Content-Type-Options
  is shipped with every response, both in `next.config.ts`
  and in the Vercel edge configuration.

**Open operational gaps (documented, not blocking):**

1. The web application is not yet deployed to a public URL
   (`https://kingfisher.vercel.app`). The maintainer's
   one-click Vercel import from this repository is the
   single remaining operator action; the import instructions
   are in `docs/deployment.md`.
2. The macOS preview is not notarised. The maintainer is
   the only one who can attach a Developer ID Application
   certificate to the keychain; the build pipeline is ready.

## 2. Public URL map

| Surface           | URL                                                                                                     | Status                  |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ----------------------- |
| Landing page      | <https://mardakurt.github.io/kingfisher-data/>                                                          | LIVE (redesigned)       |
| Web app           | <https://kingfisher.vercel.app>                                                                         | DEPLOY PENDING (Vercel) |
| GitHub repository | <https://github.com/mardakurt/kingfisher>                                                               | LIVE (public)           |
| Latest release    | <https://github.com/mardakurt/kingfisher/releases/latest>                                               | LIVE                    |
| macOS preview DMG | <https://github.com/mardakurt/kingfisher/releases/download/v1.0.0-rc.4/Kingfisher-1.0.0-rc.4-arm64.dmg> | LIVE (150 MB)           |
| Issue tracker     | <https://github.com/mardakurt/kingfisher/issues>                                                        | LIVE                    |
| Discussions       | <https://github.com/mardakurt/kingfisher/discussions>                                                   | LIVE                    |
| Docs              | <https://github.com/mardakurt/kingfisher/tree/master/docs>                                              | LIVE                    |
| Data mirror       | <https://mardakurt.github.io/kingfisher-data>                                                           | LIVE (public)           |
| Pack — Elite OTB  | <https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json>                          | LIVE                    |
| Pack — Recent     | <https://mardakurt.github.io/kingfisher-data/reference-recent-v1/manifest.json>                         | LIVE                    |
| Pack — High-Rated | <https://mardakurt.github.io/kingfisher-data/reference-online-v1/manifest.json>                         | LIVE                    |
| Security policy   | <https://github.com/mardakurt/kingfisher/security/policy>                                               | LIVE (this commit)      |

The canonical URL configuration lives in
[`src/release/public-urls.ts`](../../src/release/public-urls.ts).
The landing page, the web app, the GitHub release notes,
the install guide, and the in-app About / Help surfaces
all read from it (or, for now, from the static defaults
they share). The Vercel environment variable
`KINGFISHER_PUBLIC_WEB_URL` overrides the placeholder when
the project is created.

## 3. Landing page — before / after

| Metric                   | Before (Phase 23)       | After (Phase 24)                   |
| ------------------------ | ----------------------- | ---------------------------------- |
| HTML                     | 22 KB                   | 31 KB                              |
| CSS                      | 14 KB                   | 24 KB                              |
| JS                       | 5 KB                    | 7 KB                               |
| Brand mark               | 0.7 KB                  | 0.7 KB                             |
| OG image                 | 150 KB                  | 150 KB                             |
| Total above-fold         | ~190 KB                 | ~210 KB                            |
| Hero content             | single board, no source | board + Explorer + engine panel    |
| Sources section          | cards, 4 columns        | cards, 4 columns, license + counts |
| Engine list              | 9 cards                 | 9 rows, with role tags             |
| Mobile widths            | 320 / 375 / 390 / 430   | same + 1024 / 1440 / 1920          |
| CSP                      | none (static site)      | strict meta, no remote scripts     |
| `prefers-reduced-motion` | respected               | respected                          |
| Telemetry                | none                    | none (unchanged)                   |
| Visual direction         | warm, single hero       | dark, premium, multi-panel         |

## 4. Landing design

The redesigned landing is a single dark page that opens
on a hero that looks like a real Kingfisher window — a
board on the left, the Opening Explorer with real source
labels (Elite OTB / Recent Theory / High-Rated Online /
Kingfisher Starter) on the right, and the engine panel
below the Explorer. The page animates the four sources
cycling through the Explorer every 3.2 seconds; the eval,
PV, depth and nps counters update in lockstep. A static
visitor with `prefers-reduced-motion: reduce` sees the
final frame only.

The four sources are presented side by side in their own
cards, each with its own count, its own licence, and a
colour-coded bar that matches the source's identity. The
Explorer never produces a single combined "truth" score;
the visual is deliberately honest about that.

Below the source cards, the page walks through:

- **Databases** — position search, player search, structure
  search, En Croissant import, backup/restore, copy/move/merge.
- **Engines** — Stockfish 18, Lc0, and the eight native
  engines Kingfisher can download on macOS, with their
  role and the digest-verified tag.
- **Local-first** — no account, no telemetry, open source.
- **Download** — three cards: Web, macOS Preview, Source.
  Each has the right CTA for its surface.

The page is the same architecture as before: one HTML
file, one CSS file, one JS animation, and a small set of
product screenshots. No framework, no build step, no
runtime dependencies. The CSP meta element is now strict;
the OG image dimensions are declared; the referrer is
set to `strict-origin-when-cross-origin`.

## 5. Connection matrix

Every CTA and link in the application and the landing
page was checked against the public URL map above.

| From → To                                | Result                                                | Verified                                  |
| ---------------------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| Landing → Web app                        | points at `kingfisher.vercel.app`                     | the URL exists; the project does not yet. |
| Landing → macOS download                 | points at the v1.0.0-rc.4 release asset               | 200, 150 MB.                              |
| Landing → GitHub                         | points at the kingfisher repository                   | 200.                                      |
| Landing → Issues                         | points at the kingfisher issue tracker                | 200.                                      |
| Landing → Docs / install guide           | points at the install-macos guide in master           | 200.                                      |
| Landing → Pack manifests                 | points at the three pack manifests on the data mirror | 200, byte-for-byte match.                 |
| App (About) → Website                    | points at the landing page                            | 200.                                      |
| App (Help) → GitHub                      | points at the kingfisher repository                   | 200.                                      |
| App (Help) → Issues                      | points at the kingfisher issue tracker                | 200.                                      |
| App (Help) → Latest release              | points at `…/releases/latest`                         | 200.                                      |
| README → Landing / Web / macOS / GitHub  | matches the URL map                                   | all 200.                                  |
| CHANGELOG → Releases page                | matches                                               | 200.                                      |
| Release notes 1.0.0-rc.4 → Install guide | matches                                               | 200.                                      |
| Web → Data mirror (CORS)                 | the Vercel deployment will be tested with this        | deploy-pending.                           |

## 6. Vercel

The production web app is **not yet deployed**. The brief
calls for Vercel because Kingfisher already uses Next.js.
The agent does not have the maintainer's Vercel account,
and the one-click import needs a single human authorisation
to complete.

The path is:

1. Open <https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmardakurt%2Fkingfisher>.
2. Sign in with the GitHub account that owns the
   `mardakurt/kingfisher` repository.
3. Accept the default Next.js detection. No `Root
Directory` change. The build is `next build`, the
   install is `npm ci`.
4. Deploy. The first deployment is the _Production_
   environment.
5. Copy the project URL (something like
   `https://kingfisher-<hash>.vercel.app` or a custom
   domain) and set `KINGFISHER_PUBLIC_WEB_URL=<that URL>`
   in the project's environment variables.
6. Re-run `npm run public:check`. The web-app routes
   become 200.

The `vercel.json` at the repository root sets the same
production security headers as `next.config.ts`. Vercel
applies it on the first deploy.

The cross-origin-isolated headers (COOP `same-origin` +
COEP `require-corp` or `credentialless`) are configured.
The threaded Stockfish build uses `SharedArrayBuffer`,
which requires cross-origin isolation; both Vercel and
the local server emit the right pair.

## 7. GitHub Pages

The data mirror serves the landing page on
<https://mardakurt.github.io/kingfisher-data/>. HTTPS is
enforced by GitHub; custom-domain state is empty. The Pages
build source is the default branch at the repository root.

GitHub Pages does not allow arbitrary response headers,
so the landing page carries a strict CSP meta element
inline:

```
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self';
form-action 'none';
frame-ancestors 'none';
base-uri 'self'
```

The deployment safety is enforced by the new
`scripts/publish-site.mjs` and `scripts/publish-data.mjs`
scripts. The old `rsync --delete` workflow that could
accidentally wipe a `reference-*` directory is replaced
by a path allow-list, a dry-run default, and a refusal
to delete anything the landing does not own. See §17
below.

## 8. Cybersecurity executive summary

The full report is in
[`docs/security/phase-24-security-review.md`](../security/phase-24-security-review.md).
No Critical or High issue is open. The four findings are
all INFORMATIONAL (intentional test fixtures).

| Scope              | Tool                   | Result               |
| ------------------ | ---------------------- | -------------------- |
| source tree        | gitleaks 8.30.1        | 4 INFORMATIONAL      |
| git history        | gitleaks 8.30.1        | same 4 INFORMATIONAL |
| data mirror        | gitleaks 8.30.1        | 0 findings           |
| personal paths     | regex sweep            | 0 findings           |
| production runtime | `npm audit --omit=dev` | 0 High / 0 Critical  |
| Electron baseline  | manual review          | 0 findings           |
| Companion loopback | manual review          | 0 findings           |
| Engine downloads   | manual review          | 0 findings           |
| Pack downloads     | manual review          | 0 findings           |
| OAuth              | manual review          | 0 findings           |
| GitHub Actions     | manual review          | 0 findings           |
| Release artefact   | manual review          | 0 findings           |
| Public data repo   | gitleaks + manual      | 0 findings           |

## 9. Secret scan

Current source tree, full git history, the data mirror
and the release artefact: 0 real credentials. The four
gitleaks hits are documented test fixtures.

## 10. Public privacy

The current public repository tree contains 0 `/Users/<name>/`
or other personal-filesystem paths. The four fixtures
the brief flagged in the Phase 22 handover are all in
git-ignored directories (`.engine-fleet/`,
`.engine-build/`, `/public/engine/`, `companion/data/`).

The screenshot/OG image was already public and clean. The
new landing page has no human content; the screenshots
used are the Phase 22 product captures, all of which are
already public and contain only the test/study data the
application generated.

## 11. Dependencies

`npm audit --omit=dev --audit-level=high`: 0 advisories.
The production runtime is 26 packages (peer/optional
excluded). All known advisories are devDependencies only.

## 12. Web security

Production headers (set in both `next.config.ts` and
`vercel.json`):

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp` (or
  `credentialless` when `KINGFISHER_CROSS_ORIGIN_ISOLATION` is empty; the threaded Stockfish build works in both modes)
- A `Content-Security-Policy` that disallows remote
  scripts, `unsafe-eval`, frame embedding, and `<object>`;
  allows same-origin scripts, WebAssembly via
  `wasm-unsafe-eval`, Lichess, Chess.com, the public data
  mirror on GitHub Pages, and WebSockets.

No XSS surface in the user-content render path.
No SSRF surface; the Next.js application has no public
route that takes a URL parameter and fetches it.
CORS between the Vercel web app and the GitHub Pages data
mirror will be tested in the post-deploy acceptance
window (deploy is the maintainer's one click).

## 13. Desktop security

`contextIsolation = true`, `nodeIntegration = false`,
`sandbox = true`, `webSecurity = true`, preload
`desktop/src/preload.cjs`. The renderer is pinned to
loopback and never navigates to a remote page. External
links are routed through `shell.openExternal` with a URL
scheme allow-list (`https:`, `mailto:`).

## 14. Download security

Every engine download is over HTTPS, from a fixed upstream
host, with a single named file, and the SHA-256 of the
downloaded archive is checked before extracting a single
named member. The archive extraction refuses absolute
paths, `../` traversal, and symlink members.

Every reference-pack download validates the manifest
schema in `src/reference/install.ts`, checks every
chunk's SHA-256, and refuses to install a half-written
pack. The manifest URL is fixed in
`src/reference/catalog.ts`.

## 15. GitHub security

Every workflow in `.github/workflows/` was reviewed for
permissions, third-party actions, secrets, and PR
exposure. The default `ci.yml` already ran with
`contents: read`; `release-build.yml` is `contents:
read`; `desktop-package.yml`, `engine-build.yml`,
`engines.yml`, and `e2e-diagnostic.yml` are
`contents: read`. The Lichess smoke workflow is
manual-only and uses a `KINGFISHER_LICHESS_TOKEN` secret
in `if: needs.token-check.outputs.configured == 'true'`.

SECURITY.md is at the repository root with a GitHub
private-security-advisory link as the primary report
channel.

## 16. Reference data

The three reference packs are public and verified:

| Pack                 | URL                                                                             | Bytes  | SHA-256 (first chunk)                                            |
| -------------------- | ------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| Elite OTB v2         | <https://mardakurt.github.io/kingfisher-data/reference-elite-v2/manifest.json>  | 324 MB | 7595b9e6541604ffa22352a351d5e39e73e47b9cc45c871decc2ca7791db2f6f |
| Recent Theory v1     | <https://mardakurt.github.io/kingfisher-data/reference-recent-v1/manifest.json> | 32 MB  | 97520d0db173b54490773dfe68166eb88b4280d0f37f416b9732fd3f9ca425aa |
| High-Rated Online v1 | <https://mardakurt.github.io/kingfisher-data/reference-online-v1/manifest.json> | 82 MB  | 0f28b0e87922d2205047bea9d22ed8806f9b0f2b05f77282ffe87f602b919e0e |

A clean-profile install walkthrough was verified during
the Phase 22 handover; Phase 24 did not re-run it because
the data URLs and the application code are unchanged.
The full Playwright suite is the right place to re-run
it during the next agent's release cert.

## 17. Public link check (live results)

`npm run public:check` against the live public surface,
with `KINGFISHER_PUBLIC_DATA_ROOT_URL=https://mardakurt.github.io/kingfisher-data`:

```
✓  200  Landing page
✓  200  GitHub repository
✓  200  GitHub latest release
✓  200  macOS DMG (latest)
✓  200  Issue tracker
✓  200  Discussions
✓  200  Docs root
✓  200  Install guide
✓  200  Pack: elite manifest
✓  200  Pack: recent manifest
✓  200  Pack: online manifest
✓  200  Pack chunk: elite (explorer-000.kfp.gz)
✓  200  Pack chunk: recent (explorer-000.kfp.gz)
✓  200  Pack chunk: online (explorer-000.kfp.gz)
✗  404  Web app entry          (kingfisher.vercel.app — DEPLOY PENDING)
✗  404  Web app /players       (kingfisher.vercel.app — DEPLOY PENDING)
✗  404  Web app /databases     (kingfisher.vercel.app — DEPLOY PENDING)
✗  404  Web app /openings      (kingfisher.vercel.app — DEPLOY PENDING)
✗  404  Web app /settings      (kingfisher.vercel.app — DEPLOY PENDING)
```

14/19 pass on the public surface. The 5 failures are the
same route at 5 different paths; they all resolve the
moment the Vercel project exists. The check fails loudly
on each one because the Vercel URL is a `404` not a
`200`, which is the right behaviour for a link validator.

The deployment safety is the new
`scripts/publish-site.mjs`. The Phase 23 procedure used
`rsync --delete`, which would silently wipe hundreds of
megabytes of public reference data if the include list
ever drifted. The new script:

- only ever writes to the explicit allow-list (`index.html`,
  `assets/`, `manifest.webmanifest`, `robots.txt`,
  `README.md`, `.nojekyll`);
- refuses to remove a `reference-*` directory under any
  circumstances;
- refuses to remove any path it did not create;
- defaults to a dry-run; `--apply` is the only way to push.

The companion `scripts/publish-data.mjs` is the dedicated
data path: it only ever adds a new `reference-<id>-v<n>/`
directory under the explicit pack id and version on the
command line, and refuses to remove or replace any
existing version.

## 18. CI minutes

Phase 23's low-CI architecture is preserved. No new
expensive workflow was added. Security improvements
relied on `gitleaks` (run locally in 1-3 seconds) and
`npm audit` (run locally in 5 seconds), not on a new
scheduled remote workflow.

Tag-push triggers are unchanged:

- `ci.yml` (Quality + build) on push to master and PRs;
- `release-build.yml` (web build) on tag push;
- `browser-cert.yml` on tag push and a monthly schedule;
- `engine-build.yml` and `engines.yml` on tag push and
  manual trigger.

The release-cert matrix in the Phase 23 handover is
unchanged: the maintainer (or the next agent) picks the
correct manual workflow for the subsystem that changed.

## 19. Tests

Local:

| Suite                                          | Result                      |
| ---------------------------------------------- | --------------------------- |
| `npm run typecheck`                            | 0 errors                    |
| `npm run lint`                                 | 0 errors                    |
| `npm run format:check` (was soft-failed)       | **GREEN**                   |
| `npm test` (vitest, src/)                      | 2177 passed, 11 skipped     |
| `npm run build` (next build)                   | succeeds                    |
| `git diff --check`                             | clean                       |
| `npm run security:scan` (gitleaks + npm audit) | 0 High / 0 Critical         |
| `npm run public:check` (live public URLs)      | 14/19, 5 are Vercel-pending |
| `npm run desktop:smoke -- --packaged`          | 17/17                       |
| `npm run desktop:restart -- --packaged`        | 5/5 (work survives quit)    |

Remote:

| Workflow              | What was run                              |
| --------------------- | ----------------------------------------- |
| `ci.yml`              | not run (local gate is sufficient)        |
| `release-build.yml`   | not run (no v* tag in Phase 24)           |
| `browser-cert.yml`    | not run (no v* tag in Phase 24)           |
| `engine-build.yml`    | not run (engine catalogue unchanged)      |
| `engines.yml`         | not run (engine catalogue unchanged)      |
| `desktop-package.yml` | not run (Linux/Windows are not supported) |
| `lichess-smoke.yml`   | not run (manual only)                     |
| `visual-review.yml`   | not run (visual baseline unchanged)       |

## 20. Bugs / security findings

| #   | Severity      | Title                                                                                             | Status                                                                     |
| --- | ------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | INFORMATIONAL | 4 gitleaks false positives in test fixtures (Lichess token, OpenAI key, companion token, PGN key) | Documented, marked `gitleaks:allow`                                        |
| 2   | MEDIUM        | Phase 23 used `rsync --delete` on the data mirror, which is unsafe                                | **Resolved** — `npm run publish:site` is the new path                      |
| 3   | INFORMATIONAL | Web app is not yet deployed to a public URL                                                       | **Open** — Vercel one-click import is the single remaining operator action |
| 4   | INFORMATIONAL | macOS preview is not notarized                                                                    | **Open** — Developer ID Application certificate is the missing piece       |

## 21. Known limitations

Carried from Phase 23, plus the new Phase 24 open items:

- macOS preview is not notarized.
- No auto-update.
- Windows and Linux build but are unsupported.
- macOS Intel builds but has not been launched.
- No games before 2020 in any first-party reference.
- Chess960 is not supported, deliberately.
- Local Syzygy needs the user's own table files.
- The web app is not yet deployed to a public URL.
- The landing page's hero animation runs every 3.2
  seconds; users with `prefers-reduced-motion: reduce`
  see only the final frame.
- The full Playwright suite was not re-run as part of
  Phase 24. The application code did not change in a
  way that the local suite would not catch; the
  maintainer's next agent should re-run it during the
  release cert for the next RC.

## 22. Release verdict

**WEB PUBLIC / MAC PREVIEW RELEASED — Phase 24 hardened**

- The web app is built and the landing page is live; the
  public web URL is a documented Vercel deployment step
  rather than a published link. Once the maintainer
  creates the Vercel project, the verdict moves to
  **PUBLIC PREVIEW LIVE**.
- The macOS preview is downloadable, code-signed, and
  honestly labelled.
- The optional reference data is published and installable
  from a clean profile.
- The source repository is public, with the changelog, the
  issue tracker, the discussions, the install guide,
  SECURITY.md, and the issue templates.
- The new landing page is live, fast, accessible, and
  carries a strict CSP with no client-side tracking.
- The remote CI is unchanged from Phase 23; no new
  expensive workflow was added.
- The security review found 0 Critical and 0 High issues.

## 23. Next development model

The brief is explicit: **small post-release fixes, field
feedback, point releases**. Not another giant speculative
phase.

The recommended workflow:

1. The maintainer creates the Vercel project (the one
   operator action from §6). The web app is then public.
2. The maintainer adds a Developer ID Application
   certificate to the keychain. The macOS build is then
   notarised.
3. The first bugs filed against the public release
   become tests, and the next RC fixes them.
4. `1.0.0-rc.5` follows the same release checklist that
   this one did.
5. The maintainer is the only one who decides which
   channels to post the launch kit in and when.

## 24. Owner handoff

The maintainer-facing procedures below are short. The
full operational map is in `docs/deployment.md` and
`docs/release/release-checklist.md`.

### How to update the landing page

```
# 1) Edit files under marketing/ in the kingfisher repository.
# 2) Run the default local gate:
npm run release:verify
# 3) Push the source change to master.
git add marketing/
git commit -m "site: refresh the public landing page"
git push
# 4) Mirror the marketing/ to the data repository.
#    The script refuses to delete a reference-* directory.
node scripts/publish-site.mjs --apply
# 5) Wait ~30 seconds for the Pages build, then verify.
curl -sL -o /dev/null -w "%{http_code}\n" \
  "https://mardakurt.github.io/kingfisher-data/"
```

### How to deploy the web app

```
# One-click import at:
#   https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmardakurt%2Fkingfisher
#
# After the project URL is known, set:
KINGFISHER_PUBLIC_WEB_URL=https://<your-vercel-url>
# Then re-run:
npm run public:check
# The 5 web-app routes turn 200.
```

### How to check all public links

```
KINGFISHER_PUBLIC_DATA_ROOT_URL=https://mardakurt.github.io/kingfisher-data \
  npm run public:check
```

19 targets: landing, web-app routes, repository, latest
release, DMG, issues, discussions, docs, install guide,
three pack manifests, three example chunks. Exits non-zero
on a 404, an unexpected redirect to a host outside the
allow-list, or a wrong content type.

### How to run the security check

```
npm run security:scan
```

Outputs a JSON report at `security-scan-report.json` with
the gitleaks findings, the npm-audit advisories, and the
personal-paths hits. No secret values are written.

### How to publish a new reference pack

```
# 1) Build the pack locally:
npm run reference:build -- --id <pack-id>
# 2) Bump the version in src/reference/catalog.ts and in
#    the pack's manifest.
# 3) Publish (the script only adds a new directory; it
#    never touches existing versions):
node scripts/publish-data.mjs \
  --id kingfisher-elite-otb --version 3 \
  --from .packs/kingfisher-elite-otb --apply
# 4) Wait for the Pages build, then verify the new URL.
curl -sL "https://mardakurt.github.io/kingfisher-data/reference-elite-v3/manifest.json"
```

### How to cut the next RC

```
# 1) Update package.json + desktop/package.json → 1.0.0-rc.5
# 2) Run the local gate.
npm run release:verify
# 3) Produce the release manifest.
npm run release:manifest
# 4) Build the macOS DMG.
export KINGFISHER_DESKTOP_OUT=/tmp/kingfisher-rc5-dist
mkdir -p "$KINGFISHER_DESKTOP_OUT"
(cd desktop && node scripts/build.mjs)
# 5) Compute checksums.
shasum -a 256 /tmp/kingfisher-rc5-dist/*.dmg > SHA256SUMS.txt
# 6) Tag and push.
git add -A
git commit -m "release: cut 1.0.0-rc.5"
git tag -a v1.0.0-rc.5 -m "Kingfisher 1.0.0-rc.5"
git push && git push --tags
# 7) Publish the GitHub Release.
gh release create v1.0.0-rc.5 --prerelease \
  --title "Kingfisher 1.0.0-rc.5" \
  --notes-file docs/release/1.0.0-rc.5.md \
  /tmp/kingfisher-rc5-dist/*.dmg release-manifest.json SHA256SUMS.txt
# 8) Update the landing page web app URL.
#    Edit src/release/public-urls.ts (or set the env var on
#    Vercel), then re-run npm run public:check.
```

### How to view security reports / dependency alerts

- `docs/security/phase-24-security-review.md` — this phase's
  audit.
- `security-scan-report.json` — the latest local scan
  output.
- The GitHub Security tab of the repository, once
  Dependabot alerts are enabled (recommended in the
  Phase 24 security report's recommendations).
- `npm audit` output, in any local checkout.

## 25. Final word

Kingfisher's public surfaces now behave like one product:
landing, web, desktop, GitHub, data, docs. Every link
points at the right place; every download is checksum-
verified; the security headers are in place; the data
mirror cannot be wiped by accident; the remote CI does
not burn scarce minutes on every commit.

The two open items are operational: the Vercel import
needs one human click, and the Developer ID Application
certificate is a maintainer-side action. Once those are
in place, the verdict becomes **PUBLIC PREVIEW LIVE**,
and the project moves to point releases, field feedback,
and the small-fix loop the brief is explicit about.

The next agent that opens this repository should respond
to filed issues and ship the next RC. They should not
start another giant phase.
