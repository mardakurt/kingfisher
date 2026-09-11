# Kingfisher deployment

Where each surface is hosted, and how to publish a new release.

## The public surfaces

| Surface                  | Where                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Landing page             | <https://kingfisher-chess.vercel.app/>                                                    |
| Studio (the application) | <https://kingfisher-roan.vercel.app/>                                                     |
| Public docs              | the same landing host, at `/install`, `/privacy`, `/security`, `/data-licences`, `/terms` |
| Optional reference data  | the `kingfisher-data` Pages site, at `/reference-{pack}-{version}/`                       |
| macOS preview build      | a `Kingfisher-*.dmg` attached to a GitHub Release on this repository                      |
| Web app (fallback)       | <https://kingfisher-chess.vercel.app/>                                                    |
| Source / issues          | <https://github.com/mardakurt/kingfisher>                                                 |

The legacy `mardakurt.github.io/kingfisher-data/` origin still
serves a small redirect-only backup of the marketing page (see
`marketing/index.html`) and is the documented compatibility
path for any old link that still points at it. It is not a
canonical surface. The canonical landing identity is the Vercel
host above; `src/release/public-urls.ts` is the single source of
truth.

## How a release happens

1. Update `package.json` (and `desktop/package.json`) to the new
   version. The two must match.
2. Run `npm run release:verify`. The default gate is
   typecheck, lint, unit/integration tests, production build, and
   `git diff --check`. It exits non-zero on a red check.
3. Run `npm run release:manifest` to produce
   `release-manifest.json` with the version, commit, build
   timestamp, and the SHA-256 of every desktop artefact.
4. Build the macOS DMG: `npm run desktop:pack` (or
   `npm run desktop:dist` for the signed/notarised variant when
   the Developer ID Application certificate is available).
5. Tag the release commit: `git tag -a v<version> -m "Kingfisher <version>"`,
   then `git push --tags`.
6. Publish the GitHub Release:
   `gh release create v<version> --prerelease --title "Kingfisher <version>" --notes-file docs/release/<version>.md`
   and upload the DMG + `release-manifest.json` + checksums.
7. For each reference pack that has changed, push the new
   versioned directory to `mardakurt/kingfisher-data`, update the
   `packRelease()` call in `src/reference/catalog.ts`, and add a
   row to the catalogue's `approximateBytes` if it has changed
   materially.

## Hosting the web app on Vercel

The web app is a Next.js production build. Vercel is the
recommended host.

### One-click import (recommended for the maintainer)

Open:

> <https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmardakurt%2Fkingfisher>

Then:

1. Sign in to Vercel with the GitHub account that owns the
   `mardakurt/kingfisher` repository.
2. Accept the default Next.js detection. The `Root
Directory` stays at the repository root. `vercel.json`
   installs the verified browser engine before the Next.js
   build; the install command is `npm ci`.
3. Click **Deploy**. The first deployment is the
   _Production_ environment.
4. Copy the project URL (it will be something like
   `https://kingfisher-<hash>.vercel.app`).
5. In the Vercel project _Settings → Environment
   Variables_, set the Production variable:
   ```
   KINGFISHER_PUBLIC_WEB_URL = <your project URL>
   ```
6. Trigger a redeploy so the new environment variable is
   picked up.
7. Update the canonical default in
   `src/release/public-urls.ts` (the `web` field) to match
   the new URL, then commit and push. The landing page and
   every other surface will follow.
8. Re-run `npm run public:check` locally. The five web-app
   routes turn 200; the total is **19/19**.

The `vercel.json` at the repository root sets the same
production security headers as `next.config.ts` (CSP,
COOP, COEP, HSTS, Referrer-Policy, Permissions-Policy,
X-Content-Type-Options). Vercel applies it on every
deploy.

### CLI deployment (alternative)

`npm run deploy:vercel` uses the Vercel CLI with a token
from `VERCEL_TOKEN`. Useful when the maintainer prefers
the terminal over the web UI, or when scripting. The
script falls back to the one-click URL when the token is
not set; it never blocks the release flow.

### Production deploy automation

Both the Landing and the Studio Vercel projects deploy from
the same `master` push. The Landing project uses the
standard Vercel Git integration; the Studio project is
backed by the GitHub Actions workflow at
`.github/workflows/deploy-studio.yml`, which calls the
Vercel CLI on every push to `master` and is the durable
replacement for the Phase 41-era manual `vercel deploy
--prod --yes`.

To enable or re-enable the Studio auto-deploy:

1. In the Vercel dashboard for the Studio project, copy
   the project id from _Settings → General_.
2. Create a Personal Access Token at
   <https://vercel.com/account/tokens> with the minimum
   scope Vercel allows for production deployment.
3. In the GitHub repository, add three repository secrets:
   `VERCEL_TOKEN`, `VERCEL_TEAM_ID` (optional but
   recommended), and `VERCEL_PROJECT_STUDIO`.
4. The next push to `master` will be deployed by the
   workflow. A failed secret configuration is reported as
   an `:notice:` in the workflow output rather than as a
   red cross, so a missing secret does not block other
   CI.

Verify the result with `npm run deploy:status`. The
script reads `git rev-parse origin/master` and the latest
Vercel production deployment for each project, and prints:

```
Landing: up to date (f1336bd)
Studio:  up to date (f1336bd)
```

or, when the Studio build is missing or behind:

```
Landing: up to date (f1336bd)
Studio:  BEHIND master by 4 commits
```

This is the script the maintainer runs after a phase to
answer "is production actually running master?" without
opening Vercel.

### Custom domain

Optional, post-launch. Configure in
_Settings → Domains_ once the project exists. Avoid
purchasing or configuring a domain without explicit
maintainer approval.

### Environment variables

The build does not need any environment variable by
default. The optional cross-origin-isolation variable
(`KINGFISHER_CROSS_ORIGIN_ISOLATION=1`) enables
`SharedArrayBuffer` for the multi-threaded Stockfish build,
at the cost of forbidding third-party embeds. The
default in `next.config.ts` is `credentialless` COEP,
which keeps Stockfish threaded while allowing cross-origin
reads from the GitHub Pages data mirror.

## Hosting the landing page

The **canonical** landing page is the Vercel production build at
<https://kingfisher-chess.vercel.app/>. The Next.js build
compiles `src/app/landing/LandingPage.tsx` to a static page; Vercel
serves it from the `kingfisher` project. The marketing surface
is therefore deployed together with the application — there is
no separate landing deploy step. `npm run public:check` checks
the live Vercel host.

A small static backup of the marketing surface still lives in
the [`mardakurt/kingfisher-data`](https://github.com/mardakurt/kingfisher-data)
repository's Pages site, at
<https://mardakurt.github.io/kingfisher-data/>. The file at
`marketing/index.html` is a redirect-only stub. It exists so
older external links that still point at the legacy origin
reach a meaningful page; it is **not** a canonical surface, is
served with `X-Robots-Tag: noindex`, and is not the source of
truth for any product fact. The `marketing/README.md` and the
landing component itself both say so.

If a future change moves the canonical landing to a custom
domain, the GitHub Pages stub can be retired; until then it
stays as a compatibility shim.

## Hosting the reference data

The reference data is published by pushing a versioned directory
to the `kingfisher-data` repository. The catalog in
`src/reference/catalog.ts` names the exact path:

- `reference-elite-v2/manifest.json` (Elite OTB, v2)
- `reference-recent-v1/manifest.json` (Recent Theory, v1)
- `reference-online-v1/manifest.json` (High-Rated Online, v1)

The manifest is the source of truth. Every chunk file's SHA-256
must match the digest in the manifest. The application will not
install a pack whose digest does not match.

To publish a new pack version:

1. Build the pack with `npm run reference:build -- --id <pack-id>`
   in the main repository. The output goes to `.packs/<pack-id>/`.
2. Bump the version in the manifest (`"version": "<n>"`) and in
   the `packRelease('<pack-id>-v<n>')` call in
   `src/reference/catalog.ts`.
3. Copy the pack directory into the data repository at
   `reference-<pack-id>-v<n>/`.
4. Commit and push the data repository.
5. Wait for the Pages build to complete.
6. Verify the public URLs:
   `npm run public:check`.

## Promoting a release to stable

- The current naming scheme is `<major>.<minor>.<patch>-rc.<n>`
  for release candidates and `<major>.<minor>.<patch>` for
  stable releases.
- A release candidate is marked as a _pre-release_ on GitHub. A
  stable release is published without the flag.
- The pre-release flag is the only difference. The artefact
  pipeline is identical.
- Before tagging a stable release, run `npm run release:verify:full`
  and the packaged desktop smoke, and confirm the public web app
  and the public landing page are healthy.

## Verifying a release

`npm run public:check` fetches every public URL the release
depends on — landing page, web app entry, repository, latest
release, the three reference-pack manifests, and the three
example chunks — and exits non-zero if any of them is missing
or non-200. Run it after a publish, before telling the world.

`npm run release:verify` is the local gate (typecheck, lint,
unit/integration tests, build, whitespace). It is the right
command to run before tagging.

`npm run release:verify:full` is the heavier local gate that
adds the full Playwright suite, the desktop smoke, the desktop
chrome geometry check, the desktop restart, and the desktop
engine fleet qualification. It runs in 20+ minutes; run it
deliberately.
