# Kingfisher deployment

Where each surface is hosted, and how to publish a new release.

## The public surfaces

| Surface             | Where                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| Landing page        | <https://mardakurt.github.io/kingfisher-data/>                                 |
| Optional reference data | the `kingfisher-data` Pages site, at `/reference-{pack}-{version}/`         |
| macOS preview build | a `Kingfisher-*.dmg` attached to a GitHub Release on this repository          |
| Web app             | deployed to Vercel from the repository root                                   |
| Source / issues     | <https://github.com/mardakurt/kingfisher>                                      |

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

1. Sign in to <https://vercel.com> with the GitHub account that
   owns `mardakurt/kingfisher`.
2. *Add New… → Project* and import the `mardakurt/kingfisher`
   repository.
3. Accept the default Next.js detection (no `Root Directory`
   change; the build is `next build`, the install is `npm ci`).
4. Deploy. The first deployment is the *Production* environment.
5. Copy the project URL (something like
   `https://kingfisher-<hash>.vercel.app`) and put it in the
   landing page's `Launch the web app` button and in
   `KINGFISHER_PUBLIC_WEB_URL` for `npm run public:check`.

Optional: configure a custom domain in *Settings → Domains*.

The build does not need any environment variable. The optional
cross-origin isolation variable (`KINGFISHER_CROSS_ORIGIN_ISOLATION=1`)
enables `SharedArrayBuffer` for the multi-threaded Stockfish
build, at the cost of forbidding third-party embeds.

## Hosting the landing page

The landing page lives in the `marketing/` directory of the main
repository, AND is mirrored into the
[`mardakurt/kingfisher-data`](https://github.com/mardakurt/kingfisher-data)
repository's Pages site, so it is reachable at
<https://mardakurt.github.io/kingfisher-data/>.

The mirror is rebuilt by pushing the contents of `marketing/` to
the data repository's `main` branch and waiting for the Pages
build to complete. This is the operational path:

```sh
# from the kingfisher repository root
rsync -av --delete \
  --exclude='README.md' \
  marketing/ /tmp/kingfisher-data-stage/

(cd /tmp/kingfisher-data-stage && \
  git add . && \
  git commit -m "site: refresh the public landing page" && \
  git push)
```

The data repository's `index.html` is the landing page. The
`reference-*` directories stay as the publish location for the
pack data. The mirror is single-purpose — no application
source, no CMS, no analytics.

If the Pages site stops responding, check the build status at
`gh api repos/mardakurt/kingfisher-data/pages`.

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
- A release candidate is marked as a *pre-release* on GitHub. A
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
